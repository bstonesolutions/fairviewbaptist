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
// The Fairview Baptist Temple channel id (UC...) is not published yet. Set it
// with the YT_CHANNEL_ID env var (or in Studio Settings) once it is known;
// until then the handle above is resolved at request time.
const DEFAULT_CHANNEL = '';
let resolvedChannelCache = null;

function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

async function resolveChannelId(handle) {
  if (process.env.YT_CHANNEL_ID) return process.env.YT_CHANNEL_ID;
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
  const xml = await (await fetch(feedUrl)).text();
  return parseFeed(xml);
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
  return items;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
      items = key ? await fetchPlaylistApi('UU' + channelId.slice(2), key)
                  : await fetchRss('https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(channelId));
    }
    res.statusCode = 200;
    return res.end(JSON.stringify({ source: source, count: items.length, items: items }));
  } catch (e) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ items: [], error: String(e && e.message || e) }));
  }
};
