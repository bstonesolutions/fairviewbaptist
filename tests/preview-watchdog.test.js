const test = require('node:test');
const assert = require('node:assert/strict');
const { createPreviewWatchdog } = require('../assets/studio-page-editor.js');

function scheduler() {
  let now = 0, nextId = 0;
  const tasks = new Map(), callbacks = new Map();
  return {
    tasks, callbacks,
    setTimeout(callback, delay) {
      const id = ++nextId;
      tasks.set(id, { at: now + delay, callback }); callbacks.set(id, callback);
      return id;
    },
    clearTimeout(id) { tasks.delete(id); },
    advance(milliseconds) {
      const target = now + milliseconds;
      for (;;) {
        const due = [...tasks.entries()].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        tasks.delete(due[0]); now = due[1].at; due[1].callback();
      }
      now = target;
    }
  };
}
function fixture(timeoutMs) {
  const clock = scheduler(), events = [];
  const options = {
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    onRetry: () => events.push('retry'), onTimeout: () => events.push('timeout')
  };
  if (timeoutMs !== undefined) options.timeoutMs = timeoutMs;
  return { clock, events, watchdog: createPreviewWatchdog(options) };
}

test('a preview gets one automatic retry at ten seconds and one terminal timeout ten seconds later', () => {
  const { clock, events, watchdog } = fixture();
  watchdog.start();
  clock.advance(9999); assert.deepEqual(events, []);
  clock.advance(1); assert.deepEqual(events, ['retry']);
  assert.equal(clock.tasks.size, 1);
  clock.advance(9999); assert.deepEqual(events, ['retry']);
  clock.advance(1); assert.deepEqual(events, ['retry', 'timeout']);
  assert.equal(clock.tasks.size, 0);
  clock.advance(30000); assert.deepEqual(events, ['retry', 'timeout']);
});

test('a manual retry skips automatic retry and reaches a single terminal timeout', () => {
  const { clock, events, watchdog } = fixture();
  watchdog.start(true);
  clock.advance(9999); assert.deepEqual(events, []);
  clock.advance(1); assert.deepEqual(events, ['timeout']);
  assert.equal(clock.tasks.size, 0);
  clock.advance(30000); assert.deepEqual(events, ['timeout']);
});

test('ready clears the pending timer and invalidates a callback already queued for delivery', () => {
  const { clock, events, watchdog } = fixture();
  watchdog.start();
  const stale = [...clock.callbacks.values()][0];
  watchdog.ready();
  assert.equal(clock.tasks.size, 0);
  stale(); clock.advance(30000);
  assert.deepEqual(events, []);
  assert.equal(clock.tasks.size, 0);
});

test('cancel after an automatic retry prevents timeout even if its old callback is delivered', () => {
  const { clock, events, watchdog } = fixture();
  watchdog.start(); clock.advance(10000);
  const stale = [...clock.tasks.values()][0].callback;
  watchdog.cancel();
  assert.equal(clock.tasks.size, 0);
  stale(); clock.advance(30000);
  assert.deepEqual(events, ['retry']);
  assert.equal(clock.tasks.size, 0);
});

test('starting another preview replaces the old deadline and invalidates the old callback', () => {
  const { clock, events, watchdog } = fixture();
  watchdog.start();
  const stale = [...clock.callbacks.values()][0];
  clock.advance(5000); watchdog.start();
  assert.equal(clock.tasks.size, 1);
  stale();
  assert.deepEqual(events, []);
  clock.advance(9999); assert.deepEqual(events, []);
  clock.advance(1); assert.deepEqual(events, ['retry']);
  clock.advance(10000); assert.deepEqual(events, ['retry', 'timeout']);
  assert.equal(clock.tasks.size, 0);
});

test('manual restart during automatic recovery starts a fresh terminal deadline', () => {
  const { clock, events, watchdog } = fixture();
  watchdog.start(); clock.advance(10000);
  const stale = [...clock.tasks.values()][0].callback;
  clock.advance(5000); watchdog.start(true);
  stale();
  assert.deepEqual(events, ['retry']);
  clock.advance(9999); assert.deepEqual(events, ['retry']);
  clock.advance(1); assert.deepEqual(events, ['retry', 'timeout']);
  assert.equal(clock.tasks.size, 0);
});

test('custom timeout duration applies to both recovery stages', () => {
  const { clock, events, watchdog } = fixture(25);
  watchdog.start(false);
  clock.advance(24); assert.deepEqual(events, []);
  clock.advance(1); assert.deepEqual(events, ['retry']);
  clock.advance(24); assert.deepEqual(events, ['retry']);
  clock.advance(1); assert.deepEqual(events, ['retry', 'timeout']);
});
