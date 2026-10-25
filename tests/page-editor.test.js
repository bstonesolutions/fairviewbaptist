const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const editor = require('../assets/page-editor');

const page = {
  id: 'visit', label: 'Visit', path: '/visit', sections: [
    { id: 'intro', selector: '[data-page-section="intro"]', fields: [{ key: 'visit_intro', type: 'text' }], collections: [
      { id: 'cards', selector: '[data-page-collection="cards"]', items: [
        { id: 'one', selector: '[data-page-item="one"]' },
        { id: 'two', selector: '[data-page-item="two"]' },
        { id: 'three', selector: '[data-page-item="three"]' }
      ] }
    ] },
    { id: 'details', selector: '[data-page-section="details"]', fields: [{ key: 'visit_intro' }, { key: 'visit_details' }] },
    { id: 'contact', selector: '[data-page-section="contact"]' }
  ]
};

test('normalization accepts only known IDs and options and completes partial orders', () => {
  const value = editor.normalize({
    v: 1, order: ['contact', 'unknown', 'contact'],
    sections: {
      intro: { visible: false, layout: 'image-right', align: 'center', width: 'wide', spacing: 'roomy', style: 'position:fixed' },
      details: { visible: 'false', layout: 'javascript:alert(1)', align: 'justify', width: 200, spacing: null },
      unknown: { visible: false }
    },
    collections: { cards: { order: ['three', 'three', 'nope'], hidden: ['two', 'nope', 'two'] }, other: { hidden: ['one'] } },
    arbitrary: 'discard'
  }, page);
  assert.deepEqual(value.order, ['contact', 'intro', 'details']);
  assert.deepEqual(value.sections.intro, { visible: false, layout: 'image-right', align: 'center', width: 'wide', spacing: 'roomy' });
  assert.deepEqual(value.sections.details, { visible: true, layout: 'original', align: 'original', width: 'original', spacing: 'original' });
  assert.deepEqual(value.collections.cards, { order: ['three', 'one', 'two'], hidden: ['two'] });
  assert.deepEqual(Object.keys(value), ['v', 'order', 'sections', 'collections']);
  assert.equal(value.sections.unknown, undefined);
  assert.equal(value.collections.other, undefined);
});

test('malformed payloads and future versions restore valid defaults', () => {
  const expected = editor.normalize(null, page);
  for (const input of ['{broken', '[]', 'null', 5, false, { v: 2, order: ['contact'] }, { sections: [] }, { collections: [] }]) {
    assert.deepEqual(editor.normalize(input, page), expected);
  }
  assert.deepEqual(JSON.parse(editor.serialize('{"v":1,"order":["details"]}', page)).order, ['details', 'intro', 'contact']);
});

const watchPage = {
  id: 'watch', path: '/watch', sections: [
    { id: 'live-intro', parentGroup: 'watch-live' },
    { id: 'messages-intro', parentGroup: 'watch-messages' },
    { id: 'live-updates', parentGroup: 'watch-live' },
    { id: 'messages-list', parentGroup: 'watch-messages' }
  ]
};

test('section ordering preserves each parent group while honoring its requested internal order', () => {
  const requested = ['messages-list', 'live-updates', 'messages-intro', 'live-intro'];
  const before = requested.slice();
  assert.deepEqual(editor.sectionOrder(requested, watchPage), ['live-updates', 'live-intro', 'messages-list', 'messages-intro']);
  assert.deepEqual(requested, before);
  // Even interleaved catalog sections retain the group order of first occurrence.
  assert.deepEqual(editor.sectionOrder(null, watchPage), ['live-intro', 'live-updates', 'messages-intro', 'messages-list']);
  assert.deepEqual(editor.sectionOrder(['messages-list', 'unknown', 'messages-list'], watchPage), ['live-intro', 'live-updates', 'messages-list', 'messages-intro']);
});

test('normalization repairs a previously saved cross-parent order and preserves section settings', () => {
  const saved = JSON.stringify({ v: 1,
    order: ['messages-list', 'live-updates', 'messages-intro', 'live-intro'],
    sections: { 'live-updates': { visible: false, spacing: 'compact' } }
  });
  const normalized = editor.normalize(saved, watchPage);
  assert.deepEqual(normalized.order, ['live-updates', 'live-intro', 'messages-list', 'messages-intro']);
  assert.equal(normalized.sections['live-updates'].visible, false);
  assert.equal(normalized.sections['live-updates'].spacing, 'compact');
  assert.deepEqual(JSON.parse(editor.serialize(saved, watchPage)), normalized);
});

