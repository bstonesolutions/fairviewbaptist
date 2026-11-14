// ------------------------------------------------------------------
// /api/streams  —  Fairview Baptist Temple's recent livestreams (completed + live + upcoming).
//
// The Watch page keeps a deep, static archive (assets/livestreams.json), but
// that snapshot goes stale the moment a new service is streamed. This endpoint
// returns the channel's most recent streams, newest first, so the page can
// merge them over the static archive and stay current on its own — a just-
// ended stream shows up here right away.
//
// Two authoritative sources, combined for reliability:
//   1) YouTube's Data API, with each upload verified through the video's
//      liveStreamingDetails metadata, and
//   2) a scrape of the channel's /streams tab (stream-only, deep via
//      continuation) when YouTube serves that markup.
// Ordinary uploads never enter this response just because their title looks
// like a church service.
//
//   { items: [ {id, t, d, live, upcoming, startTime, endTime} ],
//     count, source: {api,scrape} }
//
// Always responds 200. If both sources fail, items is [], so the Watch page
// simply keeps its static archive. Nothing breaks.
// ------------------------------------------------------------------

// Fairview's public channel. A deployment override is optional.
const DEFAULT_CHANNEL = 'UCpVuAImXOHZcdGDbw6fQLIA';
// A real desktop browser UA: YouTube serves the full channel-tab markup
// (ytInitialData video grid) to browsers, but a stripped page to bot-looking
// agents — which is why a simple "FBTSite/1.0" UA comes back empty.
const UA = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  cookie: 'CONSENT=YES+1; SOCS=CAI', // skip the EU consent interstitial
};

// Conservative title helper retained for offline tests and older integrations.
// A date alone is not evidence that a video was a livestream.
function looksLikeService(title) {
  var t = String(title || '');
  if (/\breels?\b/i.test(t)) return false;
  if (/#[A-Za-z]/.test(t)) return false;                                 // any hashtag (#word) = promo clip / Short
  if (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)) return false;    // emoji = social clip, not a service
  // A named preacher without an explicit service word marks a single message.
  // This must run before any dated-service checks because sermon uploads also
  // include dates in their titles.
  if (/\bpastor\b|\bspurlock\b|michael spurlock/i.test(t) &&
      !/\b(worship|midweek|sunday school|sunday service|wednesday service|church service)\b/i.test(t)) return false;
  if (/fairview/i.test(t) && /\d{1,2}[.\/-]\d{1,2}/.test(t)) return true;   // "Fairview 7.5"
  if (/\b(worship|midweek|sunday|wednesday|service)\b/i.test(t) && /\d{1,2}[.\/-]\d{1,2}/.test(t)) return true; // "Worship 7.5"
  // Otherwise, a clear service word (themed services with no date, e.g. "Easter Sunday").
  if (/\b(worship|midweek|sunday|wednesday|service|father'?s day|mother'?s day|easter|christmas|kickoff|revival|conference)\b/i.test(t)) return true;
  return false;
}

function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").trim();
}

// Pull the first balanced {...} object that follows a marker in the page HTML.
// A non-greedy regex can't do this (the JSON is deeply nested), so we scan for
// balanced braces while respecting strings/escapes.
function sliceJson(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, i + 1); }
  }
  return null;
}

function titleText(t) {
  if (!t) return '';
  if (Array.isArray(t.runs)) return t.runs.map(function (r) { return r && r.text || ''; }).join('');
  if (typeof t.simpleText === 'string') return t.simpleText;
  if (typeof t.content === 'string') return t.content;
  return '';
}

function statusOf(node) {
  let status = '';
  const overlays = node.thumbnailOverlays || [];
  for (let i = 0; i < overlays.length; i++) {
    const r = overlays[i] && overlays[i].thumbnailOverlayTimeStatusRenderer;
    if (r && r.style === 'LIVE') status = 'live';
    else if (r && r.style === 'UPCOMING' && !status) status = 'upcoming';
  }
  // Current YouTube channel grids use lockupViewModel thumbnail badges.
  const modernOverlays = node.contentImage && node.contentImage.thumbnailViewModel && node.contentImage.thumbnailViewModel.overlays || [];
  modernOverlays.forEach(function (overlay) {
    const badges = overlay.thumbnailBottomOverlayViewModel && overlay.thumbnailBottomOverlayViewModel.badges || [];
    badges.forEach(function (badge) {
      const b = badge.thumbnailBadgeViewModel || {};
      if (/^live$/i.test(b.text || '') || /_LIVE$/.test(b.badgeStyle || '')) status = 'live';
      else if (/^upcoming$/i.test(b.text || '') && !status) status = 'upcoming';
    });
  });
  // Upcoming streams also carry an upcomingEventData block.
  if (!status && node.upcomingEventData) status = 'upcoming';
  return status;
}

