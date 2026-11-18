# Missionary map labels

Both the public missions map (including kiosk mode) and Studio pin editor use `assets/mission-map.js` with the same local `assets/map-english.json` style. Leaflet still owns pins, clicks, panning, zooming, and gesture handling.

## English label policy

The base style is OpenFreeMap Liberty, retrieved November 18, 2026 from https://tiles.openfreemap.org/styles/liberty. All 20 geographic name layers use `name:en`, with `name:latin` for a readable transliteration when an English name is absent. They never fall back to `name`, `name_en`, or `name:nonlatin`, because those can contain local-script labels. Road route numbers are retained. The name layers include countries, states, cities, villages, roads, waterways, airports, and points of interest.

Do not replace this with the standard OpenStreetMap raster tiles or stock bilingual Liberty style: their local-script labels recreate the original problem. The public map gesture hints are also explicitly English. The existing location-to-time-zone lookup already requests `language=en`; public missionary search filters the church's saved profile fields.

## Dependencies and attribution

MapLibre GL JS 5.24.0 and the Leaflet adapter 0.0.22 are pinned and hosted in `assets/vendor/`, with their licenses. They load only when a missionary map is opened. The custom style and vector data are served by OpenFreeMap; required OpenFreeMap, OpenMapTiles, and OpenStreetMap attribution remains visible in the Leaflet map.

Official integration: https://openfreemap.org/quick_start/

Official adapter: https://github.com/maplibre/maplibre-gl-leaflet

Language field definitions: https://openmaptiles.org/docs/schema/

Base style license: `assets/vendor/map-style-LICENSE.md` (OSM Liberty / BSD).
