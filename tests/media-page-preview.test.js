const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const preview = require('../assets/media-page-preview.js');
const layout = require('../assets/page-editor.js');

const origin = 'https://fairview.example';

test('preview URLs preserve the watch tab and existing query parameters', () => {
  for (const hash of ['#live', '#messages', '#music']) {
    const result = preview.previewUrl('/watch?view=featured' + hash, 'hero_bg_stream_live', origin);
    assert.equal(result.charAt(0), '/');
    const url = new URL(result, origin);
    assert.equal(url.origin, origin);
    assert.equal(url.pathname, '/watch');
    assert.equal(url.hash, hash);
    assert.equal(url.searchParams.get('view'), 'featured');
    assert.equal(url.searchParams.get('studio_preview'), '1');
    assert.equal(url.searchParams.get('media_slot'), 'hero_bg_stream_live');
  }
});

test('preview URLs replace preview parameters and encode a valid slot', () => {
  const result = preview.previewUrl('/?studio_preview=0&media_slot=old#contact', 'photo:visit', origin);
  assert.match(result, /media_slot=photo%3Avisit/);
  const url = new URL(result, origin);
  assert.deepEqual(url.searchParams.getAll('studio_preview'), ['1']);
  assert.deepEqual(url.searchParams.getAll('media_slot'), ['photo:visit']);
  assert.equal(url.hash, '#contact');
});

test('preview URLs reject external, executable and malformed destinations or slots', () => {
  for (const input of ['https://other.example/watch', 'javascript:alert(1)', '//other.example/watch', '/\\other.example', '/watch\n', 'watch', null]) {
    assert.equal(preview.previewUrl(input, 'hero_bg_home', origin), '', String(input));
  }
  for (const slot of ['', 'hero bg', '<img>', '__proto__', 'constructor', 'prototype', 'x'.repeat(121), null]) {
    assert.equal(preview.previewUrl('/watch#messages', slot, origin), '', String(slot));
  }
  assert.equal(preview.previewUrl('/watch', 'hero_bg_home', 'not an origin'), '');
});

test('payload copies only safe own string values without changing the input', () => {
  const content = Object.create({ inherited: 'Do not send' });
  Object.assign(content, {
    home_heading: 'Welcome *home*', home_heading_color: '#123456',
    media_style_hero_bg_home: '{"source":"image"}', empty: '',
    nested: { unsafe: true }, array: ['one'], number: 3, boolean: false,
    'bad key': 'No', ['x'.repeat(121)]: 'No', too_long: 'x'.repeat(50001),
    boundary: 'x'.repeat(50000)
  });
  Object.defineProperty(content, '__proto__', { value: 'Do not send', enumerable: true });
  content.constructor = 'Do not send'; content.prototype = 'Do not send';
  const before = JSON.stringify(content);
  const message = preview.payload('index', 'hero_bg_home', content, 12);
  assert.equal(message.type, 'fbt:media-preview');
  assert.equal(message.pageId, 'index');
  assert.equal(message.slot, 'hero_bg_home');
  assert.equal(message.requestId, 12);
  assert.deepEqual(Object.keys(message.content), ['home_heading', 'home_heading_color', 'media_style_hero_bg_home', 'empty', 'boundary']);
  assert.equal(message.content.home_heading, 'Welcome *home*');
  assert.equal(message.content.empty, '');
  assert.equal(message.content.boundary.length, 50000);
  assert.equal(JSON.stringify(content), before);
  message.content.home_heading = 'Edited copy';
  assert.equal(content.home_heading, 'Welcome *home*');
  assert.equal(Object.hasOwn(message.content, '__proto__'), false);
  assert.equal({}.unsafe, undefined);
});

