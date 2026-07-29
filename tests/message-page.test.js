const test = require('node:test');
const assert = require('node:assert/strict');

const catalog = require('../assets/catalog.json');
const messagePage = require('../api/message-page');

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader: function (name, value) { this.headers[String(name).toLowerCase()] = value; },
    end: function (body) { this.body = String(body || ''); },
  };
}

test('message page rejects incomplete video references with a real 404', async function () {
  const res = response();
  await messagePage({ method: 'GET', query: { v: 'bad' } }, res);
  assert.equal(res.statusCode, 404);
  assert.match(res.body, /noindex/);
  assert.doesNotMatch(res.body, /data-server-item="message"/);
});

test('bundled sermons keep server metadata when YouTube is unavailable', async function () {
  const oldFetch = global.fetch;
  const oldKey = process.env.YT_API_KEY;
  process.env.YT_API_KEY = 'unavailable-key';
  // The shipped catalog is empty until Fairview Baptist Temple videos are
  // snapshotted, so stage a bundled sermon for this test only.
  catalog.items.push({
    id: 'bundled12345',
    title: 'Help from the Hills | Psalm 121 | 6.28.26 | Pastor Michael Spurlock',
    duration: 2400,
    published: '2026-06-28T18:00:00Z',
  });
  try {
    global.fetch = async function () { throw new Error('upstream unavailable'); };
    const res = response();
    await messagePage({ method: 'GET', query: { v: 'bundled12345' } }, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Help from the Hills \| Fairview Baptist Temple, Clay WV/);
    assert.match(res.body, /data-server-item="message"/);
    assert.match(res.body, /index, follow/);
  } finally {
    global.fetch = oldFetch;
    catalog.items.pop();
    if (oldKey === undefined) delete process.env.YT_API_KEY; else process.env.YT_API_KEY = oldKey;
  }
});

test('message metadata is published only for the configured Fairview channel', async function () {
  const oldFetch = global.fetch;
  const oldKey = process.env.YT_API_KEY;
  const oldChannel = process.env.YT_CHANNEL_ID;
  process.env.YT_API_KEY = 'test-key';
  process.env.YT_CHANNEL_ID = 'UCfbtchannel000000000000';
  try {
    global.fetch = async function () {
      return {
        ok: true,
        json: async function () {
          return { items: [{ snippet: {
            channelId: 'UCfbtchannel000000000000',
            title: 'A Trusted Message | Romans 5 | Pastor Michael Spurlock',
            description: 'A sermon from Romans 5.',
            publishedAt: '2026-07-19T14:00:00Z',
            thumbnails: { high: { url: 'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg' } },
          }, contentDetails: { duration: 'PT38M10S' } }] };
        },
      };
    };
    const trusted = response();
    await messagePage({ method: 'GET', query: { v: 'abc123DEF45' } }, trusted);
    assert.equal(trusted.statusCode, 200);
    assert.match(trusted.body, /A Trusted Message \| Fairview Baptist Temple, Clay WV/);
    assert.match(trusted.body, /uploadDate/);

    global.fetch = async function () {
      return {
        ok: true,
        json: async function () {
          return { items: [{ snippet: { channelId: 'UCsomeoneelse00000000000', title: 'Outside Video' } }] };
        },
      };
    };
    const outside = response();
    await messagePage({ method: 'GET', query: { v: 'abc123DEF45' } }, outside);
    assert.equal(outside.statusCode, 404);
    assert.doesNotMatch(outside.body, /Outside Video/);
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.YT_API_KEY; else process.env.YT_API_KEY = oldKey;
    if (oldChannel === undefined) delete process.env.YT_CHANNEL_ID; else process.env.YT_CHANNEL_ID = oldChannel;
  }
});

test('message metadata rejects shorts and honors Studio message copy', async function () {
  const oldFetch = global.fetch;
  const oldKey = process.env.YT_API_KEY;
  const oldChannel = process.env.YT_CHANNEL_ID;
  process.env.YT_API_KEY = 'test-key';
  process.env.YT_CHANNEL_ID = 'UCfbtchannel000000000000';
  try {
    global.fetch = async function (url) {
      if (String(url).indexOf('googleapis.com/youtube') >= 0) {
        return { ok: true, json: async function () { return { items: [{
          snippet: {
            channelId: 'UCfbtchannel000000000000', title: 'A quick thought #faith',
            description: 'A short clip.', publishedAt: '2026-07-19T14:00:00Z', thumbnails: {}
          },
          contentDetails: { duration: 'PT49S' }
        }] }; } };
      }
      return { ok: true, json: async function () { return []; } };
    };
    const short = response();
    await messagePage({ method: 'GET', query: { v: 'short12ABCD' } }, short);
    assert.equal(short.statusCode, 404);

    global.fetch = async function (url) {
      if (String(url).indexOf('googleapis.com/youtube') >= 0) {
        return { ok: true, json: async function () { return { items: [{
          snippet: {
            channelId: 'UCfbtchannel000000000000', title: 'Original YouTube Title | Romans 8 | Pastor Michael Spurlock',
            description: 'The original description.', publishedAt: '2026-07-18T14:00:00Z', thumbnails: {}
          },
          contentDetails: { duration: 'PT42M' }
        }] }; } };
      }
      return { ok: true, json: async function () { return [{
        video_id: 'sermon12ABC', type: 'message', title: 'Hope That Holds',
        summary: 'A polished Studio summary about lasting hope in Christ.',
        speaker: 'Pastor Michael Spurlock', reference: 'Romans 8', service: 'Sunday Morning Worship'
      }]; } };
    };
    const edited = response();
    await messagePage({ method: 'GET', query: { v: 'sermon12ABC' } }, edited);
    assert.equal(edited.statusCode, 200);
    assert.match(edited.body, /Hope That Holds \| Fairview Baptist Temple, Clay WV/);
    assert.match(edited.body, /A polished Studio summary about lasting hope in Christ/);
    assert.match(edited.body, /Pastor Michael Spurlock/);
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.YT_API_KEY; else process.env.YT_API_KEY = oldKey;
    if (oldChannel === undefined) delete process.env.YT_CHANNEL_ID; else process.env.YT_CHANNEL_ID = oldChannel;
  }
});
