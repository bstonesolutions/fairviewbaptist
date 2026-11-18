/* Studio location lookup. City data: Open-Meteo / GeoNames; map pins: TimeAPI.io.
   Only an IANA zone is saved. Daylight-saving offsets remain Intl's responsibility. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FBT_MISSIONARY_TIMEZONE = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function validZone(zone) {
    if (!zone || typeof zone !== 'string') return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); return true; } catch (e) { return false; }
  }
  function normalized(text) {
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }
  function queryFor(location, country) {
    location = String(location || '').trim(); country = String(country || '').trim();
    if (!location) return '';
    return country && location.indexOf(',') < 0 && normalized(location) !== normalized(country)
      ? location + ', ' + country : location;
  }
  function selectZone(results, query) {
    var city = normalized(String(query).split(',')[0]);
    var places = (results || []).filter(function (row) {
      return row && /^PPL/.test(row.feature_code || '') && validZone(row.timezone);
    });
    var exact = places.filter(function (row) { return normalized(row.name) === city; });
    if (exact.length) places = exact;
    var zones = places.map(function (row) { return row.timezone; }).filter(function (zone, i, all) { return all.indexOf(zone) === i; });
    return zones.length === 1 ? zones[0] : '';
  }
  function lookup(request, fetcher, signal) {
    var url;
    if (request.kind === 'pin') {
      var lat = Number(request.lat), lng = Number(request.lng);
      if (request.lat == null || request.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return Promise.resolve('');
      url = 'https://timeapi.io/api/v1/timezone/coordinate?latitude=' + encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lng);
    } else {
      if (!request.query || request.query.length < 2) return Promise.resolve('');
      url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(request.query) + '&count=100&language=en&format=json';
    }
    return fetcher(url, { signal: signal, credentials: 'omit' }).then(function (response) {
      if (!response.ok) throw new Error('Location lookup unavailable');
      return response.json();
    }).then(function (data) {
      if (request.kind === 'pin') return validZone(data.timezone) ? data.timezone : '';
      return selectZone(data.results, request.query);
    });
  }

  // Each field edit invalidates the previous lookup, even when fetch ignores abort.
  // The editor also resets this controller whenever a different profile is opened.
  function create(options) {
    var generation = 0, timer = null, controller = null, active = false, request = null, pending = null, manualOverride = false;
    var fetcher = options.fetch || function (url, init) { return fetch(url, init); };
    function cancel() {
      generation += 1;
      if (timer) clearTimeout(timer); timer = null;
      if (controller) controller.abort(); controller = null;
      request = null; pending = null;
    }
    function current(token) { return active && token === generation; }
    function run() {
      if (!active || !request) return pending || Promise.resolve();
      if (timer) clearTimeout(timer); timer = null;
      var next = request, token = generation; request = null;
      var abort = new AbortController(); controller = abort;
      var deadline = setTimeout(function () { abort.abort(); }, 8000);
      options.status('Finding the time zone…');
      pending = lookup(next, fetcher, abort.signal).then(function (zone) {
        if (!current(token)) return;
        if (zone) options.apply(zone);
        else options.status('Add a city and country, place a map pin, or choose the time zone below.');
      }).catch(function () {
        if (current(token)) options.status('Could not find the time zone. You can choose it below.');
      }).then(function () {
        clearTimeout(deadline);
        if (current(token)) { pending = null; controller = null; }
      });
      return pending;
    }
    function schedule(next, delay) {
      if (manualOverride) return;
      cancel(); if (!active) return;
      options.apply('');
      if (!next) return;
      request = next;
      timer = setTimeout(run, delay == null ? 650 : delay);
    }
    function flush() {
      return (request ? run() : pending || Promise.resolve()).then(function () {
        // The owner may finish typing while an older lookup is in flight.
        if (active && (request || pending)) return flush();
      });
    }
    return {
      reset: function () { cancel(); active = true; manualOverride = false; },
      close: function () { cancel(); active = false; },
      manual: function () { cancel(); manualOverride = true; },
      location: function (location, country, delay) {
        var query = queryFor(location, country);
        schedule(query.length >= 2 ? { kind: 'location', query: query } : null, delay);
      },
      pin: function (lat, lng) { schedule(lat == null || lng == null ? null : { kind: 'pin', lat: lat, lng: lng }, 0); },
      flush: flush
    };
  }
  return { validZone: validZone, queryFor: queryFor, selectZone: selectZone, lookup: lookup, create: create };
});
