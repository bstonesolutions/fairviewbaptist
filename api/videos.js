// ------------------------------------------------------------------
// /api/videos  —  YouTube proxy for Fairview Baptist Temple.
//
// The browser cannot read YouTube directly (no CORS headers), so this
// Vercel function does it server-side and returns clean JSON.
//
//   /api/videos                  -> the channel's uploads
//   /api/videos?playlist=PL...   -> a specific playlist
//
// Two modes, picked automatically:
//   * If YT_API_KEY is set (YouTube Data API v3 key, set in Vercel),
//     it returns the FULL library (paginated, all videos).
//   * Otherwise it falls back to the keyless RSS feed (latest ~15).
// Either way the front-end also merges assets/catalog.json (a static
// full-library snapshot) for depth, so the site can show everything.
//
// Optional environment variables (set in Vercel, never hardcode):
//   YT_API_KEY     — YouTube Data API v3 key -> full library
//   YT_CHANNEL_ID  — pin a channel id (skips handle resolution)
//
// Always responds 200 with { items: [...] }. On any failure items is [],
// so the page falls back to its built-in content. Nothing breaks.
// ------------------------------------------------------------------

const DEFAULT_HANDLE = '@FairviewBaptistTemple';
const DEFAULT_CHANNEL = 'UCpVuAImXOHZcdGDbw6fQLIA';
const UA = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  cookie: 'CONSENT=YES+1; SOCS=CAI',
};
let resolvedChannelCache = null;

function request(url, options) {
  return fetch(url, Object.assign({ headers: UA, redirect: 'follow', signal: AbortSignal.timeout(8000) }, options));
}

function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

async function resolveChannelId(handle) {
  if (process.env.YT_CHANNEL_ID) return process.env.YT_CHANNEL_ID;
  if (handle === DEFAULT_HANDLE) return DEFAULT_CHANNEL;
  if (resolvedChannelCache) return resolvedChannelCache;
  try {
    const res = await fetch('https://www.youtube.com/' + handle, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; FBTSite/1.0)' },
    });
    const html = await res.text();
    const m = html.match(/"channelId":"(UC[0-9A-Za-z_-]{20,})"/) ||
              html.match(/"externalId":"(UC[0-9A-Za-z_-]{20,})"/) ||
              html.match(/channel\/(UC[0-9A-Za-z_-]{20,})/);
    if (m) { resolvedChannelCache = m[1]; return m[1]; }
  } catch (e) { /* fall through */ }
  return DEFAULT_CHANNEL;
}

// ---- keyless RSS (latest ~15) -----------------------------------
function parseFeed(xml) {
  const entries = xml.split('<entry>').slice(1);
  return entries.map(function (e) {
    const pick = function (re) { const m = e.match(re); return m ? m[1] : ''; };
    const id = pick(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!id) return null;
    return {
      id: id,
      title: decode(pick(/<title>([^<]*)<\/title>/)),
      published: pick(/<published>([^<]+)<\/published>/),
      url: 'https://www.youtube.com/watch?v=' + id,
      thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
      description: decode(pick(/<media:description>([\s\S]*?)<\/media:description>/)),
    };
  }).filter(Boolean);
}
async function fetchRss(feedUrl) {
  const response = await request(feedUrl);
  if (!response.ok) return [];
  const xml = await response.text();
  return parseFeed(xml);
}

function pageJson(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at);
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i >= 0 && i < html.length; i++) {
    const c = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(html.slice(start, i + 1)); } catch (_) { return null; }
    }
  }
  return null;
}

