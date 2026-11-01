const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/analytics.js'), 'utf8');
function load(url) {
  const scripts = [];
  const context = {
    window: {}, location: new URL(url), URLSearchParams,
    document: { createElement: () => ({}), head: { appendChild: script => scripts.push(script) } }
  };
  vm.runInNewContext(source, context);
  return { scripts, window: context.window };
}

test('public pages load Vercel Analytics even when optional Google Analytics is off', () => {
  for (const page of ['/', '/visit', '/nextsteps', '/ministries', '/message?id=example']) {
    const { scripts, window } = load('https://www.fairviewbaptisttemple.com' + page);
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].src, '/_vercel/insights/script.js');
    assert.equal(scripts[0].defer, true);
    assert.equal(typeof window.va, 'function');
  }
});

test('Studio page previews and local development do not record visitor traffic', () => {
  for (const url of [
    'https://www.fairviewbaptisttemple.com/?studio_preview=1',
    'https://www.fairviewbaptisttemple.com/jubilee?x=1&studio_preview=1',
    'http://localhost:4332/', 'http://127.0.0.1:4332/visit', 'http://[::1]:4332/'
  ]) assert.equal(load(url).scripts.length, 0, url);
});

test('production alias forwards to the church domain without affecting preview hosts', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const redirect = config.redirects.find(rule => rule.has?.some(condition => condition.type === 'host'));
  assert.deepEqual(redirect.has, [{ type: 'host', value: 'fairviewbaptist.vercel.app' }]);
  assert.equal(redirect.source, '/:path*');
  assert.equal(redirect.destination, 'https://www.fairviewbaptisttemple.com/:path*');
  assert.equal(redirect.permanent, true);
  const studio = fs.readFileSync(path.join(root, 'studio.html'), 'utf8');
  assert.match(studio, /<a href="https:\/\/www\.fairviewbaptisttemple\.com\/"[^>]*class="snav">[\s\S]*?View site<\/a>/);
});