test('section peers contain only the selected parent group in normalized order', () => {
  const requested = ['messages-list', 'live-updates', 'messages-intro', 'live-intro'];
  assert.deepEqual(editor.sectionPeers(requested, watchPage, 'live-intro'), ['live-updates', 'live-intro']);
  assert.deepEqual(editor.sectionPeers(requested, watchPage, 'messages-list'), ['messages-list', 'messages-intro']);
  assert.deepEqual(editor.sectionPeers(requested, watchPage, 'unknown'), []);
});

test('missing parent groups share one group and existing ungrouped page order stays compatible', () => {
  const requested = ['contact', 'intro'];
  assert.deepEqual(editor.sectionOrder(requested, page), ['contact', 'intro', 'details']);
  assert.deepEqual(editor.sectionPeers(requested, page, 'intro'), ['contact', 'intro', 'details']);
  const mixed = { id: 'mixed', sections: [
    { id: 'first' }, { id: 'live', parentGroup: 'watch-live' }, { id: 'last' }, { id: 'messages', parentGroup: 'watch-messages' }
  ] };
  assert.deepEqual(editor.sectionOrder(['messages', 'last', 'live', 'first'], mixed), ['last', 'first', 'live', 'messages']);
});

test('prototype-like IDs and injected properties cannot become layout records', () => {
  const unsafePage = { ...page, sections: page.sections.concat([
    { id: '__proto__' }, { id: 'constructor' }, { id: 'prototype' }, { id: '<style>' }, { id: 'intro' }
  ]) };
  const raw = JSON.parse('{"sections":{"__proto__":{"polluted":true},"constructor":{"visible":false},"intro":{"visible":false}},"order":["__proto__","constructor","intro"]}');
  const value = editor.normalize(raw, unsafePage);
  assert.deepEqual(Object.keys(value.sections), ['intro', 'details', 'contact']);
  assert.equal(Object.hasOwn(value.sections, '__proto__'), false);
  assert.equal({}.polluted, undefined);
  assert.equal(editor.layoutKey('__proto__'), '');
  assert.equal(editor.layoutKey('constructor'), '');
  assert.equal(editor.layoutKey(page), 'page_layout_visit');
});

test('page lookup matches clean and HTML routes and fields are deduplicated', () => {
  const catalog = { pages: [page, { id: 'home', path: '/' }] };
  for (const route of ['/visit', '/visit.html', '/visit/?a=1#details', 'https://example.org/visit.html']) {
    assert.equal(editor.findPage(route, catalog), page);
  }
  assert.equal(editor.findPage('/index.html', catalog).id, 'home');
  assert.equal(editor.findPage('/missing', catalog), null);
  assert.deepEqual(editor.fieldKeys(page), ['visit_intro', 'visit_details']);
});

test('numeric page and section IDs support the editable 404 page', () => {
  const notFound = { id: '404', path: '/404', sections: [{ id: '404-section-1', fields: [{ key: '404_heading' }] }] };
  assert.equal(editor.findPage('/404.html', { pages: [notFound] }), notFound);
  assert.equal(editor.layoutKey(notFound), 'page_layout_404');
  assert.deepEqual(editor.fieldKeys(notFound), ['404_heading']);
  const layout = editor.normalize({ sections: { '404-section-1': { visible: false, align: 'center' } } }, notFound);
  assert.deepEqual(layout.order, ['404-section-1']);
  assert.equal(layout.sections['404-section-1'].visible, false);
  assert.equal(layout.sections['404-section-1'].align, 'center');
});

test('URL helper permits safe destinations but rejects executable or ambiguous URLs', () => {
  for (const value of ['', '/visit', '#details', 'http://example.org/path', 'https://example.org/path', 'mailto:church@example.org', 'tel:+13045874709']) {
    assert.equal(editor.validateUrl(value, 'link'), true, value);
  }
  for (const value of ['javascript:alert(1)', 'data:text/html,test', '//evil.test', '\\evil.test', 'https://example.org/a b', 'mailto:a@example.org?subject=x%0d%0abcc:other@example.org']) {
    assert.equal(editor.validateUrl(value, 'link'), false, value);
  }
  assert.equal(editor.validateUrl('mailto:church@example.org', 'image'), false);
  for (const type of ['image', 'bg']) {
    for (const value of ['#details', 'http://example.org/photo.jpg']) assert.equal(editor.validateUrl(value, type), false, type + ': ' + value);
    for (const value of ['/assets/photo.jpg', 'https://example.org/photo.jpg']) assert.equal(editor.validateUrl(value, type), true, type + ': ' + value);
  }
  assert.equal(editor.validateUrl('http://example.org/path', 'url'), true);
});

