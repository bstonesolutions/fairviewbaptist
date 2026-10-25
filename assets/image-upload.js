/* Prepare smaller web copies for Studio uploads. The selected original is never changed. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FBTImageUpload = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';
  var prepared = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function dimensions(width, height, maxEdge) {
    width = Number(width); height = Number(height);
    maxEdge = maxEdge == null ? 1920 : Number(maxEdge);
    if (!isFinite(width) || !isFinite(height) || !isFinite(maxEdge) || width < 1 || height < 1 || maxEdge < 1) return null;
    var scale = Math.min(1, maxEdge / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }
  function shouldUse(originalBytes, optimizedBytes) {
    return Number.isFinite(originalBytes) && Number.isFinite(optimizedBytes) && originalBytes > 0 && optimizedBytes > 0 && optimizedBytes < originalBytes * .85;
  }
  function candidateType(file) {
    if (!file) return '';
    var type = String(file.type || '').toLowerCase();
    if (!type) {
      var extension = (String(file.name || '').match(/\.([a-z0-9]+)$/i) || [])[1];
      type = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })[String(extension || '').toLowerCase()] || '';
    }
    return ['image/jpeg', 'image/png', 'image/webp'].indexOf(type) >= 0 ? type : '';
  }
  function ascii(bytes, at, count) {
    var value = '';
    for (var i = at; i < at + count && i < bytes.length; i++) value += String.fromCharCode(bytes[i]);
    return value;
  }
  function animationState(bytes, type) {
    if (!bytes || !bytes.length) return 'unknown';
    if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'static' : 'unknown';
    if (type === 'image/webp') {
      if (bytes.length < 21 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return 'unknown';
      var chunkSize = bytes[16] + (bytes[17] << 8) + (bytes[18] << 16) + bytes[19] * 0x1000000;
      if (20 + chunkSize > bytes.length) return 'unknown';
      var format = ascii(bytes, 12, 4);
      if (format === 'VP8X') return chunkSize < 10 ? 'unknown' : bytes[20] & 2 ? 'animated' : 'static';
      return format === 'VP8 ' || format === 'VP8L' ? 'static' : 'unknown';
    }
    if (type === 'image/png') {
      if (bytes.length < 8 || ascii(bytes, 0, 8) !== '\x89PNG\r\n\x1a\n') return 'unknown';
      for (var at = 8; at + 12 <= bytes.length;) {
        var size = ((bytes[at] * 0x1000000) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3]);
        var kind = ascii(bytes, at + 4, 4);
        if (at + size + 12 > bytes.length) return 'unknown';
        if (kind === 'acTL') return 'animated';
        if (kind === 'IDAT') return 'static';
        at += size + 12;
      }
    }
    return 'unknown';
  }
  function decode(file) {
    return new Promise(function (resolve, reject) {
      var url = root.URL.createObjectURL(file), image = new root.Image(), timer;
      function clear() { root.clearTimeout(timer); image.onload = null; image.onerror = null; }
      image.onload = function () { clear(); resolve({ image: image, release: function () { root.URL.revokeObjectURL(url); } }); };
      image.onerror = function () { clear(); root.URL.revokeObjectURL(url); reject(new Error('Image could not be decoded.')); };
      timer = root.setTimeout(function () { clear(); image.src = ''; root.URL.revokeObjectURL(url); reject(new Error('Image decoding timed out.')); }, 15000);
      image.src = url;
    });
  }
  function encode(canvas) {
    return new Promise(function (resolve) {
      var timer = root.setTimeout(function () { resolve(null); }, 15000);
      try { canvas.toBlob(function (blob) { root.clearTimeout(timer); resolve(blob); }, 'image/webp', .86); }
      catch (error) { root.clearTimeout(timer); resolve(null); }
    });
  }
  async function convert(file) {
    var type = candidateType(file);
    if (!type || !root || !root.document || !root.File || !root.URL || !file.size || file.size < 100 * 1024) return file;
    var decoded, canvas;
    try {
      var header = new Uint8Array(await (type === 'image/jpeg' ? file.slice(0, 3) : file).arrayBuffer());
      if (animationState(header, type) !== 'static') return file;
      decoded = await decode(file);
      var target = dimensions(decoded.image.naturalWidth, decoded.image.naturalHeight);
      if (!target) return file;
      canvas = root.document.createElement('canvas');
      canvas.width = target.width; canvas.height = target.height;
      var context = canvas.getContext('2d', { willReadFrequently: type !== 'image/jpeg' });
      if (!context || typeof canvas.toBlob !== 'function') return file;
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(decoded.image, 0, 0, target.width, target.height);
      // Transparent artwork and logos retain their original format and pixels.
      if (type !== 'image/jpeg') {
        var pixels = context.getImageData(0, 0, target.width, target.height).data;
        for (var i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) return file;
      }
      var blob = await encode(canvas);
      // Unsupported browsers may return PNG instead of the requested WebP.
      if (!blob || blob.type !== 'image/webp' || !shouldUse(file.size, blob.size)) return file;
      var name = String(file.name || 'photo').replace(/\.[^.]+$/, '') + '.webp';
      return new root.File([blob], name, { type: 'image/webp', lastModified: file.lastModified || Date.now() });
    } catch (error) {
      return file;
    } finally {
      if (decoded) decoded.release();
      if (canvas) { canvas.width = 1; canvas.height = 1; }
    }
  }
  function prepare(file) {
    if (!file || typeof file !== 'object') return Promise.resolve(file);
    if (prepared && prepared.has(file)) return prepared.get(file);
    var result = convert(file);
    if (prepared) {
      prepared.set(file, result);
      result.then(function (output) { if (output && typeof output === 'object') prepared.set(output, Promise.resolve(output)); });
    }
    return result;
  }
  return { prepare: prepare, dimensions: dimensions, shouldUse: shouldUse, candidateType: candidateType, animationState: animationState };
});
