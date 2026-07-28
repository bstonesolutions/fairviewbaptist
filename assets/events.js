/* ============================================================
   Fairview Baptist Temple — events (edit this file to add/change events).
   Add your real schedule here: dates, details, registration links,
   and graphics. Each event's full description lives in its own file
   at events/<slug>.html (plain HTML in the .prose style).

   Fields (all optional except slug/title/start):
     slug, title, start ("YYYY-MM-DDTHH:MM"), end, allDay (true),
     recurring ("Every Sunday", ...), location, address,
     category, cover (image URL; empty = branded fallback), summary,
     register: { url, label },     // a link to your sign-up / Google Form
     links:    [ { label, url } ],  // anything: maps, flyers, more info
     videos:   [ "YouTubeId", ... ],// highlights / testimonials (play in-page)
     featured: true                 // pin to the top of the hub
   Your rebuilt CMS can write to this same list later.
   ============================================================ */
// Where event registrations are sent. Create a FREE form at formspree.io
// (about 2 minutes), paste your endpoint here (looks like
// https://formspree.io/f/abcdwxyz), and every event's in-page registration
// form will email you the submissions. Until this is set, the form points
// people to your email instead of failing.
window.FBT_EVENTS_CONFIG = {
  formEndpoint: '',
  contactEmail: '[Church email address]',
};

window.FBT_EVENTS = []; // no fake fallback events — real events come from the Studio (Supabase)
