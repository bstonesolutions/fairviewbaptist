# Fairview Baptist Temple: Website Handoff

This is the approved homepage design (light, warm, print-like theme with serif display type) plus brand assets. Build the rest of the site from here.

## Files in this package
- `index.html`: the homepage. Self-contained except for the logo, which lives in `/assets`.
- `assets/`: logo files and favicon.
- `HANDOFF.md`: this brief.

## Brand

**Colors**
- Brand teal (primary, from the church logo): `#177E79` (hover `#1E938C`); logo teal `#29A5A0`, logo navy `#223A5E`
- Deep teal (brand accent on light backgrounds): `#0F6663` (lighter `#158A84`)
- Aqua (accent on dark surfaces): `#7FD1CB`
- Paper backgrounds: cream `#FAF6ED`, alternate `#F2ECDD`, soft sage `#E9EFE2`
- Ink text on light: `#1F3238`, muted `rgba(31,50,56,.72)`
- Dark teal is reserved for media surfaces (players, missions map, photo placeholders); heroes, the verse band, and the footer are LIGHT. The call-to-action band is the logo navy (`#24466B` to `#16304D`). If Studio sets a hero photo, that hero flips to light-on-dark automatically.
- Text on dark: warm white `#FFF8EA`, muted `rgba(255,250,238,.78)`

**Fonts** (loaded via Google Fonts in the head)
- `Fraunces` (600): large display headlines and the scripture line. Normal case, never uppercase.
- `Source Sans 3` (400/500/600/700): body copy, buttons, nav links, card titles, and small labels. Tiny kickers/eyebrows stay uppercase and letterspaced.
- Emphasis style: the highlighted word in a headline is colored deep teal (`#0F6663`) on light backgrounds and aqua (`#7FD1CB`) on dark ones, not italicized.

**Other**
- Corner radius: cards ~12 to 14px, buttons 10px rectangles (not pills).
- Motif: Appalachian ridgelines (angular mountain profiles), never waves. The kicker mark is a small three-peak ridge with a cross on the center peak. The logo itself is the church's real mark: a script F in a navy circle with a teal wordmark.
- Logo usage: `logo-full-white.png` (light version) on dark backgrounds, `logo-full-color.png` on light backgrounds (emails, print). The `-mark-` versions are the standalone circle-F mark for compact spots and the favicon.

## Homepage structure (top to bottom)
1. **Header**: sticky, light cream, logo left, grouped nav (Visit / The Overlook / Connect / About) as plain links, "Give" button, hamburger on mobile.
2. **Hero**: light cream with faint teal ridgeline bands, Fraunces ink headline with a teal accent word, intro line, two CTAs, and a white "Join us this week" service-times card on the right (no scrolling ticker).
3. **Welcome**: short intro paragraph and a photo slot.
4. **Gather**: service cards with Fraunces times: Sunday School 10:00, Morning Worship 11:00, Evening Service 6:00, Wednesday 7:00.
5. **Visit / What to expect**: first-timer cards (when & where, what to wear, kids, how long).
6. **Watch**: live-stream block (The Overlook) with YouTube and Facebook CTAs.
7. **Messages**: recent sermon cards.
8. **Beliefs**: scripture band, a short statement, and a link to the full statement of faith.
9. **Plan band**: navy call-to-action band with light text and a dark button.
10. **Contact**: address / times / phone card and a map slot.
11. **Footer**: light (paper2) with hairline borders, logo plate, nav columns, social icon chips, copyright.

## Real content (already in the file, keep as-is)
- Church: Fairview Baptist Temple, 2294 Main Street, Clay, WV 25043 (mailing: PO Box 700, Clay, WV 25043)
- Phone: 304-587-4709
- Service times: Sunday School 10:00am, Morning Worship 11:00am, Evening Service 6:00pm, Wednesday 7:00pm
- Socials: facebook.com/FairviewBaptistTemple, instagram.com/fairviewbaptisttemple, youtube.com/@FairviewBaptistTemple
- Default preacher: Pastor Michael Spurlock
- Scripture in the beliefs band: Psalm 121:1 (KJV), "I will lift up mine eyes unto the hills, from whence cometh my help."

## Placeholders to fill (marked with [brackets] in the HTML)
- `[Church email address]` (the church's public email is not on file yet)
- YouTube channel ID (starts with `UC...`) for the live embed
- "Give online" link
- Real sermon list (titles, series, references); any sample cards are clearly marked
- Staff members beyond Pastor Michael Spurlock
- Photos. There is one photo slot in Welcome; add more throughout as desired.
- Podcast links: Fairview has no podcast yet, so podcast fields stay empty and pages fall back gracefully.

## Pages to build next
Visit, What We Believe, Our Staff, The Overlook (watch hub + sermon archive), Give, Contact, plus Events, Notes from Fairview (blog), Missions, Next Steps, Get Involved, and Prayer.

## Implementation notes
- `index.html` is framework-agnostic: plain HTML plus a little vanilla JS for the mobile menu, the ticker text, and scroll reveals (IntersectionObserver). Port it into a framework or keep it static, whichever you prefer.
- The logo files live in `/assets`, so the markup is clean.
- Accessibility is already handled: reduced-motion disables the animations and reveals, focus states are visible, and the logos have alt text. Keep these.
- Responsive breakpoints in the CSS: ~920px (grids stack), ~720px (mobile nav appears), ~480px (the wide logo swaps to the compact mark).
- The two spots worth wiring to live data so they stay current on their own are the **live stream** (YouTube) and the **sermon list** (YouTube Data API).

## Style rules to respect across the build
- No em dashes anywhere in copy.
- Keep the warm, plain, non-AI-sounding voice in any new copy. KJV for all scripture.
- Stay on the brand palette (teal, navy, aqua, cream paper, ink); avoid introducing new accent colors.
