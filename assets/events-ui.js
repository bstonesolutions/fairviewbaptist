/* ============================================================
   Fairview Baptist Temple — events hub renderer.
   events.html : featured event + upcoming cards + a summary list + past events.
   event.html  : full event page (register, body, links, testimonial videos
                 that play in-page, and an add-to-calendar link).
   Reads window.FBT_EVENTS (assets/events.js); bodies load from
   events/<slug>.html. Uses window.FBTPlayer (videos.js) for in-page video.
   ============================================================ */
(function () {
  var EVENTS = (window.FBT_EVENTS || []).slice();
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // Parse a date. IMPORTANT: return null for a missing value — new Date(null)
  // and new Date(0) yield Jan 1 1970 (a valid date!), which made events with no
  // end time look ancient and sort into "past". Guard against falsy input.
  function D(s) { if (!s) return null; var d = new Date(s); return isNaN(d) ? null : d; }
  function sameDay(a, b) { return a && b && a.toDateString() === b.toDateString(); }
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function fmtTime(d) { var h = d.getHours(), m = d.getMinutes(), ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12; return h + (m ? ':' + pad(m) : '') + ap; }
  function fmtWhen(ev) {
    var s = D(ev.start), e = ev.end ? D(ev.end) : null;
    if (ev.recurring) return ev.recurring + (s && !ev.allDay ? ' · ' + fmtTime(s) : '');
    if (!s) return '';
    if (e && !sameDay(s, e)) {
      var sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
      return MON[s.getMonth()] + ' ' + s.getDate() + (sameMonth ? '' : ', ' + s.getFullYear()) + ' to ' + (sameMonth ? '' : MON[e.getMonth()] + ' ') + e.getDate() + ', ' + e.getFullYear();
    }
    var base = WD[s.getDay()] + ', ' + MON[s.getMonth()] + ' ' + s.getDate() + ', ' + s.getFullYear();
    if (ev.allDay) return base;
    return base + ' · ' + fmtTime(s) + (e ? ' to ' + fmtTime(e) : '');
  }
  function endOf(ev) { return D(ev.end) || D(ev.start); }
  function gcal(ev) {
    var s = D(ev.start); if (!s) return '';
    var e = D(ev.end) || new Date(s.getTime() + 90 * 60000);
    function z(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'; }
    function ymd(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
    var dates = ev.allDay ? (ymd(s) + '/' + ymd(e)) : (z(s) + '/' + z(e));
    return 'https://www.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.title) +
      '&dates=' + dates + '&location=' + encodeURIComponent(ev.address || ev.location || '') +
      '&details=' + encodeURIComponent(ev.summary || '');
  }
  function bySlug(slug) { return EVENTS.filter(function (e) { return e.slug === slug; })[0]; }

  function coverHtml(ev) {
    var img = ev.cover ? '<img class="thumb-img" loading="lazy" alt="" src="' + esc(ev.cover) + '">' : '';
    return '<div class="ev-cover">' + img + (ev.category ? '<span class="s">' + esc(ev.category) + '</span>' : '') + '</div>';
  }
  function dateChip(ev) {
    var s = D(ev.start); if (!s) return '<div class="ev-chip"><span class="m">TBA</span></div>';
    return '<div class="ev-chip"><span class="m">' + MON[s.getMonth()].slice(0, 3) + '</span><span class="d">' + s.getDate() + '</span></div>';
  }

  // ---------- hub (events.html) ----------
  function renderHub() {
    var host = document.querySelector('[data-events]');
    if (!host) return;
    // Compare by DAY, not exact timestamp: an event stays "upcoming" through the
    // whole day it happens (so a Sunday service doesn't drop off at 10:31am), and
    // this absorbs timezone shifts in how the start time was stored. An event is
    // only "past" once its day is fully behind us.
    var startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    var upcoming = EVENTS.filter(function (e) { return e.recurring || (endOf(e) && endOf(e) >= startOfToday); })
      .sort(function (a, b) { return String(a.start).localeCompare(b.start); });
    var past = EVENTS.filter(function (e) { return !e.recurring && endOf(e) && endOf(e) < startOfToday; })
      .sort(function (a, b) { return String(b.start).localeCompare(a.start); });
    var featured = upcoming.filter(function (e) { return e.featured; })[0] || upcoming[0];

    // featured
    var fEl = document.querySelector('[data-event-featured]');
    if (fEl && featured) {
      fEl.hidden = false;
      fEl.innerHTML =
        '<a class="ev-feature-media" href="/event?e=' + encodeURIComponent(featured.slug) + '">' + coverHtml(featured) + '</a>' +
        '<div class="ev-feature-body"><span class="kick">Next up</span>' +
        '<h2>' + esc(featured.title) + '</h2>' +
        '<div class="ev-when">' + esc(fmtWhen(featured)) + '</div>' +
        (featured.location ? '<div class="ev-where">' + esc(featured.location) + '</div>' : '') +
        '<p>' + esc(featured.summary || '') + '</p>' +
        '<div class="acts"><a class="btn btn-b" href="/event?e=' + encodeURIComponent(featured.slug) + '">Event details</a>' +
        (featured.register ? (featured.register.mode === 'form'
          ? '<a class="btn btn-o" href="/event?e=' + encodeURIComponent(featured.slug) + '#register">' + esc(featured.register.label || 'Register') + '</a>'
          : (featured.register.url ? '<a class="btn btn-o" href="' + esc(featured.register.url) + '"' + (/^https?:/.test(featured.register.url) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(featured.register.label || 'Register') + '</a>' : '')) : '') +
        '</div></div>';
    }

    // upcoming grid (excluding featured)
    var grid = document.querySelector('[data-events-upcoming]');
    var rest = upcoming.filter(function (e) { return e !== featured; });
    if (grid) {
      grid.innerHTML = rest.map(function (e) {
        return '<a class="ev-card" href="/event?e=' + encodeURIComponent(e.slug) + '">' + coverHtml(e) +
          '<div class="ev-card-body"><div class="ev-when">' + esc(fmtWhen(e)) + '</div>' +
          '<h3>' + esc(e.title) + '</h3><p>' + esc(e.summary || '') + '</p>' +
          '<span class="pc-more">Details &rarr;</span></div></a>';
      }).join('');
      var ue = document.querySelector('[data-events-upcoming-empty]'); if (ue) ue.hidden = rest.length > 0;
    }

    // summary list
    var list = document.querySelector('[data-events-list]');
    if (list) {
      list.innerHTML = upcoming.map(function (e) {
        return '<a class="ev-row" href="/event?e=' + encodeURIComponent(e.slug) + '">' + dateChip(e) +
          '<div class="ev-row-main"><div class="ev-row-title">' + esc(e.title) + '</div>' +
          '<div class="ev-row-meta">' + esc(fmtWhen(e)) + (e.location ? ' · ' + esc(e.location) : '') + '</div></div>' +
          '<span class="ev-row-go" aria-hidden="true">&rarr;</span></a>';
      }).join('');
    }

    // past
    var pastWrap = document.querySelector('[data-events-past]');
    var pastGrid = document.querySelector('[data-events-past-grid]');
    if (pastGrid) {
      if (!past.length) { if (pastWrap) pastWrap.hidden = true; }
      else {
        if (pastWrap) pastWrap.hidden = false;
        pastGrid.innerHTML = past.slice(0, 6).map(function (e) {
          return '<a class="ev-card" href="/event?e=' + encodeURIComponent(e.slug) + '">' + coverHtml(e) +
            '<div class="ev-card-body"><div class="ev-when">' + esc(fmtWhen(e)) + '</div>' +
            '<h3>' + esc(e.title) + '</h3><p>' + esc(e.summary || '') + '</p>' +
            '<span class="pc-more">Look back &rarr;</span></div></a>';
        }).join('');
      }
    }
  }

  // ---------- single event (event.html) ----------
  function renderEvent() {
    var page = document.querySelector('[data-event-page]');
    if (!page) return;
    var slug = new URLSearchParams(location.search).get('e');
    var ev = bySlug(slug);
    function setText(sel, t) { var el = document.querySelector(sel); if (el) el.textContent = t; }
    if (!ev) { setText('[data-event-title]', 'Event not found'); var b0 = document.querySelector('[data-event-body]'); if (b0) b0.innerHTML = '<p class="lead">We could not find that event.</p><p>Head back to the events hub to see what is coming up.</p>'; return; }

    document.title = ev.title + ' | Fairview Baptist Temple';
    if (window.FBTSeo) {
      var evUrl = window.FBTSeo.DOMAIN + '/event?e=' + encodeURIComponent(ev.slug || '');
      var evImg = (ev.cover && /^https?:/.test(ev.cover)) ? ev.cover : (window.FBTSeo.DOMAIN + '/assets/og-image.jpg');
      var evDesc = ev.summary || ('Join us for ' + ev.title + ' at Fairview Baptist Temple in Clay, WV.');
      var evLd = {
        '@context': 'https://schema.org', '@type': 'Event', name: ev.title,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@type': 'Place', name: ev.location || 'Fairview Baptist Temple', address: eventAddress(ev.address, ev.location) },
        image: evImg, description: evDesc, url: evUrl,
        organizer: { '@type': 'Organization', name: 'Fairview Baptist Temple', url: window.FBTSeo.DOMAIN + '/' }
      };
      if (ev.start) evLd.startDate = ev.start;
      if (ev.end) evLd.endDate = ev.end;
      window.FBTSeo.setItem({ title: ev.title + ' | Fairview Baptist Temple', description: evDesc, image: evImg, url: evUrl, type: 'website', jsonld: evLd });
    }
    setText('[data-event-title]', ev.title);
    if (ev.category) setText('[data-event-cat]', ev.category);
    setText('[data-event-when]', fmtWhen(ev));
    if (ev.location) setText('[data-event-where]', ev.address || ev.location);
    // Hero banner background. Use the event's chosen HERO image if one was set;
    // otherwise leave the default brand gradient (from .phero .bg) rather than
    // stretching the cover/flyer behind the title. The cover is shown in full
    // lower down as the event's picture (see [data-event-photo]).
    if (ev.hero) {
      var cov = document.querySelector('[data-event-cover]');
      if (cov) {
        cov.style.backgroundImage =
          'radial-gradient(85% 80% at 80% 0%,rgba(23,126,121,.26),transparent 55%),' +
          'linear-gradient(180deg,rgba(10,38,46,.62) 0%,rgba(10,38,46,.72) 46%,rgba(10,38,46,.9) 100%),' +
          'url("' + ev.hero + '")';
        cov.style.backgroundSize = 'cover';
        cov.style.backgroundPosition = 'center';
      }
    }
    // The cover image = the event's picture. Show it in full (uncropped) at the
    // top of the details so it looks exactly like what the owner picked.
    if (ev.cover) {
      var photo = document.querySelector('[data-event-photo]');
      if (photo) { photo.hidden = false; photo.innerHTML = '<img loading="lazy" alt="' + esc(ev.title) + '" src="' + esc(ev.cover) + '">'; }
    }

    var reg = document.querySelector('[data-event-register]');
    var rc = ev.register || {};
    if (reg) {
      if (rc.mode === 'form') { reg.innerHTML = '<a class="btn btn-b" href="#register">' + esc(rc.label || 'Register') + '</a>'; renderRegForm(ev); }
      else if (rc.url) { reg.innerHTML = '<a class="btn btn-b" href="' + esc(rc.url) + '"' + (/^https?:/.test(rc.url) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(rc.label || 'Register') + '</a>'; }
    }

    // add to calendar + map
    var cal = document.querySelector('[data-event-cal]');
    if (cal) {
      var g = gcal(ev);
      var bits = [];
      if (g) bits.push('<a class="btn btn-o" href="' + g + '" target="_blank" rel="noopener">Add to calendar</a>');
      if (ev.address) bits.push('<a class="btn btn-o" href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(ev.address) + '" target="_blank" rel="noopener">Get directions</a>');
      cal.innerHTML = bits.join('');
    }

    // links
    var linksEl = document.querySelector('[data-event-links]');
    if (linksEl && ev.links && ev.links.length) {
      linksEl.hidden = false;
      linksEl.innerHTML = '<h2>Helpful links</h2><div class="ev-links">' + ev.links.map(function (l) {
        return '<a href="' + esc(l.url) + '"' + (/^https?:/.test(l.url) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(l.label) + '</a>';
      }).join('') + '</div>';
    }

    // testimonial / highlight videos (play in-page)
    var vidsEl = document.querySelector('[data-event-videos]');
    if (vidsEl && ev.videos && ev.videos.length) {
      vidsEl.hidden = false;
      vidsEl.innerHTML = '<h2>Highlights</h2><div class="ev-videos">' + ev.videos.map(function (id) {
        return '<a class="mc has-vid vthumb" href="https://www.youtube.com/watch?v=' + esc(id) + '" data-vid="' + esc(id) + '" data-title="' + esc(ev.title) + '" aria-label="Play highlight">' +
          '<div class="th"><img class="thumb-img" loading="lazy" alt="" src="https://i.ytimg.com/vi/' + esc(id) + '/maxresdefault.jpg" onerror="this.onerror=null;this.src=\'https://i.ytimg.com/vi/' + esc(id) + '/hqdefault.jpg\'">' +
          '<span class="play" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="#FCF8EE"><path d="M8 5v14l11-7z"/></svg></span></div></a>';
      }).join('') + '</div>';
    }

    // body — from the database row if present, else the static fragment file
    var body = document.querySelector('[data-event-body]');
    if (body) {
      if (ev.body != null && String(ev.body).trim()) { body.innerHTML = ev.body; }
      else {
        fetch('events/' + encodeURIComponent(ev.slug) + '.html')
          .then(function (r) { return r.ok ? r.text() : Promise.reject(); })
          .then(function (h) { body.innerHTML = h; })
          .catch(function () { body.innerHTML = '<p>' + esc(ev.summary || '') + '</p>'; });
      }
    }

    // If we arrived at (or a Register button linked to) #register, scroll to the
    // form. The section starts hidden and is only revealed once the event data
    // loads, so the browser's native hash-scroll fires too early and does nothing
    // — do it ourselves, once, after render, offset for the sticky header.
    scrollToRegister();
  }
  function eventAddress(address, locationName) {
    if (!address) {
      if (!locationName || /(?:Fairview|church|temple)/i.test(locationName)) {
        return { '@type': 'PostalAddress', streetAddress: '2294 Main Street', addressLocality: 'Clay', addressRegion: 'WV', postalCode: '25043', addressCountry: 'US' };
      }
      return undefined;
    }
    var match = String(address).match(/^\s*(.+?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i);
    if (match) {
      return { '@type': 'PostalAddress', streetAddress: match[1], addressLocality: match[2], addressRegion: match[3].toUpperCase(), postalCode: match[4], addressCountry: 'US' };
    }
    return { '@type': 'PostalAddress', streetAddress: String(address), addressCountry: 'US' };
  }
  function scrollToRegister() {
    if (location.hash !== '#register') return;
    var t = document.querySelector('[data-event-register-section]') || document.getElementById('register');
    if (!t || t.hidden) return;
    requestAnimationFrame(function () {
      var y = t.getBoundingClientRect().top + window.pageYOffset - 82;
      window.scrollTo({ top: y, behavior: 'smooth' });
    });
  }

  // ---------- in-page registration form ----------
  function renderRegForm(ev) {
    var sec = document.querySelector('[data-event-register-section]');
    if (!sec) return;
    sec.hidden = false;
    sec.innerHTML = '<div class="ev-register-card">' +
      '<h2>Register for this event</h2>' +
      '<p class="ev-reg-note">Fill this out and we will save your spot. We only use your info to follow up about this event.</p>' +
      '<form class="form ev-form">' +
        '<div class="frow two"><div><label>Your name</label><input name="name" required></div><div><label>Email</label><input type="email" name="email" required></div></div>' +
        '<div class="frow two"><div><label>Phone</label><input type="tel" name="phone"></div><div><label>How many coming?</label><input type="number" name="party" min="1" value="1"></div></div>' +
        '<div class="frow"><label>Comments or questions</label><textarea name="comments" placeholder="Anything you want us to know?"></textarea></div>' +
        '<input type="hidden" name="_subject" value="Event registration: ' + esc(ev.title) + '">' +
        '<input type="hidden" name="event" value="' + esc(ev.title) + '">' +
        '<button class="btn btn-b" type="submit">' + esc((ev.register && ev.register.label) || 'Register') + '</button>' +
        '<p class="ev-form-msg" role="status" hidden></p>' +
      '</form></div>';
    var form = sec.querySelector('form');
    form.addEventListener('submit', function (e) { e.preventDefault(); submitReg(ev, form); });
  }
  function submitReg(ev, form) {
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var cfg = window.FBT_EVENTS_CONFIG || {};
    var msg = form.querySelector('.ev-form-msg');
    var btn = form.querySelector('button[type=submit]');
    var label = (ev.register && ev.register.label) || 'Register';
    function val(n) { var el = form.querySelector('[name="' + n + '"]'); return el ? String(el.value || '').trim() : ''; }
    var name = val('name') || 'friend';
    function err(t) { msg.hidden = false; msg.className = 'ev-form-msg err'; msg.textContent = t; btn.disabled = false; btn.textContent = label; }
    function done() {
      var card = form.closest('.ev-register-card');
      card.innerHTML = '<div class="ev-thanks"><div class="ev-check">&#10003;</div><h3>You are registered!</h3><p>Thanks, ' + esc(name) + '. We will see you at ' + esc(ev.title) + '. We will reach out if we need anything.</p></div>';
    }
    var contact = cfg.contactEmail || '';
    btn.disabled = true; btn.textContent = 'Sending...';
    // Preferred: the church's own pipeline (Studio inbox + email), same as every
    // other form on the site. The RSVP shows up as an "RSVP" with the event name
    // and headcount attached.
    if (window.FBTForms && window.FBTForms.submit) {
      window.FBTForms.submit('rsvp', {
        name: val('name'), email: val('email'), phone: val('phone'),
        message: val('comments'),
        details: { event: ev.title, party: val('party') || '1' },
      }).then(function (res) {
        if (res && res.ok) done();
        else err('We could not save that just now. Please email ' + contact + ' and we will save your spot.');
      });
      return;
    }
    // Legacy fallback: a Formspree endpoint, if one was configured.
    if (!cfg.formEndpoint) { err('Registration is not connected yet. Please email ' + contact + ' and we will save your spot.'); return; }
    fetch(cfg.formEndpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw 0; done(); })
      .catch(function () { err('Something went wrong. Please try again, or email ' + contact + '.'); });
  }

  // ---------- load events: Supabase first (live edits), static file as fallback ----------
  function fromDb(r) {
    return {
      slug: r.slug, title: r.title, start: r.start_at, end: r.end_at, recurring: r.recurring,
      location: r.location, address: r.address, category: r.category, cover: r.cover,
      hero: r.hero || null,
      summary: r.summary, body: r.body, register: r.register || {}, links: r.links || [],
      videos: r.videos || [], featured: !!r.featured, status: r.status, updatedAt: r.updated_at
    };
  }
  function loadEvents(cb) {
    var B = window.FBT;
    if (!B || !B.SUPABASE_URL || !window.supabase) { cb(); return; }
    var done = false, fin = function () { if (!done) { done = true; cb(); } };
    try {
      var sb = B.getPublicClient ? B.getPublicClient() : window.supabase.createClient(B.SUPABASE_URL, B.SUPABASE_ANON_KEY);
      if (!sb) { fin(); return; }
      // Order by start_at (a real column the Studio writes). The events table has
      // no "sort" column — ordering by it made this query error and silently fall
      // back to the built-in sample events. renderHub() re-sorts anyway.
      sb.from('events').select('*').order('start_at', { ascending: true }).then(function (res) {
        var n = (res && res.data) ? res.data.length : 0;
        if (res && !res.error && n) {
          EVENTS = res.data.filter(function (r) { return r.status !== 'draft'; }).map(fromDb);
        }
        // Add ?debug to the events URL to see the exact result in a popup.
        if (/[?&]debug/.test(location.search)) {
          alert('Events load\nerror: ' + (res && res.error ? res.error.message : 'none') +
                '\nrows returned: ' + n +
                (n ? '\npublished (shown): ' + res.data.filter(function (r) { return r.status !== 'draft'; }).length : ''));
        }
        fin();
      }, function (err) {
        if (/[?&]debug/.test(location.search)) alert('Events load failed:\n' + (err && err.message ? err.message : err));
        fin();
      });
      setTimeout(fin, 4000); // never block the page on a slow network
    } catch (e) { fin(); }
  }
  function render() { try { renderHub(); } catch (e) {} try { renderEvent(); } catch (e) {} }
  function run() { loadEvents(render); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();

  // Any "Register" link that targets #register on this page: smooth-scroll with a
  // sticky-header offset instead of the browser's hard jump (which lands under the
  // header). Cross-page links (/event?e=…#register) navigate normally, then the
  // hash-scroll in renderEvent() takes over on arrival.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href$="#register"]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.charAt(0) !== '#') return; // let cross-page links navigate
    e.preventDefault();
    if (location.hash !== '#register') { try { history.pushState(null, '', '#register'); } catch (err) { location.hash = 'register'; } }
    scrollToRegister();
  });
})();
