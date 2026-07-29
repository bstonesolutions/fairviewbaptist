const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  parseDuration,
  classifyVideo,
  isMessageVideo,
} = require('../api/_message-classification');
const sitemap = require('../api/sitemap');
const catalog = require('../assets/catalog.json');

test('message classifier parses YouTube and numeric durations', function () {
  assert.equal(parseDuration('PT1H2M3S'), 3723);
  assert.equal(parseDuration('PT47M'), 2820);
  assert.equal(parseDuration(74), 74);
  assert.equal(parseDuration('not-a-duration'), null);
});

test('message classifier rejects clips, services, and music before accepting sermons', function () {
  assert.equal(classifyVideo({ title: 'A sermon clip', duration: 60 }), 'clip');
  assert.equal(classifyVideo({ title: 'Sunday Worship 7.19.26', duration: 5400 }), 'service');
  assert.equal(classifyVideo({ title: '"Come Jesus Come"', duration: 260 }), 'music');
  assert.equal(classifyVideo({
    title: 'Faith in the Storm | Acts 16 | Pastor Michael Spurlock',
    description: 'A message from Fairview Baptist Temple.',
    duration: 2400,
  }), 'message');
  assert.equal(isMessageVideo({ title: 'Church announcement', duration: 180 }), false);
});

test('Studio type overrides are authoritative', function () {
  const service = { id: 'service12345', title: 'Sunday Worship 7.19.26', duration: 5400 };
  const sermon = { id: 'sermon123456', title: 'Grace | Romans 5 | Pastor Michael Spurlock', duration: 2200 };
  assert.equal(classifyVideo(service, { type: 'message' }), 'message');
  assert.equal(classifyVideo(sermon, { type: 'clip' }), 'clip');
  assert.equal(classifyVideo(sermon, { type: 'service' }), 'service');
  assert.equal(classifyVideo(sermon, { type: 'music' }), 'music');
});

test('representative uploads keep sermons separate from services, songs, and shorts', function () {
  // The bundled catalog ships empty until Fairview Baptist Temple videos are
  // snapshotted, so these fixtures stand in for typical uploads.
  assert.equal(classifyVideo({
    id: 'sermonvideo1',
    title: 'Help from the Hills | Psalm 121 | 6.28.26 | Pastor Michael Spurlock',
    duration: 2400,
  }), 'message');
  assert.equal(classifyVideo({
    id: 'servicevid12',
    title: 'Fairview Baptist Temple 6.29.26',
    duration: 5400,
  }), 'service');
  assert.equal(classifyVideo({ id: 'musicvideo12', title: '"He Keeps Me Singing"', duration: 260 }), 'music');
  assert.equal(classifyVideo({ id: 'clipvideo123', title: 'A quick word #hope', duration: 45 }), 'clip');
  assert.equal(Array.isArray(catalog.items), true);
});

test('a newly posted dated sermon remains a message, not a service', function () {
  assert.equal(classifyVideo({
    id: 'sQEFoM5UzeM',
    title: 'A Message of Hope | 6.26.26 | Pastor Michael Spurlock',
    description: 'Pastor Michael Spurlock preaches from Psalm 121.',
    duration: 3000,
  }), 'message');
});

test('the sermon tag override file stays wired for Studio enrichment', function () {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'sermon-tags.js'), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);
  assert.equal(typeof context.window.FBT_SERMON_TAGS, 'object');
  assert.notEqual(context.window.FBT_SERMON_TAGS, null);
});

test('sitemap includes auto-classified and explicit messages without leaking other video types', function () {
  const catalog = { items: [
    { id: 'sermon123456', title: 'Grace | Romans 5 | Pastor Michael Spurlock', duration: 2200, published: '2026-07-01T12:00:00Z' },
    { id: 'service12345', title: 'Sunday Worship 7.6.26', duration: 5300, published: '2026-07-07T12:00:00Z' },
    { id: 'music1234567', title: '"He Has"', duration: 250, published: '2026-07-02T12:00:00Z' },
    { id: 'short1234567', title: 'A quick thought #faith', duration: 45, published: '2026-07-03T12:00:00Z' },
    { id: 'forcedclip12', title: 'John 3 | Pastor Michael Spurlock', duration: 2100, published: '2026-07-04T12:00:00Z' },
  ] };
  const entries = sitemap.messageEntries(catalog, [
    { video_id: 'forcedclip12', type: 'clip', updated_at: '2026-07-10T12:00:00Z' },
    { video_id: 'manualmsg123', type: 'message', updated_at: '2026-07-11T12:00:00Z' },
  ]);
  assert.deepEqual(entries.map(function (entry) { return entry.video_id; }), ['manualmsg123', 'sermon123456']);
});
