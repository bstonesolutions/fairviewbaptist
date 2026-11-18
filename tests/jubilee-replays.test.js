const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const jubilee = require('../assets/jubilee-replays');

function mountRenderer() {
  let markup = '', writes = 0, onClick, poll;
  let cards = new Map();
  let feeds = { '/api/streams': { items: [] }, '/api/live': { live: null, upcoming: null } };
  const listeners = new Map(), events = [];
  const count = { textContent: '' };
  const grid = {
    get innerHTML() {
      // Child replacement changes the real grid's serialized markup too.
      return markup + [...cards.values()].map(card => card.media.innerHTML + card.action.innerHTML).join('');
    },
    set innerHTML(value) {
      markup = value;
      writes++;
      cards = new Map([...value.matchAll(/data-jubilee-service="([\w-]+)"/g)].map(match => {
        const card = {
          media: { innerHTML: '', querySelector: () => ({ focus() {} }) },
          action: { innerHTML: '' },
          classes: new Set(),
          trigger: { focus() {} },
          querySelector(selector) { return selector === '[data-jubilee-media]' ? this.media : this.action; }
        };
        card.classList = { add: name => card.classes.add(name) };
        return [match[1], card];
      }));
    },
    removeAttribute() {},
    addEventListener(name, callback) { if (name === 'click') onClick = callback; },
    querySelector(selector) {
      const match = selector.match(/data-jubilee-(service|play)="([\w-]+)"/);
      const card = match && cards.get(match[2]);
      return card && (match[1] === 'service' ? card : card.trigger);
    }
  };
  const document = {
    getElementById: () => grid, querySelector: () => count, hidden: false,
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    dispatchEvent(event) {
      events.push(event);
      (listeners.get(event.type) || []).forEach(callback => callback(event));
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/jubilee-replays'), 'utf8'), {
    document,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch: url => Promise.resolve({ ok: true, json: () => Promise.resolve(feeds[url]) }),
    setInterval(callback) { poll = callback; }
  });
  return {
    grid, count, events,
    get writes() { return writes; },
    card(id) { return cards.get(id); },
    click(id, close = false) {
      const control = { getAttribute: () => id };
      onClick({ target: { closest: selector => selector === (close ? '[data-jubilee-close]' : '[data-jubilee-play]') ? control : null } });
    },
    refresh(nextFeeds) { feeds = nextFeeds; poll(); },
    playClip() { document.dispatchEvent({ type: 'fbt:jubilee-play', detail: { source: 'clips' } }); },
    flush: () => new Promise(resolve => setImmediate(resolve))
  };
}

test('verified completed services remain available when feeds fail or age out', () => {
  const rows = jubilee.select([], {});
  assert.deepEqual(rows.filter(row => row.status === 'replay').map(row => row.id), ['aIf9VFENyuw', 'r7KDaDpHNPU', 'hH5FXxjj6bY', 'KU4VbX_ClTM', '_YJ_iAbvlfc']);
  assert.equal(rows.length, 6);
  assert.equal(rows.at(-1).id, 'Io5HCX-cNXU');
  assert.equal(rows.at(-1).status, 'unknown');
  assert.equal(rows[0].date, '2026-11-17');
});

test('Wednesday is scheduled, live, or completed only as the feeds report it', () => {
  const item = { id: 'Io5HCX-cNXU', t: 'Appalachian Jubilee- Wednesday Night', startTime: '2026-11-19T00:00:00Z' };
  const upcoming = jubilee.select([{ ...item, upcoming: true }], {});
  assert.equal(upcoming.length, 6);
  assert.equal(upcoming[0].id, item.id);
  assert.equal(upcoming[0].status, 'upcoming');
  assert.equal(upcoming[0].date, '2026-11-18');
  assert.deepEqual(upcoming.slice(1).map(row => row.id), ['aIf9VFENyuw', 'r7KDaDpHNPU', 'hH5FXxjj6bY', 'KU4VbX_ClTM', '_YJ_iAbvlfc']);
  const live = jubilee.select([{ ...item, live: true }], {});
  assert.equal(live[0].status, 'live');
  const finished = jubilee.select([{ ...item, endTime: '2026-11-19T02:00:00Z' }], { upcoming: { ...item, videoId: item.id } });
  assert.equal(finished[0].id, item.id);
  assert.equal(finished[0].status, 'replay');
});

