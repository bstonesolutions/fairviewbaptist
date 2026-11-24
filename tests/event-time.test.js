const test = require('node:test');
const assert = require('node:assert/strict');
const { endsAt, validEnd } = require('../assets/event-time');

test('Studio and public event shapes expire at the same explicit church end time', () => {
  const start = '2026-11-14T09:00', end = '2026-11-18T20:15';
  const cutoff = Date.parse('2026-11-19T01:15:00Z');
  assert.equal(endsAt({ start_at: start, end_at: end }), cutoff);
  assert.equal(endsAt({ start, end }), cutoff);
  assert.equal(endsAt({ start, end: '2026-11-18T20:15:00-05:00' }), cutoff);
});
test('events with missing or invalid ends last through their start day in Clay', () => {
  const start = '2026-11-22T11:00';
  const expected = Date.parse('2026-11-23T05:00:00Z');
  for (const end of [null, '', 'bad', '2026-10-25T12:15']) {
    assert.equal(endsAt({ start, end }), expected);
    assert.equal(validEnd(start, end), null);
  }
  assert.equal(endsAt({ start: '2026-11-22' }), expected);
  assert.ok(Number.isNaN(endsAt({})));
});
test('date-only multi-day events include the end day and follow Eastern DST', () => {
  for (const [start, end, expected] of [
    ['2026-03-05', '2026-03-08', '2026-03-09T04:00:00Z'],
    ['2026-10-30', '2026-11-01', '2026-11-02T05:00:00Z']
  ]) {
    assert.equal(endsAt({ start, end }), Date.parse(expected));
  }
  assert.equal(endsAt({ start: '2026-07-15', end: '2026-07-16T13:30' }), Date.parse('2026-07-16T17:30:00Z'));
});
test('a weekly recurring event stays on the schedule when an occurrence ends', () => {
  assert.equal(endsAt({ start: '2026-08-09T11:00', end: '2026-08-09T12:15', recurring: 'Every Sunday' }), Infinity);
});
