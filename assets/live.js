/* ============================================================
   Fairview Baptist Temple — live hub (Watch page).
   The player normally holds the newest completed livestream. Thirty
   minutes before a scheduled broadcast it becomes the waiting room, and
   when YouTube marks the broadcast live it switches to the live player and
   chat. Auto-refresh keeps those handoffs automatic. The full completed
   service archive remains available below.
   ============================================================ */
var FBTLiveSelection = (function () {
  var PRELIVE_WINDOW_MS = 30 * 60 * 1000;
  var LATE_START_GRACE_MS = 2 * 60 * 60 * 1000;

  function itemId(item) {
    return item && (item.videoId || item.id) || '';
  }

  function startTime(item) {
    return item && (item.startTime || item.scheduledStartTime || item._startTime) || '';
  }

  function isStartingSoon(item, nowMs, windowMs) {
    if (!itemId(item)) return false;
    var startMs = new Date(startTime(item)).getTime();
    if (isNaN(startMs)) return false;
    var now = typeof nowMs === 'number' ? nowMs : Date.now();
    var lead = typeof windowMs === 'number' ? windowMs : PRELIVE_WINDOW_MS;
    var difference = startMs - now;
    return difference <= lead && difference >= -LATE_START_GRACE_MS;
  }

  function pickUpcoming(items, nowMs, windowMs) {
    return (items || []).filter(function (item) {
      return isStartingSoon(item, nowMs, windowMs);
    }).sort(function (a, b) {
      return new Date(startTime(a)).getTime() - new Date(startTime(b)).getTime();
    })[0] || null;
  }

  function latestCompleted(items) {
    var best = null, bestTime = -Infinity;
    (items || []).forEach(function (item) {
      if (!itemId(item)) return;
      var raw = item._startTime || item.startTime || item.date || item.d || '';
      var time = new Date(raw).getTime();
      if (!best || (!isNaN(time) && time > bestTime)) {
        best = item;
        bestTime = isNaN(time) ? bestTime : time;
      }
    });
    return best;
  }

  function choose(live, upcoming, latestCompleted, nowMs, windowMs) {
    if (itemId(live)) return { mode: 'live', item: live };
    if (isStartingSoon(upcoming, nowMs, windowMs)) return { mode: 'upcoming', item: upcoming };
    if (itemId(latestCompleted)) return { mode: 'latest', item: latestCompleted };
    return { mode: 'off', item: null };
  }

  return {
    PRELIVE_WINDOW_MS: PRELIVE_WINDOW_MS,
    LATE_START_GRACE_MS: LATE_START_GRACE_MS,
    isStartingSoon: isStartingSoon,
    pickUpcoming: pickUpcoming,
    latestCompleted: latestCompleted,
    choose: choose,
  };
})();

if (typeof module === 'object' && module.exports) module.exports = FBTLiveSelection;

