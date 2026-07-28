# AGENTS.md: Fairview Baptist Temple (fairviewbaptisttemple.com)

Guidance for AI coding agents (Codex, etc.) working on this repo. See also `CLAUDE.md`.

## What this is
The website for **Fairview Baptist Temple** in Clay, West Virginia, live at
https://fairviewbaptisttemple.com. It is a **plain static multi-page HTML site**: no framework,
no build step. Shared styles live in `assets/site.css`; page behavior is vanilla-JS IIFEs under
`assets/*.js`; serverless functions (Vercel Node, `module.exports = async (req, res) => {}`)
live under `api/*.js`.

## Deploy
Hosted on **Vercel**, which **auto-deploys on every push to `main`**. Workflow:
edit → commit → push to `main` → live in ~1 minute. There is **NO build command** (it's a
static site), so do not run `npm run build`. Verify changes on the live site after pushing.

## Ground rules
- **Clean URLs**: `vercel.json` sets `cleanUrls: true`. Internal links are root-relative with
  no `.html` (e.g. `href="/visit"`, `/watch#live`, `/`). Keep that style for new links.
- **Brand voice**: NO em dashes in visible copy; use commas, colons, or periods. Warm, plain,
  direct, never AI-sounding. All scripture is **KJV**.
- **Design system** (light, warm, print-like): CSS tokens in `:root` in `site.css`:
  `--paper:#FAF6ED` cream page background, `--brand:#177E79` primary (hover `--brand2:#1E938C`),
  `--accent:#0F6663` accent on light, `--aqua:#7FD1CB` accent on dark, `--tx:#1F3238` ink,
  `--mut`, `--line`. Dark contexts (sticky header, heroes, verse band, media players, missions
  map, footer) are limited to media surfaces (video players, missions map, photo placeholders) using the deep teal family (`--dsea:#0D2733`, `--dsea2:#14424A`, `--dsea3:#1B5D60`); heroes, the verse band, and the footer are light, and heroes flip to light-on-dark only when Studio sets a hero photo (`.has-cms-photo`). The logo navy `#223A5E` is reserved for the call-to-action band. Fonts: **Fraunces** for display headings (serif, normal case,
  no uppercase) and **Source Sans 3** for body and labels. Buttons are 10px-radius rectangles
  (`.btn.btn-b` teal), not pills. Reuse existing classes; don't introduce a new look.
- **Secrets**: every env var lives in Vercel, never in the repo (`SQUARE_ACCESS_TOKEN`,
  `RESEND_API_KEY`, `RESEND_FROM`, `NOTIFY_TO`, `YT_API_KEY`, `ANTHROPIC_*`, etc.). Never hardcode.
- **Mobile cannot be previewed in a headless browser**: test real changes on an actual phone
  (especially iOS Safari). The Square card field is an iframe: do NOT wrap `#square-card` in
  `display:flex` (it collapses the field on mobile Safari).

## Content: managed by a non-technical owner, no code
- **Studio** at `/studio` (`studio.html` + `assets/studio.js`): owner-only login.
  Writes to **Supabase** (client config in `assets/config.js` → `window.FBT`). The CMS schema is
  `FBT_SCHEMA` (`assets/cms-schema.js`); feed definitions are `FBT_FEEDS`
  (`assets/fbt.feeds.js`); uploads go to the `fbt-media` storage bucket. Tables:
  `site_content` (key/value page content + settings), `events`, `posts`, `sermons`,
  `missionaries`, `submissions`, `prayers`. The public pages read these live.
- Do not break `config.js` or the Supabase layer.

## Key features / files
- **Giving** (`/give`): `assets/give.js` + `api/square-pay.js`. Square Web Payments SDK
  (card + Apple Pay + Google Pay) plus Venmo. Branded receipts are emailed to givers via
  Resend from `square-pay.js` (church BCC'd). Square settings (app id, location id, plan id,
  Venmo handle, funds) come from Supabase `site_content` via Studio → Settings → Giving.
  Studio's owner-only **Giving history** reads completed payments directly from Square via
  `api/giving-history.js`; it does not store card details or rely on a duplicate database ledger.
- **Apple Pay**: `api/apple-pay-domain.js` serves Square's domain-association file **verbatim**
  (`application/octet-stream`, no compression) at
  `/.well-known/apple-developer-merchantid-domain-association` via a rewrite in `vercel.json`.
  Do NOT remove it; Square re-verifies it periodically.
- **Live stream** (`/watch`, "The Overlook"): `api/streams.js` (needs `YT_API_KEY`) +
  `assets/live.js`.
- **Events / Blog**: `assets/events-ui.js`, `assets/blog.js`, rendered from Supabase. The blog
  is branded "Notes from Fairview".
- **SEO**: per-page `<title>`/meta/OG + JSON-LD in each HTML file; dynamic sitemap at
  `/sitemap.xml` (`api/sitemap.js`); `robots.txt`; Google Analytics in `assets/analytics.js`.
- **Forms** (contact / plan-a-visit / prayer): `assets/forms.js` → `api/notify.js` (Resend)
  and Supabase `submissions`.

## Navigation
Grouped dropdowns: **Visit ▾** (Plan a Visit / Service Times / What We Believe) ·
**The Overlook** (direct link to `/watch`, styled as a pill via `.nav-stream`) ·
**Connect ▾** (Next Steps / Events / Blog / Missions / Get Involved / Prayer) ·
**About ▾** (Our Staff / Contact) · **Give** (button). Mobile is a full-screen `.msheet`
overlay menu (toggled by the floating button; `assets/site.js`).
