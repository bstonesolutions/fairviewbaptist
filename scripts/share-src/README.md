# Fairview share artwork sources

Native HTML/CSS artwork lives in ../share-cards.html; page copy and photo selection are in ../share-cards.json. Render each ?page=ID at 1200 x 630 after document.body.dataset.ready is true. Export as JPEG to assets/share/ID-v1.jpg. Use a new versioned filename when replacing published artwork so share crawlers can fetch a fresh image.

- Church exterior: existing Fairview Studio photo, originally at https://qlbylvhmkbopszmzmipm.supabase.co/storage/v1/object/public/fbt-media/site/hero_bg_live-1785336474507.jpg
- Other photographs: existing authentic church photos in assets/photos and assets/staff. No generated people or buildings.
- World silhouette: Natural Earth, public domain, 1:110m land; https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson. Equirectangular projection, no coverage claims or destination markers.
- Jubilee landscape: NPS / Louise McLaughlin, Grandview, West Virginia; existing credited site asset.
- Fonts: Montserrat, Source Sans 3, Mrs Saint Delafield, DM Serif Display, from Google Fonts. SIL Open Font Licenses are included beside the font files.

The review gallery displays the published JPEGs, including the approved Home cover. When replacing artwork, update the page OG/Twitter metadata and its `shareImage` field in ../share-cards.json together. The ?page=ID route remains the editable HTML/CSS rendering source.
