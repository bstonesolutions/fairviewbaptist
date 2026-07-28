/* ============================================================
   Fairview Baptist Temple — interactive missionary map (website + lobby touchscreen).
   Renders a dark world map (Leaflet + free CARTO tiles, no API key) with
   a pin per missionary; tapping a pin or a card opens a full profile.
   Data comes from Supabase (missionaries table) with assets/missions.js
   as a fallback. Add ?kiosk=1 for a full-screen, idle-resetting display.
   ============================================================ */
(function () {
  var DATA = window.FBT_MISSIONARIES || [];
  var loadUnavailable = false;
  var kiosk = /[?&]kiosk=1/.test(location.search);
  if (kiosk) document.documentElement.classList.add('kiosk');
  var FORM_ENDPOINT = '', CONTACT_EMAIL = '';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nn(v) { return v != null && String(v).trim() !== ''; }
  function initials(n) { return (String(n || '').match(/\b[A-Za-z]/g) || ['?']).slice(0, 2).join('').toUpperCase(); }
  function q(s) { return String(s).replace(/'/g, '%27'); }
  function ytid(s) { if (!s) return ''; var m = String(s).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/); if (m) return m[1]; if (/^[A-Za-z0-9_-]{6,}$/.test(String(s).trim())) return String(s).trim(); return ''; }
  var PDF_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
  var PHOTO_ICON = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 4"/></svg>';
  var VIDEO_ICON = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>';
  var SHARE_ICON = '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>';
  var WAVE_MARK = '<svg class="miss-fallback-wave" viewBox="0 0 60 24" aria-hidden="true"><path d="M2 6c7-6 13 6 20 0s13 6 20 0 9 0 16 0M2 12c7-6 13 6 20 0s13 6 20 0 9 0 16 0M2 18c7-6 13 6 20 0s13 6 20 0 9 0 16 0"/></svg>';

  var MISS = [], map, markers = [], allPts = [];
  var CHURCH = [38.4611, -81.0869]; // Fairview Baptist Temple, Clay, WV
  var lines = [], churchMarker = null, searchQuery = '';
  var lastProfileFocus = null, inertedProfileEls = [];
  function bySlug(s) { return MISS.filter(function (m) { return m.slug === s; })[0]; }
  function shareUrl(m) { return location.origin + location.pathname + '?m=' + encodeURIComponent(m.slug); }
  function countryOf(m) { var p = String(m.location || '').split(','); return (p[p.length - 1] || '').trim(); }
  function displayPlace(m) { return nn(m.location) ? m.location : (nn(m.country) ? m.country : countryOf(m)); }
  function flyToM(m) { if (map && !isNaN(m.lat) && !isNaN(m.lng)) { try { map.flyTo([m.lat, m.lng], 5, { duration: 1.1 }); } catch (e) { } } }
  function matchM(m, qy) { return [m.name, m.location, m.region, m.field, m.ministry, m.country, countryOf(m)].filter(nn).join(' ').toLowerCase().indexOf(qy) >= 0; }
  var ISO2 = { 'afghanistan': 'af', 'albania': 'al', 'algeria': 'dz', 'angola': 'ao', 'argentina': 'ar', 'armenia': 'am', 'australia': 'au', 'austria': 'at', 'azerbaijan': 'az', 'bahamas': 'bs', 'bahrain': 'bh', 'bangladesh': 'bd', 'belarus': 'by', 'belgium': 'be', 'belize': 'bz', 'benin': 'bj', 'bhutan': 'bt', 'bolivia': 'bo', 'bosnia': 'ba', 'bosnia and herzegovina': 'ba', 'botswana': 'bw', 'brazil': 'br', 'brunei': 'bn', 'bulgaria': 'bg', 'burkina faso': 'bf', 'burma': 'mm', 'burundi': 'bi', 'cambodia': 'kh', 'cameroon': 'cm', 'canada': 'ca', 'cape verde': 'cv', 'central african republic': 'cf', 'chad': 'td', 'chile': 'cl', 'china': 'cn', 'colombia': 'co', 'comoros': 'km', 'congo': 'cg', 'dr congo': 'cd', 'democratic republic of the congo': 'cd', 'costa rica': 'cr', "cote d'ivoire": 'ci', 'ivory coast': 'ci', 'croatia': 'hr', 'cuba': 'cu', 'cyprus': 'cy', 'czechia': 'cz', 'czech republic': 'cz', 'denmark': 'dk', 'djibouti': 'dj', 'dominican republic': 'do', 'ecuador': 'ec', 'egypt': 'eg', 'el salvador': 'sv', 'equatorial guinea': 'gq', 'eritrea': 'er', 'estonia': 'ee', 'eswatini': 'sz', 'swaziland': 'sz', 'ethiopia': 'et', 'fiji': 'fj', 'finland': 'fi', 'france': 'fr', 'gabon': 'ga', 'gambia': 'gm', 'georgia': 'ge', 'germany': 'de', 'ghana': 'gh', 'greece': 'gr', 'guatemala': 'gt', 'guinea': 'gn', 'guyana': 'gy', 'haiti': 'ht', 'honduras': 'hn', 'hungary': 'hu', 'iceland': 'is', 'india': 'in', 'indonesia': 'id', 'iran': 'ir', 'iraq': 'iq', 'ireland': 'ie', 'israel': 'il', 'italy': 'it', 'jamaica': 'jm', 'japan': 'jp', 'jordan': 'jo', 'kazakhstan': 'kz', 'kenya': 'ke', 'kosovo': 'xk', 'kuwait': 'kw', 'kyrgyzstan': 'kg', 'laos': 'la', 'latvia': 'lv', 'lebanon': 'lb', 'lesotho': 'ls', 'liberia': 'lr', 'libya': 'ly', 'lithuania': 'lt', 'luxembourg': 'lu', 'madagascar': 'mg', 'malawi': 'mw', 'malaysia': 'my', 'maldives': 'mv', 'mali': 'ml', 'malta': 'mt', 'mauritania': 'mr', 'mauritius': 'mu', 'mexico': 'mx', 'moldova': 'md', 'mongolia': 'mn', 'montenegro': 'me', 'morocco': 'ma', 'mozambique': 'mz', 'myanmar': 'mm', 'namibia': 'na', 'nepal': 'np', 'netherlands': 'nl', 'new zealand': 'nz', 'nicaragua': 'ni', 'niger': 'ne', 'nigeria': 'ng', 'north korea': 'kp', 'north macedonia': 'mk', 'macedonia': 'mk', 'norway': 'no', 'oman': 'om', 'pakistan': 'pk', 'panama': 'pa', 'papua new guinea': 'pg', 'paraguay': 'py', 'peru': 'pe', 'philippines': 'ph', 'poland': 'pl', 'portugal': 'pt', 'qatar': 'qa', 'romania': 'ro', 'russia': 'ru', 'rwanda': 'rw', 'samoa': 'ws', 'saudi arabia': 'sa', 'senegal': 'sn', 'serbia': 'rs', 'sierra leone': 'sl', 'singapore': 'sg', 'slovakia': 'sk', 'slovenia': 'si', 'solomon islands': 'sb', 'somalia': 'so', 'south africa': 'za', 'south korea': 'kr', 'south sudan': 'ss', 'spain': 'es', 'sri lanka': 'lk', 'sudan': 'sd', 'suriname': 'sr', 'sweden': 'se', 'switzerland': 'ch', 'syria': 'sy', 'taiwan': 'tw', 'tajikistan': 'tj', 'tanzania': 'tz', 'thailand': 'th', 'timor-leste': 'tl', 'east timor': 'tl', 'togo': 'tg', 'tonga': 'to', 'trinidad and tobago': 'tt', 'tunisia': 'tn', 'turkey': 'tr', 'turkiye': 'tr', 'turkmenistan': 'tm', 'uganda': 'ug', 'ukraine': 'ua', 'united arab emirates': 'ae', 'uae': 'ae', 'united kingdom': 'gb', 'uk': 'gb', 'england': 'gb', 'scotland': 'gb', 'united states': 'us', 'usa': 'us', 'united states of america': 'us', 'uruguay': 'uy', 'uzbekistan': 'uz', 'vanuatu': 'vu', 'venezuela': 've', 'vietnam': 'vn', 'yemen': 'ye', 'zambia': 'zm', 'zimbabwe': 'zw' };
  function flagOf(m) {
    var c = (nn(m.country) ? m.country : countryOf(m) || '').trim();
    if (!c) return '';
    var code = /^[A-Za-z]{2}$/.test(c) ? c.toLowerCase() : (ISO2[c.toLowerCase()] || '');
    if (code.length !== 2) return '';
    try { return String.fromCodePoint(0x1F1E6 + code.charCodeAt(0) - 97, 0x1F1E6 + code.charCodeAt(1) - 97); } catch (e) { return ''; }
  }
  function statusClass(s) { s = String(s || '').toLowerCase(); if (/furlough|home|stateside/.test(s)) return 'furlough'; if (/sending|soon|preparing|raising/.test(s)) return 'sending'; if (/field|serving|active|on the/.test(s)) return 'field'; return 'neutral'; }
  function yearsLine(m) {
    var y = parseInt(m.sent_year, 10); if (!y || y < 1900) return '';
    var now = (new Date()).getFullYear(), n = now - y;
    return n > 0 ? ('On the field since ' + y + ' · ' + n + (n === 1 ? ' year' : ' years')) : ('Sent in ' + y);
  }
  function localTimeStr(m) {
    if (!nn(m.timezone)) return '';
    try { return new Intl.DateTimeFormat('en-US', { timeZone: m.timezone, hour: 'numeric', minute: '2-digit' }).format(new Date()); } catch (e) { return ''; }
  }
  function dateLabel(v) {
    if (!nn(v)) return '';
    var d;
    var bits = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (bits) d = new Date(+bits[1], +bits[2] - 1, +bits[3]);
    else d = new Date(v);
    if (isNaN(d.getTime())) return '';
    try { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d); } catch (e) { return ''; }
  }
  function fallbackVisual(m) {
    var fl = flagOf(m), place = displayPlace(m) || m.region || 'Beyond the hills';
    return '<div class="miss-fallback-inner">' + (fl ? '<span class="miss-fallback-flag" aria-hidden="true">' + fl + '</span>' : WAVE_MARK) +
      '<strong>' + esc(initials(m.name)) + '</strong><span>' + esc(place) + '</span></div>';
  }
  function mediaCounts(m) {
    var photoSeen = {}, photos = 0;
    (nn(m.photo) ? [m.photo] : []).concat(Array.isArray(m.photos) ? m.photos.filter(nn) : []).forEach(function (p) { if (!photoSeen[p]) { photoSeen[p] = 1; photos++; } });
    var seen = {}, videos = 0;
    (nn(m.video) ? [m.video] : []).concat(Array.isArray(m.videos) ? m.videos : []).forEach(function (v) { var id = ytid(v); if (id && !seen[id]) { seen[id] = 1; videos++; } });
    var letters = Array.isArray(m.letters) ? m.letters.filter(function (l) { return l && nn(l.url); }).length : 0;
    return { photos: photos, videos: videos, letters: letters };
  }
  function cardFacts(m) {
    var facts = [];
    if (nn(m.ministry)) facts.push(m.ministry);
    var y = parseInt(m.sent_year, 10);
    if (y && y >= 1900) facts.push('Serving since ' + y);
    return facts.slice(0, 2);
  }

  function fromDb(r) {
    return {
      slug: r.slug, name: r.name, location: r.location, region: r.region,
      lat: typeof r.lat === 'number' ? r.lat : parseFloat(r.lat),
      lng: typeof r.lng === 'number' ? r.lng : parseFloat(r.lng),
      field: r.field, org: r.org, photo: r.photo, bio: r.bio,
      prayer: r.prayer, update: r.latest_update, support: r.support_url, video: r.video,
      letters: Array.isArray(r.letters) ? r.letters : [],
      status_label: r.status_label, ministry: r.ministry, country: r.country, sent_year: r.sent_year, timezone: r.timezone,
      photos: Array.isArray(r.photos) ? r.photos : [], videos: Array.isArray(r.videos) ? r.videos : [],
      connection: r.our_connection, latest_update_date: r.latest_update_date
    };
  }
  function load(cb) {
    var B = window.FBT;
    if (!B || !B.SUPABASE_URL || !window.supabase) { cb(DATA, true); return; }
    var done = false, fallbackTimer = null, legacyGraceTimer = null;
    var fin = function (d, unavailable) {
      if (!done) {
        done = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (legacyGraceTimer) clearTimeout(legacyGraceTimer);
        cb(d, !!unavailable);
      }
    };
    try {
      var sb = B.getPublicClient ? B.getPublicClient() : window.supabase.createClient(B.SUPABASE_URL, B.SUPABASE_ANON_KEY);
      if (!sb) { fin(DATA, true); return; }
      sb.from('site_content').select('key,value').in('key', ['form_endpoint', 'contact_email']).then(function (r) {
        if (r && !r.error && r.data) r.data.forEach(function (row) {
          if (row.key === 'form_endpoint' && nn(row.value)) FORM_ENDPOINT = row.value;
          if (row.key === 'contact_email' && nn(row.value)) CONTACT_EMAIL = row.value;
        });
      }, function () { });
      var legacyPublicFields = 'slug,name,location,region,lat,lng,field,org,photo,bio,prayer,latest_update,support_url,video,letters,status,status_label,ministry,country,sent_year,timezone,photos,videos,sort';
      var publicFields = legacyPublicFields + ',our_connection,latest_update_date';
      function finishMissionaries(res) {
        if (res && !res.error && Array.isArray(res.data)) fin(res.data.filter(function (r) { return r.status !== 'draft'; }).map(fromDb), false);
        else fin(DATA, true);
      }
      function safeMissionaryQuery(fields) {
        return sb.from('missionaries').select(fields).order('sort', { ascending: true }).then(function (res) { return res; }, function () { return null; });
      }
      var currentResult = null, legacyResult = null, currentSettled = false, legacySettled = false;
      function queryOk(res) { return res && !res.error && Array.isArray(res.data); }
      function settleQueries() {
        if (done) return;
        if (queryOk(currentResult)) { finishMissionaries(currentResult); return; }
        if (currentSettled && legacySettled) { finishMissionaries(queryOk(legacyResult) ? legacyResult : null); return; }
        // If the richer request hangs, do not hold already-loaded live profiles
        // for the full emergency timeout. Give it a brief chance to finish, then
        // use the compatible result and fill the new fields on the next refresh.
        if (legacySettled && queryOk(legacyResult) && !currentSettled && !legacyGraceTimer) {
          legacyGraceTimer = setTimeout(function () { finishMissionaries(legacyResult); }, 800);
        }
      }
      safeMissionaryQuery(publicFields).then(function (res) {
        currentResult = res; currentSettled = true; settleQueries();
      });
      // Start the compatible read almost immediately as rollout insurance. The
      // small head start keeps the richer response preferred after the upgrade.
      setTimeout(function () {
        if (done) return;
        safeMissionaryQuery(legacyPublicFields).then(function (res) {
          legacyResult = res; legacySettled = true; settleQueries();
        });
      }, 100);
      fallbackTimer = setTimeout(function () { fin(DATA, true); }, 15000);
    } catch (e) { fin(DATA, true); }
  }

  // ---------- map ----------
  function pinIcon(m) {
    var style = nn(m.photo) ? ('background-image:url(\'' + q(m.photo) + '\')') : '';
    return L.divIcon({
      className: 'miss-pin-wrap',
      html: '<div class="miss-pin' + (nn(m.photo) ? ' has' : '') + '" style="' + style + '">' + (nn(m.photo) ? '' : esc(initials(m.name))) + '</div><div class="miss-pin-tip"></div>',
      iconSize: [50, 58], iconAnchor: [25, 54]
    });
  }
  function initMap() {
    var host = document.getElementById('missions-map'); if (!host || !window.L) return;
    // Gesture handling (leaflet-gesture-handling, loaded in missions.html and
    // self-registered on load): on phones the map only pans/zooms with two
    // fingers so one finger scrolls the page; on desktop it only zooms with
    // ctrl/cmd + scroll. A hint shows when someone tries the "wrong" gesture, so
    // nobody has to figure out how to scroll past the map. Off in kiosk mode
    // (the full-screen display, where the map should own every gesture).
    map = L.map(host, { worldCopyJump: true, scrollWheelZoom: !kiosk, gestureHandling: !kiosk, zoomControl: true, minZoom: 1, attributionControl: false }).setView([20, 0], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 18
    }).addTo(map);
    if (map.zoomControl) map.zoomControl.setPosition('bottomright');
    refreshMarkers();
    // make sure tiles fill the container once layout settles / on resize
    setTimeout(function () { try { map.invalidateSize(); fitToPins(allPts, false); } catch (e) { } }, 250);
    window.addEventListener('resize', function () { try { map.invalidateSize(); } catch (e) { } });
  }
  // Options for fitting the view to all pins. On phones, start more zoomed out
  // (lower max zoom) so every pin is visible at once before you zoom in.
  function fitOpts(extra) {
    var mobile = window.matchMedia && window.matchMedia('(max-width:720px)').matches;
    var o = { padding: mobile ? [36, 52] : [70, 70], maxZoom: mobile ? 3 : 5 };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  // Frame all pins so the map opens centered. A plain fitBounds on a globe-
  // spanning set (missionaries across several continents) clamps against the
  // min zoom and can leave the world shoved to one edge — so for a wide
  // longitude spread we drop to a balanced, centered world view instead.
  function fitToPins(pts, animate) {
    if (!map || !pts || !pts.length) return;
    var mobile = window.matchMedia && window.matchMedia('(max-width:720px)').matches;
    if (pts.length === 1) { map.setView(pts[0], 4); return; }
    var lngs = pts.map(function (p) { return p[1]; });
    var span = Math.max.apply(null, lngs) - Math.min.apply(null, lngs);
    if (span > 170) {
      var lats = pts.map(function (p) { return p[0]; });
      var cLat = (Math.max.apply(null, lats) + Math.min.apply(null, lats)) / 2;
      if (animate) { try { map.flyTo([cLat, 0], mobile ? 1 : 2, { duration: 1 }); } catch (e) { } }
      else { try { map.setView([cLat, 0], mobile ? 1 : 2); } catch (e) { } }
      return;
    }
    try { if (animate) map.flyToBounds(pts, fitOpts({ duration: 1 })); else map.fitBounds(pts, fitOpts()); } catch (e) { }
  }
  function arc(a, b) {
    var lat1 = a[0], lng1 = a[1], lat2 = b[0], lng2 = b[1];
    var dx = lng2 - lng1, dy = lat2 - lat1, dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var off = Math.min(dist * 0.18, 16);
    var clat = (lat1 + lat2) / 2 + (dx / dist) * off, clng = (lng1 + lng2) / 2 - (dy / dist) * off;
    var pts = []; for (var t = 0; t <= 1.0001; t += 0.05) { var u = 1 - t; pts.push([u * u * lat1 + 2 * u * t * clat + t * t * lat2, u * u * lng1 + 2 * u * t * clng + t * t * lng2]); }
    return pts;
  }
  function churchIcon() {
    return L.divIcon({ className: 'miss-home-wrap', html: '<div class="miss-home"><svg width="17" height="17" viewBox="0 0 24 24" fill="#FCF8EE"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg></div>', iconSize: [38, 38], iconAnchor: [19, 19] });
  }
  function refreshMarkers() {
    if (!map) return;
    markers.forEach(function (mk) { map.removeLayer(mk); }); markers = [];
    lines.forEach(function (ln) { map.removeLayer(ln); }); lines = [];
    if (churchMarker) { map.removeLayer(churchMarker); churchMarker = null; }
    var pts = [];
    MISS.forEach(function (m) {
      if (isNaN(m.lat) || isNaN(m.lng)) return;
      var ln = L.polyline(arc(CHURCH, [m.lat, m.lng]), { color: '#177E79', weight: 1.3, opacity: 0.4, interactive: false, className: 'miss-line' }).addTo(map);
      lines.push(ln);
      var mk = L.marker([m.lat, m.lng], { icon: pinIcon(m), title: m.name }).addTo(map);
      mk.on('click', function () { openProfile(m); });
      markers.push(mk); pts.push([m.lat, m.lng]);
    });
    churchMarker = L.marker(CHURCH, { icon: churchIcon(), title: 'Fairview Baptist Temple, Clay, WV', zIndexOffset: 1000 }).addTo(map);
    churchMarker.bindPopup('<b>Fairview Baptist Temple</b><br>Clay, WV');
    pts.push(CHURCH);
    allPts = pts;
    fitToPins(pts, false);
    renderStats();
  }
  function renderStats() {
    var el = document.getElementById('miss-stats'); if (!el) return;
    if (!MISS.length) { el.hidden = true; return; }
    var countries = {}, continents = {};
    MISS.forEach(function (m) { var c = nn(m.country) ? m.country : countryOf(m); if (c) countries[c] = 1; if (nn(m.region)) continents[m.region] = 1; });
    var nC = Object.keys(countries).length, nR = Object.keys(continents).length;
    el.hidden = false;
    el.innerHTML = '<b>' + MISS.length + '</b> ' + (MISS.length === 1 ? 'missionary' : 'missionaries') +
      (nC ? ' <span class="miss-stats-dot">&middot;</span> <b>' + nC + '</b> ' + (nC === 1 ? 'country' : 'countries') : '') +
      (nR ? ' <span class="miss-stats-dot">&middot;</span> <b>' + nR + '</b> ' + (nR === 1 ? 'continent' : 'continents') : '');
  }

  // ---------- profile modal ----------
  function lockProfileBackground(host) {
    inertedProfileEls = [];
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el === host || el.tagName === 'SCRIPT' || el.hasAttribute('inert')) return;
      el.setAttribute('inert', ''); inertedProfileEls.push(el);
    });
  }
  function unlockProfileBackground() {
    inertedProfileEls.forEach(function (el) { el.removeAttribute('inert'); });
    inertedProfileEls = [];
  }
  function profileFocusables(host) {
    var sel = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
    return Array.prototype.filter.call(host.querySelectorAll(sel), function (el) { return el.getClientRects().length > 0; });
  }
  function openProfile(m) {
    var host = document.getElementById('miss-modal'); if (!host) return;
    lastProfileFocus = document.activeElement;
    var allPhotos = [], photoSeen = {};
    (nn(m.photo) ? [m.photo] : []).concat((m.photos || []).filter(nn)).forEach(function (p) {
      if (!photoSeen[p]) { photoSeen[p] = 1; allPhotos.push(p); }
    });
    var cover = allPhotos[0] || '';
    var photo = cover
      ? '<div class="miss-modal-photo" id="miss-cover" style="background-image:url(\'' + q(cover) + '\')"></div>'
      : '<div class="miss-modal-photo empty">' + fallbackVisual(m) + '</div>';
    var gallery = allPhotos.length > 1
      ? '<div class="miss-gallery">' + allPhotos.map(function (p, i) { return '<button class="miss-gthumb' + (i === 0 ? ' on' : '') + '" data-photo="' + q(p) + '" style="background-image:url(\'' + q(p) + '\')" aria-label="Photo ' + (i + 1) + '"></button>'; }).join('') + '</div>'
      : '';
    var vseen = {}, vlist = [];
    (nn(m.video) ? [m.video] : []).concat(m.videos || []).forEach(function (vv) { var id = ytid(vv); if (id && !vseen[id]) { vseen[id] = 1; vlist.push(id); } });
    var videoBlock = vlist.length ? '<section class="miss-profile-section"><div class="miss-section-head"><span>Watch</span><h3>Their ministry in motion</h3></div><div class="miss-videos">' + vlist.map(function (id) {
      return '<div class="miss-video" data-yt="' + esc(id) + '"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/' + esc(id) + '/hqdefault.jpg" onerror="this.style.display=\'none\'"><span class="miss-video-play"><svg width="26" height="26" viewBox="0 0 24 24" fill="#FCF8EE"><path d="M8 5v14l11-7z"/></svg></span></div>';
    }).join('') + '</div></section>' : '';

    var flag = flagOf(m), glance = [];
    var place = displayPlace(m);
    if (nn(place) || flag) glance.push('<div class="miss-glance-item"><span>Location</span><strong>' + (flag ? '<b aria-hidden="true">' + flag + '</b> ' : '') + esc(place) + '</strong></div>');
    if (nn(m.field) || nn(m.ministry)) glance.push('<div class="miss-glance-item"><span>Ministry</span><strong>' + esc(m.field || m.ministry) + '</strong></div>');
    if (nn(m.org)) glance.push('<div class="miss-glance-item"><span>Sending organization</span><strong>' + esc(m.org) + '</strong></div>');
    var years = yearsLine(m);
    if (years) glance.push('<div class="miss-glance-item"><span>Serving</span><strong>' + esc(years) + '</strong></div>');
    var lt = localTimeStr(m);
    if (lt) glance.push('<div class="miss-glance-item"><span>Local time</span><strong class="miss-localtime" data-tz="' + esc(m.timezone) + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>' + esc(lt) + '</span></strong></div>');
    var glanceBlock = glance.length ? '<section class="miss-profile-section miss-glance"><div class="miss-section-head"><span>At a glance</span><h3>Where and how they serve</h3></div><div class="miss-glance-grid">' + glance.join('') + '</div></section>' : '';

    var story = nn(m.bio) ? '<section class="miss-profile-section miss-story"><div class="miss-section-head"><span>Their story</span><h3>Called to serve</h3></div><p>' + esc(m.bio) + '</p></section>' : '';
    var panels = '';
    if (nn(m.connection)) panels += '<article class="miss-feature-panel connection"><span>Our connection</span><h3>Part of the Fairview family</h3><p>' + esc(m.connection) + '</p></article>';
    if (nn(m.prayer)) panels += '<article class="miss-feature-panel prayer"><span>Prayer focus</span><h3>Pray with us</h3><p>' + esc(m.prayer) + '</p></article>';
    if (nn(m.update)) {
      var updateDate = dateLabel(m.latest_update_date);
      panels += '<article class="miss-feature-panel update"><span>Latest update' + (updateDate ? ' <time datetime="' + esc(m.latest_update_date) + '">' + esc(updateDate) + '</time>' : '') + '</span><h3>What is happening now</h3><p>' + esc(m.update) + '</p></article>';
    }
    var panelBlock = panels ? '<section class="miss-profile-panels">' + panels + '</section>' : '';

    var letters = Array.isArray(m.letters) ? m.letters.filter(function (l) { return l && l.url; }) : [];
    var letterBlock = letters.length ? '<section class="miss-profile-section"><div class="miss-section-head"><span>Keep up</span><h3>Prayer letters and updates</h3></div><div class="miss-letters">' +
      letters.map(function (l) { return '<a class="miss-letter" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + PDF_ICON + '<span>' + esc(l.label || 'Letter (PDF)') + '</span></a>'; }).join('') +
      '</div></section>' : '';

    var supportAction = nn(m.support) ? '<a class="btn btn-b" href="' + esc(m.support) + '" target="_blank" rel="noopener">Support their ministry</a>' : '';
    var partner = '<section class="miss-partner"><div class="miss-partner-copy"><span>Pray, share, partner</span><h3>Help carry the mission forward</h3><p>Keep this profile close, share it with someone, and remember ' + esc(m.name) + ' in prayer.</p></div>' +
      '<div class="miss-partner-actions">' + supportAction + '<button class="btn btn-o miss-share-btn" type="button" data-share-profile>' + SHARE_ICON + '<span>Share profile</span></button></div>' +
      '<span class="miss-share-status" role="status" aria-live="polite"></span>' +
      '<div class="miss-qr"><div class="miss-qr-code" id="miss-qr-code"></div><div class="miss-qr-tx"><b>Open this profile on another device</b><span>Scan this QR code to open and share ' + esc(m.name) + '\'s profile.</span></div></div></section>';

    var contact = '<details class="miss-contact"><summary><span><b>Send encouragement</b><small>Write a note or prayer for ' + esc(m.name) + '</small></span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="miss-contact-inner">' +
      '<p class="miss-contact-note">Send a note of encouragement, a prayer, or a question. Fairview will pass it along.</p>' +
      '<form class="form miss-contact-form" novalidate>' +
      '<div class="frow two"><div><label>Your name</label><input name="name" required></div><div><label>Email</label><input type="email" name="email" required></div></div>' +
      '<div class="frow"><label>Message</label><textarea name="message" rows="3" required></textarea></div>' +
      '<input type="hidden" name="_subject" value="Beyond the hills: message for ' + esc(m.name) + '">' +
      '<input type="hidden" name="missionary" value="' + esc(m.name) + '">' +
      '<button class="btn btn-b" type="submit">Send message</button>' +
      '<p class="miss-contact-msg" role="status" hidden></p></form></div></details>';
    var eyebrow = [m.region, m.ministry].filter(nn).join(' &middot; ');
    var badge = nn(m.status_label) ? '<span class="miss-badge ' + statusClass(m.status_label) + '">' + esc(m.status_label) + '</span>' : '';
    var locLine = (nn(place) || flag) ? '<div class="miss-loc miss-profile-loc">' + (flag ? '<span aria-hidden="true">' + flag + '</span> ' : '') + esc(place) + '</div>' : '';
    host.innerHTML = '<div class="miss-modal-bd" data-close></div><div class="miss-modal-card" role="dialog" aria-modal="true" aria-labelledby="miss-profile-title">' +
      '<button class="miss-modal-x" data-close aria-label="Close profile"><span aria-hidden="true">&times;</span></button>' + photo + gallery +
      '<div class="miss-modal-body"><div class="miss-head-row">' + (eyebrow ? '<div class="miss-flag">' + eyebrow + '</div>' : '') + badge + '</div>' +
      '<h2 id="miss-profile-title">' + esc(m.name) + '</h2>' + locLine +
      glanceBlock + story + panelBlock + videoBlock + letterBlock + partner + contact + '</div></div>';
    host.classList.add('open'); document.body.classList.add('miss-open'); lockProfileBackground(host);
    var cf = host.querySelector('.miss-contact-form');
    if (cf) cf.addEventListener('submit', function (e) { e.preventDefault(); submitContact(cf, m); });
    var share = host.querySelector('[data-share-profile]');
    if (share) share.addEventListener('click', function () { shareProfile(m, share, host.querySelector('.miss-share-status')); });
    if (window.QRCode) { var qc = host.querySelector('#miss-qr-code'); if (qc) { try { new QRCode(qc, { text: shareUrl(m), width: 104, height: 104, colorDark: '#0D2733', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); } catch (e) { } } }
    try { history.replaceState(null, '', shareUrl(m) + (kiosk ? '&kiosk=1' : '')); } catch (e) { }
    if (map && !isNaN(m.lat) && !isNaN(m.lng)) { try { map.panTo([m.lat, m.lng]); } catch (e) { } }
    var close = host.querySelector('.miss-modal-x'); if (close) { try { close.focus({ preventScroll: true }); } catch (e) { close.focus(); } }
  }
  function shareProfile(m, btn, status) {
    var url = shareUrl(m), payload = { title: m.name + ' | Beyond the hills', text: 'Meet ' + m.name + ' and learn how to pray for their ministry.', url: url };
    function say(t) { if (status) status.textContent = t; }
    function copied() { say('Profile link copied.'); btn.classList.add('copied'); setTimeout(function () { btn.classList.remove('copied'); }, 1800); }
    function legacyCopy() {
      var ta = document.createElement('textarea'); ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); copied(); } catch (e) { say('Copy this link: ' + url); }
      document.body.removeChild(ta);
    }
    function copyLink() {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(copied, legacyCopy);
      else legacyCopy();
    }
    if (navigator.share) {
      navigator.share(payload).then(function () { say('Profile shared.'); }).catch(function (e) { if (!e || e.name !== 'AbortError') copyLink(); });
    } else copyLink();
  }
  function submitContact(form, m) {
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var msg = form.querySelector('.miss-contact-msg'), btn = form.querySelector('button[type=submit]');
    function err(t) { msg.hidden = false; msg.className = 'miss-contact-msg err'; msg.textContent = t; btn.disabled = false; btn.textContent = 'Send message'; }
    if (!FORM_ENDPOINT) { err('To reach ' + (m.name || 'this missionary') + ', email ' + CONTACT_EMAIL + ' and we will pass it along.'); return; }
    btn.disabled = true; btn.textContent = 'Sending…';
    var fd = new FormData(form);
    fetch(FORM_ENDPOINT, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw 0; form.parentNode.innerHTML = '<h4>Contact ' + esc(m.name) + '</h4><div class="ev-thanks"><div class="ev-check">&#10003;</div><h3>Message sent!</h3><p>Thanks. We will make sure ' + esc(m.name) + ' gets it.</p></div>'; })
      .catch(function () { err('Something went wrong. Please email ' + CONTACT_EMAIL + '.'); });
  }
  function closeProfile() {
    var h = document.getElementById('miss-modal'), restore = lastProfileFocus;
    if (h) { h.classList.remove('open'); h.innerHTML = ''; }
    document.body.classList.remove('miss-open'); unlockProfileBackground(); lastProfileFocus = null;
    try { history.replaceState(null, '', location.pathname + (kiosk ? '?kiosk=1' : '')); } catch (e) { }
    if (restore && document.contains(restore) && restore.focus) { try { restore.focus({ preventScroll: true }); } catch (e) { restore.focus(); } }
  }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-close]')) closeProfile(); });
  document.addEventListener('keydown', function (e) {
    var h = document.getElementById('miss-modal'); if (!h || !h.classList.contains('open')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeProfile(); return; }
    if (e.key !== 'Tab') return;
    var items = profileFocusables(h); if (!items.length) { e.preventDefault(); return; }
    var first = items[0], last = items[items.length - 1], active = document.activeElement;
    if (e.shiftKey && (active === first || !h.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !h.contains(active))) { e.preventDefault(); first.focus(); }
  });
  // tap the video thumbnail to play it inside the profile
  document.addEventListener('click', function (e) {
    var v = e.target.closest && e.target.closest('.miss-video[data-yt]'); if (!v) return;
    var id = v.getAttribute('data-yt');
    v.innerHTML = '<iframe src="https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1" title="Missionary video" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>';
    v.removeAttribute('data-yt'); v.style.cursor = 'default';
  });
  // photo gallery: tap a thumbnail to swap the cover
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.miss-gthumb[data-photo]'); if (!t) return;
    var cov = document.getElementById('miss-cover'); if (cov) cov.style.backgroundImage = 'url("' + t.getAttribute('data-photo') + '")';
    Array.prototype.forEach.call(t.parentNode.children, function (c) { c.classList.toggle('on', c === t); });
  });
  // keep the open profile's local time current
  setInterval(function () {
    var el = document.querySelector('.miss-localtime[data-tz]'); if (!el) return;
    try { var s = el.querySelector('span'); if (s) s.textContent = new Intl.DateTimeFormat('en-US', { timeZone: el.getAttribute('data-tz'), hour: 'numeric', minute: '2-digit' }).format(new Date()); } catch (e) { }
  }, 30000);

  // ---------- grid (website browsing) ----------
  var regionFilter = '', ministryFilter = '';
  function distinct(get) { var s = {}, out = []; MISS.forEach(function (m) { var v = get(m); if (nn(v) && !s[v]) { s[v] = 1; out.push(v); } }); return out.sort(); }
  function buildChips(id, items, attr, pick) {
    var c = document.getElementById(id); if (!c || c.dataset.built || !items.length) return;
    c.innerHTML = '<button class="hub-chip active" data-' + attr + '="">All</button>' + items.map(function (r) { return '<button class="hub-chip" data-' + attr + '="' + esc(r) + '">' + esc(r) + '</button>'; }).join('');
    c.dataset.built = '1'; c.hidden = false;
    c.addEventListener('click', function (e) {
      var b = e.target.closest('[data-' + attr + ']'); if (!b) return;
      pick(b.getAttribute('data-' + attr));
      Array.prototype.forEach.call(c.children, function (x) { x.classList.toggle('active', x === b); });
      renderGrid();
    });
  }
  function renderGrid() {
    var grid = document.getElementById('miss-grid'); if (!grid) return;
    if (MISS.length) {
      buildChips('miss-chips', distinct(function (m) { return m.region; }), 'region', function (v) { regionFilter = v; });
      buildChips('miss-ministry-chips', distinct(function (m) { return m.ministry; }), 'ministry', function (v) { ministryFilter = v; });
    }
    var qy = searchQuery.toLowerCase();
    var list = MISS.filter(function (m) {
      if (regionFilter && m.region !== regionFilter) return false;
      if (ministryFilter && m.ministry !== ministryFilter) return false;
      if (qy && !matchM(m, qy)) return false;
      return true;
    });
    grid.innerHTML = list.map(function (m, i) {
      var cardCover = nn(m.photo) ? m.photo : ((m.photos || []).filter(nn)[0] || '');
      var ph = nn(cardCover)
        ? '<div class="miss-card-photo" style="background-image:url(\'' + q(cardCover) + '\')"></div>'
        : '<div class="miss-card-photo empty">' + fallbackVisual(m) + '</div>';
      var fl = flagOf(m);
      var bdg = nn(m.status_label) ? '<span class="miss-badge ' + statusClass(m.status_label) + ' miss-card-badge">' + esc(m.status_label) + '</span>' : '';
      var facts = cardFacts(m).map(function (fact) { return '<span>' + esc(fact) + '</span>'; }).join('');
      var teaser = nn(m.prayer)
        ? '<div class="miss-card-teaser prayer"><b>Pray this week</b><p>' + esc(m.prayer) + '</p></div>'
        : (nn(m.update) ? '<div class="miss-card-teaser update"><b>Latest update' + (dateLabel(m.latest_update_date) ? ' · ' + esc(dateLabel(m.latest_update_date)) : '') + '</b><p>' + esc(m.update) + '</p></div>' : '');
      var media = mediaCounts(m), indicators = '';
      if (media.photos) indicators += '<span class="miss-media-item" aria-label="' + media.photos + (media.photos === 1 ? ' photo' : ' photos') + '">' + PHOTO_ICON + '<b>' + media.photos + '</b></span>';
      if (media.videos) indicators += '<span class="miss-media-item" aria-label="' + media.videos + (media.videos === 1 ? ' video' : ' videos') + '">' + VIDEO_ICON + '<b>' + media.videos + '</b></span>';
      if (media.letters) indicators += '<span class="miss-media-item" aria-label="' + media.letters + (media.letters === 1 ? ' letter' : ' letters') + '">' + PDF_ICON + '<b>' + media.letters + '</b></span>';
      var serving = nn(m.field) ? '<p class="miss-card-serving">' + esc(m.field) + '</p>' : '';
      var org = nn(m.org) ? '<p class="miss-card-org">With ' + esc(m.org) + '</p>' : '';
      return '<button class="miss-card" data-i="' + i + '" aria-haspopup="dialog"><div class="miss-card-ph-wrap">' + ph + bdg + '</div>' +
        '<div class="miss-card-b">' + (nn(m.region) ? '<div class="miss-card-region">' + esc(m.region) + '</div>' : '') +
        '<h3>' + esc(m.name) + '</h3>' + ((nn(displayPlace(m)) || fl) ? '<div class="miss-loc">' + (fl ? fl + ' ' : '') + esc(displayPlace(m)) + '</div>' : '') +
        serving + org + (facts ? '<div class="miss-card-facts">' + facts + '</div>' : '') + teaser +
        '<div class="miss-card-foot"><strong>Meet them <span aria-hidden="true">→</span></strong>' + (indicators ? '<div class="miss-card-media">' + indicators + '</div>' : '') + '</div></div></button>';
    }).join('');
    Array.prototype.forEach.call(grid.querySelectorAll('.miss-card'), function (btn) {
      btn.addEventListener('click', function () { openProfile(list[+btn.getAttribute('data-i')]); });
    });
    var empty = document.getElementById('miss-empty'); if (empty) empty.hidden = list.length > 0 || MISS.length === 0;
  }

  // ---------- search + controls ----------
  function renderSearchResults() {
    var sr = document.getElementById('miss-search-results'); if (!sr) return;
    if (!searchQuery) { sr.hidden = true; sr.innerHTML = ''; return; }
    var qy = searchQuery.toLowerCase();
    var hits = MISS.filter(function (m) { return matchM(m, qy); }).slice(0, 7);
    sr.hidden = false;
    sr.innerHTML = hits.length
      ? hits.map(function (m) { return '<button class="miss-sr" data-slug="' + esc(m.slug) + '"><span class="miss-sr-name">' + esc(m.name) + '</span><span class="miss-sr-loc">' + esc([m.location, m.region].filter(nn).join(' · ')) + '</span></button>'; }).join('')
      : '<div class="miss-sr-none">No matches</div>';
  }
  function resetMapView() {
    if (!map) return;
    var pts = MISS.filter(function (m) { return !isNaN(m.lat) && !isNaN(m.lng); }).map(function (m) { return [m.lat, m.lng]; });
    pts.push(CHURCH);
    fitToPins(pts, true);
  }
  function toggleFullscreen() {
    var el = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) { (el.requestFullscreen || el.webkitRequestFullscreen || function () { }).call(el); }
    else { (document.exitFullscreen || document.webkitExitFullscreen || function () { }).call(document); }
  }
  function setupControls() {
    var si = document.getElementById('miss-search'), sr = document.getElementById('miss-search-results');
    if (si) {
      if (window.innerWidth < 600) si.setAttribute('placeholder', 'Search a name or country…');
      si.addEventListener('input', function () { searchQuery = si.value.trim(); renderSearchResults(); renderGrid(); });
      si.addEventListener('focus', function () { if (searchQuery) renderSearchResults(); });
    }
    document.addEventListener('click', function (e) {
      var inWrap = e.target.closest && e.target.closest('.miss-search-wrap');
      if (sr && !inWrap) sr.hidden = true;
      var b = e.target.closest && e.target.closest('.miss-sr[data-slug]');
      if (b) { var m = bySlug(b.getAttribute('data-slug')); if (m) { if (sr) sr.hidden = true; if (si) si.blur(); flyToM(m); openProfile(m); } }
    });
    var home = document.getElementById('miss-home');
    if (home) home.addEventListener('click', function () { closeProfile(); if (si) si.value = ''; searchQuery = ''; renderSearchResults(); renderGrid(); resetMapView(); });
    var full = document.getElementById('miss-full');
    if (full) full.addEventListener('click', toggleFullscreen);
  }

  // ---------- kiosk idle + attract tour ----------
  var attractTimer = null, tourTimer = null, touring = false;
  function stopTour() { touring = false; if (tourTimer) { clearTimeout(tourTimer); tourTimer = null; } }
  function startTour() {
    if (!map || touring) return;
    var pts = MISS.filter(function (m) { return !isNaN(m.lat) && !isNaN(m.lng); });
    if (pts.length < 2) return;
    touring = true; var i = 0;
    (function step() {
      if (!touring) return;
      var m = pts[i % pts.length]; i++;
      try { map.flyTo([m.lat, m.lng], 4, { duration: 2.4 }); } catch (e) { }
      tourTimer = setTimeout(step, 6000);
    })();
  }
  function setupIdle() {
    if (!kiosk) return;
    function reset() { stopTour(); clearTimeout(attractTimer); attractTimer = setTimeout(function () { closeProfile(); startTour(); }, 45000); }
    ['click', 'touchstart', 'pointerdown', 'keydown', 'wheel'].forEach(function (ev) { document.addEventListener(ev, reset, { passive: true }); });
    reset();
  }

  function run() {
    load(function (d, unavailable) {
      MISS = d || [];
      loadUnavailable = !!unavailable;
      try { initMap(); } catch (e) { }
      try { renderGrid(); } catch (e) { }
      try { setupControls(); } catch (e) { }
      setupIdle();
      var prompt = document.getElementById('miss-prompt');
      if (prompt) {
        prompt.textContent = loadUnavailable ? 'Missionary profiles are temporarily unavailable' : 'Tap a pin to meet our missionaries';
        prompt.hidden = MISS.length === 0 && !loadUnavailable;
      }
      var pageEmpty = document.getElementById('miss-page-empty');
      if (pageEmpty) {
        pageEmpty.classList.toggle('is-unavailable', loadUnavailable);
        pageEmpty.innerHTML = loadUnavailable
          ? '<strong>Missionary profiles are temporarily unavailable.</strong><span>Please try again in a few moments.</span>'
          : '<strong>No missionary profiles have been published yet.</strong><span>Check back soon.</span>';
        pageEmpty.hidden = MISS.length > 0;
      }
      var search = document.getElementById('miss-search');
      if (search && loadUnavailable) { search.disabled = true; search.placeholder = 'Profiles temporarily unavailable'; }
      var mParam = new URLSearchParams(location.search).get('m');
      if (mParam) { var mm = bySlug(mParam); if (mm) setTimeout(function () { flyToM(mm); openProfile(mm); }, 400); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
