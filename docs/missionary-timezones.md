# Missionary time zone lookup

Studio fills the existing `missionaries.timezone` field from a city/country or a map pin. It saves the IANA zone name, not a fixed UTC offset, so existing local-time displays continue to handle daylight saving through `Intl.DateTimeFormat`.

- City search: [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api), with location data from [GeoNames](https://www.geonames.org/). Search accepts a city qualified by a country or first-level administrative area. A separate country field qualifies an unqualified city. Non-populated places and results spanning multiple time zones are not silently selected.
- Pin lookup: [TimeAPI.io](https://timeapi.io/), using `/api/v1/timezone/coordinate` as described in its current [OpenAPI document](https://timeapi.io/swagger/v1/swagger.json). The API's `timezone` value is validated with `Intl` before use.
- Both providers allow browser CORS requests without a secret. Only the location query or coordinates are sent, never the missionary's name or other profile fields. No database policy changes are needed.
- Input is debounced for 650 ms. Each lookup has an 8-second deadline. The free providers can fail or rate limit; a failure leaves manual time zone entry available and does not prevent saving.
- Open-Meteo's non-commercial [open-access limits](https://open-meteo.com/en/pricing), checked November 18, 2026, are 600 calls/minute, 5,000/hour, and 10,000/day, with no uptime guarantee. This church's editor makes one call per settled location edit. No unverified numeric limit is assumed for TimeAPI.io.
- Saved zones are preserved when a profile opens. Changing its location recalculates the zone unless the owner manually edited the zone during that editing session. Manual edits cancel pending lookups. Changing or closing profiles invalidates stale responses. Save waits for the latest outstanding lookup.

Verified live on November 18, 2026: Nairobi, Kenya → Africa/Nairobi; Clay, WV and pin 38.46, -81.08 → America/New_York.
