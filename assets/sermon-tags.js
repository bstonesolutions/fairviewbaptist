/* ============================================================
   Fairview Baptist Temple — sermon tags (optional enrichment for
   the library).

   Your YouTube titles already auto-categorize when they follow this
   shape (any order, separated by " | "):

       Sermon Title | Scripture | Date | Speaker
       e.g.  Help from the Hills | Psalm 121 | 6.28.26 | Pastor Michael Spurlock

   The library reads speaker, scripture (Bible book + chapter), and a
   clean title straight from titles like that. For OLDER videos whose
   titles are just a date (e.g. "Midweek 6.24.26"), add an entry below
   keyed by the YouTube video id and it gets the same rich filtering.

   Find a video id: it's the part after watch?v= in the YouTube URL,
   e.g. youtube.com/watch?v=sH_YOCF-DPQ  ->  "sH_YOCF-DPQ".

   Anything you set here OVERRIDES what the parser guessed. Leave a
   field out to keep the parser's value. Every field is optional.

   The date field is only needed when the service date appears in the
   thumbnail but not in the YouTube title or description.
   ============================================================ */
window.FBT_SERMON_TAGS = {
  // ---- Example (copy this shape; delete or replace it) ----
  // 'sH_YOCF-DPQ': {
  //   title:     'Help from the Hills',
  //   speaker:   'Pastor Michael Spurlock',
  //   reference: 'Psalm 121',        // book + chapter; powers the Scripture filter
  //   series:    '',                 // optional grouping
  //   topics:    ['Faith', 'Hope'],
  // },
};