test('unrelated services, tests, undated matches, and another year stay out', () => {
  const rows = jubilee.select([
    { id: 'aaaaaaaaaaa', t: 'Sunday Morning', startTime: '2026-11-15T16:00:00Z' },
    { id: 'bbbbbbbbbbb', t: 'Appalachian Jubilee test stream', startTime: '2026-11-15T16:00:00Z' },
    { id: 'ccccccccccc', t: 'Appalachian Jubilee- Monday Night', startTime: '2027-11-16T00:00:00Z' },
    { id: 'ddddddddddd', t: 'Appalachian Jubilee- Saturday' },
    { id: 'eeeeeeeeeee', t: 'Appalachian Jubilee preaching reel', startTime: '2026-11-15T16:00:00Z' }
  ], {});
  assert.equal(rows.length, 6);
});

test('a newly discovered event stream uses its Eastern service date and deduplicates', () => {
  const row = { id: 'fffffffffff', t: 'Appalachian Jubilee- Saturday', startTime: '2026-11-14T15:00:00Z', endTime: '2026-11-14T17:00:00Z' };
  const rows = jubilee.select([row, row], {});
  assert.equal(rows.length, 7);
  assert.equal(rows.find(item => item.id === row.id).date, '2026-11-14');
  assert.equal(rows.filter(item => item.status === 'replay').at(-1).id, row.id);
  assert.equal(jubilee.eventDate('2026-11-19T00:00:00Z'), '2026-11-18');
});

test('the durable Wednesday fallback has neutral copy and is not counted as a replay', () => {
  const { grid, count } = mountRenderer();
  assert.equal(count.textContent, '5 service replays');
  const wednesday = grid.innerHTML.slice(grid.innerHTML.lastIndexOf('<article '));
  assert.match(wednesday, /data-jubilee-play="Io5HCX-cNXU"/);
  assert.match(wednesday, />Jubilee service</);
  assert.match(wednesday, />Open service player</);
  assert.doesNotMatch(wednesday, /Service replay|Scheduled|Live now/);
  assert.doesNotMatch(grid.innerHTML, /<a\b|<iframe\b/);
});

test('clicking a service loads its accessible inline player without leaving the page', async () => {
  const view = mountRenderer();
  await view.flush();
  view.click('aIf9VFENyuw');
  const active = view.card('aIf9VFENyuw');
  assert.ok(active.classes.has('is-playing'));
  assert.match(active.media.innerHTML, /https:\/\/www\.youtube-nocookie\.com\/embed\/aIf9VFENyuw\?autoplay=1&playsinline=1&rel=0/);
  assert.match(active.media.innerHTML, /title="Appalachian Jubilee: Tuesday Night"/);
  assert.match(active.media.innerHTML, /allowfullscreen/);
  assert.match(active.action.innerHTML, /data-jubilee-close="aIf9VFENyuw"/);
  assert.doesNotMatch(view.grid.innerHTML, /<a\b/);
  assert.equal(view.events[0].type, 'fbt:jubilee-play');
  assert.equal(view.events[0].detail.source, 'services');
});

test('feed refreshes preserve playback and closing applies the newest service status', async () => {
  const view = mountRenderer();
  await view.flush();
  view.click('aIf9VFENyuw');
  const active = view.card('aIf9VFENyuw');
  const frame = active.media.innerHTML;
  const beforeRefresh = view.writes;
  view.refresh({
    '/api/streams': { items: [{ id: 'Io5HCX-cNXU', t: 'Appalachian Jubilee- Wednesday Night', live: true }] },
    '/api/live': { live: { videoId: 'Io5HCX-cNXU', title: 'Appalachian Jubilee- Wednesday Night' }, upcoming: null }
  });
  await view.flush();
  assert.equal(view.writes, beforeRefresh);
  assert.equal(view.card('aIf9VFENyuw'), active);
  assert.equal(active.media.innerHTML, frame);
  view.click('aIf9VFENyuw', true);
  assert.equal(view.card('aIf9VFENyuw').media.innerHTML, '');
  assert.match(view.grid.innerHTML, /^<article[^>]+data-jubilee-service="Io5HCX-cNXU"/);
  assert.match(view.grid.innerHTML, />Live now</);
});

test('switching services stops the previous player', async () => {
  const view = mountRenderer();
  await view.flush();
  view.click('aIf9VFENyuw');
  view.click('r7KDaDpHNPU');
  assert.equal(view.card('aIf9VFENyuw').media.innerHTML, '');
  assert.match(view.card('r7KDaDpHNPU').media.innerHTML, /youtube-nocookie\.com\/embed\/r7KDaDpHNPU/);
});

test('starting a clip stops the active service without starting another player', async () => {
  const view = mountRenderer();
  await view.flush();
  view.click('aIf9VFENyuw');
  view.playClip();
  assert.equal(view.card('aIf9VFENyuw').media.innerHTML, '');
  assert.doesNotMatch(view.grid.innerHTML, /<iframe\b/);
  assert.equal(view.events.filter(event => event.detail.source === 'services').length, 1);
});
