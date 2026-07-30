const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const media = require('../assets/media-styles');

test('media style rows use a stable companion key', function () {
  assert.equal(media.styleKey('hero_bg_home'), 'media_style_hero_bg_home');
  assert.equal(media.styleKey('photo_welcome'), 'media_style_photo_welcome');
  assert.equal(media.styleKey('bad key'), '');
});

test('missing and malformed style JSON preserve the legacy path', function () {
  assert.equal(media.parse('', 'background'), null);
  assert.equal(media.parse('{nope', 'background'), null);
  assert.equal(media.parse('[]', 'background'), null);
  assert.equal(media.parse('"color:red"', 'background'), null);
});

test('normalization clamps placement and rejects raw CSS values', function () {
  const style = media.normalize({
    source: 'javascript:alert(1)',
    fit: 'url(https://bad.example)',
    background: 'linear-gradient(red,blue)',
    backgroundColor: 'red;position:fixed',
    imageOpacity: -20,
    overlay: 'url(x)',
    overlayColor: '#12345G',
    overlayOpacity: 400,
    desktop: { x: -90, y: 500, zoom: 900 },
    mobile: { x: '20', y: '70', zoom: '125' },
    cssText: 'background:url(https://bad.example)',
  }, 'background');

  assert.equal(style.source, 'auto');
  assert.equal(style.fit, 'cover');
  assert.equal(style.background, 'theme');
  assert.equal(style.backgroundColor, '#123B42');
  assert.equal(style.imageOpacity, 0);
  assert.equal(style.overlay, 'brand');
  assert.equal(style.overlayColor, '#0A252C');
  assert.equal(style.overlayOpacity, 100);
  assert.deepEqual(style.desktop, { x: 0, y: 100, zoom: 200 });
  assert.deepEqual(style.mobile, { x: 20, y: 70, zoom: 125 });
  assert.equal(Object.hasOwn(style, 'cssText'), false);
});

test('desktop and phone presentations stay independent', function () {
  const style = {
    source: 'image',
    fit: 'contain',
    background: 'custom',
    backgroundColor: '#224466',
    imageOpacity: 73,
    overlay: 'left',
    overlayColor: '#112233',
    overlayOpacity: 60,
    desktop: { x: 18, y: 42, zoom: 110 },
    mobile: { x: 74, y: 24, zoom: 145 },
  };
  const desktop = media.presentation(style, 'background', 'desktop');
  const phone = media.presentation(style, 'background', 'mobile');

  assert.equal(desktop.fit, 'contain');
  assert.equal(desktop.background, '#224466');
  assert.equal(desktop.imageOpacity, 0.73);
  assert.deepEqual([desktop.x, desktop.y, desktop.zoom], [18, 42, 1.1]);
  assert.deepEqual([phone.x, phone.y, phone.zoom], [74, 24, 1.45]);
  assert.match(desktop.overlay, /^linear-gradient\(90deg,rgba\(/);
  assert.equal(desktop.overlay.includes('url('), false);
});

test('serialization strips unknown properties and round trips safely', function () {
  const value = media.serialize({
    source: 'background',
    background: 'deep',
    overlay: 'none',
    overlayOpacity: 0,
    desktop: { x: 12, y: 34, zoom: 156 },
    mobile: { x: 65, y: 43, zoom: 111 },
    secret: 'must not survive',
  }, 'background');
  const parsed = media.parse(value, 'background');

  assert.equal(parsed.source, 'background');
  assert.equal(parsed.background, 'deep');
  assert.equal(parsed.overlay, 'none');
  assert.equal(parsed.desktop.zoom, 156);
  assert.equal(Object.hasOwn(parsed, 'secret'), false);
});

test('ordinary photo slots cannot select a video source', function () {
  assert.equal(media.normalize({ source: 'video' }, 'photo').source, 'auto');
  assert.equal(media.normalize({ source: 'video' }, 'background').source, 'video');
});

test('Studio stages asset changes and publishes them with the design', function () {
  const studio = fs.readFileSync(path.join(__dirname, '../assets/studio.js'), 'utf8');
  const upload = studio.slice(studio.indexOf('function uploadMedia'), studio.indexOf('function loadMedia'));
  const save = studio.slice(studio.indexOf('function saveMediaDesign'), studio.indexOf('function restoreMediaLook'));

  assert.match(upload, /edit\.pendingValues\[key\] = url/);
  assert.doesNotMatch(upload, /from\('site_content'\)\.upsert/);
  assert.match(save, /Object\.keys\(edit\.pendingValues\)/);
  assert.match(save, /upsert\(rows,/);
  assert.match(save, /if \(!sameMediaSession\(edit\)\) return;/);
  assert.doesNotMatch(save, /closeMediaEditor/);
  assert.match(studio, /Cancel keeps it/);
  assert.match(studio, /mediaEdit\.busy \|\| mediaEdit\.style\.source === 'background'/);
});

test('the designer text panel has every helper it calls', function () {
  const studio = fs.readFileSync(path.join(__dirname, '../assets/studio.js'), 'utf8');
  // A rewrite once swallowed mediaShadowNone and silently emptied the text
  // panel; assert every helper the panel calls is actually defined.
  ['mediaShadowNone', 'mediaColorRoles', 'mediaColorValue', 'mediaColorAuto',
   'mediaTextFields', 'mediaTextValue', 'stageCopyHtml', 'refreshStageText',
   'buildMediaTextFields', 'buildMediaMatch', 'applyMediaMatch', 'undoMediaMatch'].forEach(function (fn) {
    assert.match(studio, new RegExp('function ' + fn + '\\('), fn + ' must be defined');
    assert.match(studio, new RegExp('(?<!function )' + fn + '\\b'), fn + ' must be used');
  });
});

test('public media supports a color-only optional photo without changing legacy photos', function () {
  const content = fs.readFileSync(path.join(__dirname, '../assets/content.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../assets/site.css'), 'utf8');

  assert.match(content, /photoStyle\.source === 'background'/);
  assert.match(content, /reveal\(el\)/);
  assert.match(css, /\.visit-photo\.cms-media-styled\{aspect-ratio:16\/9/);
  assert.match(css, /\.visit-photo img\{[^}]*max-height:480px/);
});

test('Studio uses target-specific hero and photo preview shapes', function () {
  const studio = fs.readFileSync(path.join(__dirname, '../assets/studio.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../studio.html'), 'utf8');

  assert.match(studio, /'hero-home'/);
  assert.match(studio, /'hero-page'/);
  assert.match(studio, /'hero-slim'/);
  assert.match(studio, /ratio: 'four-three'/);
  assert.match(html, /\.media-stage\.hero-page\{aspect-ratio:16\/5/);
  assert.match(html, /\.media-stage\.mobile\.hero-page\{[^}]*aspect-ratio:1/);
});
