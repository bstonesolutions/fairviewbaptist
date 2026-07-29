/* ============================================================
   Fairview Baptist Temple — live video router (keyless).
   Pulls videos from /api/videos (your channel feed + any configured
   Sermons / Music playlists), classifies each one as a sermon
   (message), music, or full service, and routes them:
       message  -> Messages hub (searchable sermon library)
       music    -> Music page
       service  -> Watch page (recent services / watch again)
   Live broadcasts are handled separately on the Watch page; this only
   deals with POSTED videos. Playlists win; otherwise a video is auto
   sorted by its title/description; per-video overrides in
   assets/sermon-tags.js win over everything. If the feed is empty or
   unavailable, every page keeps its built-in content. Nothing breaks.
   ============================================================ */
(function () {
  function cloneTags(source) {
    var copy = {};
    Object.keys(source || {}).forEach(function (key) {
      var row = source[key] || {};
      copy[key] = {};
      Object.keys(row).forEach(function (field) {
        copy[key][field] = Array.isArray(row[field]) ? row[field].slice() : row[field];
      });
    });
    return copy;
  }
  var FEEDS = window.FBT_FEEDS || {};
  var BASE_TAGS = cloneTags(window.FBT_SERMON_TAGS || {});
  var TAGS = cloneTags(BASE_TAGS);
  var API = FEEDS.videosApi || '/api/videos';
  var SPEAKERS = FEEDS.knownSpeakers || [];
  var EXCLUDE = (FEEDS.excludeFromHubs || []).map(function (x) { return String(x || '').toLowerCase().trim(); }).filter(Boolean);

  // Owner-listed videos to keep out of every hub (match by id or title piece).
  function isExcluded(v) {
    var id = (v.id || '').toLowerCase(), title = (v.title || '').toLowerCase();
    for (var i = 0; i < EXCLUDE.length; i++) {
      if (id && id === EXCLUDE[i]) return true;
      if (title && title.indexOf(EXCLUDE[i]) !== -1) return true;
    }
    return false;
  }

  var hasMessages = !!document.querySelector('[data-cms-sermons-grid]');
  var hasMusic = !!document.querySelector('[data-fbt-music-grid]');
  var hasServices = !!document.querySelector('[data-fbt-services-grid]');
  // Note: we no longer bail when there's no grid — the in-page player
  // (FBTPlayer) is set up on every page that loads this file (e.g. blog
  // posts use it for the "Watch the message" button). run() still no-ops.

  // ---- Bible books in canonical (KJV) order -----------------------
  var BOOKS = ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'];
  var ALT = { 'psalm': 'Psalms', 'song of songs': 'Song of Solomon', 'canticles': 'Song of Solomon', 'revelations': 'Revelation' };
  var NAME_RE = (function () {
    var names = BOOKS.map(function (b) { return b.toLowerCase(); }).concat(Object.keys(ALT));
    names.sort(function (a, b) { return b.length - a.length; });
    var esc = names.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    return new RegExp('(?:^|[^a-z])(' + esc.join('|') + ')(?:\\s+(\\d+)(?::(\\d+))?)?(?:[^a-z]|$)', 'i');
  })();
  function bookIndex(b) { var i = BOOKS.indexOf(b); return i < 0 ? 999 : i; }

  function detectScripture(text) {
    if (!text) return null;
    var m = (' ' + text + ' ').match(NAME_RE);
    if (!m) return null;
    var n = m[1].toLowerCase();
    var canon = ALT[n] || BOOKS.filter(function (b) { return b.toLowerCase() === n; })[0];
    if (!canon) return null;
    var ref = canon;
    if (m[2]) { ref += ' ' + m[2]; if (m[3]) ref += ':' + m[3]; }
    return { book: canon, reference: ref };
  }

  function detectSpeaker(text) {
    if (!text) return '';
    for (var i = 0; i < SPEAKERS.length; i++) {
      var plain = SPEAKERS[i].replace(/"/g, '');
      if (text.toLowerCase().indexOf(plain.toLowerCase()) >= 0) return SPEAKERS[i];
      var last = plain.split(' ').pop();
      if (last && text.toLowerCase().indexOf(last.toLowerCase()) >= 0 && /pastor|pas\.|rev|bro|brother/i.test(text)) return SPEAKERS[i];
    }
    if (/\bspurlock\b/i.test(text) || /\bpastor\s+michael\b/i.test(text) || /\bmichael\s+spurlock\b/i.test(text)) return 'Pastor Michael Spurlock';
    var m = text.match(/\b(?:pastor|pas\.?|rev\.?|bro\.?|brother|dr\.?)\s+[A-Z][a-zA-Z.'"]+(?:\s+[A-Z][a-zA-Z.'"]+){0,2}/);
    return m ? m[0].replace(/\s+/g, ' ').trim() : '';
  }

  var MON = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  var WORDDATE_RE = new RegExp('^' + MON + '\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{2,4})?$', 'i');
  var TRAILDATE_RE = new RegExp('\\s*(?:\\d{1,2}[.\\/-]\\d{1,2}(?:[.\\/-]\\d{2,4})?|' + MON + '\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{2,4})?)\\s*$', 'i');
  function isDatePart(p) { p = p.trim(); return /^\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?$/.test(p) || WORDDATE_RE.test(p); }
  var NOISE_RE = /^(fairview baptist temple|fairview|@?fairview|worship @ fairview|fbt)$/i;
  function stripTrailingDate(s) { return s.replace(TRAILDATE_RE, '').trim(); }
  function serviceType(raw) {
    if (/midweek|wednesday/i.test(raw)) return 'Midweek';
    if (/sunday school/i.test(raw)) return 'Sunday School';
    return 'Worship';
  }
  function cleanParts(raw) {
    return raw.split('|').map(function (s) { return s.trim(); })
      .filter(function (p) { return p && !isDatePart(p); });
  }
  function cleanTitle(raw) {
    var parts = cleanParts(raw);
    var meaningful = parts.filter(function (p) { return !detectSpeaker(p) && !NOISE_RE.test(stripTrailingDate(p)); });
    var pick = meaningful[0] || parts[0] || raw;
    pick = stripTrailingDate(pick).trim();
    var out = pick || stripTrailingDate(raw).trim() || raw.trim();
    return out.replace(/^["“]+\s*/, '').replace(/\s*["”]+$/, '').trim() || out;
  }
  function detectSeries(raw, title) {
    var parts = cleanParts(raw);
    for (var i = 0; i < parts.length; i++) {
      var p = stripTrailingDate(parts[i]).trim();
      if (p && p !== title && !detectSpeaker(p) && !NOISE_RE.test(p) && !detectScripture(p)) return p;
    }
    return '';
  }

  // Prefer the date the message was preached over the date YouTube published it.
  // YouTube does not expose words printed inside a thumbnail, so the handful of
  // thumbnail-only dates live as verified owner overrides in sermon-tags.js.
  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  var ISO_DATE_RE = /(?:^|[^\d])(\d{4})-(\d{1,2})-(\d{1,2})(?=$|[^\d])/;
  var NUMERIC_DATE_RE = /(?:^|[^\d])(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?(?=$|[^\d])/g;
  var WRITTEN_DATE_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2,4}))?\b/gi;
  function publishedYear(published) {
    var d = new Date(published || '');
    return isNaN(d) ? new Date().getFullYear() : d.getUTCFullYear();
  }
  function fullYear(raw, published, month, day) {
    if (!raw) {
      var pub = new Date(published || '');
      var base = publishedYear(published);
      if (isNaN(pub)) return base;
      var choices = [base - 1, base, base + 1].map(function (year) {
        return { year: year, distance: Math.abs(Date.UTC(year, month, day, 12) - pub.getTime()) };
      });
      choices.sort(function (a, b) { return a.distance - b.distance; });
      return choices[0].year;
    }
    var n = Number(raw);
    return String(raw).length <= 2 ? (n >= 70 ? 1900 + n : 2000 + n) : n;
  }
  function validIsoDate(year, month, day) {
    var d = new Date(Date.UTC(year, month, day, 12));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) return '';
    return d.toISOString();
  }
  function dateFromText(text, published) {
    if (!text) return '';
    var value = String(text);
    var m = value.match(ISO_DATE_RE);
    if (m) return validIsoDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    NUMERIC_DATE_RE.lastIndex = 0;
    while ((m = NUMERIC_DATE_RE.exec(value))) {
      var numericMonth = Number(m[1]) - 1;
      var numericDate = validIsoDate(fullYear(m[3], published, numericMonth, Number(m[2])), numericMonth, Number(m[2]));
      if (numericDate) return numericDate;
    }
    WRITTEN_DATE_RE.lastIndex = 0;
    while ((m = WRITTEN_DATE_RE.exec(value))) {
      var wordMonth = MONTHS[m[1].slice(0, 3).toLowerCase()];
      var writtenDate = validIsoDate(fullYear(m[3], published, wordMonth, Number(m[2])), wordMonth, Number(m[2]));
      if (writtenDate) return writtenDate;
    }
    return '';
  }
  function messageDate(v, override) {
    var serviceDate = dateFromText(v.title || '', v.published) || dateFromText(v.description || '', v.published);
    if (override && override.date) serviceDate = dateFromText(override.date, v.published) || override.date;
    return serviceDate
      ? { date: serviceDate, kind: 'service' }
      : { date: v.published || '', kind: 'published' };
  }

  // ---- type classification (the hybrid sort) ----------------------
  function classify(v, s) {
    var raw = v.title || '';
    var hay = ((v.title || '') + ' ' + (v.description || '')).toLowerCase();
    // Promo Shorts / social clips: hashtag-laden titles or very short videos.
    // Kept out of the Messages / Music / Watch hubs.
    if ((raw.match(/#[\w]+/g) || []).length) return 'clip';
    var dur = v.duration != null ? Number(v.duration) : null;
    if (dur != null && dur > 0 && dur <= 75) return 'clip';
    // Highlight / promo reels (e.g. a "preaching reel") are montages, not a
    // single sermon or song — keep them out of the Messages / Music / Watch hubs.
    if (/\breels?\b/i.test(raw)) return 'clip';
    // A clearly dated service title stays in the service archive even when the
    // YouTube description names the preacher or Scripture. Those description
    // details previously made whole services look like individual sermons.
    var hasDate = /\b\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\b/.test(raw);
    var serviceTitle = /\b(midweek|sunday school|sunday|wednesday|worship|service|fairview)\b/i.test(raw);
    var eventTitle = /\b(prayer meeting|bluegrass night|summer kickoff|matthews family|revival)\b/i.test(raw);
    var gatewayService = /\bwelcome to fairview\b|@\s*fairview\b/i.test(raw);
    var welcomeDescription = /\bwelcome to (?:fairview|fairview baptist temple)\b/i.test(v.description || '');
    var rawHasMessageDetails = !!detectSpeaker(raw) || !!detectScripture(raw);
    if ((hasDate && serviceTitle) || gatewayService ||
        ((hasDate && eventTitle) && !rawHasMessageDetails) ||
        (welcomeDescription && !rawHasMessageDetails) || NOISE_RE.test(s.title)) return 'service';
    if (s.speaker || s.reference) return 'message';
    // A bare quoted phrase with no preacher/date is almost always a worship song.
    if (/^\s*["“][^"”]+["”]\s*$/.test(raw)) return 'music';
    var music = /#worshipmusic|\bworship music\b|\bmusic video\b|\bchoir\b|\bspecial music\b|#worship\b|\bsong\b|\bhymn sing\b/i;
    var svc = /\b(worship|midweek|sunday|wednesday|service|father'?s day|mother'?s day)\b/i;
    if (music.test(hay) && !svc.test(raw)) return 'music';
    if (svc.test(raw) || NOISE_RE.test(s.title)) return 'service';
    return 'message';
  }

  function categorize(v) {
    var raw = v.title || '';
    var t = cleanTitle(raw);
    var sc = detectScripture(raw) || detectScripture(v.description || '');
    var o = TAGS[v.id];
    var dated = messageDate(v, o);
    var s = {
      id: v.id,
      title: t,
      rawTitle: raw,
      speaker: detectSpeaker(raw),
      book: sc ? sc.book : '',
      reference: sc ? sc.reference : '',
      service: serviceType(raw),
      series: detectSeries(raw, t),
      topics: [],
      date: dated.date,
      dateKind: dated.kind,
      published: v.published || '',
      thumb: v.thumbnail || '',
      description: v.description || '',
      url: v.url || (v.id ? 'https://www.youtube.com/watch?v=' + v.id : ''),
    };
    if (o) {
      if (o.title) s.title = o.title;
      if (o.speaker) s.speaker = o.speaker;
      if (o.reference) { s.reference = o.reference; var sc2 = detectScripture(o.reference); s.book = (sc2 && sc2.book) || o.reference; }
      if (o.series) s.series = o.series;
      if (o.topics && o.topics.length) s.topics = o.topics;
      if (o.service) s.service = o.service;
      if (o.summary) s.summary = o.summary;
      if (o.notes) s.notes = o.notes;
      if (o.transcript) s.transcript = o.transcript;
    }
    s.type = (o && o.type) || v.playlistType || classify(v, s);
    if (isExcluded(v)) s.type = 'clip'; // owner override wins over everything
    if (!s.series) s.series = s.type === 'message' ? '' : s.service;
    return s;
  }

  // ---- shared helpers ---------------------------------------------
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nonEmpty(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }
  function fmtDate(iso, showWeekday) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var options = { month: 'long', day: 'numeric', year: 'numeric' };
    if (showWeekday) options.weekday = 'long';
    return d.toLocaleDateString('en-US', options);
  }
  function byDateDesc(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); }

  function card(s, badgeText, detailPage) {
    var meta = [s.speaker, s.reference].filter(nonEmpty).join(' &middot; ');
    // Full-res thumbnail, with a fallback to hqdefault for older videos that lack maxres.
    var img = nonEmpty(s.id)
      ? '<img class="thumb-img" loading="lazy" alt="" src="https://i.ytimg.com/vi/' + esc(s.id) + '/maxresdefault.jpg" onerror="this.onerror=null;this.src=\'https://i.ytimg.com/vi/' + esc(s.id) + '/hqdefault.jpg\'">'
      : '';
    var badge = badgeText || s.series || s.service;
    var href = detailPage && nonEmpty(s.id) ? '/message?v=' + encodeURIComponent(s.id) : s.url;
    var detailAttr = detailPage ? ' data-message-detail="true"' : '';
    return '' +
      '<a class="mc has-vid" href="' + esc(href) + '" data-vid="' + esc(s.id) + '" data-title="' + esc(s.title) + '"' + detailAttr + ' aria-label="' + (detailPage ? 'View message: ' : 'Play: ') + esc(s.title) + '">' +
        '<div class="th">' + img + '<span class="play" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="#FCF8EE"><path d="M8 5v14l11-7z"/></svg></span><span class="s">' + esc(badge) + '</span></div>' +
        '<div class="bd"><div class="dt">' + esc((s.dateKind === 'published' ? 'Published ' : '') + (fmtDate(s.date, s.showWeekday) || 'Video')) + '</div>' +
        '<h3>' + esc(s.title) + '</h3>' +
        '<div class="me">' + (meta || 'Fairview Baptist Temple') + '</div>' +
        '</div>' +
      '</a>';
  }

  function embed(player, s) {
    if (!player || !nonEmpty(s.id)) return;
    player.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(s.id) +
      '?rel=0" title="' + esc(s.title) + '" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
  }

  // ---- Messages hub (sermons only) --------------------------------
  function renderMessages(rows) {
    var grid = document.querySelector('[data-cms-sermons-grid]');
    if (!grid) return;
    var msgs = rows.filter(function (r) { return r.type === 'message'; }).sort(byDateDesc);
    var loadingEl = document.querySelector('[data-lib="loading"]');
    var emptyEl = document.querySelector('[data-lib="empty"]');
    if (loadingEl) loadingEl.hidden = true;
    if (!msgs.length) { if (!grid.children.length && emptyEl) emptyEl.hidden = false; return; }

    var fb = document.querySelector('[data-cms-sermons-featured]');
    if (fb) {
      var f = msgs[0];
      var t = fb.querySelector('[data-sf="title"]'); if (t) t.textContent = f.title;
      var m = fb.querySelector('[data-sf="meta"]'); if (m) m.textContent = [f.speaker, f.reference].filter(nonEmpty).join(' · ') || (fmtDate(f.date) || 'Fairview Baptist Temple');
      var l = fb.querySelector('[data-sf="link"]'); if (l && nonEmpty(f.id)) { l.setAttribute('href', '/message?v=' + encodeURIComponent(f.id)); l.removeAttribute('target'); l.removeAttribute('rel'); l.textContent = 'View message'; }
      var split = fb.closest('.split'); embed(split && split.querySelector('.player'), f);
    }

    var bar = document.querySelector('[data-cms-library]');
    if (!bar) { grid.innerHTML = msgs.map(function (s) { return card(s, '', true); }).join(''); return; }
    bar.hidden = false;

    function uniq(a) { var seen = {}, out = []; a.forEach(function (v) { if (nonEmpty(v) && !seen[v]) { seen[v] = 1; out.push(v); } }); return out; }
    function fill(name, values) {
      var sel = bar.querySelector('[data-lib="' + name + '"]'); if (!sel) return;
      values.forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
      sel.style.display = values.length ? '' : 'none';
    }
    fill('speaker', uniq(msgs.map(function (r) { return r.speaker; })).sort());
    fill('book', uniq(msgs.map(function (r) { return r.book; })).sort(function (a, b) { return bookIndex(a) - bookIndex(b); }));
    var topics = []; msgs.forEach(function (r) { (r.topics || []).forEach(function (t) { topics.push(t); }); });
    fill('topic', uniq(topics).sort());
    fill('series', uniq(msgs.map(function (r) { return r.series; })).sort());

    var countEl = document.querySelector('[data-lib="count"]');
    function val(n) { var el = bar.querySelector('[data-lib="' + n + '"]'); return el ? el.value : ''; }
    function renderList() {
      var q = (val('search') || '').toLowerCase(), sp = val('speaker'), bk = val('book'), tp = val('topic'), sr = val('series'), sort = val('sort') || 'newest';
      var list = msgs.filter(function (r) {
        if (sp && r.speaker !== sp) return false;
        if (bk && r.book !== bk) return false;
        if (sr && r.series !== sr) return false;
        if (tp && (r.topics || []).indexOf(tp) < 0) return false;
        if (q && (r.title + ' ' + r.reference + ' ' + r.speaker + ' ' + r.series).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      list.sort(function (a, b) {
        if (sort === 'speaker') return String(a.speaker || '~').localeCompare(b.speaker || '~');
        if (sort === 'book') return bookIndex(a.book) - bookIndex(b.book);
        return sort === 'oldest' ? String(a.date || '').localeCompare(b.date || '') : byDateDesc(a, b);
      });
      grid.innerHTML = list.map(function (s) { return card(s, s.series || s.book || 'Message', true); }).join('');
      if (countEl) { countEl.hidden = false; countEl.textContent = list.length + (list.length === 1 ? ' message' : ' messages'); }
      if (emptyEl) emptyEl.hidden = list.length > 0;
    }
    ['search', 'speaker', 'book', 'topic', 'series', 'sort'].forEach(function (n) { var el = bar.querySelector('[data-lib="' + n + '"]'); if (el) el.addEventListener('input', renderList); });
    var clr = bar.querySelector('[data-lib="clear"]');
    if (clr) clr.addEventListener('click', function () {
      ['search', 'speaker', 'book', 'topic', 'series'].forEach(function (n) { var el = bar.querySelector('[data-lib="' + n + '"]'); if (el) el.value = ''; });
      var s = bar.querySelector('[data-lib="sort"]'); if (s) s.value = 'newest';
      renderList();
    });
    renderList();
  }

  // ---- Music page -------------------------------------------------
  function renderMusic(rows) {
    var grid = document.querySelector('[data-fbt-music-grid]');
    if (!grid) return;
    var music = rows.filter(function (r) { return r.type === 'music' && !/\breels?\b/i.test(r.rawTitle || r.title || ''); }).sort(byDateDesc);
    var emptyEl = document.querySelector('[data-fbt-music-empty]');
    var fb = document.querySelector('[data-fbt-music-featured]');
    if (fb) {
      if (music.length) {
        fb.hidden = false;
        var t = fb.querySelector('[data-mf="title"]'); if (t) t.textContent = music[0].title;
        var d = fb.querySelector('[data-mf="meta"]'); if (d) d.textContent = fmtDate(music[0].date) || 'Fairview Baptist Temple';
        var l = fb.querySelector('[data-mf="link"]'); if (l) { l.setAttribute('href', music[0].url); }
        embed(fb.querySelector('.player'), music[0]);
      } else { fb.hidden = true; }
    }
    grid.innerHTML = music.map(function (s) { return card(s, s.series && s.series !== 'Worship' ? s.series : 'Music'); }).join('');
    if (emptyEl) emptyEl.hidden = music.length > 0;
    var countEl = document.querySelector('[data-fbt-music-count]');
    if (countEl && music.length) { countEl.hidden = false; countEl.textContent = music.length + (music.length === 1 ? ' video' : ' videos'); }
  }

  // ---- in-page player (lightbox) — shared, never links out -------
  var FBTPlayer = (function () {
    var el, frame, titleEl;
    function ensure() {
      if (el) return;
      el = document.createElement('div'); el.className = 'vlb'; el.hidden = true;
      el.innerHTML = '<div class="vlb-backdrop"></div><div class="vlb-dialog">' +
        '<button class="vlb-close" type="button" aria-label="Close">&times;</button>' +
        '<div class="vlb-frame"></div><div class="vlb-title"></div></div>';
      document.body.appendChild(el);
      frame = el.querySelector('.vlb-frame'); titleEl = el.querySelector('.vlb-title');
      el.querySelector('.vlb-backdrop').addEventListener('click', close);
      el.querySelector('.vlb-close').addEventListener('click', close);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    }
    function open(id, title) {
      if (!id) return; ensure();
      frame.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(id) +
        '?autoplay=1&rel=0" title="' + esc(title || 'Video') + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
      titleEl.textContent = title || ''; el.hidden = false; document.body.style.overflow = 'hidden';
    }
    function close() { if (!el) return; el.hidden = true; frame.innerHTML = ''; document.body.style.overflow = ''; }
    return { open: open, close: close };
  })();
  // delegated: any video card plays in-page
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('.mc.has-vid[data-vid]') : null;
    if (!a) return;
    if (a.hasAttribute('data-message-detail')) return;
    var id = a.getAttribute('data-vid'); if (!id) return;
    e.preventDefault();
    FBTPlayer.open(id, a.getAttribute('data-title') || '');
  });

  // ---- gather feeds (uploads + playlists), classify, cache --------
  function fetchFeed(url) {
    return fetch(url, { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && d.items) || []; })
      .catch(function () { return []; });
  }
  function gather() {
    // Live feed (freshest) + a static full-library snapshot (depth) + any playlists.
    var jobs = [
      { url: API, type: null },
      { url: (FEEDS.catalog || 'assets/catalog.json'), type: null },
    ];
    if (FEEDS.sermonsPlaylistId) jobs.push({ url: API + '?playlist=' + encodeURIComponent(FEEDS.sermonsPlaylistId), type: 'message' });
    if (FEEDS.musicPlaylistId) jobs.push({ url: API + '?playlist=' + encodeURIComponent(FEEDS.musicPlaylistId), type: 'music' });
    if (FEEDS.servicesPlaylistId) jobs.push({ url: API + '?playlist=' + encodeURIComponent(FEEDS.servicesPlaylistId), type: 'service' });
    return Promise.all(jobs.map(function (j) { return fetchFeed(j.url); })).then(function (results) {
      var map = {};
      results.forEach(function (items, i) {
        var ptype = jobs[i].type;
        items.forEach(function (v) {
          if (!v || !v.id) return;
          if (!map[v.id]) { map[v.id] = {}; for (var k0 in v) map[v.id][k0] = v[k0]; }
          else { for (var k in v) { if ((map[v.id][k] == null || map[v.id][k] === '') && v[k] != null && v[k] !== '') map[v.id][k] = v[k]; } }
          if (ptype) map[v.id].playlistType = ptype;
        });
      });
      return Object.keys(map).map(function (k) { return map[k]; });
    });
  }
  // Merge owner overrides saved in the studio (Supabase sermon_tags) into TAGS.
  function loadTags() {
    var B = window.FBT;
    if (!B || !B.SUPABASE_URL || !window.supabase) return Promise.resolve();
    try {
      var sb = B.getPublicClient ? B.getPublicClient() : window.supabase.createClient(B.SUPABASE_URL, B.SUPABASE_ANON_KEY);
      if (!sb) return Promise.resolve();
      return sb.from('sermon_tags').select('*').then(function (r) {
        if (r && !r.error && r.data) r.data.forEach(function (row) {
          var o = TAGS[row.video_id] || {};
          ['title', 'speaker', 'reference', 'series', 'type', 'service', 'summary', 'notes', 'transcript'].forEach(function (f) { if (nonEmpty(row[f])) o[f] = row[f]; });
          if (nonEmpty(row.preached_on)) o.date = row.preached_on;
          if (row.topics && row.topics.length) o.topics = row.topics;
          TAGS[row.video_id] = o;
        });
      }, function () {});
    } catch (e) { return Promise.resolve(); }
  }
  function load() {
    // Start each fresh load from the built-in baseline. This matters in Studio
    // when an owner clears a saved override: an older in-memory value must not
    // survive after the database field has been set back to null.
    TAGS = cloneTags(BASE_TAGS);
    var KEY = 'fbt_videos_v1';
    var fromCache = null;
    // Keep navigation fast without hiding a newly posted message for ten
    // minutes. A one-minute cache is enough to absorb quick tab changes while
    // letting a normal refresh pick up a fresh upload almost immediately.
    try { var c = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (c && c.t && (Date.now() - c.t) < 60000 && c.items) fromCache = c.items; } catch (e) {}
    var p = fromCache ? Promise.resolve(fromCache) : gather().then(function (items) { try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), items: items })); } catch (e) {} return items; });
    return Promise.all([p, loadTags()]).then(function (res) { return res[0].map(categorize); });
  }

  var _loaded;
  function loadOnce() { if (!_loaded) _loaded = load(); return _loaded; }
  function refresh() { _loaded = load(); return _loaded; }
  window.FBTPlayer = FBTPlayer;
  window.FBTVideos = { load: loadOnce, refresh: refresh, card: card, fmtDate: fmtDate };

  function run() {
    if (!(hasMessages || hasMusic)) return; // the Watch page is driven by live.js
    loadOnce().then(function (rows) {
      rows = rows || [];
      try { renderMessages(rows); } catch (e) {}
      try { renderMusic(rows); } catch (e) {}
    }).catch(function () { try { renderMessages([]); } catch (e) {} try { renderMusic([]); } catch (e) {} });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
