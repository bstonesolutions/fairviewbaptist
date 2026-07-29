# Launch checklist — fairviewbaptisttemple.com

Updated July 2026. The build phase is finished: the repo
(`bstonesolutions/fairviewbaptist`) auto-deploys to Vercel, the Supabase CMS is
live and wired in (`assets/config.js`), the YouTube channel ID is on file, the
real pastor/staff/photos are in, and giving runs through the church's Anedot
hosted page. What is left is mostly accounts, content, and the domain cutover.

## 1. Point the domain (the go-live moment)

- [ ] In the Vercel project: Settings > Domains > add `fairviewbaptisttemple.com`
      and `www.fairviewbaptisttemple.com`.
- [ ] Update DNS where the domain is registered (whoever manages the current
      site has this login): A record `76.76.21.21`, or switch the nameservers
      to Vercel's. Cancel the old site host once DNS has moved.
- [ ] In Supabase: Authentication > URL Configuration > set the Site URL to
      `https://fairviewbaptisttemple.com` and keep BOTH the production
      `/studio` URL and the current `*.vercel.app/studio` URL in Redirect URLs
      (password-reset emails link back to whichever origin they were requested
      from).

## 2. The church email address

Everything below unblocks at once when the church picks its public email.

- [ ] Replace every `[Church email address]` placeholder: Studio > Settings >
      Contact fills the site copy; also grep the repo for the rest
      (`contact.html`, `visit.html`, `next-steps.html`, `privacy.html`,
      `assets/events.js`, `assets/cms-schema.js`) and fill the empty
      `href="mailto:"` links next to them.
- [ ] Resend account: verify the `fairviewbaptisttemple.com` sending domain,
      then set Vercel env vars `RESEND_API_KEY`, `RESEND_FROM`
      (e.g. `Fairview Baptist Temple <no-reply@fairviewbaptisttemple.com>`),
      and `NOTIFY_TO` (where contact/visit form submissions land). Forms save
      to Supabase either way, but nobody gets an email until this is set.

## 3. Studio access for the church

- [ ] Add Pastor Spurlock's (or the church secretary's) email in THREE places:
      `OWNER_EMAILS` in `assets/config.js`, the `STUDIO_OWNER_EMAILS` Vercel
      env var (or `DEFAULT_OWNERS` in `api/_studio-auth.js`), and the
      `is_fbt_owner()` allow-list in `supabase/public-form-hardening.sql`
      (re-run just that function in the Supabase SQL editor).
- [ ] Have them sign in at `/studio` once and set a password.

## 4. Content only the church can provide

- [ ] Real photos in Studio: homepage welcome photo, the three homepage tiles,
      H.O.P.E. photos (the homepage band and the Get Involved card each have a slot),
      staff group photo, hero backgrounds.
- [ ] Missionaries: add each one in Studio > Missions (the Missions page shows
      an empty state until then).
- [ ] Full statement of faith for the Beliefs page, if the church wants it
      article-by-article (the summary version is live and reads fine).
- [ ] Confirm the Facebook/Instagram URLs actually exist as written (footer
      icons + Studio > Settings > Social links); fix or blank any that don't.
- [ ] Music & Choir card on Get Involved: the copy is a safe generic default;
      have the church personalize it in Studio > Ministries.

## 5. Optional integrations (site works fine without them)

- [ ] **Square** (in-browser card giving; Anedot already covers online gifts):
      Square account, then Vercel env `SQUARE_ACCESS_TOKEN`,
      `SQUARE_LOCATION_ID`, `SQUARE_ENV=production`; paste the Application ID
      + Location ID in Studio > Settings > Giving. Apple Pay additionally
      needs the domain file replaced in `api/apple-pay-domain.js` (see its
      comment) after registering the domain in Square.
- [ ] **Venmo**: handle in Studio > Settings > Giving.
- [ ] **YouTube API**: `YT_API_KEY` env var in Vercel for the richer service
      archive. Optional playlist IDs in `assets/fbt.feeds.js` tighten the
      Messages/Music split (the channel ID is already baked in).
- [ ] **Google Analytics**: paste a G- id into `assets/analytics.js`; enable
      Web Analytics on the Vercel project for the free option.

## 6. After DNS moves

- [ ] Google Search Console: verify the domain, submit `/sitemap.xml`.
- [ ] Smoke-test on the live domain: contact form, plan-a-visit form, the
      Give online button, Studio login, and the livestream player on a Sunday.
