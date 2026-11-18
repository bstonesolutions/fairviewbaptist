const test = require('node:test');
const assert = require('node:assert/strict');
const create = require('../assets/mission-map').create;

function element(tag) {
  return {
    tag, style: {}, children: [], listeners: {},
    appendChild(child) { this.children.push(child); child.parent = this; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
    setAttribute() {},
    addEventListener(name, listener) { this.listeners[name] = listener; }
  };
}
function fixture() {
  const scripts = [], layers = [], timers = new Map();
  let nextTimer = 0;
  const root = {
    document: { createElement: element, head: element('head') },
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    L: { DomEvent: { disableClickPropagation() {}, disableScrollPropagation() {} } }
  };
  const append = root.document.head.appendChild;
  root.document.head.appendChild = function (node) { append.call(this, node); scripts.push(node); };
  function bridge() {
    root.L.maplibreGL = options => {
      const events = {}, container = element('div'), canvas = element('canvas');
      const gl = { on(name, fn) { events[name] = fn; }, getCanvas() { return canvas; } };
      const layer = { options, events, addTo(map) { map.layers.push(this); return this; }, getContainer() { return container; }, getMaplibreMap() { return gl; } };
      layers.push(layer);
      return layer;
    };
  }
  function map() {
    const container = element('div');
    return { layers: [], events: {}, attributionControl: {}, on(name, fn) { this.events[name] = fn; }, getContainer() { return container; }, removeLayer(layer) { this.layers = this.layers.filter(item => item !== layer); } };
  }
  async function ready() {
    scripts.find(node => node.tag === 'link').onload();
    root.maplibregl = { supported: () => true };
    scripts.find(node => node.src && node.src.includes('maplibre-gl-5.')).onload();
    await Promise.resolve();
    bridge();
    scripts.find(node => node.src && node.src.includes('leaflet-maplibre')).onload();
  }
  return { root, scripts, layers, timers, bridge, map, ready, api: create(root) };
}

test('the public and editor maps share lazy resources and one noninteractive English layer each', async () => {
  const f = fixture();
  assert.equal(f.scripts.length, 0);
  const publicMap = f.map(), studioMap = f.map();
  const publicLoad = f.api.addTo(publicMap);
  assert.equal(f.api.addTo(publicMap), publicLoad);
  const studioLoad = f.api.addTo(studioMap);
  assert.equal(f.scripts.length, 2);
  await f.ready();
  const [publicLayer, studioLayer] = await Promise.all([publicLoad, studioLoad]);
  assert.equal(f.scripts.length, 3);
  assert.notEqual(publicLayer, studioLayer);
  assert.equal(publicMap.layers.length, 1);
  assert.equal(studioMap.layers.length, 1);
  for (const layer of f.layers) {
    assert.equal(layer.options.style, '/assets/map-english.json');
    assert.equal(layer.options.interactive, false);
    assert.match(layer.options.attribution, /OpenFreeMap.*OpenMapTiles.*OpenStreetMap/);
    assert.equal(layer.getContainer().style.pointerEvents, 'none');
    assert.equal(layer.getMaplibreMap().getCanvas().style.pointerEvents, 'none');
    layer.events.load();
  }
  assert.equal(f.timers.size, 0);
});

test('failed resources can be retried and never substitute local-language raster tiles', async () => {
  const f = fixture(), map = f.map();
  const failed = f.api.addTo(map);
  f.scripts.find(node => node.tag === 'link').onload();
  f.scripts.find(node => node.tag === 'script').onerror();
  assert.equal(await failed, null);
  assert.equal(map.layers.length, 0);
  const notice = map.getContainer().children[0];
  assert.match(notice.children[0].textContent, /English map could not load/);
  notice.children[1].listeners.click({ preventDefault() {}, stopPropagation() {} });
  f.root.maplibregl = { supported: () => true };
  f.scripts.filter(node => node.tag === 'script').at(-1).onload();
  await Promise.resolve();
  f.bridge();
  f.scripts.at(-1).onload();
  const layer = await f.api.addTo(map);
  assert.ok(layer);
  assert.equal(map.getContainer().children.length, 0);
  assert.ok(f.scripts.every(node => !(node.src || node.href).includes('openstreetmap.org')));
  layer.events.load();
});

test('WebGL and provider failures show a usable retry without intercepting Leaflet pins', async () => {
  const f = fixture(), map = f.map();
  const loaded = f.api.addTo(map);
  await f.ready();
  f.root.maplibregl.supported = () => false;
  assert.equal(await loaded, null);
  assert.equal(map.getContainer().children.length, 1);
  f.root.maplibregl.supported = () => true;
  const layer = await f.api.addTo(map);
  layer.events.load();
  assert.equal(map.getContainer().children.length, 0);
  layer.events.error();
  assert.equal(map.getContainer().children.length, 1);
  assert.equal(layer.getContainer().style.pointerEvents, 'none');
  map.events.unload();
  assert.equal(f.timers.size, 0);
  assert.equal(map.getContainer().children.length, 0);
});
