# Launch checklist — fairviewbaptisttemple.com

Work through these in order. Steps 1 and 2 put the site on the internet; everything
after can happen gradually while the site is already live. Each step names the doc
with the details.

## 1. Give the site its own home

- [ ] Create an empty GitHub repo (suggested: `bstonesolutions/fairview-baptist-temple`,
      no README) and push this code to it as `main`. Keep it out of `the-brook`:
      that repo auto-deploys Honey Brook's live site from `main`.
- [ ] In Vercel: **Add New Project**, import the new repo. No build command, no
      output directory changes (it is a static site with serverless functions,
      exactly like the HBBC project).

## 2. Point the domain

- [ ] In the new Vercel project: Settings > Domains > add `fairviewbaptisttemple.com`
      and `www.fairviewbaptisttemple.com`.
- [ ] Update DNS where the domain is registered (the pastor or whoever manages the
      current site has this login): A record `76.76.21.21`, or change the
      nameservers to Vercel's. The old site host can be cancelled once DNS moves.

## 3. Turn on the CMS (about 10 minutes, see CMS-SETUP.md)

- [ ] Create a free Supabase project, run `supabase/schema.sql`, then
      `supabase/public-form-hardening.sql` and `supabase/storage-and-policy-polish.sql`.
- [ ] Paste the project URL and anon key into `assets/config.js`.
- [ ] Owner emails: brandonstone8567@gmail.com is already allow-listed; add Pastor
      Spurlock's email in `assets/config.js` AND in the allow-list in `supabase/schema.sql`
      before running it (or update the SQL function afterward).
- [ ] Sign in at `/studio` and start editing. Photos, staff bios, and per-ministry
      pictures all upload from there.

## 4. Livestream (see LIVESTREAM-SETUP.md)

- [ ] Get the channel ID (starts with `UC...`) for youtube.com/@FairviewBaptistTemple:
      YouTube Studio > Settings > Channel > Advanced settings.
- [ ] Paste it in Studio > Settings, or in `assets/fbt.feeds.js` (`youtubeChannelId`).
- [ ] Optional richer setup: `YT_API_KEY` env var in Vercel for the service archive.

## 5. Giving

- [ ] Create Fairview's Square account (or use the church's existing one).
- [ ] Vercel env vars: `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`; then put the
      Application ID + Location ID in Studio > Settings > Giving (or
      `assets/give.js` GIVE_DEFAULTS). Until then the Give page shows its
      friendly setup state; it can never charge against the wrong account.
- [ ] Optional: Venmo handle in Studio; Apple Pay needs Square's domain file for
      this domain (see the comment in `api/apple-pay-domain.js`).

## 6. Email + forms

- [ ] Pick the church's public email address and replace every
      `[Church email address]` placeholder (Studio > Settings does the site copy;
      grep the repo for the rest).
- [ ] Resend account + Vercel env vars `RESEND_API_KEY`, `RESEND_FROM`, `NOTIFY_TO`
      so contact/visit/prayer forms and giving receipts email the church.

## 7. Polish

- [ ] Real photos in Studio (welcome, staff, ministries, hero backgrounds).
- [ ] Pastor Spurlock's real bio on the Staff page (edit in Studio).
- [ ] Google Analytics: paste a G- id into `assets/analytics.js` if wanted.
- [ ] Google Search Console: verify the domain, submit `/sitemap.xml`.
- [ ] Add sermons in Studio (or let the YouTube integration pull them).
