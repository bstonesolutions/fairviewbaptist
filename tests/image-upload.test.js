const test = require('node:test');
const assert = require('node:assert/strict');
const upload = require('../assets/image-upload.js');

test('dimensions reduce large images proportionally without upscaling smaller originals', () => {
  assert.deepEqual(upload.dimensions(3024, 4032), { width: 1440, height: 1920 });
  assert.deepEqual(upload.dimensions(4032, 3024), { width: 1920, height: 1440 });
  assert.deepEqual(upload.dimensions(1280, 720), { width: 1280, height: 720 });
  assert.deepEqual(upload.dimensions(100, 100), { width: 100, height: 100 });
  assert.deepEqual(upload.dimensions(2400, 1600, 1200), { width: 1200, height: 800 });
  const thin = upload.dimensions(1, 10000);
  assert.equal(thin.width, 1);
  assert.equal(thin.height, 1920);
});

test('invalid dimensions or resize limits cannot produce a canvas size', () => {
  for (const [width, height, maxEdge] of [
    [0, 100, 1920], [100, 0, 1920], [-1, 100, 1920], [100, -1, 1920],
    [NaN, 100, 1920], [100, Infinity, 1920], [100, 100, 0],
    [100, 100, -1], [100, 100, NaN], [100, 100, Infinity]
  ]) assert.equal(upload.dimensions(width, height, maxEdge), null);
});

test('optimized output is accepted only for a reduction greater than fifteen percent', () => {
  assert.equal(upload.shouldUse(1000, 849), true);
  assert.equal(upload.shouldUse(1000, 850), false);
  assert.equal(upload.shouldUse(1000, 851), false);
  assert.equal(upload.shouldUse(1000, 1000), false);
  assert.equal(upload.shouldUse(1000, 1100), false);
  for (const [original, optimized] of [[0, 10], [-1, 10], [1000, 0], [1000, -1], [NaN, 10], [1000, NaN], [Infinity, 10], [1000, Infinity]]) {
    assert.equal(upload.shouldUse(original, optimized), false);
  }
});

test('candidate types include supported still formats and infer extensions only without a MIME type', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(upload.candidateType({ name: 'upload', type }), type);
  }
  for (const [name, type] of [['portrait.JPG', 'image/jpeg'], ['portrait.jpeg', 'image/jpeg'], ['logo.PNG', 'image/png'], ['photo.webp', 'image/webp']]) {
    assert.equal(upload.candidateType({ name, type: '' }), type);
    assert.equal(upload.candidateType({ name }), type);
  }
  for (const [name, type] of [
    ['animation.gif', 'image/gif'], ['vector.svg', 'image/svg+xml'], ['photo.avif', 'image/avif'],
    ['looks-like.jpg', 'application/octet-stream'], ['looks-like.png', 'image/gif'], ['looks-like.webp', 'image/svg+xml'],
    ['animation.gif', ''], ['vector.svg', ''], ['photo.avif', ''], ['unknown', ''], ['archive.jpg.exe', '']
  ]) assert.equal(upload.candidateType({ name, type }), '');
});

function ascii(value) { return Buffer.from(value, 'ascii'); }
function pngChunk(type, data) {
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  // CRC bytes are present; animation detection does not decode pixel data.
  return Buffer.concat([size, ascii(type), data, Buffer.alloc(4)]);
}
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function png(...chunks) {
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return new Uint8Array(Buffer.concat([pngSignature, pngChunk('IHDR', header), ...chunks]));
}
function webp(type, data) {
  const chunkSize = Buffer.alloc(4); chunkSize.writeUInt32LE(data.length);
  const body = Buffer.concat([ascii('WEBP'), ascii(type), chunkSize, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  const size = Buffer.alloc(4); size.writeUInt32LE(body.length);
  return new Uint8Array(Buffer.concat([ascii('RIFF'), size, body]));
}

test('PNG detection distinguishes APNG animation from a normal first image-data chunk', () => {
  const control = Buffer.alloc(8); control.writeUInt32BE(2);
  const data = pngChunk('IDAT', Buffer.from([1, 2, 3]));
  assert.equal(upload.animationState(png(pngChunk('acTL', control), data), 'image/png'), 'animated');
  assert.equal(upload.animationState(png(pngChunk('tEXt', ascii('Author\0Fairview')), data), 'image/png'), 'static');
});

test('PNG detection leaves invalid, incomplete or indeterminate containers unmodified', () => {
  const animated = png(pngChunk('acTL', Buffer.alloc(8)));
  const truncated = animated.subarray(0, animated.length - 6);
  const invalidSignature = png(pngChunk('IDAT', Buffer.alloc(4))); invalidSignature[0] = 0;
  const impossibleLength = png(pngChunk('IDAT', Buffer.alloc(4)));
  // IHDR occupies bytes 8–32; the following chunk cannot claim bytes outside the buffer.
  impossibleLength.set([127, 255, 255, 255], 33);
  for (const value of [new Uint8Array(), new Uint8Array(pngSignature), truncated, invalidSignature, impossibleLength, png(pngChunk('IEND', Buffer.alloc(0)))]) {
    assert.equal(upload.animationState(value, 'image/png'), 'unknown');
  }
});

test('WebP detection respects the extended animation flag and simple still-image chunks', () => {
  const animated = Buffer.alloc(10); animated[0] = 2;
  const alphaStill = Buffer.alloc(10); alphaStill[0] = 16;
  assert.equal(upload.animationState(webp('VP8X', animated), 'image/webp'), 'animated');
  assert.equal(upload.animationState(webp('VP8X', alphaStill), 'image/webp'), 'static');
  assert.equal(upload.animationState(webp('VP8 ', Buffer.alloc(10)), 'image/webp'), 'static');
  assert.equal(upload.animationState(webp('VP8L', Buffer.from([47, 0, 0, 0, 0])), 'image/webp'), 'static');
});

test('WebP detection treats invalid signatures and truncated chunks as unknown', () => {
  const complete = webp('VP8X', Buffer.alloc(10));
  const invalidRiff = complete.slice(); invalidRiff[0] = 0;
  const invalidWebp = complete.slice(); invalidWebp[8] = 0;
  const oversizedChunk = complete.slice(); oversizedChunk.set([255, 255, 255, 127], 16);
  for (const value of [new Uint8Array(), complete.subarray(0, 12), complete.subarray(0, 21), invalidRiff, invalidWebp, oversizedChunk, webp('JUNK', Buffer.alloc(10))]) {
    assert.equal(upload.animationState(value, 'image/webp'), 'unknown');
  }
});

test('JPEG is classified as static and unsupported formats remain unknown', () => {
  const jpeg = new Uint8Array([255, 216, 255, 217]);
  assert.equal(upload.animationState(jpeg, 'image/jpeg'), 'static');
  assert.equal(upload.animationState(new Uint8Array(Buffer.from('GIF89a')), 'image/jpeg'), 'unknown');
  assert.equal(upload.animationState(jpeg.subarray(0, 2), 'image/jpeg'), 'unknown');
  for (const type of ['image/gif', 'image/svg+xml', 'image/avif', '']) {
    assert.equal(upload.animationState(jpeg, type), 'unknown');
  }
});
