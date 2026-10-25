#!/usr/bin/env python3
"""Annotate static page content and regenerate Studio's page catalog.

Uses only the standard library and changes opening tags, not HTML formatting.
Existing CMS keys and page IDs are retained on subsequent runs. Runtime widgets,
forms, navigation, and footer are intentionally handled by their own editors.
"""
from html import escape, unescape
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PAGES = [
    ('index', 'Home'), ('visit', 'Plan a Visit'), ('beliefs', 'What We Believe'),
    ('staff', 'Our Staff'), ('get-involved', 'Ministries'), ('next-steps', 'Next Steps'),
    ('events', 'Events'), ('missions', 'Missions'), ('give', 'Giving'),
    ('contact', 'Contact'), ('jubilee', 'Appalachian Jubilee'), ('watch', 'The Overlook'),
    ('privacy', 'Privacy'), ('blog', 'Notes from Fairview'), ('prayer', 'Prayer'),
    ('404', 'Page Not Found'),
]
VOID = set('area base br col embed hr img input link meta param source track wbr'.split())
BLOCKED_TAGS = set('script style svg nav header footer form button input select option textarea iframe video audio canvas'.split())
DYNAMIC_ATTRS = {
    'data-live-stage', 'data-fbt-services', 'data-events', 'data-event-featured',
    'data-events-upcoming', 'data-events-list', 'data-events-past-grid',
    'data-blog-grid', 'data-prayer-wall', 'data-video-grid', 'data-video-featured',
    'data-fbt-grid', 'data-fbt-featured', 'data-cms-sermons-grid',
    'data-cms-sermons-featured', 'data-post-body',
}
DYNAMIC_IDS = {
    'missions-map', 'miss-grid', 'miss-modal', 'miss-stats', 'miss-search-results',
    'miss-filters', 'home-missions-map', 'give-now', 'live-player', 'media-player',
    'give-other-title',
}
RUNTIME_VISIBILITY_ATTRS = {
    'data-blog-empty', 'data-events-upcoming-empty', 'data-prayer-empty',
    'data-fbt-music-empty',
}
TEXT_ATTRS = ('data-cms-text', 'data-cms-rich', 'data-cms-mailto', 'data-cms-tel')
COPY_TAGS = set('h1 h2 h3 h4 h5 p span strong em a li summary dt dd blockquote div th td cite small'.split())
COLLECTION_CLASSES = set('card member ecard walk-step gi-card gi-step ns-card ns-path-step tile value belief fact irow stat'.split())


class Node:
    def __init__(self, tag, attrs, start, open_end, parent=None):
        self.tag, self.attrs, self.start, self.open_end = tag, dict(attrs), start, open_end
        self.parent, self.children, self.texts, self.added = parent, [], [], {}
        self.end_start = self.end = open_end

    def ancestors(self):
        p = self.parent
        while p:
            yield p
            p = p.parent

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()

    def get(self, key, default=''):
        return self.added.get(key, self.attrs.get(key, default))

    def has(self, key):
        return key in self.added or key in self.attrs

    def add(self, key, value):
        if not self.has(key):
            self.added[key] = value


class Document(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0]
        for m in re.finditer('\n', source):
            self.lines.append(m.end())
        self.root = Node('document', [], 0, 0)
        self.stack = [self.root]
        self.edits = []
        self.feed(source)

    def pos(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        pos = self.pos()
        node = Node(tag, attrs, pos, pos + len(self.get_starttag_text()), self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.stack.pop()

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                node = self.stack[i]
                node.end_start = self.pos()
                node.end = self.source.find('>', node.end_start) + 1
                self.stack = self.stack[:i]
                return

    def handle_data(self, data):
        self.stack[-1].texts.append((self.pos(), data))

    def handle_entityref(self, name):
        self.handle_data('&' + name + ';')

    def handle_charref(self, name):
        self.handle_data('&#' + name + ';')

    def text(self, node):
        raw = self.source[node.open_end:node.end_start]
        return re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]*>', '', raw))).strip()

    def rich(self, node):
        raw = self.source[node.open_end:node.end_start]
        raw = re.sub(r'</?em(?:\s[^>]*)?>', '*', raw)
        return re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]*>', '', raw))).strip()

    def apply(self):
        for n in self.root.walk():
            if n.added:
                mark = n.open_end - (2 if self.source[n.open_end - 2:n.open_end] == '/>' else 1)
                self.edits.append((mark, mark, ''.join(' %s="%s"' % (k, escape(str(v), quote=True)) for k, v in n.added.items())))
        out = self.source
        for start, end, replacement in sorted(self.edits, reverse=True):
            out = out[:start] + replacement + out[end:]
        return out


