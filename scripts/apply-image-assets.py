#!/usr/bin/env python3
"""Wire generated image copies into markup without changing CMS source keys."""
import json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
text = (ROOT / 'assets/image-assets.js').read_text()
assets = json.loads(text[text.index('{'):].rstrip().rstrip(';'))
logo = assets['/assets/logo-fairview-2026.png']
reverse = {entry['src']: original for original, entry in assets.items()}
def attribute(tag, key, value):
    pattern = r'\s' + re.escape(key) + r'="[^"]*"'
    value = value.replace('&','&amp;').replace('"','&quot;')
    addition = f' {key}="{value}"'
    return re.sub(pattern, lambda _:addition, tag) if re.search(pattern,tag) else tag[:-1] + addition + '>'
def image(match):
    tag = match.group(0)
    saved = re.search(r'\bdata-image-source="([^"]+)"',tag)
    src = saved or re.search(r'\bsrc="([^"]+)"',tag)
    if not src: return tag
    original = src[1].split('?')[0]
    if original.startswith('assets/'): original = '/' + original
    original = reverse.get(original, original)
    if original not in assets: return tag
    entry = assets[original]
    for key,value in [('data-image-source',original),('src',entry['src']),('srcset',entry['srcset']),('width',str(entry['width'])),('height',str(entry['height'])),('decoding','async')]: tag=attribute(tag,key,value)
    sizes='64px' if 'logo-fairview' in original else ('100vw' if 'cms-bg-' in tag else '(max-width: 700px) 100vw, 50vw')
    if '/assets/staff/incoming-' in original and 'portrait-04' not in original: sizes='(max-width: 700px) 100vw, (max-width: 1000px) 50vw, 360px'
    tag=attribute(tag,'sizes',sizes)
    return tag
for path in list(ROOT.glob('*.html'))+list((ROOT/'templates').glob('*.tpl')):
    html = re.sub(r'<img\b[^>]*>', image, path.read_text())
    html = re.sub(r'(<link\b[^>]*rel="icon"[^>]*href=")[^"]+("[^>]*>)',lambda m:m[1]+logo['favicon']+m[2],html)
    html = html.replace('sizes="1254x1254"','sizes="64x64"')
    html = re.sub(r'(<link\b[^>]*rel="apple-touch-icon"[^>]*href=")[^"]+("[^>]*>)',lambda m:m[1]+logo['appleTouchIcon']+m[2],html)
    mountain=assets['/assets/photos/wv-appalachian-mountains.jpg']
    html=html.replace('<link rel="preload" as="image" href="/assets/photos/wv-appalachian-mountains.jpg">','<link rel="preload" as="image" href="'+mountain['src']+'" imagesrcset="'+mountain['srcset']+'" imagesizes="100vw" fetchpriority="high">')
    if 'assets/content.js?' in html or path.name=='studio.html':
        if '/assets/image-assets.js' not in html:
            anchor = '<script src="assets/media-styles.js?v=1"></script>'
            if anchor not in html: anchor='<script src="/assets/page-catalog.js?v=1"></script>'
            html=html.replace(anchor, '<script src="/assets/image-assets.js?v=1"></script>\n<script src="/assets/image-loader.js?v=2"></script>\n'+anchor)
    if path.name=='studio.html' and '/assets/image-upload.js' not in html:
        html=html.replace('<script src="/assets/studio-page-editor.js?v=1"></script>','<script src="/assets/image-upload.js?v=1"></script>\n<script src="/assets/studio-page-editor.js?v=1"></script>')
    html=html.replace('content.js?v=14','content.js?v=15').replace('studio.js?v=39','studio.js?v=40').replace('site.css?v=10','site.css?v=11')
    path.write_text(html)
for name in ['api/_giving-receipt.js','api/donor-portal.js']:
    p=ROOT/name;p.write_text(p.read_text().replace('https://www.fairviewbaptisttemple.com/assets/logo-fairview-2026.png','https://www.fairviewbaptisttemple.com'+logo['appleTouchIcon']))
