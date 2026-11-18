const test = require('node:test');
const assert = require('node:assert/strict');
const zones = require('../assets/missionary-timezone');

function place(name, timezone, feature_code = 'PPL') { return { name, timezone, feature_code }; }
function response(results) { return { ok: true, json: async () => ({ results }) }; }
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function editor(fetch) {
  const applied = [], statuses = [];
  const controller = zones.create({ fetch, apply: value => applied.push(value), status: value => statuses.push(value) });
  controller.reset();
  return { controller, applied, statuses };
}

test('city lookup uses the country and rejects ambiguous time zones and country centroids', () => {
  assert.equal(zones.queryFor('Nairobi', 'Kenya'), 'Nairobi, Kenya');
  assert.equal(zones.queryFor('Clay, WV', 'United States'), 'Clay, WV');
  assert.equal(zones.selectZone([place('Nairobi', 'Africa/Nairobi'), place('Nairobi South', 'Africa/Nairobi')], 'Nairobi, Kenya'), 'Africa/Nairobi');
  assert.equal(zones.selectZone([place('Springfield', 'America/New_York'), place('Springfield', 'America/Chicago')], 'Springfield'), '');
  assert.equal(zones.selectZone([place('United States', 'America/New_York', 'PCLI')], 'United States'), '');
  assert.equal(zones.selectZone([place('Nowhere', 'Not/AZone')], 'Nowhere'), '');
});

test('pin lookup uses the documented timezone response and validates coordinates', async () => {
  let calls = 0;
  const fetcher = async url => {
    calls++;
    assert.equal(new URL(url).searchParams.get('latitude'), '38.46');
    return { ok: true, json: async () => ({ timezone: 'America/New_York' }) };
  };
  assert.equal(await zones.lookup({ kind: 'pin', lat: 38.46, lng: -81.08 }, fetcher), 'America/New_York');
  assert.equal(await zones.lookup({ kind: 'pin', lat: null, lng: null }, fetcher), '');
  assert.equal(await zones.lookup({ kind: 'pin', lat: 100, lng: 0 }, fetcher), '');
  assert.equal(calls, 1);
});

test('saving flushes the debounce and an automatically filled zone follows a changed location', async () => {
  const f = editor(async url => response([new URL(url).searchParams.get('name').startsWith('Nairobi')
    ? place('Nairobi', 'Africa/Nairobi') : place('Melbourne', 'Australia/Melbourne')]));
  f.controller.location('Nairobi', 'Kenya');
  await f.controller.flush();
  assert.equal(f.applied.at(-1), 'Africa/Nairobi');
  f.controller.location('Melbourne', 'Australia');
  await f.controller.flush();
  assert.equal(f.applied.at(-1), 'Australia/Melbourne');
  f.controller.close();
});

test('an old lookup cannot fill a different missionary after opening another profile', async () => {
  const old = deferred();
  const f = editor(() => old.promise);
  f.controller.location('Nairobi', 'Kenya');
  const pending = f.controller.flush();
  f.controller.reset();
  old.resolve(response([place('Nairobi', 'Africa/Nairobi')]));
  await pending;
  assert.deepEqual(f.applied, ['']);
  f.controller.close();
});

test('manual zone edits win over an in-flight lookup and later location edits', async () => {
  const old = deferred();
  const f = editor(() => old.promise);
  f.controller.location('Nairobi', 'Kenya');
  const pending = f.controller.flush();
  f.controller.manual();
  f.controller.location('London', 'United Kingdom');
  old.resolve(response([place('Nairobi', 'Africa/Nairobi')]));
  await pending;
  assert.deepEqual(f.applied, ['']);
  f.controller.close();
});

test('Save waits for the latest location when typing continues during a lookup', async () => {
  const first = deferred(), second = deferred();
  let calls = 0, finished = false;
  const f = editor(() => (++calls === 1 ? first.promise : second.promise));
  f.controller.location('Nairobi', 'Kenya');
  const saving = f.controller.flush().then(() => { finished = true; });
  f.controller.location('Melbourne', 'Australia');
  first.resolve(response([place('Nairobi', 'Africa/Nairobi')]));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(finished, false);
  second.resolve(response([place('Melbourne', 'Australia/Melbourne')]));
  await saving;
  assert.equal(f.applied.at(-1), 'Australia/Melbourne');
  f.controller.close();
});

test('lookup failure leaves manual entry available and does not block Save', async () => {
  const f = editor(async () => { throw new Error('offline'); });
  f.controller.location('Nairobi', 'Kenya');
  await f.controller.flush();
  assert.deepEqual(f.applied, ['']);
  assert.match(f.statuses.at(-1), /choose it below/);
  f.controller.close();
});
