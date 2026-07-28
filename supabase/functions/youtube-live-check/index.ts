// Supabase Edge Function: youtube-live-check
// ------------------------------------------------------------------
// Checks whether Fairview Baptist Temple's YouTube channel is live and writes
// the result to the public.live_status table. The Watch page reads that
// table and flips between the live player and the offline placeholder.
// Schedule this to run on a cron (see LIVESTREAM-SETUP.md).
//
// Secrets to set (supabase secrets set KEY=value):
//   YOUTUBE_API_KEY  - a YouTube Data API v3 key (Google Cloud console)
//   YT_CHANNEL_ID    - the channel id, starts with "UC..."
// Auto-provided in deployed functions: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// NOTE on quota: YouTube's search.list costs 100 units/call and the default
// daily quota is 10,000. Running this every minute all day exceeds that, so
// schedule it sparingly (e.g. every ~2-3 min during service windows). For a
// zero-quota option, skip this function and just set a YouTube channel ID in
// Studio Settings; the Watch page will auto-embed the live broadcast.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  const channelId = Deno.env.get("YT_CHANNEL_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!apiKey || !channelId || !supabaseUrl || !serviceKey) {
    return json({ error: "Missing required environment variables" }, 500);
  }

  let isLive = false;
  let videoId: string | null = null;
  let title: string | null = null;

  try {
    const url =
      "https://www.googleapis.com/youtube/v3/search" +
      `?part=snippet&channelId=${channelId}&eventType=live&type=video&maxResults=1&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    const item = data.items && data.items[0];
    if (item && item.id && item.id.videoId) {
      isLive = true;
      videoId = item.id.videoId;
      title = item.snippet && item.snippet.title ? item.snippet.title : null;
    }
  } catch (e) {
    return json({ error: "YouTube fetch failed: " + String(e) }, 502);
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const { error } = await sb.from("live_status").upsert(
    { id: "youtube", is_live: isLive, video_id: videoId, title, updated_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  if (error) return json({ error: error.message }, 500);

  return json({ is_live: isLive, video_id: videoId, title });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
