# Fairview Baptist Temple: livestream hub setup

> **Status (July 2026): DONE.** The channel ID `UCpVuAImXOHZcdGDbw6fQLIA`
> is wired into `assets/fbt.feeds.js`. Only the optional `YT_API_KEY` extras
> below remain.

The Watch page, **The Overlook** (`watch.html`), can show the church's YouTube stream
**automatically** the moment you go live. The church's channel is
**youtube.com/@FairviewBaptistTemple**. Its channel ID (the code that starts with `UC...`) is not
on file yet, so the steps below include finding it and pasting it into Studio.

There are two ways to set this up. Pick one. (Both assume the CMS from
[CMS-SETUP.md](CMS-SETUP.md) is already connected.)

---

## Option A: Simplest (no API key, no quota, recommended to start)

The player auto-embeds the channel's current live broadcast. When you go live, it shows the stream;
when you're not live, it shows your most recent stream.

1. Find the **YouTube channel ID** for @FairviewBaptistTemple (starts with `UC...`): sign in to the
   channel and open https://www.youtube.com/account_advanced
2. In **Studio → Settings → Livestream**, paste it into **"YouTube channel ID"** and save. (This
   field ships empty; the hub stays on its placeholder until the ID is pasted in.)

That's it. Nothing to schedule, no quota to worry about. The only limitation: when you're offline the
player shows your last stream rather than a separate "we're offline" screen.

---

## Option B: Full hub (true live / offline states + LIVE badge + replays)

A scheduled function checks YouTube every couple of minutes and records whether you're live. The
Overlook then shows the live video with a **LIVE** badge while you're streaming, and an offline
placeholder plus recent message replays when you're not.

> Leave the **"YouTube channel ID"** field in Studio Settings **empty** for this
> option, so the offline placeholder can show when you're not live.

### 1. Get a YouTube Data API key
1. Go to https://console.cloud.google.com → create or pick a project.
2. **APIs & Services → Library →** enable **YouTube Data API v3**.
3. **APIs & Services → Credentials → Create credentials → API key.** Copy it.

### 2. Deploy the Edge Function
With the Supabase CLI (https://supabase.com/docs/guides/cli) from this folder:
```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set YOUTUBE_API_KEY=your_key YT_CHANNEL_ID=UCyourchannelid
supabase functions deploy youtube-live-check --no-verify-jwt
```
(`supabase/functions/youtube-live-check/index.ts` is already written. `YT_CHANNEL_ID` is the
@FairviewBaptistTemple channel ID from step 1 of Option A.)

### 3. Schedule it
In the Supabase dashboard: **Integrations → Cron → Create job**, choose the **youtube-live-check**
Edge Function as the target.

**Watch the quota.** YouTube's live check costs 100 units/call and the free quota is 10,000/day. So:
- Running **every 15 minutes** all day fits the free quota (about 96 calls/day) but is slow to react.
- For near-instant switching, schedule **every 1-2 minutes only during your service windows** (e.g.
  Sunday morning, Sunday evening, and Wednesday evening) and rarely otherwise. You can create more
  than one cron job with different schedules. Example service-window expression (UTC; adjust for
  your timezone): `*/2 13-18 * * 0` (every 2 min, Sundays) and `*/2 23-24 * * 3` (Wednesday evening).
- Or request a quota increase in the Google Cloud console if you want minute-by-minute all week.

### 4. Confirm
Run the function once (the dashboard has a "Run" button, or hit its URL). Check the `live_status` table
has a `youtube` row. Go live on YouTube, wait for the next run, and The Overlook should switch to the
live video on its own.

---

## Facebook

Facebook live is kept as a **"Watch on Facebook"** button (facebook.com/FairviewBaptistTemple)
rather than an in-page embed. Auto-detecting and embedding a Facebook live stream requires a
Facebook app, page access token, and app review, which is heavy for a single button. The YouTube hub
above covers the in-page experience; the Facebook button sends viewers straight to the page.
