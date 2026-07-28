const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const streams = require('../api/streams')._parse;
const liveSelection = require('../assets/live');

test('dated sermon uploads are not guessed to be livestreams', function () {
  assert.equal(
    streams.looksLikeService('A Message of Hope | 6.26.26 | Pastor J. Bret Wiley'),
    false
  );
  assert.equal(streams.looksLikeService('Worship @ Fairview 7.26.26'), true);
});

test('only videos with YouTube liveStreamingDetails enter the stream feed', function () {
  const uploads = [
    { id: 'normalVideo', title: 'A Message of Hope | 6.26.26 | Pastor J. Bret Wiley', published: '2026-07-27T02:06:17Z' },
    { id: 'pastStream1', title: 'Worship @ Fairview 7.26.26', published: '2026-07-26T16:01:45Z' },
    { id: 'liveStream1', title: 'Sunday Worship', published: '2026-07-27T14:30:00Z' },
    { id: 'nextStream1', title: 'Wednesday Midweek', published: '2026-07-29T23:00:00Z' },
  ];
  const videos = [
    {
      id: 'normalVideo',
      snippet: { title: uploads[0].title, publishedAt: uploads[0].published, liveBroadcastContent: 'none' },
    },
    {
      id: 'pastStream1',
      snippet: { title: uploads[1].title, publishedAt: uploads[1].published, liveBroadcastContent: 'none' },
      liveStreamingDetails: { actualStartTime: '2026-07-26T14:30:00Z', actualEndTime: '2026-07-26T16:01:45Z' },
    },
    {
      id: 'liveStream1',
      snippet: { title: uploads[2].title, publishedAt: uploads[2].published, liveBroadcastContent: 'live' },
      liveStreamingDetails: { actualStartTime: '2026-07-27T14:30:00Z' },
    },
    {
      id: 'nextStream1',
      snippet: { title: uploads[3].title, publishedAt: uploads[3].published, liveBroadcastContent: 'upcoming' },
      liveStreamingDetails: { scheduledStartTime: '2026-07-29T23:00:00Z' },
    },
  ];

  const result = streams.normalizeVerifiedStreams(uploads, videos);
  assert.deepEqual(result.map(function (item) { return item.id; }), ['pastStream1', 'liveStream1', 'nextStream1']);
  assert.equal(result[0].live, false);
  assert.equal(result[0].upcoming, false);
  assert.equal(result[0].startTime, '2026-07-26T14:30:00Z');
  assert.equal(result[0].endTime, '2026-07-26T16:01:45Z');
  assert.equal(result[1].live, true);
  assert.equal(result[1].upcoming, false);
  assert.equal(result[1].startTime, '2026-07-27T14:30:00Z');
  assert.equal(result[2].live, false);
  assert.equal(result[2].upcoming, true);
  assert.equal(result[2].startTime, '2026-07-29T23:00:00Z');
});

test('an unverified upload cannot re-enter through title or ordering', function () {
  const uploads = [
    { id: 'normalVideo', title: 'Sunday Message 7.26.26 | Pastor J. Bret Wiley', published: '2026-07-27T02:06:17Z' },
    { id: 'pastStream1', title: 'Worship @ Fairview 7.26.26', published: '2026-07-26T16:01:45Z' },
  ];
  const result = streams.normalizeVerifiedStreams(uploads, [{
    id: 'pastStream1',
    snippet: { title: uploads[1].title, publishedAt: uploads[1].published, liveBroadcastContent: 'none' },
    liveStreamingDetails: { actualStartTime: '2026-07-26T14:30:00Z' },
  }]);

  assert.deepEqual(result.map(function (item) { return item.id; }), ['pastStream1']);
});

test('the current livestream always takes priority', function () {
  const now = Date.parse('2026-07-26T14:00:00Z');
  const chosen = liveSelection.choose(
    { id: 'liveNow', title: 'Live now' },
    { id: 'startingSoon', startTime: '2026-07-26T14:10:00Z' },
    { id: 'latestService' },
    now
  );
  assert.equal(chosen.mode, 'live');
  assert.equal(chosen.item.id, 'liveNow');
});

test('a scheduled broadcast waits until the 30-minute pre-live window', function () {
  const now = Date.parse('2026-07-26T14:00:00Z');
  const latest = { id: 'latestService', title: 'Latest service' };
  const tooEarly = liveSelection.choose(
    null,
    { id: 'scheduled', startTime: '2026-07-26T14:31:00Z' },
    latest,
    now
  );
  const startingSoon = liveSelection.choose(
    null,
    { id: 'scheduled', startTime: '2026-07-26T14:30:00Z' },
    latest,
    now
  );
  assert.equal(tooEarly.mode, 'latest');
  assert.equal(tooEarly.item.id, 'latestService');
  assert.equal(startingSoon.mode, 'upcoming');
  assert.equal(startingSoon.item.id, 'scheduled');
});

test('an upcoming broadcast without a usable start time does not displace the latest service', function () {
  const chosen = liveSelection.choose(
    null,
    { id: 'scheduled', startTime: '' },
    { id: 'latestService' },
    Date.parse('2026-07-26T14:00:00Z')
  );
  assert.equal(chosen.mode, 'latest');
});

test('a delayed upcoming broadcast remains featured during the grace period', function () {
  const chosen = liveSelection.choose(
    null,
    { id: 'scheduled', startTime: '2026-07-26T13:00:00Z' },
    { id: 'latestService' },
    Date.parse('2026-07-26T14:00:00Z')
  );
  assert.equal(chosen.mode, 'upcoming');
});

test('stale upcoming flags are ignored and do not hide a valid scheduled broadcast', function () {
  const now = Date.parse('2026-07-26T14:00:00Z');
  const chosen = liveSelection.pickUpcoming([
    { id: 'stale', startTime: '2026-04-01T23:00:00Z' },
    { id: 'startingSoon', startTime: '2026-07-26T14:20:00Z' },
  ], now);
  assert.equal(chosen.id, 'startingSoon');
});

test('the featured completed stream is chosen by its actual start time', function () {
  const chosen = liveSelection.latestCompleted([
    { id: 'olderUploadFirst', _startTime: '2026-07-19T14:30:00Z' },
    { id: 'newestService', _startTime: '2026-07-26T14:30:00Z' },
    { id: 'middleService', date: '2026-07-23T23:00:00Z' },
  ]);
  assert.equal(chosen.id, 'newestService');
});

test('an abandoned upcoming broadcast expires after the late-start grace period', function () {
  const chosen = liveSelection.choose(
    null,
    { id: 'stale', startTime: '2026-07-26T11:59:59Z' },
    { id: 'latestService' },
    Date.parse('2026-07-26T14:00:00Z')
  );
  assert.equal(chosen.mode, 'latest');
});

test('the latest featured service remains available in the archive', function () {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'live.js'), 'utf8');
  assert.doesNotMatch(source, /if \(s\.id === curPlayerId\) return false/);
  assert.equal(liveSelection.choose(null, null, null, Date.now()).mode, 'off');
});