def blocked(node, section):
    for n in [node] + list(node.ancestors()):
        if n.tag in BLOCKED_TAGS or n.get('id') in DYNAMIC_IDS or any(n.has(a) for a in DYNAMIC_ATTRS):
            return True
        if n.has('data-fbt-video') or n.has('data-svc') or n.has('data-tab') or n.has('data-mf'):
            return True
        if n is section:
            return False
    return False


def bound_above(node, section):
    return any(any(n.has(a) for a in TEXT_ATTRS) for n in node.ancestors() if n is not section)


def label_for(doc, node, fallback):
    if node.tag == 'tr':
        cell = next((n for n in node.children if n.tag in ('th', 'td')), None)
        if cell and doc.text(cell):
            return doc.text(cell)[:90]
    for n in node.walk():
        if n.tag in ('h1', 'h2', 'h3', 'h4', 'summary'):
            value = doc.text(n)
            if value:
                return value[:90]
    image = next((n for n in node.walk() if n.tag == 'img' and n.get('alt')), None)
    if image:
        return image.get('alt')[:90]
    text = doc.text(node)
    return text[:65] if text and len(text) < 100 else fallback


def slug(value):
    return re.sub('[^a-z0-9]+', '-', value.lower()).strip('-')


def annotate(page, source):
    doc = Document(source)
    used_keys = {value for n in doc.root.walk() for attr, value in n.attrs.items() if attr.startswith('data-cms-') and value}
    sections = [n for n in doc.root.walk() if n.tag == 'section' and not any(p.tag in ('section', 'header', 'footer', 'nav') for p in n.ancestors())]
    for si, section in enumerate(sections, 1):
        sid = section.get('data-page-section') or page + '-section-' + str(si)
        section.add('data-page-section', sid)
        section.add('data-page-label', label_for(doc, section, 'Section ' + str(si)))
        # Preserve controls inside dynamic panels; only static page content gets fields.
        counter = 0
        def new_key(kind):
            nonlocal counter
            while True:
                counter += 1
                key = sid.replace('-', '_') + '_' + kind + '_' + str(counter)
                if key not in used_keys:
                    used_keys.add(key)
                    return key
        for node in section.walk():
            if (node.get('id') == 'miss-empty' or any(node.has(a) for a in RUNTIME_VISIBILITY_ATTRS)
                    or node.get('data-lib') in ('loading', 'empty')):
                node.add('data-cms-no-reveal', '')
            if blocked(node, section) or bound_above(node, section):
                continue
            if node.tag == 'a' and node.get('href') and not any(node.has(a) for a in ('data-cms-href', 'data-cms-mailto', 'data-cms-tel')):
                # Script-managed actions retain their behavior and targets.
                if not node.get('id') and not node.has('download') and not node.has('data-next-step') and not node.get('href').startswith('javascript:'):
                    node.add('data-cms-href', new_key('link'))
            if node.tag == 'img' and not any(n.has('data-cms-img') or n.has('data-cms-bg') for n in node.ancestors()):
                # Keep responsive/decorative logos and scripted player images intact.
                if node.get('alt') and node.parent and node.parent.tag in ('div', 'figure') and len(node.parent.children) == 1 and not node.get('id'):
                    node.parent.add('data-cms-img', new_key('image'))
                    node.parent.add('data-cms-alt', node.get('alt'))
            if node.has('data-cms-img') and not node.has('data-cms-alt-key'):
                node.add('data-cms-alt-key', node.get('data-cms-img') + '_alt')
            if node.tag not in COPY_TAGS or any(node.has(a) for a in TEXT_ATTRS):
                continue
            if node.get('id') and node.tag not in ('h1', 'h2', 'h3', 'h4'):
                continue
            if not node.children:
                text = doc.text(node)
                if text and not re.fullmatch(r'[\d\s·•→+–-]+', text):
                    node.add('data-cms-text', new_key('text'))
            elif node.tag in ('h1', 'h2', 'h3', 'h4', 'p') and all(c.tag == 'em' and not c.attrs for c in node.children):
                # Existing accent markup uses the same *accent* rich-text syntax.
                if not any(any(c.has(a) for a in TEXT_ATTRS) for c in node.children):
                    node.add('data-cms-rich', new_key('text'))
            elif node.tag in ('p', 'li', 'div', 'a', 'blockquote'):
                # Give each loose text run a span rather than flattening links or formatting.
                # Merge HTML entity pieces first so words like "isn't" remain one field.
                runs = []
                for pos, text in node.texts:
                    if runs and runs[-1][0] + len(runs[-1][1]) == pos:
                        runs[-1] = (runs[-1][0], runs[-1][1] + text)
                    else:
                        runs.append((pos, text))
                for pos, raw in runs:
                    value = unescape(raw).strip()
                    if not value or re.fullmatch(r'[\d\s·•→+–.,:-]+', value):
                        continue
                    key = new_key('text')
                    lead = raw[:len(raw) - len(raw.lstrip())]
                    trail = raw[len(raw.rstrip()):]
                    middle = raw.strip()
                    doc.edits.append((pos, pos + len(raw), lead + '<span data-cms-text="' + key + '">' + middle + '</span>' + trail))
        collection_index = 0
        for parent in section.walk():
            if blocked(parent, section) or any(parent.has(a) for a in TEXT_ATTRS):
                continue
            children = parent.children
            candidates = [c for c in children if c.tag == 'details' or (set(c.get('class').split()) & COLLECTION_CLASSES)]
            if 'family-photos' in parent.get('class').split():
                candidates = [c for c in children if 'photo' in c.get('class').split()]
            if parent.tag in ('ul', 'ol') and not parent.has('role'):
                candidates = [c for c in children if c.tag == 'li']
            if parent.tag == 'tbody':
                candidates = [c for c in children if c.tag == 'tr']
            if len(candidates) < 2:
                continue
            collection_index += 1
            cid = parent.get('data-page-collection') or sid + '-items-' + str(collection_index)
            parent.add('data-page-collection', cid)
            parent.add('data-page-label', 'Questions' if candidates[0].tag == 'details' else 'Schedule rows' if parent.tag == 'tbody' else 'Items')
            for ii, item in enumerate(candidates, 1):
                item.add('data-page-item', cid + '-' + str(ii))
                item.add('data-page-label', label_for(doc, item, 'Item ' + str(ii)))
    return doc.apply()


