# Fairview Baptist Temple: editing the site (one-time setup)

The site is editable from the private **Studio** at **`/studio`**. Sign in with an approved email and
password. Backgrounds, photos, text, links, events, and sermons update **instantly**, with no code or
redeploy.

This is powered by a small Supabase project. You only set this up once (about 10 minutes). Until you
do, the website still works perfectly; it just shows its built-in content.

---

## Step 1: Create a Supabase project

1. Go to https://supabase.com and sign in (use your existing account/org).
2. Click **New project**. Give it a name like `fairview-baptist-temple`, pick a region close to you,
   set a database password (save it somewhere), and create it. This is its own database, separate
   from your other projects.

## Step 2: Create the tables and storage

1. In the new project, open **SQL Editor** (left sidebar).
2. Open the file `supabase/schema.sql` from this site, copy all of it, paste it into the editor, and
   click **Run**. You should see "Success". This creates the content tables, the `fbt-media` storage
   bucket, and the security rules.

## Step 3: Confirm who can edit

The allowed editor is already set to **brandonstone8567@gmail.com** (in `schema.sql` and in
`assets/config.js`). To add another person, such as the pastor:

1. In `supabase/schema.sql`, find the owner allow-list function (`is_fbt_owner()`, kept from the
   original build) and add their email to the list, then re-run just that function in the SQL editor.
2. Add the same email to `OWNER_EMAILS` in `assets/config.js`.

## Step 4: Turn on email login

1. Go to **Authentication > Providers** and make sure **Email** is enabled (it is by default).
2. Go to **Authentication > URL Configuration**:
   - **Site URL**: your live website address (e.g. `https://fairviewbaptisttemple.com`).
   - **Redirect URLs**: add your Studio URLs so password setup and reset links work. Add both:
     - `https://fairviewbaptisttemple.com/studio` (your real domain, once deployed)
     - `http://localhost:4332/studio` (for testing locally with `node serve.mjs`)

## Step 5: Connect the site

1. In Supabase, go to **Project Settings > API**.
2. Copy the **Project URL** and the **anon / public** key.
3. Open `assets/config.js` in this site and paste them in:
   ```js
   SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
   SUPABASE_ANON_KEY: 'paste-the-long-anon-key-here',
   ```
   (These are safe to publish. The security rules only let your allow-listed email write anything.)

## Step 6: Edit

1. Deploy the site (or run `node serve.mjs` locally).
2. Visit `/studio` and sign in with your approved email and password.
3. If you have not set a password yet, click **Set or reset your password** and use the email link.
4. Use the tabs to edit:
   - **Events, Blog, Missions, and Bulletin**: publish and update public content.
   - **Inbox and Prayer wall**: review messages and prayer requests from the website.
   - **Giving history**: review completed Square gifts, yearly totals, receipts, and CSV exports.
   - **People & ministries**: update staff, leaders, and ministry information.
   - **Pages and menu**: rename, show, hide, and reorder navigation links.
   - **Media and videos**: set page backgrounds, photos, videos, and artwork.
   - **Video hubs**: organize messages, music, speakers, and scripture details.
   - **Settings**: church contact details, service times, giving, social and podcast links, and the
     YouTube livestream channel ID.
5. Changes appear on the public site immediately (just refresh).

---

## The Inbox: visit plans & messages from the website

The **Plan a visit** form (on the Visit page) and the **Contact** form save every
submission to Supabase and show them under **Studio → Inbox**, where you can reply, mark
them handled, or delete them. A little badge shows how many are new.

- The Inbox uses the `submissions` table, which is created when you run `schema.sql`
  (Step 2). If the Inbox says it can't load, just re-run `schema.sql` once; it's safe to re-run.
- **Get an email too (optional but recommended):** set an environment variable named
  `RESEND_API_KEY` in Vercel (Project → Settings → Environment Variables) using a free key from
  [resend.com](https://resend.com). Then every submission also emails the church inbox. Optional:
  `NOTIFY_TO` (where the emails go; set this to the church's inbox once the
  `[Church email address]` is known) and `RESEND_FROM` (a verified sender). Without the key,
  submissions still land in the Studio Inbox; you just won't get the email copy.

## Good to know

- **Nothing breaks if Supabase is down or empty.** Each page falls back to its built-in content.
- **Forms never lose a message.** If a submission can't be saved or emailed, the form asks the
  visitor to call instead, so nothing silently disappears.
- **Images** are stored in the `fbt-media` bucket and served straight from Supabase. Keep them
  reasonably sized (a few MB max) for fast loading.
- **The live stream**: once you paste the YouTube **channel ID** into Studio Settings, the Watch page
  (The Overlook) automatically embeds the live broadcast instead of the placeholder player. See
  [LIVESTREAM-SETUP.md](LIVESTREAM-SETUP.md).

## Troubleshooting

- **"That email is not on the allow list"**: the email you typed is not in `OWNER_EMAILS` /
  the schema allow-list function. Fix per Step 3.
- **The password email opens but you are not signed in**: the Studio URL is not in the Supabase
  Redirect URLs list (Step 4). Add it exactly, including `/studio`.
- **Uploads or saves fail**: make sure you ran the full `schema.sql` (Step 2) and that you are signed
  in with an allow-listed email.