test('payload validates scope and normalizes request IDs', () => {
  assert.equal(preview.payload('__proto__', 'hero_bg_home', {}, 1), null);
  assert.equal(preview.payload('index', 'constructor', {}, 1), null);
  assert.equal(preview.payload('bad page', 'hero_bg_home', {}, 1), null);
  assert.equal(preview.payload('404', 'photo_404', {}, 0).pageId, '404');
  for (const requestId of [-1, 1.5, '12', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(preview.payload('index', 'hero_bg_home', {}, requestId).requestId, 0);
  }
  for (const content of [null, undefined, 'text', ['value']]) {
    assert.deepEqual(preview.payload('index', 'hero_bg_home', content, 0).content, {});
  }
});

function surface() {
  const listeners = new Map(), classes = new Set();
  return {
    style: {}, attrs: {}, textContent: '', clientWidth: 600,
    classList: { add: value => classes.add(value), toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value), contains: value => classes.has(value) },
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { if (listeners.has(type)) listeners.get(type).delete(listener); },
    emit(type, event = {}) { for (const listener of listeners.get(type) || []) listener(event); },
    listenerCount(type) { return (listeners.get(type) || new Set()).size; },
    getAttribute(name) { return this.attrs[name] || null; },
    set src(value) { this.attrs.src = value; }, get src() { return this.attrs.src; }
  };
}
function mounted() {
  const posts = [], timers = new Map(), observers = [];
  const frame = surface(), shell = surface(), status = surface(), open = surface(), element = surface();
  frame.contentWindow = { postMessage(message, targetOrigin) { posts.push({ message, targetOrigin }); } };
  element.querySelector = selector => ({ '[data-mpp-frame]': frame, '.mpp-frame-shell': shell, '[data-mpp-status]': status, '[data-mpp-open]': open })[selector];
  let timerId = 0;
  const window = Object.assign(surface(), {
    location: { origin }, innerHeight: 1000,
    FBTPageLayout: layout, FBT_PAGE_CATALOG: { pages: [{ id: 'index', path: '/' }, { id: 'watch', path: '/watch' }] },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.disconnected = true; }
    }
  });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/media-page-preview.js'), 'utf8'), { window, URL });
  const api = window.FBT_MEDIA_PAGE_PREVIEW.mount({ element });
  const flush = () => { const pending = [...timers.values()]; timers.clear(); for (const callback of pending) callback(); };
  const ready = (event = {}) => window.emit('message', { origin, source: frame.contentWindow, data: { type: 'fbt:page-preview-ready', pageId: 'watch' }, ...event });
  return { api, window, element, frame, shell, status, open, posts, timers, observers, flush, ready };
}

test('mounted preview posts only to its own frame after a matching same-origin ready message', () => {
  const f = mounted();
  f.api.update({ path: '/watch#messages', slot: 'hero_bg_stream_messages', viewport: 'desktop', content: { heading: 'Draft', heading_color: '#123456' } });
  f.flush();
  assert.equal(f.posts.length, 0);
  f.ready({ origin: 'https://other.example' });
  f.ready({ source: {} });
  f.ready({ data: { type: 'fbt:page-preview-ready', pageId: 'index' } });
  f.ready({ data: { type: 'other', pageId: 'watch' } });
  assert.equal(f.posts.length, 0);
  f.ready();
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].targetOrigin, origin);
  assert.equal(f.posts[0].message.type, 'fbt:media-preview');
  assert.equal(f.posts[0].message.pageId, 'watch');
  assert.equal(f.posts[0].message.slot, 'hero_bg_stream_messages');
  assert.equal(f.posts[0].message.content.heading_color, '#123456');
  assert.equal(new URL(f.frame.src, origin).hash, '#messages');
  assert.equal(f.open.href, '/watch#messages');
});

test('mounted preview sends changed colors and viewport changes without reloading the page', () => {
  const f = mounted();
  const initial = { path: '/watch#live', slot: 'hero_bg_stream_live', viewport: 'desktop', content: { heading: 'Draft', heading_color: '#123456' } };
  f.api.update(initial); f.frame.emit('load'); f.flush();
  const source = f.frame.src, firstRequest = f.posts[0].message.requestId;
  assert.equal(f.posts.length, 1);
  assert.equal(f.frame.style.width, '1200px');
  assert.equal(f.frame.style.transform, 'scale(0.5)');
  f.api.update(initial); f.flush();
  assert.equal(f.posts.length, 1);
  f.api.update({ ...initial, content: { ...initial.content, heading_color: '' } }); f.flush();
  assert.equal(f.posts.length, 2);
  assert.equal(f.posts[1].message.content.heading_color, '');
  assert.ok(f.posts[1].message.requestId > firstRequest);
  assert.equal(f.frame.src, source);
  f.api.update({ ...initial, viewport: 'mobile' }); f.flush();
  assert.equal(f.frame.style.width, '390px');
  assert.equal(f.shell.classList.contains('mpp-phone'), true);
});

test('closing cancels queued drafts and destroying removes listeners and resize observer', () => {
  const f = mounted();
  f.api.update({ path: '/watch', slot: 'hero_bg_stream_live', viewport: 'desktop', content: { heading: 'Draft' } });
  f.api.close(); f.ready(); f.frame.emit('load'); f.flush();
  assert.equal(f.frame.src, 'about:blank');
  assert.equal(f.posts.length, 0);
  assert.equal(f.timers.size, 0);
  f.api.destroy();
  assert.equal(f.window.listenerCount('message'), 0);
  assert.equal(f.window.listenerCount('resize'), 0);
  assert.equal(f.frame.listenerCount('load'), 0);
  assert.equal(f.observers[0].disconnected, true);
  assert.equal(f.element.__fbtMediaPreview, undefined);
  f.api.update({ path: '/watch', slot: 'hero_bg_stream_live', content: {} });
  assert.equal(f.frame.src, 'about:blank');
});