def catalog_page(page, label, source, defaults):
    doc = Document(source)
    sections = []
    parent_groups = {}
    for section in doc.root.walk():
        if not section.has('data-page-section'):
            continue
        sid = section.get('data-page-section')
        parent = section.parent
        if parent not in parent_groups:
            parent_panel = parent.get('data-panel')
            if parent_panel:
                parent_groups[parent] = (page + '-panel-' + slug(parent_panel), parent_panel.title())
            elif parent.tag in ('body', 'main'):
                parent_groups[parent] = (page + '-' + parent.tag, 'Page')
            else:
                parent_groups[parent] = (page + '-parent-' + (slug(parent.get('id')) or sid), 'Page section group')
        parent_group, parent_label = parent_groups[parent]
        fields, seen, collections = [], set(), []
        for node in section.walk():
            for attr, kind in [('data-cms-text', 'text'), ('data-cms-rich', 'rich'), ('data-cms-href', 'url'), ('data-cms-mailto', 'text'), ('data-cms-tel', 'text'), ('data-cms-bg', 'image'), ('data-cms-img', 'image'), ('data-cms-alt-key', 'text')]:
                if not node.has(attr):
                    continue
                key = node.get(attr)
                if not key or key in seen:
                    continue
                seen.add(key)
                default_field = defaults.get(key, {})
                if attr == 'data-cms-href':
                    value = node.get('href')
                    field_label = 'Link: ' + (doc.text(node)[:60] or key)
                elif attr in ('data-cms-bg', 'data-cms-img'):
                    img = next((c for c in node.walk() if c.tag == 'img'), None)
                    value = img.get('src') if img else ''
                    field_label = 'Background image' if attr == 'data-cms-bg' else 'Photo: ' + node.get('data-cms-alt', key)[:60]
                elif attr == 'data-cms-alt-key':
                    img = next((c for c in node.walk() if c.tag == 'img'), None)
                    value = node.get('data-cms-alt') or (img.get('alt') if img else '')
                    field_label = 'Photo description'
                else:
                    value = doc.rich(node) if kind == 'rich' else doc.text(node)
                    prefix = 'Heading' if node.tag.startswith('h') else 'Question' if node.tag == 'summary' else 'Button label' if node.tag == 'a' and 'btn' in node.get('class') else 'Text'
                    field_label = prefix + ': ' + (value[:70] or key)
                fields.append({'key': key, 'label': default_field.get('label') or field_label, 'type': kind, 'def': default_field.get('def', value)})
            if node.has('data-page-collection'):
                cid = node.get('data-page-collection')
                items = [{'id': c.get('data-page-item'), 'label': c.get('data-page-label'), 'selector': '[data-page-item="' + c.get('data-page-item') + '"]'} for c in node.children if c.has('data-page-item')]
                collections.append({'id': cid, 'label': node.get('data-page-label') or 'Items', 'selector': '[data-page-collection="' + cid + '"]', 'items': items})
        panel = next((n.get('data-panel') for n in section.ancestors() if n.has('data-panel')), '')
        section_label = section.get('data-page-label')
        if panel:
            section_label = panel.title() + ': ' + section_label
        sections.append({'id': sid, 'label': section_label, 'parentGroup': parent_group, 'parentLabel': parent_label, 'selector': '[data-page-section="' + sid + '"]', 'fields': fields, 'collections': collections})
    return {'id': page, 'label': label, 'path': '/' if page == 'index' else '/' + page, 'sections': sections}


