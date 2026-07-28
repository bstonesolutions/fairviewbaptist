/* ============================================================
   Fairview Baptist Temple — live feeds config (PUBLIC values,
   safe to ship). This is separate from assets/config.js (the CMS).
   It holds the handful of public IDs/links the live features read.
   Nothing here is secret. Leave an optional value empty and the
   page uses its built-in fallback. Nothing ever breaks.
   ============================================================ */
window.FBT_FEEDS = {
  // --- YouTube videos (The Overlook: Live / Messages / Music) ------
  // Your channel. The /api/videos proxy resolves the handle for you,
  // so you normally only need the handle. The channelId is a fallback:
  // paste the church's channel ID (it starts with UC...) when you
  // have it. Find it at youtube.com > your channel > Settings >
  // Advanced settings > Channel ID.
  youtubeHandle: '@FairviewBaptistTemple',
  youtubeChannelId: 'UCpVuAImXOHZcdGDbw6fQLIA',
  // Endpoint that returns videos as JSON (keyless). Reads the uploads
  // feed, or ?playlist=PL... for a specific playlist.
  videosApi: '/api/videos',

  // --- Hybrid sort: optional YouTube playlists ---------------------
  // Make a "Sermons" playlist and a "Music" playlist on YouTube and
  // paste their ids (the PL... part of the playlist URL). Videos in a
  // playlist are sorted authoritatively into that hub; anything not in
  // a playlist is auto-sorted by its title/description. Leave blank to
  // rely purely on auto-sort for now.
  sermonsPlaylistId: '',
  musicPlaylistId: '',
  servicesPlaylistId: '', // optional: full Sunday/Wednesday service recordings

  // --- Hide specific videos from every hub (Live / Messages / Music) ---
  // Use this when a clip auto-sorts into the wrong place. Each entry
  // matches by YouTube video id OR a case-insensitive piece of the
  // title. Best to use the id (the v=... part of the URL) when you can.
  excludeFromHubs: [],

  // --- Podcast (optional) ------------------------------------------
  // Fairview does not have a podcast yet. If the church starts one,
  // paste the Spotify show id (open.spotify.com/show/THIS_PART) and
  // the other links here and the podcast features light up.
  podcastSpotifyShowId: '',
  podcastApple: '',
  podcastRss: '',

  // --- Speakers the title parser should recognize ------------------
  // Helps auto-detect the preacher (and that a video is a sermon).
  knownSpeakers: [
    'Pastor J. Bret Wiley',
    'Bret Wiley',
  ],
};
