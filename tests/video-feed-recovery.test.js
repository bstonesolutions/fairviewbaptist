const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const videosApi = require('../api/videos');
const { collectUploads, normalizeWatchMetadata } = videosApi._parse;
const CHANNEL = 'UCpVuAImXOHZcdGDbw6fQLIA';

function player(id, extra = {}) {
  return {
    videoDetails: { videoId: id, channelId: CHANNEL, title: 'Grace | Pastor Michael Spurlock', shortDescription: 'Romans 5', lengthSeconds: '2400', ...extra },
    microformat: { playerMicroformatRenderer: { publishDate: '2026-11-12T05:00:03Z' } },
  };
}

function lockup(id, title) {
  return { lockupViewModel: { contentId: id, contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', metadata: { lockupMetadataViewModel: { title: { content: title } } } } };
}

test('current and legacy YouTube upload grids retain IDs without inventing dates', () => {
  const rows = collectUploads({ contents: [
    lockup('sermon12345', 'Grace | Pastor Michael Spurlock'),
    lockup('sermon12345', 'Duplicate'),
    { videoRenderer: { videoId: 'older123456', title: { runs: [{ text: 'Earlier sermon' }] }, publishedTimeText: { simpleText: '2 days ago' } } },
  ] });
  assert.deepEqual(rows.map(row => row.id), ['sermon12345', 'older123456']);
  assert.equal(rows[1].published, '');
});

test('watch metadata supplies exact dates, duration, channel, and live status', () => {
  const item = { id: 'sermon12345', title: 'Grace' };
  const row = normalizeWatchMetadata(item, player(item.id), CHANNEL);
  assert.equal(row.published, '2026-11-12T05:00:03Z');
  assert.equal(row.duration, 2400);
  assert.equal(row.isLivestream, false);
  assert.equal(normalizeWatchMetadata(item, player(item.id, { channelId: 'other-channel' }), CHANNEL), null);
  const upcoming = normalizeWatchMetadata(item, player(item.id, { isLiveContent: true, isUpcoming: true }), CHANNEL);
  assert.equal(upcoming.upcoming, true);
  assert.equal(upcoming.isLivestream, true);
});

test('an unavailable YouTube RSS feed falls back to the channel upload page', async () => {
  const oldFetch = global.fetch, oldKey = process.env.YT_API_KEY, oldChannel = process.env.YT_CHANNEL_ID;
  delete process.env.YT_API_KEY;
  delete process.env.YT_CHANNEL_ID;
  const requested = [];
  global.fetch = async url => {
    requested.push(url);
    if (url.includes('/feeds/')) return { ok: false, status: 500 };
    if (url.includes('/videos?')) return { ok: true, text: async () => 'var ytInitialData = ' + JSON.stringify({ contents: [lockup('sermon12345', 'Grace')] }) + ';</script>' };
    if (url.includes('/watch?')) return { ok: true, text: async () => 'var ytInitialPlayerResponse = ' + JSON.stringify(player('sermon12345')) + ';</script>' };
    throw new Error('Unexpected URL: ' + url);
  };
  try {
    let response;
    await videosApi({ method: 'GET', query: {} }, { setHeader() {}, end(body) { response = JSON.parse(body); } });
    assert.equal(response.count, 1);
    assert.equal(response.source.method, 'channel-page');
    assert.equal(response.items[0].description, 'Romans 5');
    assert.equal(response.items[0].published, '2026-11-12T05:00:03Z');
    assert.equal(requested.length, 3);
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.YT_API_KEY; else process.env.YT_API_KEY = oldKey;
    if (oldChannel === undefined) delete process.env.YT_CHANNEL_ID; else process.env.YT_CHANNEL_ID = oldChannel;
  }
});

function browserLibrary(items, streams, tags = {}) {
  const window = { FBT_FEEDS: {}, FBT_SERMON_TAGS: tags };
  const context = vm.createContext({
    window,
    document: { querySelector: () => null, readyState: 'loading', addEventListener() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch: async url => ({ json: async () => ({ items: url === '/api/videos' ? items : url === '/api/streams' ? streams : [] }) }),
  });
  vm.runInContext(fs.readFileSync(require.resolve('../assets/videos.js'), 'utf8'), context);
  return window.FBTVideos;
}

test('known livestream recordings stay out of Messages even with a preacher in their title', async () => {
  const rows = await browserLibrary([
    { id: 'stream12345', title: 'Appalachian Jubilee | Pastor Michael Spurlock', published: '2026-11-14' },
    { id: 'sermon12345', title: 'Grace | Pastor Michael Spurlock', published: '2026-11-12' },
  ], [{ id: 'stream12345', live: false, upcoming: false }]).load();
  assert.equal(rows[0].type, 'service');
  assert.equal(rows[1].type, 'message');
});

test('completed sermon overrides remain usable but active or scheduled streams cannot become messages', async () => {
  const items = ['completed01', 'upcoming001', 'livestream1'].map(id => ({ id, title: 'Grace | Pastor Michael Spurlock', isLivestream: true }));
  const tags = Object.fromEntries(items.map(item => [item.id, { type: 'message' }]));
  const rows = await browserLibrary(items, [
    { id: 'completed01' }, { id: 'upcoming001', upcoming: true }, { id: 'livestream1', live: true },
  ], tags).load();
  assert.deepEqual(Array.from(rows, row => row.type), ['message', 'service', 'service']);
});

test('Jubilee teasers cannot replace the latest sermon even when longer than 75 seconds', async () => {
  const rows = await browserLibrary([
    { id: 'teaser12345', title: '2026 Appalachian Jubilee Teaser 1 (Travis Groves)', duration: 91, published: '2026-11-13' },
    { id: 'sermon12345', title: 'The Biblical Man SS Class Part 5 | Pastor Michael Spurlock', duration: 2491, published: '2026-11-12' },
  ], []).load();
  assert.equal(rows[0].type, 'clip');
  assert.equal(rows[1].type, 'message');
});
