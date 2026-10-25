/* Serve lightweight display copies while keeping original uploads available. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FBTImages = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';
  function find(value, manifest, origin) {
    manifest = manifest || (root && root.FBT_IMAGE_ASSETS) || {};
    origin = origin || (root && root.location.origin) || 'https://fairviewbaptist.vercel.app';
    var path;
    try { var url = new URL(String(value || ''), origin); if (url.origin !== origin) return null; path = url.pathname; } catch (e) { return null; }
    if (Object.prototype.hasOwnProperty.call(manifest, path)) return { original: path, asset: manifest[path] };
    var keys = Object.keys(manifest);
    for (var i = 0; i < keys.length; i++) {
      var entry = manifest[keys[i]];
      var paths = [entry.src, entry.thumbnail].concat(String(entry.srcset || '').split(',').map(function (v) { return v.trim().split(' ')[0]; }));
      if (paths.indexOf(path) >= 0) return { original: keys[i], asset: entry };
    }
    return null;
  }
  function original(value) { var entry = find(value); return entry ? entry.original : String(value || ''); }
  function source(value, thumbnail) { var entry = find(value); return entry ? (thumbnail ? entry.asset.thumbnail : entry.asset.src) : String(value || ''); }
  function assign(img, value, options) {
    if (!img) return;
    options = options || {};
    var entry = find(value), host = options.host || img.parentElement;
    var box = host && host.getBoundingClientRect ? host.getBoundingClientRect() : null;
    var near = !box || (box.top < (root.innerHeight || 800) * 1.25 && box.bottom > 0);
    img.decoding = 'async';
    img.loading = options.eager || near ? 'eager' : 'lazy';
    img.fetchPriority = options.hero && near ? 'high' : 'auto';
    img.setAttribute('data-image-source', entry ? entry.original : String(value || ''));
    if (entry) {
      img.setAttribute('width', entry.asset.width); img.setAttribute('height', entry.asset.height);
      img.setAttribute('sizes', options.sizes || (options.hero ? '100vw' : '(max-width: 700px) 100vw, 50vw'));
      if (options.thumbnail) img.removeAttribute('srcset');
      else img.setAttribute('srcset', entry.asset.srcset);
    } else { img.removeAttribute('srcset'); img.removeAttribute('sizes'); }
    var next = source(value, options.thumbnail);
    if (img.getAttribute('src') !== next) img.setAttribute('src', next);
  }
  return { find: find, original: original, source: source, assign: assign };
});
