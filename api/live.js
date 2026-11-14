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

const DEFAULT_CHANNEL = 'UCpVuAImXOHZcdGDbw6fQLIA';
const readBroadcast = require('./streams')._parse.readBroadcast;

async function readLiveTab(channelId) {
  const row = await readBroadcast('https://www.youtube.com/channel/' + encodeURIComponent(channelId) + '/live', channelId);
  if (!row) return { live: null, upcoming: null };
  return {
    live: row.live ? { videoId: row.id, title: row.t } : null,
    upcoming: row.upcoming ? { videoId: row.id, title: row.t, startTime: row.startTime } : null,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=15');
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
