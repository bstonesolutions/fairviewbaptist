# Fairview Baptist Temple livestreams

The homepage and [The Overlook](https://www.fairviewbaptisttemple.com/watch#live)
automatically follow `@FairviewBaptistTemple`, channel `UCpVuAImXOHZcdGDbw6fQLIA`.

Schedule broadcasts as **Public** in YouTube Studio and allow embedding. No
separate website switch or Supabase scheduled function is required. Private or
unlisted broadcasts are not discoverable in the channel's public feed.

## What visitors see

- The Live tab lists upcoming broadcasts with dates, times in Eastern Time, and
  links to set a YouTube reminder.
- The main player shows the latest completed service until one hour before the
  next scheduled broadcast, matching The Brook's waiting-room window.
- A channel with no completed services shows its next scheduled broadcast.
- When the broadcast goes live, the player switches to it and shows chat.
- After it ends, the recording becomes the replay and remains in the archive.
- Messages contains individual sermon uploads. Full livestreams and scheduled
  broadcasts belong in Live, not in the latest-message feature.

The browser checks every 45 seconds. Shared server caching and YouTube's own
updates can add a short delay to a transition; an already-open page updates
automatically.

## Data sources

`api/live.js` checks the channel's actual live player. `api/streams.js` reads
the public Streams tab, and `api/videos.js` reads uploaded videos. Modern and
legacy YouTube layouts are supported. The optional Vercel `YT_API_KEY` adds an
official YouTube Data API source; `YT_CHANNEL_ID` can override the channel.
Credentials never belong in browser files.

The old `live_channel_id` CMS setting and `youtube-live-check` Supabase function
are legacy integrations. They do not control the current homepage or Watch hub.

## Verify a change

Run `node --test tests/streams.test.js tests/live-schedule.test.js` and the
video/message tests. After deployment, check `/api/live`, `/api/streams`, and
`/api/videos` on the church domain, then inspect `/watch#live` and
`/watch#messages`. Confirm scheduled broadcasts are separated from completed
recordings and the latest message is an individual sermon.