def main():
    raw = subprocess.check_output(['node', '-e', "const fs=require('fs'),vm=require('vm'),c={window:{}};vm.runInNewContext(fs.readFileSync('assets/cms-schema.js','utf8'),c);process.stdout.write(JSON.stringify(c.window.FBT_SCHEMA.groups.flatMap(g=>g.fields||[])));"], cwd=ROOT, text=True)
    defaults = {f['key']: f for f in json.loads(raw)}
    pages = []
    for page, label in PAGES:
        path = ROOT / (page + '.html')
        source = path.read_text()
        result = annotate(page, source)
        if result != source:
            path.write_text(result)
        pages.append(catalog_page(page, label, result, defaults))
    catalog = {'version': 1, 'pages': pages}
    (ROOT / 'assets/page-catalog.js').write_text('/* Generated by scripts/build-page-catalog.py. Stable keys preserve saved content. */\nwindow.FBT_PAGE_CATALOG = ' + json.dumps(catalog, ensure_ascii=False, indent=2) + ';\n')
    print(json.dumps({'pages': len(pages), 'sections': sum(len(p['sections']) for p in pages), 'fields': sum(len(s['fields']) for p in pages for s in p['sections']), 'collections': sum(len(s['collections']) for p in pages for s in p['sections'])}))


if __name__ == '__main__':
    main()
