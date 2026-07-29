/* ============================================================
   Fairview Baptist Temple — live content hydration.
   On page load, reads editable content from Supabase and applies it
   to elements tagged with data-cms-* attributes. If Supabase is not
   configured, the library failed to load, or a value is empty, the
   page keeps its built-in content. Nothing ever breaks.

   Attribute hooks (put on elements in the HTML):
     data-cms-text="key"   set textContent from a site_content value
     data-cms-rich="key"   like text, but *word* becomes <em>word</em>
     data-cms-href="key"   set the href of a link
     data-cms-bg="key"     use an uploaded photo as the hero background
     data-cms-img="key"    drop an uploaded photo into a photo slot
                           (optional data-cms-alt="..." for alt text)
     data-cms-visible="key" hide an optional card/profile when value is "hide"
   Sermons (Messages page):
     data-cms-sermons-grid        container whose cards are rebuilt
     data-cms-sermons-featured    featured block; children tagged:
        data-sf="title" | data-sf="meta" | data-sf="link"
   ============================================================ */
(function () {
  var cfg = window.FBT;
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return; // not configured yet
  if (!window.supabase || !window.supabase.createClient) return;   // library unavailable

  var sb = cfg.getPublicClient ? cfg.getPublicClient() : window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  if (!sb) return;
  var mediaStyles = window.FBTMediaStyles || null;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function rich(s) {
    return esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }
  function nonEmpty(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }
  function displayValue(key, value) {
    var s = String(value == null ? '' : value).trim();
    if (key === 'contact_city' && /^clay$/i.test(s)) return 'Clay, WV 25043';
    if (/^time_/.test(key)) {
      s = s.replace(/^wednesdays?\s*/i, '').trim();
      var m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(a|p|am|pm)$/i);
      if (m) return m[1] + ':' + (m[2] || '00') + (m[3].charAt(0).toLowerCase() === 'a' ? 'am' : 'pm');
    }
    return s;
  }
  function phoneDisplay(value) {
    var digits = String(value == null ? '' : value).replace(/\D/g, '');
    if (digits.length === 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
    return String(value == null ? '' : value).trim();
  }
  function reveal(el) {
    if (!el) return;
    el.hidden = false;
    var wrap = el.closest('[data-cms-reveal]');
    if (wrap) wrap.hidden = false;
    var mediaWrap = el.closest('[data-cms-media-wrap]');
    if (mediaWrap) mediaWrap.classList.add('has-cms-media');
  }

  function savedMediaStyle(map, key, kind) {
    if (!mediaStyles || !key) return null;
    var styleKey = mediaStyles.styleKey(key);
    return styleKey ? mediaStyles.parse(map[styleKey], kind) : null;
  }

  function clearMediaAppearance(el) {
    if (!el) return;
    el.classList.remove('cms-media-styled', 'cms-overlay-managed', 'cms-source-background');
    [
      '--cms-fit', '--cms-x-d', '--cms-y-d', '--cms-zoom-d',
      '--cms-x-m', '--cms-y-m', '--cms-zoom-m', '--cms-image-opacity'
    ].forEach(function (name) { el.style.removeProperty(name); });
    el.style.removeProperty('background');
  }

  function applyMediaAppearance(el, style, kind) {
    if (!el || !style || !mediaStyles) return;
    var normalized = mediaStyles.normalize(style, kind);
    var backdrop = mediaStyles.backgroundValue(normalized, kind);
    clearMediaAppearance(el);
    el.classList.add('cms-media-styled', 'cms-overlay-managed');
    if (normalized.source === 'background') el.classList.add('cms-source-background');
    el.style.setProperty('--cms-fit', normalized.fit);
    el.style.setProperty('--cms-x-d', normalized.desktop.x + '%');
    el.style.setProperty('--cms-y-d', normalized.desktop.y + '%');
    el.style.setProperty('--cms-zoom-d', String(normalized.desktop.zoom / 100));
    el.style.setProperty('--cms-x-m', normalized.mobile.x + '%');
    el.style.setProperty('--cms-y-m', normalized.mobile.y + '%');
    el.style.setProperty('--cms-zoom-m', String(normalized.mobile.zoom / 100));
    el.style.setProperty('--cms-image-opacity', String(normalized.imageOpacity / 100));
    if (backdrop) el.style.background = backdrop;
  }

  function appendMediaOverlay(el, style, kind, className) {
    if (!el || !style || !mediaStyles) return;
    var overlay = document.createElement('span');
    overlay.className = className;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.background = mediaStyles.overlayValue(style, kind);
    el.appendChild(overlay);
  }

  function makeDecorativeImage(url, className) {
    var img = document.createElement('img');
    img.className = className;
    img.src = String(url);
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.decoding = 'async';
    return img;
  }

  // ---------- site style: owner-picked fonts and colors ----------
  var HEAD_FONTS = {
    oswald: { css: 'family=Oswald:wght@500;600;700', fam: '"Oswald",sans-serif', wt: '700' },
    archivo: { css: 'family=Archivo+Black', fam: '"Archivo Black",sans-serif', wt: '400' },
    bebas: { css: 'family=Bebas+Neue', fam: '"Bebas Neue",sans-serif', wt: '400' }
  };
  var SCRIPT_FONTS = {
    greatvibes: { css: 'family=Great+Vibes', fam: '"Great Vibes",cursive' },
    dancing: { css: 'family=Dancing+Script:wght@600;700', fam: '"Dancing Script",cursive' },
    allura: { css: 'family=Allura', fam: '"Allura",cursive' }
  };
  function loadFontCss(query) {
    if (!query) return;
    var id = 'fbt-font-' + query.replace(/\W+/g, '');
    if (document.getElementById(id)) return;
    var link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?' + query + '&display=swap';
    document.head.appendChild(link);
  }
  function hexOk(v) { return /^#[0-9a-fA-F]{6}$/.test(String(v || '').trim()); }
  function shade(hex, factor) {
    var n = parseInt(String(hex).slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * factor), g = Math.round(((n >> 8) & 255) * factor), b = Math.round((n & 255) * factor);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function applySiteStyle(map) {
    if (!map) return;
    var root = document.documentElement.style;
    var hf = HEAD_FONTS[String(map.style_heading_font || '').trim().toLowerCase()];
    if (hf) { loadFontCss(hf.css); root.setProperty('--font-display', hf.fam); root.setProperty('--font-display-wt', hf.wt); }
    var sf = SCRIPT_FONTS[String(map.style_script_font || '').trim().toLowerCase()];
    if (sf) { loadFontCss(sf.css); root.setProperty('--font-script', sf.fam); }
    var accent = String(map.style_accent_color || '').trim();
    if (hexOk(accent)) {
      root.setProperty('--brand', accent); root.setProperty('--teal', accent);
      root.setProperty('--accent', accent); root.setProperty('--accent2', accent);
      root.setProperty('--brand2', shade(accent, 0.85));
    }
    var heading = String(map.style_heading_color || '').trim();
    if (hexOk(heading)) root.setProperty('--navy', heading);
  }
  // Text colors picked in the Studio media designer. Any bound text element
  // honors a companion <key>_color row; rich headings also honor
  // <key minus _heading>_accent_color for their <em> words. Inline styles so
  // they win over both the light default and photo mode.
  function applyHeroColors(map) {
    function hex(key) {
      var v = String(map[key] || '').trim();
      return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '';
    }
    document.querySelectorAll('[data-cms-rich],[data-cms-text]').forEach(function (el) {
      var key = el.getAttribute('data-cms-rich') || el.getAttribute('data-cms-text');
      var c = hex(key + '_color');
      if (c) el.style.color = c;
      if (el.hasAttribute('data-cms-rich')) {
        var accent = hex(key.replace(/_heading$/, '_accent') + '_color');
        if (accent) el.querySelectorAll('em').forEach(function (em) { em.style.color = accent; });
      }
    });
  }

  window.FBTSiteStyle = applySiteStyle;

  function applyContent(map) {
    applySiteStyle(map);
    // optional cards and profiles. With no saved setting they keep their
    // built-in visibility; Studio writes "show" or "hide" explicitly.
    document.querySelectorAll('[data-cms-visible]').forEach(function (el) {
      var v = map[el.getAttribute('data-cms-visible')];
      if (!nonEmpty(v)) return;
      el.hidden = /^(hide|hidden|false|0|no)$/i.test(String(v).trim());
    });
    // text
    document.querySelectorAll('[data-cms-text]').forEach(function (el) {
      var key = el.getAttribute('data-cms-text');
      var v = map[key];
      if (nonEmpty(v)) {
        el.textContent = displayValue(key, v);
        if (el.hasAttribute('data-cms-specific') && /^staff$/i.test(el.textContent.trim())) el.hidden = true;
        else reveal(el);
      }
    });
    // rich text (accent word via *asterisks*)
    document.querySelectorAll('[data-cms-rich]').forEach(function (el) {
      var v = map[el.getAttribute('data-cms-rich')];
      if (nonEmpty(v)) { el.innerHTML = rich(v); reveal(el); }
    });
    // links
    document.querySelectorAll('[data-cms-href]').forEach(function (el) {
      var v = map[el.getAttribute('data-cms-href')];
      if (nonEmpty(v)) { el.setAttribute('href', v); if (el.hasAttribute('data-cms-optional')) reveal(el); }
      else if (el.hasAttribute('data-cms-optional')) el.hidden = true;
    });
    // Optional sections can name several settings and stay out of the page
    // until at least one real destination has been configured.
    document.querySelectorAll('[data-cms-any]').forEach(function (el) {
      var keys = String(el.getAttribute('data-cms-any') || '').split(',');
      var ready = keys.some(function (key) { return nonEmpty(map[key.trim()]); });
      if (ready) reveal(el); else el.hidden = true;
    });
    // phone links: update both the visible number and the tel: target
    document.querySelectorAll('[data-cms-tel]').forEach(function (el) {
      var v = map[el.getAttribute('data-cms-tel')];
      if (nonEmpty(v)) { el.textContent = phoneDisplay(v); el.setAttribute('href', 'tel:' + String(v).replace(/[^0-9+]/g, '')); }
    });
    // email links: update both the visible address and the mailto: target
    document.querySelectorAll('[data-cms-mailto]').forEach(function (el) {
      var v = map[el.getAttribute('data-cms-mailto')];
      if (nonEmpty(v)) { el.textContent = v; el.setAttribute('href', 'mailto:' + v); }
    });
    // hero background: a video wins if set (hero_vid_*), else the photo.
    // A dark overlay keeps the hero text legible either way.
    document.querySelectorAll('[data-cms-bg]').forEach(function (el) {
      applyBackground(el, el.getAttribute('data-cms-bg'), map);
    });
    // photo slots. An optional slot can start hidden (hidden attribute, and/or
    // an ancestor tagged data-cms-reveal) so nothing shows until a photo is set;
    // when one is, we drop the image in AND reveal it.
    document.querySelectorAll('[data-cms-img]').forEach(function (el) {
      var mediaKey = el.getAttribute('data-cms-img');
      var v = map[mediaKey];
      var altKey = el.getAttribute('data-cms-alt-key');
      var alt = (altKey && nonEmpty(map[altKey])) ? displayValue(altKey, map[altKey]) : (el.getAttribute('data-cms-alt') || '');
      var current = Array.prototype.filter.call(el.children, function (child) { return child.tagName === 'IMG'; })[0] || null;
      if (nonEmpty(v)) {
        if (!current || current.getAttribute('src') !== String(v)) {
          current = document.createElement('img');
          current.loading = 'lazy';
          current.decoding = 'async';
          current.src = String(v);
          el.innerHTML = '';
          el.appendChild(current);
        }
        reveal(el);
      }
      if (current && alt) current.setAttribute('alt', alt);
      var photoStyle = savedMediaStyle(map, mediaKey, 'photo');
      var builtIn = Array.prototype.filter.call(el.children, function (child) {
        return child.classList && child.classList.contains('staff-collage-grid');
      })[0] || null;
      if (photoStyle && (current || builtIn || photoStyle.source === 'background')) {
        Array.prototype.slice.call(el.querySelectorAll('.cms-media-overlay')).forEach(function (node) { node.remove(); });
        applyMediaAppearance(el, photoStyle, 'photo');
        appendMediaOverlay(el, photoStyle, 'photo', 'cms-media-overlay');
        if (current || builtIn || photoStyle.source === 'background') reveal(el);
      }
    });
    // Other baked-in images (for example the staff collage) can follow an
    // edited staff name without replacing the photo itself.
    document.querySelectorAll('img[data-cms-alt-key]').forEach(function (img) {
      var key = img.getAttribute('data-cms-alt-key');
      if (nonEmpty(map[key])) img.setAttribute('alt', displayValue(key, map[key]));
    });
    // If every optional item inside a section is hidden, hide the heading and
    // empty section too instead of leaving a blank shell behind.
    document.querySelectorAll('[data-cms-hide-when-empty]').forEach(function (wrap) {
      var selector = wrap.getAttribute('data-cms-hide-when-empty');
      var items = selector ? wrap.querySelectorAll(selector) : [];
      if (items.length) wrap.hidden = Array.prototype.every.call(items, function (item) { return item.hidden; });
    });
    applyHeroColors(map);
    applyPersonSchema();
  }

  function applyPersonSchema() {
    var script = document.getElementById('staff-person-schema');
    if (!script) return;
    var people = [];
    document.querySelectorAll('[data-cms-person]').forEach(function (card) {
      if (card.hidden) return;
      var nameEl = card.querySelector('[data-person-name]');
      var roleEl = card.querySelector('[data-person-role]');
      var name = nameEl ? nameEl.textContent.trim() : '';
      var role = roleEl ? roleEl.textContent.trim() : '';
      if (!name) return;
      var person = {
        '@type': 'Person',
        name: name,
        worksFor: { '@id': 'https://fairviewbaptisttemple.com/#church' },
        url: 'https://fairviewbaptisttemple.com/staff'
      };
      // "Staff" is a generic placeholder, not a real job title. Keep the
      // person discoverable without publishing that value as search metadata.
      if (role && !/^staff$/i.test(role)) person.jobTitle = role;
      people.push(person);
    });
    script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': people });
  }

  function applyBackground(el, key, map) {
    if (!el || !key || !map) return;
    var vid = key.indexOf('hero_bg_') === 0 ? map[key.replace('hero_bg_', 'hero_vid_')] : null;
    var img = map[key];
    var style = savedMediaStyle(map, key, 'background');
    // A slot can name an older slot to inherit from until its own media is set
    // (the home H.O.P.E. band took over from the shared Get Involved photo).
    var alt = el.getAttribute('data-cms-bg-alt');
    if (alt && !nonEmpty(img) && !nonEmpty(vid) && !style) {
      el.removeAttribute('data-cms-bg-alt');
      return applyBackground(el, alt, map);
    }
    el.innerHTML = '';
    clearMediaAppearance(el);
    el.style.removeProperty('background-image');
    el.style.removeProperty('background-size');
    el.style.removeProperty('background-position');

    var source = style ? style.source : 'auto';
    var useVideo = source === 'video' ? nonEmpty(vid) : source === 'auto' && nonEmpty(vid);
    var useImage = source === 'image' ? nonEmpty(img) : source === 'auto' && !useVideo && nonEmpty(img);
    if (source === 'video' && !useVideo && nonEmpty(img)) useImage = true;
    if (style) applyMediaAppearance(el, style, 'background');

    if (source !== 'background' && useVideo) {
      var video = document.createElement('video');
      video.className = 'cms-bg-media cms-bg-video';
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('muted', '');
      if (nonEmpty(img)) video.poster = String(img);
      var videoSource = document.createElement('source');
      videoSource.src = String(vid);
      if (/\.mp4(?:$|[?#])/i.test(String(vid))) videoSource.type = 'video/mp4';
      video.appendChild(videoSource);
      el.appendChild(video);
    } else if (source !== 'background' && useImage) {
      el.appendChild(makeDecorativeImage(img, 'cms-bg-media cms-bg-image'));
    }

    if (style) {
      appendMediaOverlay(el, style, 'background', 'cms-bg-overlay');
    } else if (useVideo || useImage) {
      var legacyOverlay = document.createElement('span');
      legacyOverlay.className = 'cms-bg-overlay';
      legacyOverlay.setAttribute('aria-hidden', 'true');
      legacyOverlay.style.background = useVideo
        ? 'linear-gradient(165deg,rgba(10,38,46,.6),rgba(10,38,46,.88))'
        : 'linear-gradient(165deg,rgba(10,38,46,.74),rgba(10,38,46,.90))';
      el.appendChild(legacyOverlay);
    }

    // Heroes are light by default; a Studio photo/video (or a chosen media
    // background) arrives with a dark overlay, so flip the hero to light text.
    var heroHost = el.closest ? el.closest('.hero,.phero,[data-cms-photo-host]') : null;
    if (heroHost) heroHost.classList.toggle('has-cms-photo', !!(useVideo || useImage || (style && source === 'background')));
    if (heroHost) heroHost.classList.toggle('cms-no-text-shadow', String(map[key + '_shadow'] || '').trim() === 'none');
  }

  var contentMap = null;
  function applyStreamBackground(panel) {
    if (!contentMap) return;
    var el = document.querySelector('[data-cms-bg-panel]');
    if (!el) return;
    var keys = panel === 'music'
      ? ['hero_bg_music', 'hero_bg_live', 'hero_bg_messages']
      : panel === 'messages'
        ? ['hero_bg_messages', 'hero_bg_live']
        : ['hero_bg_live', 'hero_bg_messages'];
    var chosen = keys.filter(function (key) {
      return nonEmpty(contentMap[key]) ||
        nonEmpty(contentMap[key.replace('hero_bg_', 'hero_vid_')]) ||
        !!savedMediaStyle(contentMap, key, 'background');
    })[0] || keys[0];
    applyBackground(el, chosen, contentMap);
  }
  document.addEventListener('fbt:stream-panel', function (e) {
    applyStreamBackground(e && e.detail && e.detail.panel || 'live');
  });

  function sermonCard(s) {
    var meta = [s.speaker, s.reference].filter(nonEmpty).join(' · ');
    var date = nonEmpty(s.preached_on) ? formatDate(s.preached_on) : '';
    var thumb = nonEmpty(s.thumb_url)
      ? ' style="background-image:linear-gradient(150deg,rgba(29,106,147,.2),rgba(20,66,74,.5)),url(\'' + esc(s.thumb_url) + '\');background-size:cover;background-position:center;"'
      : '';
    var inner =
      '<div class="th"' + thumb + '><span class="s">' + esc(s.series || 'Message') + '</span></div>' +
      '<div class="bd"><div class="dt">' + esc(date || 'Message') + '</div>' +
      '<h3>' + esc(s.title || '') + '</h3>' +
      '<div class="me">' + esc(meta) + '</div></div>';
    if (nonEmpty(s.video_url)) {
      return '<a class="mc" href="' + esc(s.video_url) + '" target="_blank" rel="noopener">' + inner + '</a>';
    }
    return '<article class="mc">' + inner + '</article>';
  }

  function formatDate(d) {
    try {
      var parts = String(d).split('-'); // yyyy-mm-dd
      var dt = new Date(parts[0], parseInt(parts[1], 10) - 1, parts[2]);
      return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch (e) { return String(d); }
  }

  function applyFeatured(featured) {
    var fb = document.querySelector('[data-cms-sermons-featured]');
    if (!fb || !featured) return;
    var t = fb.querySelector('[data-sf="title"]'); if (t) t.textContent = featured.title || '';
    var m = fb.querySelector('[data-sf="meta"]');
    if (m) m.textContent = [featured.speaker, featured.reference].filter(nonEmpty).join(' · ');
    var l = fb.querySelector('[data-sf="link"]');
    if (l && nonEmpty(featured.video_url)) { l.setAttribute('href', featured.video_url); l.setAttribute('target', '_blank'); l.setAttribute('rel', 'noopener'); }
  }

  // ----- filterable sermon library (Messages page) -----
  var BOOKS = (window.FBT_SCHEMA && window.FBT_SCHEMA.books) || [];
  function uniq(arr) { var seen = {}, out = []; arr.forEach(function (v) { if (nonEmpty(v) && !seen[v]) { seen[v] = 1; out.push(v); } }); return out; }
  function bookIndex(b) { var i = BOOKS.indexOf(b); return i < 0 ? 999 : i; }

  function applyLibrary(rows) {
    var bar = document.querySelector('[data-cms-library]');
    var grid = document.querySelector('[data-cms-sermons-grid]');
    if (!bar || !grid) return false;
    bar.hidden = false;

    function fill(name, values) {
      var sel = bar.querySelector('[data-lib="' + name + '"]'); if (!sel) return;
      values.forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    }
    fill('speaker', uniq(rows.map(function (r) { return r.speaker; })).sort());
    fill('book', uniq(rows.map(function (r) { return r.book; })).sort(function (a, b) { return bookIndex(a) - bookIndex(b); }));
    var topics = []; rows.forEach(function (r) { (r.topics || []).forEach(function (t) { topics.push(t); }); });
    fill('topic', uniq(topics).sort());
    fill('series', uniq(rows.map(function (r) { return r.series; })).sort());

    var countEl = document.querySelector('[data-lib="count"]');
    var emptyEl = document.querySelector('[data-lib="empty"]');
    function val(n) { var el = bar.querySelector('[data-lib="' + n + '"]'); return el ? el.value : ''; }

    function render() {
      var q = (val('search') || '').toLowerCase(), sp = val('speaker'), bk = val('book'), tp = val('topic'), sr = val('series'), sort = val('sort') || 'newest';
      var list = rows.filter(function (r) {
        if (sp && r.speaker !== sp) return false;
        if (bk && r.book !== bk) return false;
        if (sr && r.series !== sr) return false;
        if (tp && (r.topics || []).indexOf(tp) < 0) return false;
        if (q && String(r.title || '').toLowerCase().indexOf(q) < 0 && String(r.reference || '').toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      list.sort(function (a, b) {
        if (sort === 'speaker') return String(a.speaker || '').localeCompare(b.speaker || '');
        if (sort === 'book') return bookIndex(a.book) - bookIndex(b.book);
        var da = String(a.preached_on || ''), db = String(b.preached_on || '');
        return sort === 'oldest' ? da.localeCompare(db) : db.localeCompare(da);
      });
      grid.innerHTML = list.map(sermonCard).join('');
      if (countEl) { countEl.hidden = false; countEl.textContent = list.length + (list.length === 1 ? ' message' : ' messages'); }
      if (emptyEl) emptyEl.hidden = list.length > 0;
    }

    ['search', 'speaker', 'book', 'topic', 'series', 'sort'].forEach(function (n) {
      var el = bar.querySelector('[data-lib="' + n + '"]'); if (el) el.addEventListener('input', render);
    });
    var clr = bar.querySelector('[data-lib="clear"]');
    if (clr) clr.addEventListener('click', function () {
      ['search', 'speaker', 'book', 'topic', 'series'].forEach(function (n) { var el = bar.querySelector('[data-lib="' + n + '"]'); if (el) el.value = ''; });
      var s = bar.querySelector('[data-lib="sort"]'); if (s) s.value = 'newest';
      render();
    });
    render();
    return true;
  }

  function applySermons(rows) {
    if (!rows || !rows.length) return; // let the YouTube-backed library handle the empty state
    var loading = document.querySelector('[data-lib="loading"]');
    if (loading) loading.hidden = true;
    var featured = rows.filter(function (r) { return r.featured; })[0] || rows[0];
    applyFeatured(featured);

    if (!applyLibrary(rows)) {
      var grid = document.querySelector('[data-cms-sermons-grid]');
      if (grid) { var rest = rows.filter(function (r) { return r !== featured; }); grid.innerHTML = (rest.length ? rest : rows).map(sermonCard).join(''); }
    }

    // recent replays on the Watch page
    var rep = document.querySelector('[data-cms-live-replays]');
    if (rep) { rep.innerHTML = rows.slice(0, 3).map(sermonCard).join(''); rep.hidden = false; }
  }

  // ----- live hub (Watch page) -----
  function applyLivePlayer(map, live) {
    var host = document.querySelector('[data-cms-live-player]');
    if (!host) return;
    var statusEl = document.querySelector('[data-cms-live-status]');
    if (live && live.is_live && nonEmpty(live.video_id)) {
      host.innerHTML = '<div class="player"><iframe src="https://www.youtube.com/embed/' + encodeURIComponent(live.video_id) +
        '?autoplay=1&rel=0" title="' + esc(live.title || 'Fairview live') + '" allow="autoplay; encrypted-media" allowfullscreen></iframe></div>';
      if (statusEl) { statusEl.hidden = false; statusEl.classList.add('on'); statusEl.innerHTML = '<span class="dot"></span> Live now' + (nonEmpty(live.title) ? ' &middot; ' + esc(live.title) : ''); }
      return;
    }
    // Not live: a channel ID from Studio Settings makes the embed show the live or most recent stream.
    var chan = map && map['live_channel_id'];
    if (nonEmpty(chan)) {
      host.innerHTML = '<div class="player"><iframe src="https://www.youtube.com/embed/live_stream?channel=' +
        encodeURIComponent(chan) + '" title="Fairview Baptist Temple live stream" allowfullscreen></iframe></div>';
    }
    // otherwise the branded fallback stays as-is
  }

  // ---- top nav + mobile sheet (driven by the studio's Pages and menu) ----
  // nav_config is a JSON array of { page, label, menu }. Absent/invalid → the
  // page keeps its built-in nav, so nothing breaks if it isn't set.
  function applyNav(map) {
    var raw = map.nav_config;
    if (!nonEmpty(raw)) return;
    var items; try { items = JSON.parse(raw); } catch (e) { return; }
    if (!Array.isArray(items) || !items.length) return;
    // Add newer permanent pages to older saved menu configurations without
    // forcing the owner to rebuild or resave the menu first.
    if (!items.some(function (item) { return item && item.page === 'next-steps.html'; })) {
      var connectAt = items.findIndex(function (item) {
        return item && ['events.html', 'blog.html', 'missions.html', 'get-involved.html', 'prayer.html'].indexOf(item.page) >= 0;
      });
      var nextStep = { page: 'next-steps.html', label: 'Next Steps', menu: true };
      if (connectAt >= 0) items.splice(connectAt, 0, nextStep); else items.push(nextStep);
    }
    var here = (location.pathname.split('/').pop() || 'index.html') || 'index.html';
    // Keep the hand-built Visit / Connect / About groups, but make Studio's
    // labels and show/hide choices apply to their exact page links.
    if (document.querySelector('.nav ul .has-menu')) {
      function pageHref(page) {
        var clean = String(page || '').replace(/^\/+/, '').replace(/\.html$/, '');
        return !clean || clean === 'index' ? '/' : '/' + clean;
      }
      function hrefPage(href) {
        var clean = String(href || '').split('#')[0].split('?')[0];
        return pageHref(clean);
      }
      var navRank = {};
      items.forEach(function (it, i) {
        if (it && it.page && navRank[pageHref(it.page)] == null) navRank[pageHref(it.page)] = i;
      });
      function reorderLinks(links) {
        var original = links.slice();
        return links.sort(function (a, b) {
          var ar = navRank[hrefPage(a.getAttribute('href'))];
          var br = navRank[hrefPage(b.getAttribute('href'))];
          ar = ar == null ? Number.MAX_SAFE_INTEGER : ar;
          br = br == null ? Number.MAX_SAFE_INTEGER : br;
          return ar - br || original.indexOf(a) - original.indexOf(b);
        });
      }
      var navRoots = [document.querySelector('.nav'), document.querySelector('.msheet')].filter(Boolean);
      items.forEach(function (it) {
        if (!it || !it.page || !it.label) return;
        var href = pageHref(it.page);
        navRoots.forEach(function (root) {
          Array.prototype.forEach.call(root.querySelectorAll('a'), function (a) {
            if (a.getAttribute('href') !== href) return;
            a.textContent = it.label;
            a.hidden = it.menu === false;
            var directLi = a.parentElement;
            if (directLi && directLi.tagName === 'LI' && directLi.parentElement && directLi.parentElement.matches('.nav > ul')) directLi.hidden = it.menu === false;
          });
        });
      });
      // Move the existing nodes rather than rebuilding them. This preserves
      // active states and the mobile menu's click-to-close handlers.
      Array.prototype.forEach.call(document.querySelectorAll('.nav ul .nav-dd'), function (menu) {
        var links = Array.prototype.filter.call(menu.children, function (child) { return child.tagName === 'A'; });
        reorderLinks(links).forEach(function (link) { menu.appendChild(link); });
      });
      var mobileMenu = document.querySelector('.msheet');
      if (mobileMenu) {
        Array.prototype.forEach.call(mobileMenu.querySelectorAll('.msh-h'), function (heading) {
          var links = [], cursor = heading.nextElementSibling;
          while (cursor && cursor.tagName === 'A' && cursor.classList.contains('msh-sub')) {
            links.push(cursor); cursor = cursor.nextElementSibling;
          }
          reorderLinks(links).forEach(function (link) { mobileMenu.insertBefore(link, cursor); });
          heading.hidden = !links.some(function (link) { return !link.hidden; });
        });
      }
      Array.prototype.forEach.call(document.querySelectorAll('.nav ul .has-menu'), function (li) {
        var visible = Array.prototype.some.call(li.querySelectorAll('.nav-dd a'), function (a) { return !a.hidden; });
        li.hidden = !visible;
      });
      return;
    }
    var ul = document.querySelector('.nav ul');
    if (ul) {
      var menu = items.filter(function (it) { return it && it.page && it.label && it.menu !== false; });
      if (menu.length) ul.innerHTML = menu.map(function (it) {
        return '<li><a href="' + esc(it.page) + '"' + (it.page === here ? ' class="active"' : '') + '>' + esc(it.label) + '</a></li>';
      }).join('');
    }
    var msh = document.querySelector('.msheet');
    if (msh) {
      var all = items.filter(function (it) { return it && it.page && it.label; });
      if (all.length) {
        var html = '<a href="/">Home</a>';
        html += all.map(function (it) { return '<a href="' + esc(it.page) + '">' + esc(it.label) + '</a>'; }).join('');
        html += '<a href="/visit" style="color:var(--accent);">Plan a visit</a>';
        msh.innerHTML = html;
      }
    }
  }

  // ---- fetch + coordinate ----
  var state = { map: null, live: undefined };
  function maybeLive() { if (state.map !== null && state.live !== undefined) { try { applyLivePlayer(state.map, state.live); } catch (e) {} } }

  sb.from('site_content').select('key,value').then(function (res) {
    var map = {};
    if (!res.error && res.data) res.data.forEach(function (row) { map[row.key] = row.value; });
    contentMap = map;
    try { applyContent(map); } catch (e) { /* never block the page */ }
    try { applyStreamBackground(location.hash.slice(1) || 'live'); } catch (e) { /* never block the page */ }
    try { applyNav(map); } catch (e) { /* never block the page */ }
    state.map = map; maybeLive();
  });

  sb.from('sermons').select('*').order('featured', { ascending: false })
    .order('sort', { ascending: true }).order('preached_on', { ascending: false })
    .then(function (res) {
      if (res.error || !res.data) return;
      try { applySermons(res.data); } catch (e) { /* ignore */ }
    });

  if (document.querySelector('[data-cms-live-player]')) {
    sb.from('live_status').select('*').eq('id', 'youtube').limit(1).then(function (res) {
      state.live = (!res.error && res.data && res.data[0]) ? res.data[0] : null;
      maybeLive();
    });
  } else {
    state.live = null;
  }
})();