function scheduledStartOf(node) {
  const raw = node && node.upcomingEventData && node.upcomingEventData.startTime;
  if (!raw) return '';
  const parsed = new Date(Number(raw) * 1000);
  return isNaN(parsed) ? '' : parsed.toISOString();
}

// Walk the parsed ytInitialData collecting every video renderer in page order
// (newest first on the /streams tab). A "video renderer" is any node carrying
// both a videoId and a title — this stays robust when YouTube reshuffles its
// wrapper objects. Deduped by id.
function collectVideos(root) {
  const out = [], seen = {};
  // Depth-first in document order (newest first on the /streams tab).
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) walk(node[i]); return; }
    const modern = node.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && node.metadata && node.metadata.lockupMetadataViewModel;
    const id = modern ? node.contentId : node.videoId;
    const title = modern ? modern.title : node.title;
    if (typeof id === 'string' && /^[\w-]{11}$/.test(id) && title && !seen[id]) {
      seen[id] = 1;
      const status = statusOf(node);
      out.push({
        id: id,
        t: decode(titleText(title)),
        d: '', // exact date isn't on the grid; the page derives year from the title
        live: status === 'live',
        upcoming: status === 'upcoming',
        startTime: scheduledStartOf(node),
        endTime: '',
      });
      return; // Menus repeat the same video and may contain unrelated suggestions.
    }
    for (const k in node) walk(node[k]);
  })(root);
  return out;
}

