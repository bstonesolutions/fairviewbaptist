const test = require('node:test');
const assert = require('node:assert/strict');
const live = require('../assets/live');

test('all scheduled services remain visible before the player waiting-room window', () => {
  const now = Date.parse('2026-11-14T20:00:00Z');
  const list = live.scheduled([
    { id: 'monday', _startTime: '2026-11-17T00:00:00Z' },
    { id: 'sunday', startTime: '2026-11-15T15:00:00Z' },
    { videoId: 'sunday', startTime: '2026-11-15T15:00:00Z' },
    { id: 'stale', startTime: '2026-11-01T15:00:00Z' },
    { id: 'unknown', startTime: '' },
  ], now);
  assert.deepEqual(list.map(item => item.id), ['sunday', 'monday']);
  assert.equal(live.pickUpcoming(list, now), null);
  assert.equal(live.choose(null, list[0], { id: 'replay' }, now).mode, 'latest');
});

test('a new streaming channel shows its next broadcast before any replays exist', () => {
  const next = { id: 'sunday', startTime: '2026-11-15T15:00:00Z' };
  assert.deepEqual(live.choose(null, next, null, Date.parse('2026-11-14T20:00:00Z')), { mode: 'upcoming', item: next });
});

test('player moves from replay to waiting room to live and then the completed replay', () => {
  const now = Date.parse('2026-11-15T15:00:00Z');
  const next = { id: 'sunday', startTime: '2026-11-15T15:00:00Z' };
  const previous = { id: 'previous' };
  assert.equal(live.choose(null, next, previous, now - 61 * 60000).item.id, 'previous');
  assert.equal(live.choose(null, next, previous, now - 60 * 60000).mode, 'upcoming');
  assert.equal(live.choose(next, next, previous, now).mode, 'live');
  assert.equal(live.choose(null, null, next, now + 90 * 60000).mode, 'latest');
});
