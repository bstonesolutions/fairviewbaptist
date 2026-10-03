# Pastor updates and Jubilee working draft

Prepared October 2, 2026. Brandon authorized publication, with the final Jubilee section-order corrections included. This document records the approved scope and release checks.

## Included

- Nursery information on Plan a Visit, including the arrival guidance and FAQ.
- Public pastoral appointment choice removed. The notification API also rejects the retired request type; old Inbox records retain their label.
- Missions-team description, participation link, and Barry Payton's leadership.
- Pastor and nine staff/leadership entries in the supplied order, with confirmed roles. Existing portraits remain tied to the same people. New entries have no invented photos or biographies.
- Twelve original church photographs distributed across Home, Visit, Get Involved, Missions, Next Steps, and Jubilee.
- Facebook, Instagram, YouTube, and the user-confirmed TikTok handle in the footer.
- A dedicated evergreen-and-gold Appalachian Jubilee page with its own event navigation, an authentic Grandview, WV mountain panorama, serif/script header, both original flyers, The Matthews Family pictured in the music lineup, daily service times, speakers, singing, and lodging links.
- Jubilee calls to action on Home and Events and links in desktop/mobile navigation and the footer.
- Studio: dedicated Jubilee editor, synchronized defaults, staff controls, supplied-photo library, media/source controls, and show/hide control for the Jubilee promotional banner.

## Review

The read-only working preview is served locally at `http://localhost:4334/jubilee`. It combines the current public CMS snapshot with the reviewed photo/TikTok updates. These overrides are local to the preview. The test-only Studio route uses a local fake client to verify saves and reloads; it does not authenticate or write to Supabase.

Event details and lodging sources: [jubilee-sources.md](jubilee-sources.md).

## Publication procedure

1. Inspect the current Git diff and run the tests again if changes have been made.
2. Commit and push to `main` under the publication authorization. Vercel deploys pushes automatically.
3. After all new static assets are served by the deployment, apply the exact key/value updates in `content-updates/pastor-notes-2026-10-02.json` to this site's `site_content` table. Preserve all other rows. Those updates replace the intended photos, reset only their old crop/opacity settings, set TikTok, and retire the former staff entry.
4. Reopen the public pages and real Studio, verify photos and editable defaults, confirm the Vercel deployment, and check a real phone.

The pre-change public CMS snapshot is saved locally at `/tmp/fairview-site-review/site-content-before.json`. No database schema, authentication, storage policy, giving setup, or owner permissions were changed.

## Header revision verification

The mountain panorama and header were checked at 1440px desktop and 390px narrow viewport. All section anchors resolve; no horizontal overflow or browser errors were found. The complete 49-test suite passed. Studio uses the same mountain photo, shared original appearance, dates, the event introduction, and editable music lineup. A real phone check remains part of publication verification.

## Final Jubilee order

Mountain header, event introduction, speakers and service schedule, choir and special singing with The Matthews Family pictured, then combined visit planning and lodging. The family feature headline is removed from the hero and introductory section.