// Only the selected Live tab is a stream source. Recommendations and a
// fallback Videos tab are not evidence of a broadcast.
function streamsTabContent(data) {
  const contents = data && data.contents || {};
  const browse = contents.twoColumnBrowseResultsRenderer || contents.singleColumnBrowseResultsRenderer || {};
  const tab = (browse.tabs || []).map(function (entry) { return entry.tabRenderer; }).find(function (entry) {
    if (!entry || !entry.selected) return false;
    const endpoint = entry.endpoint && entry.endpoint.commandMetadata && entry.endpoint.commandMetadata.webCommandMetadata;
    return /\/streams(?:[?#]|$)/.test(endpoint && endpoint.url || '') || entry.title === 'Live';
  });
  return tab && tab.content || null;
}

// Read the video's own player response, never page-wide live/schedule flags:
// recommendations can include unrelated channels that are live right now.
function parseBroadcastPlayer(html, channelId, expectedId) {
  const raw = sliceJson(html, 'ytInitialPlayerResponse');
  if (!raw) return null;
  let player;
  try { player = JSON.parse(raw); } catch (e) { return null; }
  const video = player.videoDetails || {};
  if (!/^[\w-]{11}$/.test(video.videoId || '') || video.channelId !== channelId ||
      (expectedId && video.videoId !== expectedId)) return null;
  const micro = player.microformat && (player.microformat.playerMicroformatRenderer || player.microformat.microformatDataRenderer) || {};
  const broadcast = micro.liveBroadcastDetails || {};
  const liveRenderer = player.playabilityStatus && player.playabilityStatus.liveStreamability && player.playabilityStatus.liveStreamability.liveStreamabilityRenderer || {};
  const slate = liveRenderer.offlineSlate && liveRenderer.offlineSlate.liveStreamOfflineSlateRenderer || {};
  const scheduled = Number(slate.scheduledStartTime || 0);
  const scheduledIso = scheduled && Number.isFinite(scheduled) ? new Date(scheduled * 1000).toISOString() : '';
  if (!video.isLiveContent && !video.isLive && !video.isUpcoming && !micro.liveBroadcastDetails) return null;
  const ended = !!broadcast.endTimestamp;
  const live = !ended && (video.isLive === true || broadcast.isLiveNow === true);
  const upcoming = !ended && !live && (video.isUpcoming === true || !!scheduledIso);
  return {
    id: video.videoId, t: decode(video.title || ''),
    d: micro.publishDate || micro.uploadDate || '',
    live: live, upcoming: upcoming,
    startTime: broadcast.startTimestamp || scheduledIso,
    endTime: broadcast.endTimestamp || '',
  };
}

async function readBroadcast(url, channelId, expectedId) {
  const response = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  return parseBroadcastPlayer(await response.text(), channelId, expectedId);
}

async function hydrateStreams(items, channelId) {
  // The new grid's schedule text uses the server's local time zone. Fetch
  // exact timestamps instead of guessing from that label. Also date recent
  // replays so the newest completed service can be selected accurately.
  const candidates = items.filter(function (v) { return v.live || v.upcoming; }).slice(0, 12)
    .concat(items.filter(function (v) { return !v.live && !v.upcoming; }).slice(0, 4));
  await Promise.all(candidates.map(async function (item) {
    try {
      const verified = await readBroadcast('https://www.youtube.com/watch?v=' + encodeURIComponent(item.id), channelId, item.id);
      if (verified) Object.assign(item, verified);
    } catch (e) { /* Keep the authoritative stream-tab row if a page is unavailable. */ }
  }));
  return items;
}

function pick(html, re) { const m = html.match(re); return m ? m[1] : ''; }

// The continuation token that loads the next page of the /streams grid.
function findContinuationToken(node) {
  let token = null;
  (function walk(n) {
    if (token || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (let i = 0; i < n.length && !token; i++) walk(n[i]); return; }
    const cir = n.continuationItemRenderer;
    if (cir && cir.continuationEndpoint && cir.continuationEndpoint.continuationCommand) {
      token = cir.continuationEndpoint.continuationCommand.token; return;
    }
    for (const k in n) { if (token) break; walk(n[k]); }
  })(node);
  return token;
}

// Ask YouTube's internal browse API for the next page of streams. Best-effort:
// any failure just stops paging, so page one (the recent streams that matter)
// is never at risk.
async function fetchContinuation(apiKey, clientVersion, token) {
  const res = await fetch('https://www.youtube.com/youtubei/v1/browse?key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: Object.assign({ 'content-type': 'application/json' }, UA),
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: clientVersion, hl: 'en', gl: 'US' } },
      continuation: token,
    }),
  });
  return res.json();
}

// Source 1: scrape the /streams tab (stream-only, deep via continuation).
async function scrapeStreamsTab(channelId) {
  const url = 'https://www.youtube.com/channel/' + channelId + '/streams?hl=en&gl=US';
  const response = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(10000) });
  if (!response.ok) return [];
  const html = await response.text();
  const raw = sliceJson(html, 'ytInitialData');
  if (!raw) return [];
  let data;
  try { data = JSON.parse(raw); } catch (e) { return []; }

  const tab = streamsTabContent(data);
  if (!tab) return [];
  const out = collectVideos(tab);
  const seen = {}; out.forEach(function (v) { seen[v.id] = 1; });

  // Page deeper so the fresh list always reaches back far enough to overlap the
  // static archive (assets/livestreams.json) — otherwise a band of streams
  // newer than that snapshot but older than page one would belong to neither
  // list and vanish. Guarded + capped; any hiccup just returns what we have.
  const apiKey = pick(html, /"INNERTUBE_API_KEY":"([^"]+)"/);
  const clientVersion = pick(html, /"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/) ||
                        pick(html, /"clientVersion":"([\d.]+)"/);
  let token = findContinuationToken(tab);
  let pages = 0;
  while (token && apiKey && clientVersion && pages < 5 && out.length < 250) {
    pages++;
    try {
      const cont = await fetchContinuation(apiKey, clientVersion, token);
      const more = collectVideos(cont).filter(function (v) { return !seen[v.id]; });
      if (!more.length) break;
      more.forEach(function (v) { seen[v.id] = 1; out.push(v); });
      token = findContinuationToken(cont);
    } catch (e) { break; }
  }
  return hydrateStreams(out.slice(0, 250), channelId);
}