function collectUploads(data) {
  const rows = [], seen = new Set();
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    const modern = node.lockupViewModel;
    const legacy = node.videoRenderer;
    const id = modern ? modern.contentId : legacy && legacy.videoId;
    const title = modern ? modern.metadata?.lockupMetadataViewModel?.title?.content :
      legacy && (legacy.title?.simpleText || legacy.title?.runs?.map(r => r.text || '').join(''));
    if (/^[\w-]{11}$/.test(id || '') && title && !seen.has(id)) {
      seen.add(id);
      rows.push({ id, title: decode(title), published: '', description: '',
        url: 'https://www.youtube.com/watch?v=' + id,
        thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' });
      return;
    }
    Object.keys(node).forEach(key => walk(node[key]));
  }
  walk(data);
  return rows;
}

// Use the video's own metadata for exact dates and broadcast status. Relative
// labels such as "2 days ago" on the channel grid are never made into dates.
function normalizeWatchMetadata(item, player, channelId) {
  const details = player && player.videoDetails;
  if (!details || details.videoId !== item.id || details.channelId !== channelId) return null;
  const micro = player.microformat?.playerMicroformatRenderer || player.microformat?.microformatDataRenderer || {};
  const broadcast = micro.liveBroadcastDetails || {};
  const live = details.isLive === true || broadcast.isLiveNow === true;
  const upcoming = !live && (details.isUpcoming === true || player.playabilityStatus?.liveStreamability?.liveStreamabilityRenderer?.offlineSlate?.liveStreamOfflineSlateRenderer?.scheduledStartTime != null);
  return Object.assign({}, item, {
    title: details.title || item.title,
    description: details.shortDescription || '',
    published: micro.publishDate || micro.uploadDate || '',
    duration: Number(details.lengthSeconds) || null,
    isLivestream: details.isLiveContent === true || !!micro.liveBroadcastDetails,
    live, upcoming,
  });
}

function parseWatchMetadata(item, html, channelId) {
  const player = pageJson(html, 'ytInitialPlayerResponse');
  if ((player?.videoDetails?.channelId && player.videoDetails.channelId !== channelId) ||
      (player?.videoDetails?.videoId && player.videoDetails.videoId !== item.id)) return null;
  const verified = normalizeWatchMetadata(item, player, channelId);
  if (verified && verified.published && verified.description) return verified;
  // Some datacenter responses omit videoDetails but retain the primary
  // document's structured metadata. Only use head tags for this exact URL,
  // never dates/descriptions from recommendations in the page body.
  const head = String(html).split(/<\/head\s*>/i)[0];
  const links = head.match(/<link\b[^>]*>/gi) || [];
  const attribute = (tag, name) => {
    const match = tag.match(new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(["\'])(.*?)\\1', 'is'));
    return match ? decode(match[2]) : '';
  };
  const canonical = links.find(tag => attribute(tag, 'rel').toLowerCase() === 'canonical');
  let exact = false;
  try { const url = new URL(attribute(canonical || '', 'href')); exact = /(^|\.)youtube\.com$/.test(url.hostname) && url.pathname === '/watch' && url.searchParams.get('v') === item.id; } catch (_) {}
  if (!exact) return verified;
  const metadata = {};
  (head.match(/<meta\b[^>]*>/gi) || []).forEach(tag => {
    const key = attribute(tag, 'itemprop') || attribute(tag, 'property') || attribute(tag, 'name');
    if (key) metadata[key.toLowerCase()] = attribute(tag, 'content');
  });
  const published = metadata.datepublished || metadata.uploaddate || '';
  const description = metadata.description || metadata['og:description'] || '';
  if (!verified && !published && !description) return null;
  return Object.assign({}, verified || item, {
    published: verified?.published || published,
    description: verified?.description || description,
  });
}

async function scrapeUploads(channelId) {
  const response = await request('https://www.youtube.com/channel/' + encodeURIComponent(channelId) + '/videos?hl=en&gl=US');
  if (!response.ok) return [];
  const rows = collectUploads(pageJson(await response.text(), 'ytInitialData')).slice(0, 30);
  const output = new Array(rows.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, rows.length) }, async () => {
    while (next < rows.length) {
      const index = next++, row = rows[index];
      try {
        const page = await request(row.url);
        output[index] = page.ok ? parseWatchMetadata(row, await page.text(), channelId) : null;
      } catch (_) { /* retain a truthful undated listing if a detail page fails */ }
      if (!output[index]) output[index] = row;
    }
  }));
  return output;
}

async function enrichApiVideos(items, key) {
  const out = [];
  for (let offset = 0; offset < items.length; offset += 50) {
    const batch = items.slice(offset, offset + 50);
    try {
      const response = await request('https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,liveStreamingDetails&id=' +
        encodeURIComponent(batch.map(item => item.id).join(',')) + '&key=' + encodeURIComponent(key));
      if (!response.ok) { out.push(...batch); continue; }
      const data = await response.json(), byId = {};
      (data.items || []).forEach(item => { byId[item.id] = item; });
      batch.forEach(item => {
        const record = byId[item.id];
        if (!record) { out.push(item); return; }
        const details = record.liveStreamingDetails;
        const state = record.snippet?.liveBroadcastContent;
        const duration = (record.contentDetails?.duration || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
        out.push(Object.assign({}, item, {
          duration: duration ? (+duration[1] || 0) * 3600 + (+duration[2] || 0) * 60 + (+duration[3] || 0) : null,
          isLivestream: !!details,
          live: state === 'live' || !!(details?.actualStartTime && !details.actualEndTime),
          upcoming: state === 'upcoming' || !!(details?.scheduledStartTime && !details.actualStartTime),
        }));
      });
    } catch (_) { out.push(...batch); }
  }
  return out;
}

// ---- full library via YouTube Data API (when YT_API_KEY set) ----
async function fetchPlaylistApi(playlistId, key) {
  let items = [], pageToken = '';
  for (let i = 0; i < 40; i++) { // up to 2000 videos
    const url = 'https://www.googleapis.com/youtube/v3/playlistItems' +
      '?part=snippet,contentDetails&maxResults=50&playlistId=' + encodeURIComponent(playlistId) +
      '&key=' + encodeURIComponent(key) + (pageToken ? '&pageToken=' + pageToken : '');
    const data = await (await fetch(url)).json();
    if (data.error) throw new Error(data.error.message || 'YouTube API error');
    (data.items || []).forEach(function (it) {
      const sn = it.snippet || {}, cd = it.contentDetails || {};
      const vid = cd.videoId || (sn.resourceId && sn.resourceId.videoId);
      if (!vid) return;
      items.push({
        id: vid,
        title: sn.title || '',
        published: cd.videoPublishedAt || sn.publishedAt || '',
        url: 'https://www.youtube.com/watch?v=' + vid,
        thumbnail: 'https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg',
        description: sn.description || '',
      });
    });
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return enrichApiVideos(items, key);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  const key = process.env.YT_API_KEY;
  try {
    const playlist = req.query && req.query.playlist;
    let items, source;
    if (playlist) {
      source = { type: 'playlist', id: playlist, full: !!key };
      items = key ? await fetchPlaylistApi(playlist, key)
                  : await fetchRss('https://www.youtube.com/feeds/videos.xml?playlist_id=' + encodeURIComponent(playlist));
    } else {
      const handle = (req.query && req.query.handle) || DEFAULT_HANDLE;
      const channelId = await resolveChannelId(handle);
      source = { type: 'channel', id: channelId, full: !!key };
      items = key ? await fetchPlaylistApi('UU' + channelId.slice(2), key).catch(() => [])
                  : await fetchRss('https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(channelId)).catch(() => []);
      if (!items.length) {
        items = await scrapeUploads(channelId);
        source.method = 'channel-page';
      }
    }
    res.statusCode = 200;
    return res.end(JSON.stringify({ source: source, count: items.length, items: items }));
  } catch (e) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ items: [], error: String(e && e.message || e) }));
  }
};

module.exports._parse = { parseFeed, pageJson, collectUploads, normalizeWatchMetadata, parseWatchMetadata };