// A small DOM implementation exercises node movement, identity, and visibility
// without browser dependencies or executing any live content/database code.
class Element {
  constructor(name, attrs = {}) {
    this.name = name; this.attrs = { ...attrs }; this.childNodes = []; this.parentNode = null;
    const classes = new Set();
    this.classList = { contains: value => classes.has(value), toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value) };
  }
  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this; this.childNodes.push(node); return node;
  }
  removeChild(node) { this.childNodes.splice(this.childNodes.indexOf(node), 1); node.parentNode = null; return node; }
  replaceChild(next, prior) {
    if (next.parentNode) next.parentNode.removeChild(next);
    const at = this.childNodes.indexOf(prior);
    assert.notEqual(at, -1);
    this.childNodes[at] = next; next.parentNode = this; prior.parentNode = null; return prior;
  }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  removeAttribute(key) { delete this.attrs[key]; }
  getAttribute(key) { return Object.hasOwn(this.attrs, key) ? this.attrs[key] : null; }
  matches(selector) {
    const match = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
    if (!match) throw new Error('Unsupported selector');
    return this.attrs[match[1]] === match[2];
  }
  querySelector(selector) {
    const match = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
    if (!match) throw new Error('Unsupported selector');
    for (const child of this.childNodes) {
      if (child.attrs[match[1]] === match[2]) return child;
      const descendant = child.querySelector(selector);
      if (descendant) return descendant;
    }
    return null;
  }
}
class Document extends Element {
  constructor() { super('document'); this.listeners = {}; this.readyState = 'complete'; }
  createComment() { return new Element('comment'); }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  emit(type, detail) { for (const callback of this.listeners[type] || []) callback({ detail }); }
}
function fixture() {
  const document = new Document();
  const main = document.appendChild(new Element('main'));
  const before = main.appendChild(new Element('before'));
  const intro = main.appendChild(new Element('intro', { 'data-page-section': 'intro' }));
  const divider = main.appendChild(new Element('divider'));
  const details = main.appendChild(new Element('details', { 'data-page-section': 'details', hidden: '' }));
  const after = main.appendChild(new Element('after'));
  const aside = document.appendChild(new Element('aside'));
  const contact = aside.appendChild(new Element('contact', { 'data-page-section': 'contact' }));
  const cards = intro.appendChild(new Element('cards', { 'data-page-collection': 'cards' }));
  const one = cards.appendChild(new Element('one', { 'data-page-item': 'one' }));
  const notice = cards.appendChild(new Element('notice'));
  const two = cards.appendChild(new Element('two', { 'data-page-item': 'two', hidden: '' }));
  const three = cards.appendChild(new Element('three', { 'data-page-item': 'three' }));
  return { document, main, before, intro, divider, details, after, aside, contact, cards, one, notice, two, three };
}
const names = parent => parent.childNodes.map(node => node.name);

test('applying layout moves existing nodes only within their parent and preserves nonselected slots', () => {
  const f = fixture();
  editor.apply(page, { order: ['contact', 'details', 'intro'], collections: { cards: { order: ['three', 'one', 'two'] } } }, f.document);
  assert.deepEqual(names(f.main), ['before', 'details', 'divider', 'intro', 'after']);
  assert.deepEqual(names(f.aside), ['contact']);
  assert.deepEqual(names(f.cards), ['three', 'notice', 'one', 'two']);
  assert.equal(f.main.childNodes[3], f.intro);
  assert.equal(f.cards.childNodes[2], f.one);
  assert.equal(f.main.childNodes[2], f.divider);
  assert.equal(f.cards.childNodes[1], f.notice);
});