// Official YouTube Data API (needs a free key in env YT_API_KEY). Unlike the
// page scrape and RSS feed — which YouTube blocks from datacenter IPs like
// Vercel's, returning nothing — the Data API is authenticated and works from
// servers. The uploads playlist supplies recent IDs, then videos.list verifies
// which IDs are real broadcasts via liveStreamingDetails. Both calls are cheap
// list operations. Returns [] with no key.
function normalizeVerifiedStreams(uploads, videos) {
  const verified = {};
  (videos || []).forEach(function (video) {
    if (!video || !video.id || !video.liveStreamingDetails) return;
    const snippet = video.snippet || {};
    const details = video.liveStreamingDetails || {};
    const state = String(snippet.liveBroadcastContent || '').toLowerCase();
    verified[video.id] = {
      id: video.id,
      t: decode(snippet.title || ''),
      d: snippet.publishedAt || '',
      live: state === 'live',
      upcoming: state === 'upcoming',
      startTime: details.actualStartTime || details.scheduledStartTime || '',
      endTime: details.actualEndTime || '',
    };
  });
  return (uploads || []).map(function (upload) {
    const row = verified[upload && upload.id];
    if (!row) return null;
    if (!row.t) row.t = decode(upload.title || '');
    if (!row.d) row.d = upload.published || '';
    return row;
  }).filter(Boolean);
}

async function fetchDataApi(channelId) {
  const key = process.env.YT_API_KEY;
  if (!key) return [];
  const uploads = channelId.replace(/^UC/, 'UU');
  const url = 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=' +
    encodeURIComponent(uploads) + '&key=' + encodeURIComponent(key);
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) return [];
  const data = await res.json();
  const candidates = (data.items || []).map(function (it) {
    const s = it.snippet || {};
    const c = it.contentDetails || {};
    const id = c.videoId || (s.resourceId && s.resourceId.videoId);
    if (!id) return null;
    return { id: id, title: s.title || '', published: c.videoPublishedAt || s.publishedAt || '' };
  }).filter(Boolean);
  if (!candidates.length) return [];

  const detailsUrl = 'https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=' +
    encodeURIComponent(candidates.map(function (item) { return item.id; }).join(',')) +
    '&key=' + encodeURIComponent(key);
  const detailsRes = await fetch(detailsUrl, { headers: { accept: 'application/json' } });
  if (!detailsRes.ok) return [];
  const details = await detailsRes.json();
  return normalizeVerifiedStreams(candidates, details.items || []);
}

// Combine the sources. The verified Data API results lead; the stream-only
// channel tab is a keyless backstop. Deduped by id, newest-first order
// preserved.
async function readStreams(channelId) {
  const [api, scrape] = await Promise.all([
    fetchDataApi(channelId).catch(function () { return []; }),
    scrapeStreamsTab(channelId).catch(function () { return []; }),
  ]);
  const seen = {}, out = [];
  // Data API leads (verified), with the stream-only channel tab as a backstop.
  // General-upload RSS is intentionally excluded because titles cannot prove
  // that a video was ever a livestream.
  api.concat(scrape).forEach(function (v) {
    if (!v || !v.id || seen[v.id]) return;
    seen[v.id] = 1; out.push(v);
  });
  return { items: out.slice(0, 250), counts: { api: api.length, scrape: scrape.length } };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  // Let Vercel's CDN serve one shared scrape to all viewers for a minute, so a
  // busy Sunday doesn't hammer YouTube once per visitor per poll.
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=30');
  const channelId = process.env.YT_CHANNEL_ID || DEFAULT_CHANNEL;
  try {
    const r = await readStreams(channelId);
    res.statusCode = 200;
    return res.end(JSON.stringify({ items: r.items, count: r.items.length, source: r.counts }));
  } catch (e) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ items: [], error: String(e && e.message || e) }));
  }
};

// Pure helpers exposed for offline tests (inert in the serverless handler).
module.exports._parse = {
  sliceJson: sliceJson,
  collectVideos: collectVideos,
  findContinuationToken: findContinuationToken,
  looksLikeService: looksLikeService,
  normalizeVerifiedStreams: normalizeVerifiedStreams,
  streamsTabContent: streamsTabContent,
  parseBroadcastPlayer: parseBroadcastPlayer,
  readBroadcast: readBroadcast,
};
