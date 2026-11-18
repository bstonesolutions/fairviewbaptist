/* English missionary basemap shared by the public map and Studio pin editor. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = { create: factory };
  if (root) root.FBTMissionMap = factory(root);
})(typeof window === 'undefined' ? null : window, function (root) {
  'use strict';
  var doc = root.document;
  var vendor = '/assets/vendor/';
  var attribution = '<a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  var loading = null;
  var cssLoaded = false;
  var states = new WeakMap();

  function resource(tag, url) {
    return new Promise(function (resolve, reject) {
      var node = doc.createElement(tag);
      var timer = root.setTimeout(function () { finish(new Error('Map resource timed out')); }, 20000);
      function finish(error) {
        root.clearTimeout(timer);
        node.onload = node.onerror = null;
        if (error) { node.remove(); reject(error); }
        else resolve();
      }
      node.onload = function () { finish(); };
      node.onerror = function () { finish(new Error('Map resource could not load')); };
      if (tag === 'link') { node.rel = 'stylesheet'; node.href = url; }
      else { node.src = url; node.async = true; }
      doc.head.appendChild(node);
    });
  }

  function load() {
    if (loading) return loading;
    var css = cssLoaded ? Promise.resolve() : resource('link', vendor + 'maplibre-gl-5.24.0.css').then(function () { cssLoaded = true; });
    var js = root.maplibregl ? Promise.resolve() : resource('script', vendor + 'maplibre-gl-5.24.0.js');
    loading = Promise.all([css, js.then(function () {
      if (!root.maplibregl) throw new Error('Map renderer is unavailable');
      if (!root.L || !root.L.maplibreGL) return resource('script', vendor + 'leaflet-maplibre-gl-0.0.22.js');
    })]).then(function () {
      if (!root.L || !root.L.maplibreGL) throw new Error('Map bridge is unavailable');
    }).catch(function (error) { loading = null; throw error; });
    return loading;
  }

  function clearNotice(state) {
    if (state.notice) state.notice.remove();
    state.notice = null;
  }

  function showError(map, state) {
    state.failed = true;
    root.clearTimeout(state.timer);
    if (state.notice) return;
    var notice = doc.createElement('div');
    notice.className = 'mission-map-notice';
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:absolute;z-index:800;left:12px;right:12px;bottom:32px;padding:12px;background:var(--paper,#FAF6ED);color:var(--tx,#1F3238);border:1px solid var(--line,#d7ddd9);font:16px/1.4 sans-serif;pointer-events:auto;';
    var message = doc.createElement('span');
    message.textContent = 'The English map could not load. ';
    var retry = doc.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-o';
    retry.textContent = 'Try again';
    retry.style.cssText = 'font-size:12px;padding:6px 10px;margin-left:6px;';
    retry.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      removeLayer(map, state);
      clearNotice(state);
      state.promise = null;
      addTo(map);
    });
    notice.appendChild(message);
    notice.appendChild(retry);
    if (root.L && root.L.DomEvent) {
      root.L.DomEvent.disableClickPropagation(notice);
      root.L.DomEvent.disableScrollPropagation(notice);
    }
    map.getContainer().appendChild(notice);
    state.notice = notice;
  }

  function removeLayer(map, state) {
    root.clearTimeout(state.timer);
    if (!state.layer) return;
    var layer = state.layer;
    state.layer = null;
    try { map.removeLayer(layer); }
    catch (error) {
      // A failed WebGL constructor can leave only the Leaflet container behind.
      var container = layer.getContainer && layer.getContainer();
      if (container) container.remove();
    }
  }

  function addTo(map) {
    var state = states.get(map);
    if (!state) {
      state = { layer: null, promise: null, notice: null, timer: null, failed: false };
      states.set(map, state);
      map.on('unload', function () {
        state.disposed = true;
        root.clearTimeout(state.timer);
        clearNotice(state);
      });
    }
    if (state.promise) return state.promise;
    state.failed = false;
    state.promise = load().then(function () {
      if (state.disposed) return null;
      if (root.maplibregl.supported && !root.maplibregl.supported()) throw new Error('WebGL is unavailable');
      if (!map.attributionControl && root.L.control && root.L.control.attribution) root.L.control.attribution().addTo(map);
      var layer = root.L.maplibreGL({
        style: '/assets/map-english.json',
        interactive: false,
        attribution: attribution
      });
      state.layer = layer;
      layer.addTo(map);
      layer.getContainer().style.pointerEvents = 'none';
      var gl = layer.getMaplibreMap();
      gl.getCanvas().style.pointerEvents = 'none';
      gl.on('error', function () { if (!state.disposed && state.layer === layer) showError(map, state); });
      gl.on('load', function () {
        root.clearTimeout(state.timer);
        if (!state.failed) clearNotice(state);
      });
      state.timer = root.setTimeout(function () {
        if (!state.disposed && state.layer === layer) showError(map, state);
      }, 20000);
      return layer;
    }).catch(function () {
      removeLayer(map, state);
      state.promise = null;
      if (!state.disposed) showError(map, state);
      return null;
    });
    return state.promise;
  }

  return { addTo: addTo };
});
