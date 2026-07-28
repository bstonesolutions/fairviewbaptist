/* Server-rendered metadata shell for individual YouTube messages.
   The browser hydrates the full experience from assets/message.js. */
const fs = require('fs');
const path = require('path');
const CATALOG = require('../assets/catalog.json');
const { isMessageVideo } = require('./_message-classification');

const DOMAIN = 'https://fairviewbaptisttemple.com';
// The Fairview Baptist Temple channel id (UC...) is not published yet. Set it
// with the YT_CHANNEL_ID env var (or in Studio Settings) once it is known.
const DEFAULT_CHANNEL = '';
// Set during CMS-SETUP: the Fairview Baptist Temple Supabase project URL and
// anon key (see CMS-SETUP.md). Sermon-tag enrichment stays off until then.
const SUPABASE_URL = 'https://qlbylvhmkbopszmzmipm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsYnlsdmhta2JvcHN6bXptaXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyODE1MDYsImV4cCI6MjEwMDg1NzUwNn0.muLRBIvNtki4lYOBIf6S80R2rYdBPoQvDzvzmEIn2A4';

function one(value) { return Array.isArray(value) ? value[0] : value; }
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
function readTemplate() {
  const roots = [process.cwd(), path.join(__dirname, '..')];
  for (const root of roots) {
    try { return fs.readFileSync(path.join(root, 'templates', 'message.tpl'), 'utf8'); }
    catch (e) { /* try the next root */ }
  }
  throw new Error('Missing message template');
}
function cleanTitle(raw) {
  const first = String(raw || '').split('|')[0].trim();
  return first
    .replace(/\s+(?:\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?)\s*$/, '')
    .replace(/[—–]/g, ' - ')
    .trim() || 'Message from Fairview Baptist Temple';
}
function catalogItem(id) {
  const items = CATALOG && Array.isArray(CATALOG.items) ? CATALOG.items : [];
  return items.filter(function (item) { return item && item.id === id; })[0] || null;
}
async function sermonTag(id, signal) {
  try {
    const url = SUPABASE_URL + '/rest/v1/sermon_tags?video_id=eq.' + encodeURIComponent(id) +
      '&select=video_id,title,speaker,reference,series,topics,type,summary,service,preached_on,updated_at&limit=1';
    const response = await fetch(url, {
      signal: signal,
      headers: { apikey: SUPABASE_ANON_KEY, authorization: 'Bearer ' + SUPABASE_ANON_KEY, accept: 'application/json' }
    });
    if (!response.ok) return null;
    const rows = await response.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (error) {
    // Studio copy is an enhancement for a bundled message. A temporary
    // database delay must never make a known sermon page disappear.
    return null;
  }
}
function descriptionFor(title, override) {
  const summary = String(override && override.summary || '').replace(/\s+/g, ' ').trim();
  if (summary) return summary.length > 260 ? summary.slice(0, 257).replace(/\s+\S*$/, '') + '...' : summary;
  return 'Watch "' + title + '" from Fairview Baptist Temple in Clay, West Virginia.';
}
function buildItem(id, source, override) {
  const title = String(override && override.title || '').trim() || cleanTitle(source.title);
  const thumbnails = source.thumbnails || {};
  const image = source.thumbnail || (thumbnails.maxres || thumbnails.standard || thumbnails.high || thumbnails.medium || {}).url;
  return {
    id: id,
    title: title,
    pageTitle: title + ' | Fairview Baptist Temple, Clay WV',
    description: descriptionFor(title, override),
    image: image || ('https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'),
    published: source.publishedAt || source.published || '',
    preachedOn: override && override.preached_on || '',
    speaker: override && override.speaker || '',
    reference: override && override.reference || '',
    service: override && override.service || '',
    youtubeUrl: 'https://www.youtube.com/watch?v=' + id,
    url: DOMAIN + '/message?v=' + encodeURIComponent(id)
  };
}
function replaceMeta(html, kind, key, value) {
  const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('<meta\\s+' + kind + '="' + safeKey + '"\\s+content="[^"]*"\\s*\\/?>', 'i');
  const tag = '<meta ' + kind + '="' + key + '" content="' + esc(value) + '">';
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', tag + '\n</head>');
}
function applyHead(html, item) {
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + esc(item.pageTitle) + '</title>');
  html = replaceMeta(html, 'name', 'description', item.description);
  html = replaceMeta(html, 'name', 'robots', 'index, follow, max-image-preview:large');
  html = replaceMeta(html, 'property', 'og:url', item.url);
  html = replaceMeta(html, 'property', 'og:title', item.pageTitle);
  html = replaceMeta(html, 'property', 'og:description', item.description);
  html = replaceMeta(html, 'property', 'og:image', item.image);
  html = replaceMeta(html, 'property', 'og:image:alt', item.title);
  html = replaceMeta(html, 'name', 'twitter:title', item.pageTitle);
  html = replaceMeta(html, 'name', 'twitter:description', item.description);
  html = replaceMeta(html, 'name', 'twitter:image', item.image);
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, '<link rel="canonical" href="' + esc(item.url) + '">');
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'VideoObject', '@id': item.url + '#video', name: item.title,
        description: item.description, thumbnailUrl: [item.image],
        uploadDate: item.published || undefined,
        contentUrl: item.youtubeUrl, embedUrl: 'https://www.youtube-nocookie.com/embed/' + item.id,
        publisher: { '@type': 'Organization', '@id': DOMAIN + '/#church', name: 'Fairview Baptist Temple' }
      },
      {
        '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: DOMAIN + '/' },
          { '@type': 'ListItem', position: 2, name: 'Messages', item: DOMAIN + '/watch#messages' },
          { '@type': 'ListItem', position: 3, name: item.title, item: item.url }
        ]
      }
    ]
  };
  if (item.speaker) schema['@graph'][0].creator = { '@type': 'Person', name: item.speaker };
  if (item.reference) schema['@graph'][0].keywords = [item.reference, item.service].filter(Boolean).join(', ');
  return html.replace('</head>', '<script type="application/ld+json" data-server-item="message">' + safeJson(schema) + '</script>\n</head>');
}
async function youtubeItem(id) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 6000);
  try {
    // The sitemap and browser library are built from this same trusted channel
    // snapshot. Render known entries directly so crawlable sermon metadata does
    // not depend on YouTube answering another request at page-view time.
    const bundled = catalogItem(id);
    if (bundled) {
      const bundledOverride = await sermonTag(id, controller.signal);
      if (!isMessageVideo(bundled, bundledOverride)) return null;
      return buildItem(id, bundled, bundledOverride);
    }

    const key = String(process.env.YT_API_KEY || '').trim();
    const channelId = String(process.env.YT_CHANNEL_ID || DEFAULT_CHANNEL).trim();
    if (key) {
      const apiUrl = 'https://www.googleapis.com/youtube/v3/videos?part=snippet%2CcontentDetails&id=' +
        encodeURIComponent(id) + '&key=' + encodeURIComponent(key);
      const apiResponse = await fetch(apiUrl, { signal: controller.signal, headers: { accept: 'application/json' } });
      if (!apiResponse.ok) throw new Error('YouTube metadata unavailable');
      const apiData = await apiResponse.json();
      const video = apiData && Array.isArray(apiData.items) && apiData.items[0];
      const snippet = video && video.snippet;
      // A valid YouTube ID is not enough. Only publish metadata for videos from
      // the church's configured channel, so arbitrary outside videos cannot be
      // indexed under fairviewbaptisttemple.com/message.
      if (!snippet || snippet.channelId !== channelId) return null;
      const source = {
        id: id, title: snippet.title || '', description: snippet.description || '',
        duration: video.contentDetails && video.contentDetails.duration,
        thumbnails: snippet.thumbnails || {}, publishedAt: snippet.publishedAt || ''
      };
      const override = await sermonTag(id, controller.signal);
      if (!isMessageVideo(source, override)) return null;
      return buildItem(id, source, override);
    }
    const url = 'https://www.youtube.com/oembed?format=json&url=' +
      encodeURIComponent('https://www.youtube.com/watch?v=' + id);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'FBTSite/1.0' }
    });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('YouTube metadata unavailable');
    }
    const data = await response.json();
    const authorUrl = String(data.author_url || '');
    const fromHandle = /youtube\.com\/@fairviewbaptisttemple(?:[/?#]|$)/i.test(authorUrl);
    const fromChannel = !!channelId &&
      authorUrl.toLowerCase().indexOf(('youtube.com/channel/' + channelId).toLowerCase()) >= 0;
    if (!fromHandle && !fromChannel) return null;
    const source = { id: id, title: data.title || '', thumbnail: data.thumbnail_url || '' };
    const override = await sermonTag(id, controller.signal);
    if (!isMessageVideo(source, override)) return null;
    return buildItem(id, source, override);
  } finally {
    clearTimeout(timer);
  }
}
function send(res, status, html, headOnly) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.end(headOnly ? '' : html);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return send(res, 405, 'Method not allowed', req.method === 'HEAD');
  }
  const html = readTemplate();
  const id = String(one(req.query && (req.query.v || req.query.id)) || '').trim();
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return send(res, 404, html, req.method === 'HEAD');
  try {
    const item = await youtubeItem(id);
    return send(res, item ? 200 : 404, item ? applyHead(html, item) : html, req.method === 'HEAD');
  } catch (e) {
    return send(res, 200, html, req.method === 'HEAD');
  }
};
