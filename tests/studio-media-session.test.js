const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mediaStyles = require('../assets/media-styles');

const studio = fs.readFileSync(path.join(__dirname, '../assets/studio.js'), 'utf8');
function functions(from, to) {
  return studio.slice(studio.indexOf('  function ' + from + '('), studio.indexOf('  function ' + to + '('));
}
function node(tag) {
  const attributes = {}, children = [];
  const element = {
    tagName: tag.toUpperCase(), children, style: {}, className: '',
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return attributes[name] || null; },
    appendChild(child) { children.push(child); child.parentNode = element; },
    querySelectorAll(selector) {
      const found = [];
      for (const child of children) {
        if (selector[0] === '.' && child.className.split(' ').includes(selector.slice(1))) found.push(child);
        found.push(...child.querySelectorAll(selector));
      }
      return found;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    play() { return Promise.resolve(); }
  };
  element.classList = {
    add(...names) { element.className = [...new Set(element.className.split(' ').filter(Boolean).concat(names))].join(' '); }
  };
  Object.defineProperty(element, 'innerHTML', { set() { children.length = 0; }, get() { return ''; } });
  return element;
}
function renderer(meta) {
  const stage = node('div');
  const context = {
    mediaEdit: { meta, style: mediaStyles.defaults(meta.kind), viewport: 'desktop', restoreOriginal: false },
    mediaStyleApi: mediaStyles,
    mediaImage: item => item && item.image || '',
    mediaVideo: item => item && item.video || '',
    mediaHasImage: item => !!(item && (item.image || item.builtIn)),
    mediaByKey: key => ({ key, image: '/assets/' + key + '.jpg' }),
    mediaSettingValue: () => 'panel',
    mediaStyleKey: item => 'media_style_' + item.key,
    mediaBackdrop: () => '#ffffff',
    styleMediaPreviewCopy() {},
    contentDefaults: {}, IMG_SVG: '',
    document: { createElement: node }, window: {},
    $: id => { assert.equal(id, 'media-stage'); return stage; }
  };
  vm.createContext(context);
  vm.runInContext(functions('mediaActiveSource', 'styleMediaPreviewCopy') + functions('paintMediaStage', 'syncMediaEditor'), context);
  const draw = () => context.mediaRender(stage, context.mediaEdit.meta, context.mediaEdit.style, 'desktop', true);
  draw();
  return { context, stage, draw, object: () => stage.querySelector('.media-preview-object') };
}

test('opening another image slot replaces the previous image even though both sources are images', () => {
  const f = renderer({ key: 'pastor_photo', kind: 'photo', image: '/assets/pastor.jpg' });
  const first = f.object();
  assert.equal(first.src, '/assets/pastor.jpg');
  f.context.mediaEdit.meta = { key: 'staff1_photo', kind: 'photo', image: '/assets/staff1.jpg' };
  f.context.paintMediaStage();
  assert.notEqual(f.object(), first);
  assert.equal(f.object().src, '/assets/staff1.jpg');
});

test('changing the image URL in one slot replaces its previously rendered image', () => {
  const f = renderer({ key: 'pastor_photo', kind: 'photo', image: '/assets/old.jpg' });
  const first = f.object();
  f.context.mediaEdit.meta.image = '/assets/fresh.jpg';
  f.context.paintMediaStage();
  assert.notEqual(f.object(), first);
  assert.equal(f.object().src, '/assets/fresh.jpg');
});

test('framing and opacity changes keep the same image element', () => {
  const f = renderer({ key: 'pastor_photo', kind: 'photo', image: '/assets/pastor.jpg' });
  const first = f.object();
  f.context.mediaEdit.style.desktop = { x: 35, y: 65, zoom: 140 };
  f.context.mediaEdit.style.imageOpacity = 75;
  f.context.paintMediaStage();
  assert.equal(f.object(), first);
  assert.equal(first.style.transform, 'scale(1.4)');
  assert.equal(first.style.objectPosition, '35% 65%');
  assert.equal(first.style.opacity, '0.75');
});

test('switching video slots replaces the video and poster together', () => {
  const f = renderer({ key: 'hero_bg_home', kind: 'background', noCopy: true, image: '/assets/a.jpg', video: '/assets/a.mp4' });
  const first = f.object();
  f.context.mediaEdit.meta = { key: 'hero_bg_watch', kind: 'background', noCopy: true, image: '/assets/b.jpg', video: '/assets/b.mp4' };
  f.context.paintMediaStage();
  assert.notEqual(f.object(), first);
  assert.equal(f.object().src, '/assets/b.mp4');
  assert.equal(f.object().poster, '/assets/b.jpg');
});

test('every new designer session requests a full initial render', () => {
  const renders = [], elements = {};
  const context = {
    mediaSessionSeq: 0, mediaReady: true, mediaStyleApi: mediaStyles,
    mediaByKey: key => ({ key, kind: 'photo', label: key }),
    mediaStoredStyle: () => null, mediaDefaultStyle: () => mediaStyles.defaults('photo'),
    mediaHasCustomStyle: () => false, takeMediaDraft: () => null,
    setMediaBackgroundInert() {}, setMediaEditorMessage() {}, buildMediaTextFields() {}, buildMediaMatch() {},
    syncMediaEditor: rebuild => renders.push(rebuild),
    document: { activeElement: {}, body: node('body') },
    window: { history: { replaceState() {} }, setTimeout() {} },
    $: id => elements[id] || (elements[id] = Object.assign(node('div'), { querySelector: () => ({ scrollTop: 0 }) }))
  };
  vm.createContext(context);
  vm.runInContext(functions('openMediaEditor', 'closeMediaEditor'), context);
  context.openMediaEditor('pastor_photo');
  context.openMediaEditor('staff1_photo');
  assert.equal(renders.length, 2);
  assert.ok(renders.every(rebuild => rebuild !== false));
  assert.equal(context.mediaEdit.meta.key, 'staff1_photo');
});
