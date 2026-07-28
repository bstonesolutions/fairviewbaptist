/* Dynamic sitemap: fixed pages, published posts/events, and conservatively
   classified sermon detail pages. Robust: if Supabase is unreachable it still
   returns the static pages and the bundled YouTube catalog. */
const CATALOG = require('../assets/catalog.json');
const { isMessageVideo } = require('./_message-classification');
const DOMAIN = 'https://fairviewbaptisttemple.com';
// Set during CMS-SETUP: the Fairview Baptist Temple Supabase project URL and
// anon key (see CMS-SETUP.md). Until then only the static pages are listed.
const SUPABASE_URL = 'https://qlbylvhmkbopszmzmipm.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsYnlsdmhta2JvcHN6bXptaXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyODE1MDYsImV4cCI6MjEwMDg1NzUwNn0.muLRBIvNtki4lYOBIf6S80R2rYdBPoQvDzvzmEIn2A4';

const STATIC = [
  ['/', 'weekly', '1.0'], ['/visit', 'monthly', '0.9'], ['/watch', 'weekly', '0.8'],
  ['/events', 'weekly', '0.8'], ['/get-involved', 'monthly', '0.7'], ['/missions', 'monthly', '0.7'],
  ['/next-steps', 'monthly', '0.8'],
  ['/beliefs', 'yearly', '0.7'], ['/staff', 'monthly', '0.6'], ['/prayer', 'monthly', '0.6'],
  ['/blog', 'weekly', '0.6'], ['/give', 'yearly', '0.6'], ['/contact', 'yearly', '0.6'],
  ['/privacy', 'yearly', '0.4'],
];

async function sbRows(table) {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?select=slug,updated_at,status',
      { headers: { apikey: ANON, authorization: 'Bearer ' + ANON, accept: 'application/json' } });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}
async function sermonRows() {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/sermon_tags?select=video_id,updated_at,type',
      { headers: { apikey: ANON, authorization: 'Bearer ' + ANON, accept: 'application/json' } });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}
function validVideoId(value) { return /^[A-Za-z0-9_-]{6,20}$/.test(String(value || '')); }
function messageEntries(catalog, overrides) {
  const byId = new Map();
  const overrideById = new Map();
  const items = catalog && Array.isArray(catalog.items) ? catalog.items : (Array.isArray(catalog) ? catalog : []);
  items.forEach(function (item) {
    if (item && validVideoId(item.id) && !byId.has(item.id)) byId.set(item.id, item);
  });
  (overrides || []).forEach(function (row) {
    if (!row || !validVideoId(row.video_id)) return;
    overrideById.set(row.video_id, row);
    // A Studio-authorized message can safely enter the sitemap even when it is
    // newer than the bundled catalog. Other explicit types are rejected below.
    if (!byId.has(row.video_id)) byId.set(row.video_id, { id: row.video_id });
  });
  const entries = [];
  byId.forEach(function (item, id) {
    const override = overrideById.get(id);
    if (!isMessageVideo(item, override)) return;
    entries.push({
      video_id: id,
      updated_at: (override && override.updated_at) || item.published || '',
    });
  });
  return entries.sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
}
function xmlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function urlTag(loc, freq, prio, lastmod) {
  return '  <url><loc>' + xmlEsc(loc) + '</loc>' +
    (lastmod ? '<lastmod>' + String(lastmod).slice(0, 10) + '</lastmod>' : '') +
    (freq ? '<changefreq>' + freq + '</changefreq>' : '') +
    (prio ? '<priority>' + prio + '</priority>' : '') + '</url>';
}

async function handler(req, res) {
  const rows = [STATIC.map(function (u) { return urlTag(DOMAIN + u[0], u[1], u[2]); }).join('\n')];
  const posts = await sbRows('posts');
  posts.filter(function (p) { return p && p.slug && p.status !== 'draft'; }).forEach(function (p) {
    rows.push(urlTag(DOMAIN + '/post?slug=' + encodeURIComponent(p.slug), 'monthly', '0.5', p.updated_at));
  });
  const events = await sbRows('events');
  events.filter(function (e) { return e && e.slug && e.status !== 'draft'; }).forEach(function (e) {
    rows.push(urlTag(DOMAIN + '/event?e=' + encodeURIComponent(e.slug), 'weekly', '0.5', e.updated_at));
  });
  const overrides = await sermonRows();
  messageEntries(CATALOG, overrides).forEach(function (message) {
    rows.push(urlTag(DOMAIN + '/message?v=' + encodeURIComponent(message.video_id), 'monthly', '0.5', message.updated_at));
  });
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    rows.join('\n') + '\n</urlset>';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.statusCode = 200;
  res.end(xml);
}

module.exports = handler;
module.exports.messageEntries = messageEntries;