test('restoring defaults restores original DOM order, classes and options without unhiding original content', () => {
  const f = fixture();
  editor.apply(page, {
    order: ['details', 'intro'],
    sections: { intro: { visible: false, layout: 'stacked', align: 'center', width: 'narrow', spacing: 'compact' } },
    collections: { cards: { order: ['two', 'one'], hidden: ['one', 'two'] } }
  }, f.document);
  assert.equal(f.intro.classList.contains('fbt-section-hidden'), true);
  assert.equal(f.one.classList.contains('fbt-item-hidden'), true);
  assert.equal(f.intro.getAttribute('data-page-layout'), 'stacked');
  editor.apply(page, null, f.document);
  assert.deepEqual(names(f.main), ['before', 'intro', 'divider', 'details', 'after']);
  assert.deepEqual(names(f.cards), ['one', 'notice', 'two', 'three']);
  assert.equal(f.intro.classList.contains('fbt-section-hidden'), false);
  assert.equal(f.one.classList.contains('fbt-item-hidden'), false);
  assert.equal(f.details.getAttribute('hidden'), '');
  assert.equal(f.two.getAttribute('hidden'), '');
  for (const key of ['layout', 'align', 'width', 'spacing']) assert.equal(f.intro.getAttribute('data-page-' + key), null);
});

test('repeated apply is stable and missing sections or items do not interrupt remaining layout', () => {
  const f = fixture();
  f.cards.removeChild(f.two);
  f.aside.removeChild(f.contact);
  const layout = { order: ['details', 'contact', 'intro'], collections: { cards: { order: ['two', 'three', 'one'] } } };
  editor.apply(page, layout, f.document);
  editor.apply(page, editor.serialize(layout, page), f.document);
  assert.deepEqual(names(f.main), ['before', 'details', 'divider', 'intro', 'after']);
  assert.deepEqual(names(f.cards), ['three', 'notice', 'one']);
});

test('a collection attached to its section itself can reorder and hide items', () => {
  const document = new Document();
  const section = document.appendChild(new Element('tiles', { 'data-page-section': 'tiles', 'data-page-collection': 'links' }));
  const first = section.appendChild(new Element('first', { 'data-page-item': 'first' }));
  section.appendChild(new Element('second', { 'data-page-item': 'second' }));
  const tiles = { id: 'home', sections: [{ id: 'tiles', selector: '[data-page-section="tiles"]', collections: [{
    id: 'links', selector: '[data-page-collection="links"]', items: [
      { id: 'first', selector: '[data-page-item="first"]' },
      { id: 'second', selector: '[data-page-item="second"]' }
    ]
  }] }] };
  editor.apply(tiles, { collections: { links: { order: ['second', 'first'], hidden: ['first'] } } }, document);
  assert.deepEqual(names(section), ['second', 'first']);
  assert.equal(first.classList.contains('fbt-item-hidden'), true);
});

test('browser runtime responds to content and permits previews only from its same-origin parent', () => {
  const f = fixture(), listeners = {}, sent = [];
  const parent = { postMessage: (data, origin) => sent.push({ data, origin }) };
  const window = {
    document: f.document, parent, location: { pathname: '/visit', origin: 'https://fairview.example' },
    FBT_PAGE_CATALOG: { pages: [page] },
    addEventListener: (type, callback) => { listeners[type] = callback; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/page-editor.js'), 'utf8'), { window, URL });
  assert.equal(window.FBTPageLayout.findPage('/visit').id, 'visit');
  assert.equal(sent[0].data.type, 'fbt:page-preview-ready');
  assert.equal(sent[0].data.pageId, 'visit');
  assert.equal(sent[0].origin, window.location.origin);
  f.document.emit('fbt:content', { page_layout_visit: JSON.stringify({ order: ['details', 'intro'] }) });
  assert.deepEqual(names(f.main), ['before', 'details', 'divider', 'intro', 'after']);
  const message = { type: 'fbt:page-preview', pageId: 'visit', layout: { sections: { intro: { visible: false } } }, content: { arbitrary: 'ignored by layout runtime' } };
  listeners.message({ origin: 'https://other.example', source: parent, data: message });
  listeners.message({ origin: window.location.origin, source: {}, data: message });
  listeners.message({ origin: window.location.origin, source: parent, data: { ...message, pageId: 'other' } });
  assert.equal(f.intro.classList.contains('fbt-section-hidden'), false);
  listeners.message({ origin: window.location.origin, source: parent, data: message });
  assert.equal(f.intro.classList.contains('fbt-section-hidden'), true);
  assert.deepEqual(names(f.main), ['before', 'intro', 'divider', 'details', 'after']);
  // An in-flight content response cannot overwrite the editor's active layout preview.
  f.document.emit('fbt:content', { page_layout_visit: '' });
  assert.equal(f.intro.classList.contains('fbt-section-hidden'), true);
});
