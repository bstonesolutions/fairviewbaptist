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
  map, footer) are limited to media surfaces (video players, missions map, photo placeholders) using the deep teal family (`--dsea:#0D2733`, `--dsea2:#14424A`, `--dsea3:#1B5D60`); heroes, the verse band, and the footer are light, and heroes flip to light-on-dark only when Studio sets a hero photo (`.has-cms-photo`). Headings use the logo navy `--navy:#223A5E`; the times strip and H.O.P.E. band use `--teal:#29A5A0`. Fonts: **Montserrat 800/900 uppercase** for display headings, **Mrs Saint Delafield** for the script kicker accents (`.kick`), and **Source Sans 3** for body and labels. Buttons are square (`border-radius:0`) uppercase Montserrat rectangles (`.btn.btn-b` teal, `.btn-o` navy outline), not pills. Reuse existing classes; don't introduce a new look.
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
  The media designer (Photos & media) is the site editor, organized by page:
  every hero AND every section of every page has a card (`MEDIA_BG`/`MEDIA_BG_GEN`)
  that edits its background photo, overlay, text, and per-text colors via
  `MEDIA_TEXT`/`MEDIA_TEXT_GEN` in `studio.js` (keys like `visit_hero_heading` and
  `visit_s2_heading`, live-previewed on the stage, saved with the design); its stage mirrors the live page exactly (same backdrop defaults and
  readability scrim). Site-wide fonts/colors are `style_*` settings applied by
  `applySiteStyle()` in `content.js` through CSS variables.
- Do not break `config.js` or the Supabase layer.

## Key features / files
- **Giving** (`/give`): live through the church's **Anedot hosted page** (`give_link` in
  Studio → Settings → Giving; default in `assets/give.js` GIVE_DEFAULTS). With no Square IDs
  configured, `applyHostedOnlyMode()` collapses the page to the hosted "Give online" flow.
  The Square Web Payments path (`api/square-pay.js`, card + Apple Pay + Google Pay, Venmo,
  Studio Giving history via `api/giving-history.js`) is dormant until a Square account and
  env vars exist; do not remove it.
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
Grouped dropdowns (CSS-only hover/focus, `li.has-menu > button.nav-top + .nav-dd`):
**Visit** ▾ (Plan a Visit `/visit`, Service Times `/visit#service-times`, What We
Believe `/beliefs`) · **The Overlook** (`/watch`) · **Connect** ▾ (Next Steps, Events,
Missions, Get Involved) · **About** ▾ (Our Staff, Contact) · **Give** (button). Blog and
Prayer are retired from navigation, the footer, and the sitemap; their pages remain
reachable at `/blog` and `/prayer`. Mobile is a full-screen `.msheet` overlay with
script-font group headers (`.msh-h`) and indented links (`.msh-sub`), toggled by the
header hamburger (`assets/site.js`).
