const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function mountRenderer() {
  let markup = '', onClick;
  let cards = new Map();
  const listeners = new Map(), events = [];
  const count = { textContent: '' };
  const grid = {
    get innerHTML() {
      // Child replacement changes the real grid's serialized markup too.
      return markup + [...cards.values()].map(card => card.media.innerHTML + card.action.innerHTML).join('');
    },
    set innerHTML(value) {
      markup = value;
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
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  });
  return {
    grid, count, events,
    card(id) { return cards.get(id); },
    click(id, close = false) {
      const control = { getAttribute: () => id };
      onClick({ target: { closest: selector => selector === (close ? '[data-jubilee-close]' : '[data-jubilee-play]') ? control : null } });
    },
    playClip() { document.dispatchEvent({ type: 'fbt:jubilee-play', detail: { source: 'clips' } }); }
  };
}

test('the 2026 archive renders all six completed broadcasts without a live feed', () => {
  const { grid, count } = mountRenderer();
  assert.equal(count.textContent, '6 service replays');
  assert.deepEqual([...grid.innerHTML.matchAll(/data-jubilee-service="([\w-]+)"/g)].map(match => match[1]),
    ['Io5HCX-cNXU', 'aIf9VFENyuw', 'r7KDaDpHNPU', 'hH5FXxjj6bY', 'KU4VbX_ClTM', '_YJ_iAbvlfc']);
  assert.match(grid.innerHTML, /<time datetime="2026-11-18">November 18, 2026<\/time>/);
  assert.doesNotMatch(grid.innerHTML, /<iframe\b|Live now|Scheduled/);
});

test('clicking a service loads its accessible inline player without leaving the page', () => {
  const view = mountRenderer();
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

test('closing a recording returns to the archived service cards', () => {
  const view = mountRenderer();
  view.click('Io5HCX-cNXU');
  view.click('Io5HCX-cNXU', true);
  assert.equal(view.card('Io5HCX-cNXU').media.innerHTML, '');
  assert.match(view.grid.innerHTML, /data-jubilee-play="Io5HCX-cNXU"/);
});

test('switching services stops the previous player', () => {
  const view = mountRenderer();
  view.click('aIf9VFENyuw');
  view.click('r7KDaDpHNPU');
  assert.equal(view.card('aIf9VFENyuw').media.innerHTML, '');
  assert.match(view.card('r7KDaDpHNPU').media.innerHTML, /youtube-nocookie\.com\/embed\/r7KDaDpHNPU/);
});

test('starting a clip stops the active service without starting another player', () => {
  const view = mountRenderer();
  view.click('aIf9VFENyuw');
  view.playClip();
  assert.equal(view.card('aIf9VFENyuw').media.innerHTML, '');
  assert.doesNotMatch(view.grid.innerHTML, /<iframe\b/);
  assert.equal(view.events.filter(event => event.detail.source === 'services').length, 1);
});
