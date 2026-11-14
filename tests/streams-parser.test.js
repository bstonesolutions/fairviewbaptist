const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../api/streams')._parse;
const channel = 'UCpVuAImXOHZcdGDbw6fQLIA';

function lockup(id, title, badge) {
  return { lockupViewModel: {
    contentId: id, contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
    metadata: { lockupMetadataViewModel: { title: { content: title } } },
    contentImage: { thumbnailViewModel: { overlays: [{ thumbnailBottomOverlayViewModel: {
      badges: [{ thumbnailBadgeViewModel: { text: badge } }],
    } }] } },
  } };
}
function page(player, recommendations) {
  return '<script>var ytInitialPlayerResponse = ' + JSON.stringify(player) + ';</script>' +
    '<script>var ytInitialData = ' + JSON.stringify(recommendations || {}) + ';</script>';
}
function player(id, details, micro, status) {
  return {
    videoDetails: Object.assign({ videoId: id, channelId: channel, title: 'Fairview service', isLiveContent: true }, details),
    microformat: { playerMicroformatRenderer: micro || {} },
    playabilityStatus: status || {},
  };
}

test('modern YouTube lockups include all scheduled streams and legacy renderers still work', function () {
  const result = parser.collectVideos({ contents: [
    lockup('_YJ_iAbvlfc', 'Sunday School', 'Upcoming'),
    lockup('KU4VbX_ClTM', 'Sunday Morning', 'Upcoming'),
    lockup('r7KDaDpHNPU', 'Monday Night', 'LIVE'),
    lockup('aIf9VFENyuw', 'Tuesday Night', '1:04:22'),
    { videoRenderer: { videoId: '0vd0N5Ljfx4', title: { runs: [{ text: 'Legacy stream' }] },
      upcomingEventData: { startTime: '1794754800' } } },
  ] });
  assert.equal(result.length, 5);
  assert.equal(result[0].t, 'Sunday School');
  assert.equal(result[1].upcoming, true);
  assert.equal(result[2].live, true);
  assert.equal(result[3].upcoming, false);
  assert.equal(result[4].startTime, '2026-11-15T15:00:00.000Z');
});

test('a fallback Videos tab and recommendations cannot enter the stream archive', function () {
  const data = { contents: { twoColumnBrowseResultsRenderer: { tabs: [
    { tabRenderer: { title: 'Videos', selected: true, content: { contents: [lockup('aIf9VFENyuw', 'Upload', '12:00')] } } },
  ] } }, recommendations: lockup('KU4VbX_ClTM', 'Some other live channel', 'LIVE') };
  assert.equal(parser.streamsTabContent(data), null);
  data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer = {
    title: 'Live', selected: true, content: { contents: [lockup('_YJ_iAbvlfc', 'Sunday School', 'Upcoming')] },
  };
  assert.deepEqual(parser.collectVideos(parser.streamsTabContent(data)).map(x => x.id), ['_YJ_iAbvlfc']);
});

test('upcoming exact UTC time comes from the player, not the grid local time label', function () {
  const result = parser.parseBroadcastPlayer(page(player('_YJ_iAbvlfc', { isUpcoming: true }, {}, {
    status: 'LIVE_STREAM_OFFLINE', liveStreamability: { liveStreamabilityRenderer: {
      offlineSlate: { liveStreamOfflineSlateRenderer: { scheduledStartTime: '1794754800' } },
    } },
  }), { isLiveNow: true, scheduledStartTime: '9999999999' }), channel);
  assert.equal(result.live, false);
  assert.equal(result.upcoming, true);
  assert.equal(result.startTime, '2026-11-15T15:00:00.000Z');
});

test('related video live flags cannot make a completed broadcast go live again', function () {
  const result = parser.parseBroadcastPlayer(page(player('aIf9VFENyuw', {}, {
    liveBroadcastDetails: { isLiveNow: false, startTimestamp: '2026-11-08T16:00:00Z', endTimestamp: '2026-11-08T17:00:00Z' },
  }), { videoRenderer: { videoId: 'KU4VbX_ClTM', isLiveNow: true, scheduledStartTime: '1794754800' } }), channel);
  assert.equal(result.live, false);
  assert.equal(result.upcoming, false);
  assert.equal(result.startTime, '2026-11-08T16:00:00Z');
  assert.equal(result.endTime, '2026-11-08T17:00:00Z');
});

test('only this channel and the requested video are accepted from a watch player', function () {
  assert.equal(parser.parseBroadcastPlayer(page(player('_YJ_iAbvlfc', { channelId: 'other' })), channel), null);
  assert.equal(parser.parseBroadcastPlayer(page(player('_YJ_iAbvlfc')), channel, 'KU4VbX_ClTM'), null);
  assert.equal(parser.parseBroadcastPlayer(page(player('_YJ_iAbvlfc', { isLiveContent: false })), channel), null);
  assert.equal(parser.parseBroadcastPlayer(page(player('_YJ_iAbvlfc', { isLive: true })), channel).live, true);
});