(function (selection) {
  if (typeof document === 'undefined') return;
  var stage = document.querySelector('[data-live-stage]');
  var grid = document.querySelector('[data-fbt-services-grid]');
  // Run if EITHER an in-page player OR the service archive is present. The
  // stream page keeps only the archive (no top player); the home page has only
  // the player. Everything below is guarded so either can be absent.
  if (!stage && !grid) return;
  var playerEl = stage ? stage.querySelector('[data-live-player]') : null;
  var chatEl = stage ? stage.querySelector('[data-live-chat]') : null;
  var statusEl = document.querySelector('[data-live-status]');
  var subEl = document.querySelector('[data-live-sub]');
  var gridWrap = document.querySelector('[data-fbt-services]');
  var LIVE_API = '/api/live';
  var STREAMS_API = '/api/streams';

  var curPlayerId = null, curAutoplay = null, archiveServices = [], archiveSig = '', archiveWired = false, archiveVisible = 24, _streams = null, _freshLast = [];
  var ARCH_STEP = 24;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function host() { try { return location.hostname || ''; } catch (e) { return ''; } }
  function embedVideo(id, autoplay) {
    return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) +
      '?rel=0&modestbranding=1' + (autoplay ? '&autoplay=1&mute=1' : '');
  }
  function chatUrl(id) { return 'https://www.youtube.com/live_chat?v=' + encodeURIComponent(id) + '&embed_domain=' + encodeURIComponent(host()); }
  function fmtWhen(iso) {
    try { var d = new Date(iso); if (isNaN(d)) return ''; return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }

  function setPlayer(id, autoplay) {
    if (!id || !playerEl) return;
    if (id === curPlayerId && autoplay === curAutoplay) return;
    curPlayerId = id; curAutoplay = autoplay;
    playerEl.innerHTML = '<iframe src="' + embedVideo(id, autoplay) + '" title="Fairview Baptist Temple stream" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
  }
  function setOfflinePlayer() {
    if (!playerEl) return;
    curPlayerId = null; curAutoplay = null;
    playerEl.innerHTML =
      '<div class="live-offline" role="status">' +
        '<span class="live-offline-icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="m23 7-7 5 7 5V7Z"/><rect x="1" y="5" width="15" height="14" rx="2"/><path d="M5 9h7M5 12h5"/>' +
          '</svg>' +
        '</span>' +
        '<span class="live-offline-kicker">Fairview livestream</span>' +
        '<strong>We&rsquo;re not live right now.</strong>' +
        '<span>The player will appear here automatically when the next livestream begins.</span>' +
      '</div>';
  }
  function setChat(id) {
    if (!chatEl) return;
    if (id) {
      chatEl.hidden = false; stage.classList.remove('no-chat');
      if (chatEl.getAttribute('data-cid') !== id) {
        chatEl.setAttribute('data-cid', id);
        chatEl.innerHTML = '<div class="ch"><span class="dot"></span> Live chat</div><iframe src="' + chatUrl(id) + '" title="Live chat"></iframe>';
      }
    } else {
      chatEl.hidden = true; stage.classList.add('no-chat'); chatEl.removeAttribute('data-cid'); chatEl.innerHTML = '';
    }
  }
  function setStatus(mode, title, startTime) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.classList.remove('is-upcoming', 'is-off');
    if (mode === 'live') statusEl.innerHTML = '<span class="dot"></span> Live now' + (title ? ' &middot; ' + esc(title) : '');
    else if (mode === 'upcoming') { statusEl.classList.add('is-upcoming'); statusEl.innerHTML = '<span class="dot"></span> ' + (startTime && fmtWhen(startTime) ? 'Starts ' + fmtWhen(startTime) : 'Scheduled') + (title ? ' &middot; ' + esc(title) : ''); }
    else if (mode === 'latest') { statusEl.classList.add('is-upcoming'); statusEl.innerHTML = '<span class="dot"></span> Latest service' + (title ? ' &middot; ' + esc(title) : ''); }
    else { statusEl.classList.add('is-off'); statusEl.innerHTML = '<span class="dot"></span> Offline'; }
  }
  function setSub(t) { if (subEl) subEl.textContent = t; }

  // ---- searchable service archive (search by title/date, filter by year) ----
  function parseTitleDate(raw) {
    var m = (raw || '').match(/\b(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?\b/);
    if (!m) return null;
    var mm = +m[1], dd = +m[2];
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    var Y = m[3] ? (m[3].length === 2 ? 2000 + (+m[3]) : +m[3]) : 0;
    return { m: mm, d: dd, Y: Y };
  }
  function dateVariants(mm, dd, Y) {
    var out = [], y2 = Y ? String(Y).slice(-2) : '';
    if (Y) {
      var dt = new Date(Y, mm - 1, dd);
      if (!isNaN(dt)) {
        out.push(dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
        out.push(dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
      }
      out.push(mm + '/' + dd + '/' + Y, mm + '/' + dd + '/' + y2, mm + '-' + dd + '-' + Y, mm + '.' + dd + '.' + y2, mm + '.' + dd + '.' + Y, String(Y));
    }
    out.push(mm + '/' + dd, mm + '.' + dd, mm + '-' + dd, mm + ' ' + dd);
    return out;
  }
  // service "year" prefers the date in the original title, falling back to the upload date
  function svcInfo(s) {
    var td = parseTitleDate(s.rawTitle);
    var pd = new Date(s.date || ''); var pdOk = !isNaN(pd);
    var Y = (td && td.Y) || (pdOk ? pd.getFullYear() : '');
    var parts = [s.title || '', s.rawTitle || ''];
    if (td) parts = parts.concat(dateVariants(td.m, td.d, td.Y || (pdOk ? pd.getFullYear() : 0)));
    if (pdOk) parts = parts.concat(dateVariants(pd.getMonth() + 1, pd.getDate(), pd.getFullYear()));
    return { year: Y, search: parts.join(' ').toLowerCase() };
  }
  function archiveEl(n) { var f = document.querySelector('[data-svc-filters]'); return f ? f.querySelector('[data-svc="' + n + '"]') : null; }

  // ---- the full livestream archive (six years of services) -------
  function cleanStreamTitle(raw) {
    var parts = (raw || '').split('|').map(function (s) { return s.trim(); })
      .filter(function (p) { return p && !/^\s*\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\s*$/.test(p); });
    var pick = parts[0] || raw || '';
    return pick.replace(/\s*\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\s*$/, '').trim() || (raw || '').trim();
  }
  function streamType(raw) {
    if (/sunday school/i.test(raw)) return 'Sunday School';
    if (/wednesday|midweek|prayer/i.test(raw)) return 'Midweek';
    if (/\btuesday\b|christmas eve|revival|bluegrass|summer kickoff|matthews family|watchnight|good friday|cantata|concert|vacation bible|\bvbs\b|missionary/i.test(raw)) return 'Special Service';
    if (/sunday|worship|morning|father|mother|easter|\bfairview\b/i.test(raw)) return 'Sunday Morning Worship';
    var td = parseTitleDate(raw);
    if (td && td.Y) {
      var dated = new Date(td.Y, td.m - 1, td.d, 12);
      if (!isNaN(dated) && dated.getDay() === 0) return 'Sunday Morning Worship';
    }
    return 'Other Service';
  }
  function serviceDate(raw, published, type) {
    var td = parseTitleDate(raw);
    if (!td) return published || '';
    var pd = new Date(published || '');
    var Y = td.Y;
    if (!Y && !isNaN(pd)) {
      var expectedDay = type === 'Midweek' ? 3 :
        (type === 'Sunday School' || type === 'Sunday Morning Worship' ? 0 : -1);
      if (expectedDay >= 0) {
        var best = null;
        for (var candidateYear = pd.getFullYear() - 3; candidateYear <= pd.getFullYear() + 3; candidateYear++) {
          var candidate = new Date(candidateYear, td.m - 1, td.d, 12);
          if (isNaN(candidate) || candidate.getMonth() !== td.m - 1 || candidate.getDate() !== td.d || candidate.getDay() !== expectedDay) continue;
          var distance = Math.abs(candidate.getTime() - pd.getTime());
          if (!best || distance < best.distance) best = { year: candidateYear, distance: distance };
        }
        if (best) Y = best.year;
      }
      if (!Y) {
        Y = pd.getFullYear();
        var approx = new Date(Y, td.m - 1, td.d, 12);
        var gap = approx.getTime() - pd.getTime();
        var halfYear = 183 * 24 * 60 * 60 * 1000;
        if (gap > halfYear) Y -= 1;
        else if (gap < -halfYear) Y += 1;
      }
    }
    if (!Y) return published || '';
    var exact = new Date(Y, td.m - 1, td.d, 12);
    if (isNaN(exact) || exact.getFullYear() !== Y || exact.getMonth() !== td.m - 1 || exact.getDate() !== td.d) return published || '';
    return exact.toISOString();
  }
  function toService(item, idx) {
    // Prefer the service date written in the title. Older archive timestamps
    // are approximate upload dates, which can produce the wrong weekday.
    var type = streamType(item.t || '');
    var date = serviceDate(item.t || '', item.d || '', type);
    return {
      id: item.id, rawTitle: item.t || '', title: cleanStreamTitle(item.t || ''),
      date: date, order: idx, showWeekday: true,
      thumb: 'https://i.ytimg.com/vi/' + item.id + '/hqdefault.jpg',
      url: 'https://www.youtube.com/watch?v=' + item.id, service: type,
      _live: !!item.live, _upcoming: !!item.upcoming, // scrape flags: keep live/premieres out of the archive
      _startTime: item.startTime || '', _endTime: item.endTime || '',
    };
  }
  // The deep, static archive (six years of services). Cached — it doesn't change.
  function loadStreams() {
    if (_streams) return _streams;
    _streams = fetch('assets/livestreams.json', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) { return ((d && d.items) || []).map(toService); })
      .catch(function () { return []; });
    return _streams;
  }
  // The channel's recent livestreams, read live from YouTube (keyless) every
  // poll. This is what keeps the page current: a just-ended stream appears here
  // right away, so it can be featured and drop into the archive without anyone
  // re-publishing a static file. NOT cached — we want each poll fresh.
  function loadFreshStreams() {
    return fetch(STREAMS_API, { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var list = ((d && d.items) || []).map(toService);
        // A blocked/empty poll shouldn't collapse the page back to the stale
        // static archive and flicker the featured video — reuse the last good
        // scrape until a fresh one actually arrives.
        if (list.length) { _freshLast = list; return list; }
        return _freshLast;
      })
      .catch(function () { return _freshLast; });
  }
  // Fresh (recency) over static (depth), deduped by id, newest first. Both
  // lists are already newest-first; the fresh scrape covers the top of the
  // list, so concatenating fresh-then-static and dropping duplicates yields a
  // coherent, gap-free ordering. If the scrape is empty we fall back to the
  // static archive exactly as before.
  function mergeStreams(fresh, stat) {
    var byId = {}, out = [];
    (fresh || []).concat(stat || []).forEach(function (s) {
      if (!s || !s.id) return;
      var kept = byId[s.id];
      if (kept) { if (!kept.date && s.date) kept.date = s.date; return; } // keep fresh, borrow the static date
      byId[s.id] = s; out.push(s);
    });
    out.forEach(function (s, i) { s.order = i; });
    return out;
  }

  function renderArchive() {
    if (!grid || !window.FBTVideos || !window.FBTVideos.card) return;
    var q = ((archiveEl('search') || {}).value || '').toLowerCase().trim();
    var yr = (archiveEl('year') || {}).value || '';
    var type = (archiveEl('type') || {}).value || '';
    var sort = (archiveEl('sort') || {}).value || 'newest';
    var list = archiveServices.filter(function (s) {
      if (yr && String(s._year) !== yr) return false;
      if (type && s.service !== type) return false;
      if (q && (s._search || '').indexOf(q) < 0) return false;
      return true;
    });
    list.sort(function (a, b) { return sort === 'oldest' ? b.order - a.order : a.order - b.order; });
    var shown = list.slice(0, archiveVisible);
    grid.innerHTML = shown.map(function (s) { return window.FBTVideos.card(s, s.service); }).join('');
    grid.hidden = false;
    var countEl = document.querySelector('[data-svc="count"]');
    if (countEl) { countEl.hidden = false; countEl.textContent = list.length <= shown.length ? (list.length + (list.length === 1 ? ' service' : ' services')) : ('Showing ' + shown.length + ' of ' + list.length + ' services'); }
    var emptyEl = document.querySelector('[data-svc="empty"]'); if (emptyEl) emptyEl.hidden = list.length > 0;
    var moreEl = document.querySelector('[data-svc="more"]'); if (moreEl) moreEl.hidden = list.length <= shown.length;
  }
  function buildArchive(services) {
    if (!grid) return;
    var sig = services.map(function (s) { return s.id; }).join(',');
    if (sig === archiveSig) return; // unchanged — keep the user's search intact
    archiveSig = sig; archiveServices = services; archiveVisible = ARCH_STEP;
    services.forEach(function (s) { var info = svcInfo(s); s._search = info.search; s._year = info.year; });
    var filters = document.querySelector('[data-svc-filters]');
    if (filters) filters.hidden = !services.length;
    if (gridWrap) gridWrap.hidden = !services.length;
    var yearEl = archiveEl('year');
    if (yearEl) {
      var prev = yearEl.value, seen = {}, years = [];
      services.forEach(function (s) { var y = s._year; if (y && !seen[y]) { seen[y] = 1; years.push(y); } });
      years.sort(function (a, b) { return b - a; });
      yearEl.innerHTML = '<option value="">All years</option>' + years.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
      yearEl.value = prev;
    }
    if (!archiveWired) {
      var onFilter = function () { archiveVisible = ARCH_STEP; renderArchive(); };
      ['search', 'year', 'type', 'sort'].forEach(function (n) { var el = archiveEl(n); if (el) el.addEventListener('input', onFilter); });
      var clr = archiveEl('clear');
      if (clr) clr.addEventListener('click', function () {
        var se = archiveEl('search'); if (se) se.value = '';
        var ye = archiveEl('year'); if (ye) ye.value = '';
        var te = archiveEl('type'); if (te) te.value = '';
        var so = archiveEl('sort'); if (so) so.value = 'newest';
        archiveVisible = ARCH_STEP; renderArchive();
      });
      var more = document.querySelector('[data-svc="more"]');
      if (more) more.addEventListener('click', function () { archiveVisible += ARCH_STEP; renderArchive(); });
      archiveWired = true;
    }
    renderArchive();
  }

  function update() {
    var liveP = fetch(LIVE_API, { headers: { accept: 'application/json' } }).then(function (r) { return r.json(); }).catch(function () { return {}; });
    Promise.all([liveP, loadStreams(), loadFreshStreams()]).then(function (res) {
      var s = res[0] || {}, streams = mergeStreams(res[2], res[1]);
      var liveId = s.live && s.live.videoId, upId = s.upcoming && s.upcoming.videoId;
      // Keep the featured/scheduled broadcasts out of "Watch again": both the
      // one /api/live named AND anything the scrape itself flagged live/upcoming
      // (covers a 2nd scheduled stream, and the case where /api/live lags).
      var past = streams.filter(function (x) { return x.id !== liveId && x.id !== upId && !x._live && !x._upcoming; });
      var streamLive = streams.filter(function (x) { return x._live; })[0] || null;
      var now = Date.now();
      var upcomingStreams = streams.filter(function (x) { return x._upcoming; });
      var matchingUpcoming = streams.filter(function (x) { return x.id === upId; })[0] || null;
      var live = liveId ? {
        id: liveId,
        title: s.live.title || (streamLive && streamLive.id === liveId ? streamLive.rawTitle : ''),
      } : (streamLive ? { id: streamLive.id, title: streamLive.rawTitle } : null);
      var apiUpcoming = upId ? {
        id: upId,
        title: s.upcoming.title || (matchingUpcoming ? matchingUpcoming.rawTitle : ''),
        startTime: s.upcoming.startTime || (matchingUpcoming ? matchingUpcoming._startTime : ''),
      } : null;
      var upcoming = selection.pickUpcoming((apiUpcoming ? [apiUpcoming] : []).concat(upcomingStreams), now);
      var featured = selection.choose(live, upcoming, selection.latestCompleted(past), now);

      if (featured.mode === 'live') {
        setPlayer(featured.item.id, true); setChat(featured.item.id); setStatus('live', featured.item.title);
        setSub('We are live right now. Join the service, and say hello in the chat.');
      } else if (featured.mode === 'upcoming') {
        setPlayer(featured.item.id, false); setChat(featured.item.id); setStatus('upcoming', featured.item.title, featured.item.startTime);
        setSub('Our next livestream starts soon. The player and chat are ready right here.');
      } else if (featured.mode === 'latest') {
        setPlayer(featured.item.id, false); setChat(null); setStatus('latest', featured.item.title);
        setSub('Watch our most recent livestream here. This player switches to the next scheduled broadcast 30 minutes before it begins.');
      } else {
        setOfflinePlayer();
        setChat(null); setStatus('off');
        setSub('When we go live, the service plays here automatically. Completed livestreams will appear in the service archive below.');
      }
      // "Watch again" = the full, searchable archive of every past service
      buildArchive(past);
    }).catch(function () {});
  }

  function start() { update(); setInterval(update, 45000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(FBTLiveSelection);
