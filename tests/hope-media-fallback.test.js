const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const styles = require('../assets/media-styles');
const content = fs.readFileSync(path.join(__dirname, '../assets/content.js'), 'utf8');
const studio = fs.readFileSync(path.join(__dirname, '../assets/studio.js'), 'utf8');
const photo = '/assets/hope-original.jpg';
const inheritedStyle = styles.serialize({ source: 'image', overlay: 'none', desktop: { x: 25, y: 45, zoom: 115 } }, 'photo');

function publicBackground() {
  const host = {
    children: [], attributes: { 'data-cms-bg-alt': 'photo_gi_groups' },
    style: { removeProperty() {} },
    getAttribute(name) { return this.attributes[name] || null; },
    removeAttribute(name) { delete this.attributes[name]; },
    querySelector() { return this.children.find(child => child.className === 'cms-bg-media cms-bg-image') || null; },
    appendChild(child) { this.children.push(child); child.parentNode = this; },
    closest() { return null; }
  };
  const context = {
    nonEmpty: value => value != null && String(value).trim() !== '',
    savedMediaStyle: (map, key, kind) => styles.parse(map[styles.styleKey(key)], kind),
    clearMediaAppearance() { host.appliedStyle = null; },
    applyMediaAppearance(node, style) { node.appliedStyle = style; },
    appendMediaOverlay() {},
    makeDecorativeImage(src, className) {
      return { src, className, tagName: 'IMG', remove() { host.children = host.children.filter(child => child !== this); } };
    },
    setPhotoSource(image, src) { image.src = src; }
  };
  vm.createContext(context);
  vm.runInContext(content.slice(content.indexOf('  function applyBackground('), content.indexOf('  var contentMap = null;')), context);
  return { host, apply: map => context.applyBackground(host, 'hero_bg_hope', map) };
}

test('default hydration preserves the alias for the later fetched H.O.P.E. artwork and style', () => {
  const f = publicBackground();
  f.apply({ hero_bg_hope: '', photo_gi_groups: '' });
  assert.equal(f.host.getAttribute('data-cms-bg-alt'), 'photo_gi_groups');
  f.apply({ photo_gi_groups: photo, media_style_photo_gi_groups: inheritedStyle });
  assert.equal(f.host.querySelector().src, photo);
  assert.equal(f.host.appliedStyle.source, 'image');
  assert.equal(f.host.appliedStyle.desktop.x, 25);
  f.apply({ photo_gi_groups: '/assets/hope-updated.jpg', media_style_photo_gi_groups: inheritedStyle });
  assert.equal(f.host.querySelector().src, '/assets/hope-updated.jpg');
  assert.equal(f.host.getAttribute('data-cms-bg-alt'), 'photo_gi_groups');
});

test('an explicit color background does not inherit the old H.O.P.E. artwork', () => {
  const f = publicBackground();
  f.apply({ photo_gi_groups: photo, media_style_photo_gi_groups: inheritedStyle });
  f.apply({ photo_gi_groups: photo, media_style_hero_bg_hope: styles.serialize({ source: 'background' }, 'background') });
  assert.equal(f.host.querySelector(), null);
  assert.equal(f.host.appliedStyle.source, 'background');
  assert.equal(f.host.getAttribute('data-cms-bg-alt'), 'photo_gi_groups');
});

function studioBackground() {
  const meta = { key: 'hero_bg_hope', kind: 'background', fallbackKey: 'photo_gi_groups' };
  const other = { key: 'photo_gi_groups', kind: 'photo' };
  const context = {
    mediaVals: { photo_gi_groups: photo, media_style_photo_gi_groups: inheritedStyle },
    mediaStyleApi: styles, mediaByKey: key => key === other.key ? other : null,
    nn: value => value == null ? '' : String(value).trim(),
    mediaEdit: { meta, style: styles.parse(inheritedStyle, 'background'), pendingValues: {}, restoreOriginal: false }
  };
  vm.createContext(context);
  const start = studio.indexOf('  function mediaVideoKey(');
  const end = studio.indexOf('  function mediaHasCustomStyle(');
  const helpers = studio.slice(start, end).replace(/  function mediaByKey[^\n]*\n/g, '');
  vm.runInContext(helpers, context);
  return { context, meta };
}

test('Studio resolves the same inherited photo and framing as the public Home band', () => {
  const { context, meta } = studioBackground();
  assert.equal(context.mediaImage(meta, false), photo);
  const style = context.mediaStoredStyle(meta);
  assert.equal(style.source, 'image');
  assert.equal(style.desktop.x, 25);
  context.mediaVals.hero_bg_hope = '/assets/dedicated.jpg';
  assert.equal(context.mediaImage(meta, false), '/assets/dedicated.jpg');
  assert.equal(context.mediaStoredStyle(meta), null);
});

test('an inherited image is retained with the new own-slot design, in preview and save values', () => {
  const { context, meta } = studioBackground();
  const values = context.mediaDesignValues(context.mediaEdit);
  assert.equal(values.hero_bg_hope, photo);
  assert.deepEqual(Object.keys(context.mediaEdit.pendingValues), []);
  const f = publicBackground();
  f.apply({ ...context.mediaVals, ...values, media_style_hero_bg_hope: styles.serialize(context.mediaEdit.style, meta.kind) });
  assert.equal(f.host.querySelector().src, photo);
});

test('explicit removal or color-only drafts do not silently copy inherited artwork', () => {
  const { context, meta } = studioBackground();
  context.mediaEdit.style.source = 'background';
  assert.deepEqual(Object.keys(context.mediaDesignValues(context.mediaEdit)), []);
  context.mediaVals.media_style_hero_bg_hope = styles.serialize({ source: 'background' }, 'background');
  assert.equal(context.mediaImage(meta, false), '');
  assert.equal(context.mediaStoredStyle(meta).source, 'background');
  context.mediaEdit.pendingValues[meta.key] = '';
  assert.equal(context.mediaDesignValues(context.mediaEdit)[meta.key], '');
});
