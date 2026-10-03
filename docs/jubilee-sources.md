# Appalachian Jubilee page sources

Prepared October 2, 2026 (America/New_York).

## Event details

The two flyers supplied by Brandon are the event sources. They are displayed whole, without editing identifiable people or cropping the artwork:

- `assets/photos/appalachian-jubilee-2026.png`: complete speaker flyer, shown with the service schedule.
- `assets/photos/appalachian-jubilee-music-2026.png`: lead flyer near the top of the page, with The Matthews Family in the first photo.

Both list November 14-18; Saturday at 10am, Sunday at 10am, 11am, and 6pm, and Monday-Wednesday at 7pm nightly. The page uses 2026, the current event year, which matches those weekdays. No service end time, rate, registration charge, or room block has been supplied or invented.

The main flyer lists Travis Groves (Sunday), Jason Holley (Sunday and Tuesday), Brandon Stone (Saturday and Monday), Scott Matthews (Monday and Wednesday), David King (Tuesday), Preston Milan (Wednesday), and Michael Spurlock as host pastor. It does not assign the Sunday speakers to particular service times, so the page does not either.

The event introduction leads directly below the mountain hero. The Matthews Family is pictured on the original music flyer and named with their Monday-Wednesday dates, November 16-18, in the music section after the speakers and service schedule. The music flyer adds The Matthews Family (Monday-Wednesday) and choir and special singing nightly with Kathy Spurlock, Brandon Stone, Tiffani Holley, The Matthews Family, and more. It supplements the full speaker list.

The event's Facebook and YouTube buttons use the shared Studio social URL fields. The flyer says the services will be streamed on both platforms; no livestream video IDs are invented.

## Lodging links

Hotel names, addresses, and direct links were checked against the providers' official websites. The page gives the three areas the pastor requested and Walker Creek Farms. It does not claim these are the three closest hotels, supply driving distances, or promise availability.

| Area | Property | Official source | Verified information used |
| --- | --- | --- | --- |
| Sutton | Days Inn & Suites by Wyndham Sutton Flatwoods | https://www.wyndhamhotels.com/days-inn/sutton-west-virginia/days-hotel-sutton-flatwoods/overview | Name, 350 Days Drive in Sutton, access to I-79 |
| Elkview | La Quinta Inn & Suites by Wyndham Elkview - Charleston NE | https://www.wyndhamhotels.com/laquinta/elkview-west-virginia/la-quinta-elkview-charleston-ne/overview | Name, 101 Crossings Mall Road in Elkview, off I-79 |
| Mink Shoals area | Sleep Inn Charleston North | https://www.choicehotels.com/west-virginia/charleston/sleep-inn-hotels/wv412 | Name, 2772 Pennsylvania Avenue, Charleston, off I-79. Area label follows the pastor's requested lodging area. |
| Nebo | Walker Creek Farms | https://www.walkercreekfarms.com/cabins-1 | Cabins and yurts, 230 Nebo Walker Road, Nebo |

No hotel photos or marketing passages were copied. The site links directly to the properties for current rates and reservations.

## Studio integration

- New page: `/jubilee`, included in `api/sitemap.js`.
- Text/link fields: `jubilee_*` hooks in `jubilee.html`; grouped in the Jubilee Studio pane.
- Background cards: `hero_bg_jubilee`, `hero_bg_jubilee_intro`, `hero_bg_jubilee_s1`, `hero_bg_jubilee_music`, `hero_bg_jubilee_s2`.
- Photo cards: `photo_jubilee_flyer`, `photo_jubilee_music_flyer`, `photo_jubilee_worship`, `photo_jubilee_fellowship`.
- Flyer images must use `contain` so the complete original design remains visible.
- Default hero palette follows the flyers: evergreen `#123F3D` to `#0A2B2D`, warm gold `#F0D36F`, cream text `#FFF8E6`. Other sections keep Fairview's existing cream surfaces.
- `assets/jubilee.js` listens for the shared `fbt:content` event and rebuilds Event structured data using the Studio date range and hydrated page content. Invalid or cleared dates remove the event metadata. The date range uses day-only ISO dates; it does not infer an ending hour.
- Event date controls `jubilee_start_date` and `jubilee_end_date` govern structured data. When changing the event year/dates, update the visible date line, introductory copy, and daily schedule in the same Studio pane as well.

## West Virginia landscape

The dedicated Jubilee header uses an authentic panorama of Horseshoe Bend from Grandview in New River Gorge, West Virginia. Credit: NPS photo / Louise McLaughlin. The official image record marks it public domain with full granting rights.

- Record and rights: https://npgallery.nps.gov/AssetDetail/d1297f02-155d-451f-6714-d8c55a4f8f62
- Original: https://npgallery.nps.gov/GetAsset/d1297f02-155d-451f-6714-d8c55a4f8f62/original.jpg
- Local original: `assets/photos/wv-appalachian-mountains.jpg` (2263 x 1000).

The page crops the original responsively using CSS and applies a left-side contrast overlay. The original pixels are unchanged. The photo and framing are editable in Studio; the original page look restores the landscape and its shared style. The event masthead has its own section navigation and serif/script typography. The Matthews Family appears in the music lineup. Visit planning, directions, and lodging are combined in the final section.

The visible bottom-right photo credit was removed at Brandon’s request. The NPS image record confirms public-domain full granting rights; [NPS reuse guidance](https://www.nps.gov/aboutus/disclaimer.htm) says acknowledgement is appreciated. Source and photographer attribution remain recorded here.
