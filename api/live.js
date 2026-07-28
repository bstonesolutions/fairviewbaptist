// ------------------------------------------------------------------
// /api/live  —  is Fairview Baptist Temple live right now (or scheduled)?
//
// Returns the current live broadcast and/or the next scheduled stream so
// the Watch page can embed the player + chat and auto-update. Uses a free
// page read of the channel's /live tab (no API key, no quota) so it can be
// polled often. Best-effort: if YouTube's markup ever shifts or nothing is
// live, it simply returns nulls and the page shows the latest service.
//
//   { live: {videoId,title} | null,
//     upcoming: {videoId,title,startTime} | null,
//     source: 'scrape' }
//
// Always responds 200. CORS open so it works from the deployed site.
// ------------------------------------------------------------------

// The Fairview Baptist Temple channel id (UC...) is not published yet. Set it
// with the YT_CHANNEL_ID env var (or in Studio Settings) once it is known.
const DEFAULT_CHANNEL = '';
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; FBTSite/1.0)' };

function clean(t) {
  return String(t || '').replace(/\s*-\s*YouTube\s*$/i, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

async function readLiveTab(channelId) {
  const url = 'https://www.youtube.com/channel/' + channelId + '/live';
  const html = await (await fetch(url, { headers: UA, redirect: 'follow' })).text();
  const canon = (html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]+)">/) || [])[1] || '';
  const title = clean((html.match(/<meta name="title" content="([^"]*)">/) || [])[1] ||
                      (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '');
  const isLiveNow = /"isLiveNow":true/.test(html);
  const lbc = (html.match(/"liveBroadcastContent":"(\w+)"/) || [])[1] || '';
  const schedSec = (html.match(/"scheduledStartTime":"(\d+)"/) || [])[1];
  // Only treat the /live tab as authoritative when it actually resolved to a video.
  if (!canon) return { live: null, upcoming: null };
  if (isLiveNow) return { live: { videoId: canon, title: title }, upcoming: null };
  if (lbc === 'upcoming' || schedSec) {
    return {
      live: null,
      upcoming: { videoId: canon, title: title, startTime: schedSec ? new Date(Number(schedSec) * 1000).toISOString() : '' },
    };
  }
  return { live: null, upcoming: null };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const channelId = process.env.YT_CHANNEL_ID || DEFAULT_CHANNEL;
  try {
    const r = await readLiveTab(channelId);
    res.statusCode = 200;
    return res.end(JSON.stringify({ live: r.live, upcoming: r.upcoming, source: 'scrape' }));
  } catch (e) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ live: null, upcoming: null, error: String(e && e.message || e) }));
  }
};
