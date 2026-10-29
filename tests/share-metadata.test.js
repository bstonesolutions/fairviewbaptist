const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const contentPage = require('../api/content-page');

const DOMAIN = 'https://www.fairviewbaptisttemple.com';
const CARD = { post: DOMAIN + '/assets/share/blog-v1.jpg', event: DOMAIN + '/assets/share/events-v1.jpg' };

function meta(html, key) {
  const match = html.match(new RegExp('<meta (?:property|name)="' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '" content="([^"]*)"'));
  return match ? match[1] : null;
}
async function server(kind, row, offline) {
  const oldFetch = global.fetch;
  global.fetch = async function () {
    if (offline) throw new Error('unavailable');
    return { ok: true, json: async function () { return [row]; } };
  };
  const res = { statusCode: 0, setHeader() {}, end(body) { this.body = body; } };
  try {
    await contentPage({ method: 'GET', query: { kind, [kind === 'post' ? 'slug' : 'e']: row.slug } }, res);
    assert.equal(res.statusCode, 200);
    return res.body;
  } finally { global.fetch = oldFetch; }
}
function browser(kind, row) {
  const nodes = [];
  function matches(node, selector) {
    if (!selector.startsWith(node.tag)) return false;
    return [...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)].every(function (m) {
      return m[2] === undefined ? Object.hasOwn(node.attrs, m[1]) : node.attrs[m[1]] === m[2];
    });
  }
  const head = {
    appendChild(node) { nodes.push(node); },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) { return nodes.filter(n => selector.split(',').some(s => matches(n, s))); }
  };
  const body = { innerHTML: '' };
  const document = {
    head, readyState: 'complete', title: '', addEventListener() {},
    querySelector(selector) {
      return selector === (kind === 'post' ? '[data-post-body]' : '[data-event-page]') ? body : null;
    },
    createElement(tag) {
      return { tag, attrs: {}, setAttribute(key, value) { this.attrs[key] = String(value); }, remove() { nodes.splice(nodes.indexOf(this), 1); } };
    }
  };
  const context = {
    window: { FBT_POSTS: kind === 'post' ? [row] : [], FBT_EVENTS: kind === 'event' ? [row] : [] },
    document, location: { search: '?' + (kind === 'post' ? 'slug' : 'e') + '=' + row.slug, hash: '', href: DOMAIN + '/' + kind },
    URLSearchParams, setTimeout, clearTimeout
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/seo-item.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(require.resolve(kind === 'post' ? '../assets/blog.js' : '../assets/events-ui.js'), 'utf8'), context);
  return {
    get(key) { const node = nodes.find(n => n.attrs.property === key || n.attrs.name === key); return node ? node.attrs.content : null; },
    seo: context.window.FBTSeo
  };
}

test('event and post server previews use their category card, including an upstream outage', async function () {
  for (const kind of ['post', 'event']) {
    const row = { slug: 'church-news', title: 'Church news', body: '<p>Details.</p>', status: 'published' };
    for (const offline of [false, true]) {
      const html = await server(kind, row, offline);
      assert.equal(meta(html, 'og:image'), CARD[kind]);
      assert.equal(meta(html, 'twitter:image'), CARD[kind]);
      assert.equal(meta(html, 'og:image:width'), '1200');
      assert.equal(meta(html, 'og:image:height'), '630');
    }
  }
});

test('hydration keeps the server category card and dimensions', async function () {
  for (const kind of ['post', 'event']) {
    const row = { slug: 'church-news', title: 'Church news', body: '<p>Details.</p>' };
    const html = await server(kind, row);
    const client = browser(kind, row);
    for (const key of ['og:image', 'twitter:image', 'og:image:alt', 'twitter:image:alt', 'og:image:width', 'og:image:height']) {
      assert.equal(client.get(key), meta(html, key), kind + ': ' + key);
    }
  }
});

test('custom post/event covers and event hero fallback survive hydration without incorrect dimensions', async function () {
  const cases = [
    ['post', { cover: 'https://example.org/post-cover.jpg' }, 'https://example.org/post-cover.jpg'],
    ['post', { cover: '/assets/photos/worship.jpg' }, DOMAIN + '/assets/photos/worship.jpg'],
    ['event', { cover: '//example.org/event-cover.jpg', hero: '/assets/photos/preaching.jpg' }, 'https://example.org/event-cover.jpg'],
    ['event', { hero: '/assets/photos/preaching.jpg' }, DOMAIN + '/assets/photos/preaching.jpg']
  ];
  for (const [kind, media, expected] of cases) {
    const row = { slug: 'church-news', title: 'Church news', body: '<p>Details.</p>', ...media };
    const html = await server(kind, row);
    const client = browser(kind, row);
    assert.equal(meta(html, 'og:image'), expected);
    assert.equal(client.get('og:image'), expected);
    assert.equal(client.get('twitter:image'), expected);
    assert.equal(client.get('og:image:alt'), row.title);
    assert.equal(meta(html, 'og:image:width'), null);
    assert.equal(client.get('og:image:width'), null);
    assert.equal(client.get('og:image:height'), null);
  }
});

test('changing from category art to a custom image clears the old category dimensions', function () {
  const client = browser('post', { slug: 'church-news', title: 'Church news', body: '<p>Details.</p>' });
  assert.equal(client.get('og:image:width'), '1200');
  client.seo.setItem({ title: 'New cover', image: 'https://example.org/portrait.jpg' });
  assert.equal(client.get('og:image:width'), null);
  assert.equal(client.get('og:image:height'), null);
});
