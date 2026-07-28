# Fairview Baptist Temple website

Static multi-page site for **Fairview Baptist Temple** in Clay, West Virginia
(https://fairviewbaptisttemple.com). Plain HTML/CSS/JS, no build step. Deploy the folder to any
static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages).

## Pages

| File | Page |
|------|------|
| `index.html` | Home |
| `visit.html` | Plan a Visit (what to expect, service times, find us) |
| `beliefs.html` | What We Believe (statement of faith) |
| `staff.html` | Our Staff |
| `watch.html` | The Overlook (live stream, messages, music) |
| `blog.html` | Notes from Fairview (blog) |
| `events.html` | Events |
| `missions.html` | Missions |
| `next-steps.html` | Next Steps |
| `get-involved.html` | Get Involved |
| `prayer.html` | Prayer wall |
| `give.html` | Give |
| `manage-giving.html` | Manage giving (donor portal) |
| `contact.html` | Contact |
| `privacy.html` | Privacy Policy |
| `studio.html` | Studio (private editor at `/studio`) |
| `live.html`, `messages.html`, `music.html` | Legacy redirects into `/watch` |

## Editing the site (no code needed)

The site has a built-in editor at **`/studio`**. Sign in with an approved email and password to
update content. Changes go live instantly, with no redeploy.

- **Backgrounds**: a photo behind any page header (dark overlay keeps text readable)
- **Photos**: welcome photo, staff portraits, artwork
- **Text**: homepage + beliefs copy (wrap a word in `*asterisks*` for the accent color: clay on
  light backgrounds, aqua on dark)
- **Facts & links**: address, phone, email, service times, giving link, social + podcast links,
  live YouTube channel ID
- **Sermons**: a full add/edit/remove manager. Each sermon is tagged by **speaker, Bible book, and
  topic**, which turns The Overlook into a **searchable, filterable library** (search + filter by
  speaker / scripture / topic / series, sortable by date, speaker, or Bible order).
- **Live stream**: the Watch page can show the YouTube stream automatically the moment the church
  goes live. Setup is in **[LIVESTREAM-SETUP.md](LIVESTREAM-SETUP.md)** (a simple channel-ID
  option, or a fuller auto live/offline hub with a scheduled check).
- **Giving history**: Studio owners can review completed Square gifts by year, search the history,
  open Square receipts, and download a CSV. Square remains the private source of truth.

This runs on a small Supabase project. **One-time setup is in [CMS-SETUP.md](CMS-SETUP.md)** (about 10
minutes). Until it's connected, the site shows its built-in content and nothing breaks. The relevant
files: `supabase/schema.sql` (run once), `assets/config.js` (paste 2 keys), `assets/cms-schema.js` +
`assets/content.js` (the engine), `studio.html` + `assets/studio.js` (the editor), and
`supabase/functions/youtube-live-check/` (the optional live-detection function).

## How it's structured

- **`assets/site.css`**: the entire design system, shared by every page. Light, warm, print-like
  theme on cream paper (`--paper: #FAF6ED`) with the church's brand teal (`--brand: #177E79`), deep teal
  (`--accent: #0F6663`), and aqua (`--aqua: #7FD1CB`) accents. Type is **Fraunces** (display serif)
  + **Source Sans 3** (body and labels). Dark surfaces (sticky header, heroes, verse band, media
  players, missions map, footer) use the deep teal family; the logo navy `#223A5E` appears in the call-to-action band. Change a color or spacing once here
  and it updates site-wide.
- **`assets/site.js`**: shared behavior: sticky-header shadow, mobile menu, scroll reveals, hero
  ticker. Safe to load on every page.
- **`assets/`**: logos, favicon, and the page scripts (content engine, Studio, giving, live,
  events, blog, missions, forms, and friends).
- The header and footer markup are identical on every page (copy/paste blocks). If you change nav
  or footer links, change them in every page file.
- The watch hub is named **"The Overlook"** (nav pill to `/watch`); the blog is
  **"Notes from Fairview"** (`/blog`).
- `serve.mjs` is a local preview helper only (`node serve.mjs` then open http://localhost:4332). It
  is not needed for deployment.

## Real content already wired in

Verified from public church directories (do not invent beyond these):

- Address **2294 Main Street, Clay, WV 25043**; mailing address **PO Box 700, Clay, WV 25043**;
  phone **304-587-4709** (used on Home, Visit, Contact; map embeds + "Get directions").
- **Pastor J. Bret Wiley**. No other staff names are confirmed; the extra staff slots are
  placeholders.
- Service times: **Sunday School 10:00am, Morning Worship 11:00am, Evening Service 6:00pm,
  Wednesday 7:00pm** (midweek prayer meeting and Bible study).
- Independent, fundamental Baptist. **King James Bible (KJV)**. Traditional singing and preaching.
- Ministries: **H.O.P.E. addictions recovery program** (Friday evenings), **van ministry** (a free
  ride to church), **soul-winning visitation** (Saturdays), **youth ministry**, and a **strong
  missions program**.
- Socials: **facebook.com/FairviewBaptistTemple**, **instagram.com/fairviewbaptisttemple**,
  YouTube **@FairviewBaptistTemple**.

## Placeholders to fill (search for `[` brackets)

- **`[Church email address]`**: the church's public email is not on file yet. It appears in copy,
  CMS defaults, and Studio settings; replace it everywhere once known.
- **YouTube channel ID** (starts with `UC...`): needed for the live embed on The Overlook. Paste it
  into Studio → Settings → Livestream (see [LIVESTREAM-SETUP.md](LIVESTREAM-SETUP.md)).
- **Supabase keys** in `assets/config.js`: empty until the one-time
  [CMS-SETUP.md](CMS-SETUP.md) is done.
- **Square / giving env vars** in Vercel (`SQUARE_ACCESS_TOKEN`, app id, location id, plan id, and
  the Resend keys for receipts): giving stays in test/placeholder mode until set.
- **Podcast links**: Fairview has no podcast yet. The podcast features are wired but their fields
  are empty, and pages fall back gracefully.
- **Staff members 2-4**: only Pastor J. Bret Wiley is confirmed; the other staff cards are
  `[bracket]` placeholders.
- **Photos**: every photo slot is a labeled placeholder (Home welcome, staff portraits, artwork).
  Drop real images in through Studio or replace the placeholder blocks.

## Style rules used throughout

No em dashes in copy. Warm, plain, direct voice. KJV for all scripture. One accent word per
headline (deep teal on light, aqua on dark). These were enforced on every page; keep them for any new
copy.
