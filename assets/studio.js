/* ============================================================
   Fairview Baptist Temple - Studio (login + Events manager). Phase 1.
   Logs in with a Supabase magic link (no password). Reads/writes the
   `events` table; saves go live on the public events hub instantly.
   Only allow-listed emails (config.js OWNER_EMAILS, enforced by RLS)
   can actually save; others see a notice and writes are blocked.
   ============================================================ */
(function () {
  var B = window.FBT || {};
  var $ = function (id) { return document.getElementById(id); };
  var loadingV = $('loading');
  if (!window.supabase || !B.SUPABASE_URL || !B.SUPABASE_ANON_KEY) {
    loadingV.innerHTML = '<p style="color:#FFF8EA;max-width:420px;text-align:center">Studio isn\'t configured yet. Add your Supabase URL and key in assets/config.js.</p>';
    return;
  }
  var sb = window.supabase.createClient(B.SUPABASE_URL, B.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  var owners = (B.OWNER_EMAILS || []).map(function (s) { return String(s).toLowerCase(); });
  var bucket = B.MEDIA_BUCKET || 'fbt-media';
  var studioSidebar = document.getElementById('studio-sidebar');
  var studioNavToggle = $('studio-nav-toggle');
  var studioNavScrim = $('studio-nav-scrim');
  var studioMain = $('studio-main');
  var studioViewName = $('studio-view-name');
  var studioMobileQuery = window.matchMedia ? window.matchMedia('(max-width: 820px)') : null;

  function studioIsMobile() { return studioMobileQuery ? studioMobileQuery.matches : window.innerWidth <= 820; }
  function studioFocus(el) {
    if (!el || !el.focus) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }
  function setStudioMenu(open, focusTarget) {
    if (!studioSidebar || !studioNavToggle || !studioNavScrim) return;
    var mobile = studioIsMobile();
    open = !!open && mobile;
    if (!open && focusTarget) studioFocus(focusTarget);
    studioSidebar.classList.toggle('nav-open', open);
    studioNavToggle.classList.toggle('nav-open', open);
    studioNavScrim.classList.toggle('nav-open', open);
    studioNavToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    studioNavToggle.setAttribute('aria-label', open ? 'Close Studio menu' : 'Open Studio menu');
    if (mobile && !open) {
      studioSidebar.setAttribute('inert', '');
      studioSidebar.setAttribute('aria-hidden', 'true');
    } else {
      studioSidebar.removeAttribute('inert');
      studioSidebar.removeAttribute('aria-hidden');
    }
    if (open) {
      window.setTimeout(function () {
        var active = studioSidebar.querySelector('.snav[data-view].active');
        studioFocus(active || studioSidebar);
      }, 30);
    }
  }
  function syncStudioMenu() {
    if (studioIsMobile()) setStudioMenu(false);
    else {
      if (studioSidebar) { studioSidebar.classList.remove('nav-open'); studioSidebar.removeAttribute('inert'); studioSidebar.removeAttribute('aria-hidden'); }
      if (studioNavToggle) { studioNavToggle.classList.remove('nav-open'); studioNavToggle.setAttribute('aria-expanded', 'false'); studioNavToggle.setAttribute('aria-label', 'Open Studio menu'); }
      if (studioNavScrim) studioNavScrim.classList.remove('nav-open');
    }
  }
  if (studioNavToggle) studioNavToggle.addEventListener('click', function () { setStudioMenu(!studioSidebar.classList.contains('nav-open'), studioSidebar.classList.contains('nav-open') ? studioNavToggle : null); });
  if (studioNavScrim) studioNavScrim.addEventListener('click', function () { setStudioMenu(false, studioNavToggle); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && studioSidebar && studioSidebar.classList.contains('nav-open')) setStudioMenu(false, studioNavToggle); });
  if (studioMobileQuery) {
    if (studioMobileQuery.addEventListener) studioMobileQuery.addEventListener('change', syncStudioMenu);
    else if (studioMobileQuery.addListener) studioMobileQuery.addListener(syncStudioMenu);
  }
  syncStudioMenu();

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); }
  function ytid(s) { if (!s) return ''; var m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/); if (m) return m[1]; if (/^[A-Za-z0-9_-]{6,}$/.test(s)) return s; return ''; }
  function fmtDate(s) { if (!s) return 'No date'; var d = new Date(s); if (isNaN(d)) return s; return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  // Friendly hint appended to save-error alerts across the studio.
  function saveHint(m) {
    m = String(m || '');
    if (/row-level|policy/i.test(m)) return '\n\n(You may not be on the editor allow-list.)';
    if (/duplicate key.*slug|_slug_key/i.test(m)) return '\n\n(That web address / slug is already used, pick a different one.)';
    if (/duplicate key.*pkey/i.test(m)) return '\n\n(The database id counter is out of sync. Ask your website helper for the one-line fix SQL.)';
    return '';
  }
  var EDIT_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  var TRASH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';
  var CAL_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
  var DOC_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';
  var UP_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 15 6-6 6 6"/></svg>';
  var DOWN_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>';
  var LOCK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  var PIN_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';

  // ---------- auth ----------
  // If we're arriving from a "set/reset password" email, stay on the set-password
  // screen until the new password is saved (don't route straight into the app).
  var recovering = /type=recovery/.test(location.hash || '');
  var studioStarted = false;
  function show(v) {
    loadingV.hidden = true;
    var sp = $('setpw');
    // Never leave every screen hidden (a blank page); fall back to login.
    if (v === 'setpw' && !sp) v = 'login';
    if (v !== 'login' && v !== 'app' && v !== 'setpw') v = 'login';
    $('login').hidden = (v !== 'login');
    $('app').hidden = (v !== 'app');
    if (sp) sp.hidden = (v !== 'setpw');
  }
  function route(session) {
    var email = session && session.user && session.user.email;
    if (email) {
      $('who').textContent = email;
      var isOwner = !owners.length || owners.indexOf(email.toLowerCase()) >= 0;
      var no = $('notowner');
      if (!isOwner) { no.hidden = false; no.innerHTML = 'Heads up: <b>' + esc(email) + '</b> isn\'t on the editor list, so saving is blocked. Sign out and use ' + esc(owners.join(' or ')) + '.'; }
      else { no.hidden = true; }
      show('app');
      if (!studioStarted) {
        studioStarted = true;
        showView(initialStudioView());
      }
    } else { studioStarted = false; show('login'); }
  }
  sb.auth.getSession().then(function (r) { if (recovering) { show('setpw'); return; } route(r.data.session); });
  document.addEventListener('visibilitychange', function () {
    // Coming back to the tab: refresh the session quietly and make sure the
    // app is on screen; never bounce the view or the open editor.
    if (document.hidden || !studioStarted) return;
    sb.auth.getSession().then(function (r) {
      if (r && r.data && r.data.session) show('app');
    });
  });
  sb.auth.onAuthStateChange(function (_e, s) {
    if (_e === 'PASSWORD_RECOVERY') { recovering = true; show('setpw'); return; }
    if (recovering) return; // stay on set-password until the new one is saved
    // Token refreshes can momentarily report no session; treating that as a
    // sign-out restarted Studio on the dashboard and lost the editor's place.
    if (!s && _e !== 'SIGNED_OUT' && studioStarted) return;
    route(s);
  });

  // Sign in with email + password.
  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('login-email').value.trim();
    var password = $('login-password').value;
    var msg = $('login-msg');
    if (!email || !password) return;
    msg.className = 'studio-msg'; msg.textContent = 'Signing in…';
    sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      if (r.error) { msg.className = 'studio-msg err'; msg.textContent = r.error.message; }
      // success routes via onAuthStateChange
    });
  });

  // Set or reset the password: emails a secure link back to /studio, where the
  // set-password screen appears (handled by the PASSWORD_RECOVERY event above).
  $('forgot-link').addEventListener('click', function (e) {
    e.preventDefault();
    var email = $('login-email').value.trim(); var msg = $('login-msg');
    if (!email) { msg.className = 'studio-msg err'; msg.textContent = 'Enter your email above first, then tap this.'; return; }
    msg.className = 'studio-msg'; msg.textContent = 'Sending a link to set your password…';
    sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (r) {
      if (r.error) { msg.className = 'studio-msg err'; msg.textContent = r.error.message; }
      else { msg.className = 'studio-msg ok'; msg.textContent = 'Check your email for a link to set your password.'; }
    });
  });

  // Save the new password (on the set-password screen after clicking the email link).
  $('setpw-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = $('setpw-password').value; var msg = $('setpw-msg');
    if (!pw || pw.length < 8) { msg.className = 'studio-msg err'; msg.textContent = 'Use at least 8 characters.'; return; }
    msg.className = 'studio-msg'; msg.textContent = 'Saving…';
    sb.auth.updateUser({ password: pw }).then(function (r) {
      if (r.error) { msg.className = 'studio-msg err'; msg.textContent = r.error.message; return; }
      msg.className = 'studio-msg ok'; msg.textContent = 'Password saved. Signing you in…';
      recovering = false;
      try { history.replaceState(null, '', location.pathname); } catch (err) {}
      sb.auth.getSession().then(function (res) { route(res.data.session); });
    });
  });
  $('signout').addEventListener('click', function () { setStudioMenu(false, studioNavToggle); sb.auth.signOut().then(function () { route(null); }); });

  // ---------- events list ----------
  var events = [], editing = null;
  function byId(id) { return events.filter(function (e) { return String(e.id) === String(id); })[0]; }

  function loadEvents() {
    var rows = $('ev-rows');
    rows.innerHTML = '<div class="studio-empty">Loading events…</div>';
    sb.from('events').select('*').order('start_at', { ascending: true }).then(function (r) {
      if (r.error) { rows.innerHTML = '<div class="studio-empty">Couldn\'t load events: ' + esc(r.error.message) + '</div>'; return; }
      events = r.data || []; renderRows();
    });
  }
  function renderRows() {
    var rows = $('ev-rows');
    if (!events.length) { rows.innerHTML = '<div class="studio-empty">No events yet. Click <b>+ New event</b> to add your first.</div>'; return; }
    var now = Date.now();
    rows.innerHTML = events.map(function (e) {
      var when = e.recurring || fmtDate(e.start_at);
      var past = !e.recurring && e.end_at && new Date(e.end_at).getTime() < now;
      var pill = e.status === 'draft' ? '<span class="spill draft">Draft</span>'
        : e.featured ? '<span class="spill feat">Featured</span>'
          : past ? '<span class="spill past">Past</span>'
            : '<span class="spill live">Published</span>';
      var thumb = e.cover
        ? '<div class="srow-thumb" style="background-image:url(&quot;' + esc(e.cover) + '&quot;)"></div>'
        : '<div class="srow-thumb">' + CAL_SVG + '</div>';
      return '<div class="srow">' + thumb +
        '<div class="srow-main"><div class="srow-title">' + esc(e.title) + '</div><div class="srow-meta">' + esc(when) + (e.category ? ' · ' + esc(e.category) : '') + '</div></div>' +
        pill +
        '<button class="sicon" data-edit="' + esc(e.id) + '" aria-label="Edit ' + esc(e.title) + '">' + EDIT_SVG + '</button>' +
        '<button class="sicon" data-del="' + esc(e.id) + '" aria-label="Delete ' + esc(e.title) + '">' + TRASH_SVG + '</button>' +
        '</div>';
    }).join('');
  }
  $('ev-rows').addEventListener('click', function (e) {
    var ed = e.target.closest('[data-edit]'), dl = e.target.closest('[data-del]');
    if (ed) { var a = byId(ed.getAttribute('data-edit')); if (a) openEdit(a); }
    else if (dl) { var b = byId(dl.getAttribute('data-del')); if (b) delEvent(b); }
  });

  // ---------- edit form ----------
  function v(id) { return $(id).value; }
  function setV(id, val) { $(id).value = (val == null ? '' : val); }
  function setCoverPrev(url) { var p = $('f-cover-prev'); if (url) { p.style.backgroundImage = 'url("' + url + '")'; p.classList.add('has'); } else { p.style.backgroundImage = ''; p.classList.remove('has'); } }
  function setHeroPrev(url) { var p = $('f-hero-prev'); if (url) { p.style.backgroundImage = 'url("' + url + '")'; p.classList.add('has'); } else { p.style.backgroundImage = ''; p.classList.remove('has'); } }
  function toggleRegUrl() { $('f-reg-url-row').hidden = v('f-reg-mode') !== 'link'; }

  function openEdit(ev) {
    editing = ev || null;
    $('ev-edit-title').textContent = ev ? 'Edit event' : 'New event';
    setV('f-title', ev && ev.title); setV('f-slug', ev && ev.slug); setV('f-category', ev && ev.category);
    setV('f-status', (ev && ev.status) || 'published');
    setV('f-start', ev && ev.start_at); setV('f-end', ev && ev.end_at);
    setV('f-location', ev && ev.location); setV('f-recurring', ev && ev.recurring);
    setV('f-address', ev && ev.address); setV('f-summary', ev && ev.summary); setV('f-body', ev && ev.body);
    var reg = (ev && ev.register) || {};
    var mode = reg.mode === 'form' ? 'form' : (reg.url ? 'link' : '');
    setV('f-reg-mode', mode); setV('f-reg-label', reg.label); setV('f-reg-url', reg.url);
    toggleRegUrl();
    setV('f-links', ((ev && ev.links) || []).map(function (l) { return (l.label || '') + ' | ' + (l.url || ''); }).join('\n'));
    setV('f-videos', ((ev && ev.videos) || []).join('\n'));
    $('f-featured').checked = !!(ev && ev.featured);
    setV('f-cover', ev && ev.cover); setCoverPrev(ev && ev.cover); $('f-cover-msg').textContent = '';
    $('f-cover-file').value = '';
    setV('f-hero', ev && ev.hero); setHeroPrev(ev && ev.hero); $('f-hero-msg').textContent = '';
    $('f-hero-file').value = '';
    $('ev-list').hidden = true; $('ev-edit').hidden = false; window.scrollTo(0, 0);
  }
  function closeEdit() { $('ev-edit').hidden = true; $('ev-list').hidden = false; window.scrollTo(0, 0); }
  $('ev-new').addEventListener('click', function () { openEdit(null); });
  $('ev-back').addEventListener('click', closeEdit);
  $('ev-cancel').addEventListener('click', closeEdit);
  $('f-reg-mode').addEventListener('change', toggleRegUrl);
  $('f-cover').addEventListener('input', function () { setCoverPrev(v('f-cover')); });
  $('f-hero').addEventListener('input', function () { setHeroPrev(v('f-hero')); });

  function uploadImg(file, kind, done) {
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    var path = 'events/' + (slugify(v('f-title')) || 'event') + '-' + kind + '-' + Date.now() + '.' + ext;
    sb.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type }).then(function (r) {
      if (r.error) { done(null, r.error.message); return; }
      done(sb.storage.from(bucket).getPublicUrl(path).data.publicUrl);
    });
  }
  $('f-cover-file').addEventListener('change', function () {
    var file = this.files && this.files[0]; if (!file) return;
    var msg = $('f-cover-msg'); msg.textContent = 'Uploading…';
    uploadImg(file, 'cover', function (url, errMsg) {
      if (!url) { msg.textContent = 'Upload failed: ' + errMsg; return; }
      setV('f-cover', url); setCoverPrev(url); msg.textContent = 'Uploaded ✓';
    });
  });
  $('f-hero-file').addEventListener('change', function () {
    var file = this.files && this.files[0]; if (!file) return;
    var msg = $('f-hero-msg'); msg.textContent = 'Uploading…';
    uploadImg(file, 'hero', function (url, errMsg) {
      if (!url) { msg.textContent = 'Upload failed: ' + errMsg; return; }
      setV('f-hero', url); setHeroPrev(url); msg.textContent = 'Uploaded ✓';
    });
  });

  $('ev-save').addEventListener('click', saveEvent);
  function saveEvent() {
    var title = v('f-title').trim();
    if (!title) { $('f-title').focus(); $('f-cover-msg'); alert('Please add a title.'); return; }
    var slug = v('f-slug').trim() || slugify(title);
    var regMode = v('f-reg-mode'); var register = {};
    if (regMode === 'form') register = { mode: 'form', label: v('f-reg-label').trim() || 'Register' };
    else if (regMode === 'link') register = { url: v('f-reg-url').trim(), label: v('f-reg-label').trim() || 'Register' };
    var links = v('f-links').split('\n').map(function (li) {
      li = li.trim(); if (!li) return null; var p = li.split('|');
      return { label: (p[0] || '').trim(), url: (p[1] || '').trim() };
    }).filter(function (l) { return l && l.url; });
    var videos = v('f-videos').split('\n').map(function (li) { return ytid(li.trim()); }).filter(Boolean);
    var row = {
      slug: slug, title: title,
      start_at: v('f-start') || null, end_at: v('f-end') || null,
      recurring: v('f-recurring').trim() || null, location: v('f-location').trim() || null,
      address: v('f-address').trim() || null, category: v('f-category').trim() || null,
      cover: v('f-cover').trim() || null, hero: v('f-hero').trim() || null,
      summary: v('f-summary').trim() || null,
      body: v('f-body') || null, register: register, links: links, videos: videos,
      featured: $('f-featured').checked, status: v('f-status'), updated_at: new Date().toISOString()
    };
    var btn = $('ev-save'); btn.disabled = true; btn.textContent = 'Saving…';
    // Editing → UPDATE by id; new → INSERT. (See savePost: upsert-on-slug with an
    // explicit id can raise a duplicate primary-key error.)
    function writeRow(r) {
      return (editing && editing.id)
        ? sb.from('events').update(r).eq('id', editing.id).select()
        : sb.from('events').insert(r).select();
    }
    writeRow(row).then(function (r) {
      // If the one-time "hero" column hasn't been added yet, still save everything
      // else (so events never break), and tell the owner how to enable it.
      if (r.error && /hero/i.test(r.error.message || '')) {
        var noHero = Object.assign({}, row); delete noHero.hero;
        writeRow(noHero).then(function (r2) {
          btn.disabled = false; btn.textContent = 'Save event';
          if (r2.error) { alert('Couldn\'t save: ' + r2.error.message + saveHint(r2.error.message)); return; }
          closeEdit(); loadEvents();
          alert('Saved. To use a separate hero background image, run this one-time setup in Supabase (SQL editor):\n\nALTER TABLE public.events ADD COLUMN IF NOT EXISTS hero text;');
        });
        return;
      }
      btn.disabled = false; btn.textContent = 'Save event';
      if (r.error) { alert('Couldn\'t save: ' + r.error.message + saveHint(r.error.message)); return; }
      closeEdit(); loadEvents();
    });
  }

  function delEvent(ev) {
    if (!window.confirm('Delete “' + ev.title + '”? This can\'t be undone.')) return;
    sb.from('events').delete().eq('id', ev.id).then(function (r) {
      if (r.error) { alert('Couldn\'t delete: ' + r.error.message); return; }
      loadEvents();
    });
  }

  // ---------- view switching (Events / Blog / …) ----------
  var RETIRED_VIEWS = ['giving', 'prayers', 'bulletin', 'blog'];
  var pendingMediaSlot = '';
  var restoreScrollFor = '';
  function initialStudioView() {
    var h = (window.location.hash || '').replace(/^#/, '');
    var parts = h.split('/');
    var view = parts[0];
    if (view === 'media' && parts[1]) pendingMediaSlot = parts[1];
    if (view && document.getElementById('view-' + view) && RETIRED_VIEWS.indexOf(view) < 0) {
      // Refreshing should put the owner back at the same spot on the page too.
      try {
        var saved = JSON.parse(window.sessionStorage.getItem('fbt-studio-place') || 'null');
        if (saved && saved.view === view && saved.y > 0) {
          restoreScrollFor = view;
          var y = saved.y;
          window.setTimeout(function () { if (restoreScrollFor === view) window.scrollTo(0, y); }, 250);
          window.setTimeout(function () { if (restoreScrollFor === view) { window.scrollTo(0, y); restoreScrollFor = ''; } }, 900);
        }
      } catch (err) { /* ignore */ }
      return view;
    }
    return 'dashboard';
  }
  window.addEventListener('beforeunload', function () {
    try {
      var active = document.querySelector('.studio-side .snav.active[data-view]');
      window.sessionStorage.setItem('fbt-studio-place', JSON.stringify({
        view: active ? active.getAttribute('data-view') : 'dashboard',
        y: window.scrollY || 0
      }));
    } catch (err) { /* ignore */ }
  });
  function showView(view) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-view-pane]'), function (p) { p.hidden = (p.id !== 'view-' + view); });
    var activeButton = null;
    Array.prototype.forEach.call(document.querySelectorAll('.studio-side .snav[data-view]'), function (b) {
      var active = b.getAttribute('data-view') === view;
      b.classList.toggle('active', active);
      if (active) { b.setAttribute('aria-current', 'page'); activeButton = b; }
      else b.removeAttribute('aria-current');
    });
    if (studioViewName && activeButton) studioViewName.textContent = activeButton.getAttribute('data-view-label') || view;
    if (studioIsMobile()) setStudioMenu(false, studioMain);
    $('ev-edit').hidden = true; $('ev-list').hidden = false;
    $('bl-edit').hidden = true; $('bl-list').hidden = false;
    if (view === 'events') loadEvents();
    if (view === 'blog') loadPosts();
    if (view === 'settings') loadSettings();
    if (view === 'people') loadPeople();
    if (view === 'sermons') loadSermons();
    if (view === 'media') loadMedia();
    if (view === 'pages') loadPages();
    if (view === 'missions') loadMissions();
    if (view === 'dashboard') loadDashboard();
    if (view === 'inbox') loadInbox();
    if (view === 'giving') { loadGivingSubscriptions(); loadGivingHistory(); }
    if (view === 'prayers') loadPrayers();
    if (view === 'bulletin') loadBulletins();
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    // Keep the place on refresh: /studio#media reopens on Photos & media.
    try { window.history.replaceState(null, '', '#' + view); } catch (err) { /* ignore */ }
    if (view !== restoreScrollFor) restoreScrollFor = '';
  }
  Array.prototype.forEach.call(document.querySelectorAll('.studio-side .snav[data-view]'), function (b) {
    b.addEventListener('click', function () { showView(b.getAttribute('data-view')); });
  });

  // ---------- dashboard ----------
  var dashLoaded = false, dashLoading = false, dashLoadedAt = 0;
  var dashData = {
    submissions: [], prayers: [], events: [], content: [], missionaries: [], posts: [],
    gifts: [], subscriptions: [], givingLimited: false, subscriptionLimited: false, results: {}
  };
  // Sections retired for Fairview: flip to false to bring one back (with its
  // studio.html nav button and panels).
  var DASH_RETIRED = { giving: true, prayers: true, bulletin: true, blog: true
  };
  var DASH_ICONS = {
    inbox: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.5h13l3 6.5v6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 2 18v-6z"/></svg>',
    prayer: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z"/></svg>',
    event: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    bulletin: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    gift: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2v20M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    post: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>'
  };

  function dashSetLoading() {
    var button = $('dash-refresh');
    if (button) { button.disabled = true; button.classList.add('loading'); button.querySelector('span').textContent = 'Refreshing...'; }
    var sync = $('dash-sync'); if (sync) { sync.className = 'dash-sync'; sync.textContent = dashLoaded ? 'Refreshing the latest activity...' : 'Loading the latest Studio activity...'; }
    if (dashLoaded) return;
    $('dash-focus-grid').innerHTML = '<div class="dash-focus-card dash-skeleton">Loading</div><div class="dash-focus-card dash-skeleton">Loading</div><div class="dash-focus-card dash-skeleton">Loading</div><div class="dash-focus-card dash-skeleton">Loading</div>';
    $('dash-giving').innerHTML = '<div class="dash-empty dash-skeleton">Loading giving activity</div>';
    $('dash-health').innerHTML = '<div class="dash-empty dash-skeleton">Checking your content</div>';
    $('dash-activity').innerHTML = '<div class="dash-empty dash-skeleton">Loading recent activity</div>';
  }
  function dashSettled(promise) {
    return Promise.resolve(promise).then(function (data) { return { ok: true, data: data }; }, function (error) { return { ok: false, error: error }; });
  }
  function dashQuery(query) {
    return Promise.resolve(query).then(function (result) {
      if (result.error) throw result.error;
      return result.data || [];
    });
  }
  function dashApi(path, tokenPromise) {
    return tokenPromise.then(function (token) {
      var controller = window.AbortController ? new AbortController() : null;
      var timer = window.setTimeout(function () { if (controller) controller.abort(); }, 7000);
      return fetch(path, {
        headers: { Authorization: 'Bearer ' + token },
        signal: controller ? controller.signal : undefined
      }).then(function (response) {
        window.clearTimeout(timer);
        return response;
      }, function (error) {
        window.clearTimeout(timer);
        throw error;
      });
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'This information could not load.');
        return data;
      });
    });
  }
  function dashMonthKey(value) {
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date)) return '';
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).formatToParts(date);
      var year = '', month = '';
      parts.forEach(function (part) { if (part.type === 'year') year = part.value; if (part.type === 'month') month = part.value; });
      return year + '-' + month;
    } catch (e) { return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0'); }
  }
  function dashEasternDateParts(value) {
    var date = value instanceof Date ? value : new Date(value || Date.now());
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      var out = {};
      parts.forEach(function (part) { if (part.type === 'year' || part.type === 'month' || part.type === 'day') out[part.type] = parseInt(part.value, 10); });
      return out;
    } catch (e) { return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }; }
  }
  function dashSundayDate() {
    var p = dashEasternDateParts(new Date());
    var date = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
    date.setUTCDate(date.getUTCDate() + ((7 - date.getUTCDay()) % 7));
    return date.toISOString().slice(0, 10);
  }
  function dashDateOnlyLabel(value) {
    if (!value) return 'Date unavailable';
    var date = new Date(String(value).slice(0, 10) + 'T12:00:00');
    if (isNaN(date)) return String(value);
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function dashEventDate(value) {
    var date = new Date(value);
    if (isNaN(date)) return 'Date unavailable';
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' + date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function dashRelativeTime(value) {
    var date = new Date(value), now = Date.now();
    if (isNaN(date)) return '';
    var seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 172800) return 'Yesterday';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function dashPreview(value, length) {
    var clean = String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return clean.length > length ? clean.slice(0, length - 1).trim() + '…' : clean;
  }
  function dashNextEvent() {
    var now = Date.now();
    var dated = dashData.events.filter(function (item) {
      if (!item || item.status === 'draft' || !item.start_at) return false;
      var end = new Date(item.end_at || item.start_at).getTime();
      return !isNaN(end) && end >= now;
    }).sort(function (a, b) { return new Date(a.start_at).getTime() - new Date(b.start_at).getTime(); });
    if (dated[0]) return dated[0];
    return dashData.events.filter(function (item) { return item && item.status !== 'draft' && item.recurring; })[0] || null;
  }
  function dashBulletinInfo() {
    var target = dashSundayDate();
    var list = [];
    dashData.content.forEach(function (row) {
      if (row.key !== 'bulletins') return;
      try { list = JSON.parse(row.value || '[]') || []; } catch (e) { list = []; }
    });
    list.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var current = list.filter(function (item) { return String(item.date || '').slice(0, 10) === target; })[0] || null;
    return { target: target, current: current, latest: list[0] || null, list: list };
  }
  function dashFocusCard(view, icon, label, value, meta, tone) {
    return '<button class="dash-focus-card' + (tone ? ' ' + tone : '') + '" type="button" data-dash-view="' + esc(view) + '">' +
      '<span class="dash-focus-icon">' + icon + '</span><span class="dash-focus-label">' + esc(label) + '</span>' +
      '<strong class="dash-focus-value">' + esc(value) + '</strong><span class="dash-focus-meta">' + esc(meta) + '</span></button>';
  }
  function dashFocusError(icon, label) {
    return '<div class="dash-focus-card dash-focus-error warn"><span class="dash-focus-icon">' + icon + '</span><span class="dash-focus-label">' + esc(label) + '</span><strong class="dash-focus-value">Could not load</strong><span class="dash-focus-meta">Refresh to try this section again.</span></div>';
  }
  function dashHealthRow(view, title, detail, count, warning) {
    return '<button class="dash-health-row" type="button" data-dash-view="' + esc(view) + '"><span class="dash-health-dot' + (warning ? ' warn' : '') + '"></span>' +
      '<span class="dash-health-copy"><strong>' + esc(title) + '</strong><small>' + esc(detail) + '</small></span>' +
      '<span class="dash-row-count' + (warning ? ' warn' : '') + '">' + esc(count) + '</span></button>';
  }
  function dashRenderFocus() {
    var html = '', result = dashData.results;
    var newInbox = dashData.submissions.filter(function (item) { return !item.handled; }).length;
    var pendingPrayers = dashData.prayers.filter(function (item) { return !item.approved; }).length;
    if (result.submissions) html += dashFocusCard('inbox', DASH_ICONS.inbox, 'Inbox', newInbox ? (newInbox + (newInbox === 1 ? ' new message' : ' new messages')) : 'Inbox is clear', newInbox ? 'Open and mark each one handled.' : 'You are caught up.', newInbox ? 'warn' : 'good');
    else html += dashFocusError(DASH_ICONS.inbox, 'Inbox');
    if (!DASH_RETIRED.prayers) {
      if (result.prayers) html += dashFocusCard('prayers', DASH_ICONS.prayer, 'Prayer wall', pendingPrayers ? (pendingPrayers + ' awaiting review') : 'Nothing pending', pendingPrayers ? 'Approve, edit, or keep private.' : 'Every public request has been reviewed.', pendingPrayers ? 'warn' : 'good');
      else html += dashFocusError(DASH_ICONS.prayer, 'Prayer wall');
    }
    if (result.events) {
      var next = dashNextEvent();
      html += next
        ? dashFocusCard('events', DASH_ICONS.event, 'Next event', next.title || 'Untitled event', next.recurring && !next.start_at ? next.recurring : dashEventDate(next.start_at), 'good')
        : dashFocusCard('events', DASH_ICONS.event, 'Next event', 'No dated event', 'Add the next event when the details are ready.', 'warn');
    } else html += dashFocusError(DASH_ICONS.event, 'Next event');
    var bulletin = (!DASH_RETIRED.bulletin && result.content) ? dashBulletinInfo() : null;
    if (!DASH_RETIRED.bulletin) {
      if (bulletin) {
        html += bulletin.current
          ? dashFocusCard('bulletin', DASH_ICONS.bulletin, 'Sunday bulletin', 'Ready for Sunday', dashDateOnlyLabel(bulletin.target) + ' is posted.', 'good')
          : dashFocusCard('bulletin', DASH_ICONS.bulletin, 'Sunday bulletin', 'Upload needed', 'No bulletin is posted for ' + dashDateOnlyLabel(bulletin.target) + '.', 'warn');
      } else html += dashFocusError(DASH_ICONS.bulletin, 'Sunday bulletin');
    }
    $('dash-focus-grid').innerHTML = html;
    var attention = (result.submissions ? newInbox : 0) + (!DASH_RETIRED.prayers && result.prayers ? pendingPrayers : 0) + (bulletin && !bulletin.current ? 1 : 0);
    var badge = $('dashboard-badge'); if (badge) { badge.hidden = !attention; badge.textContent = attention > 99 ? '99+' : String(attention); }
  }
  function dashRenderGiving() {
    if (DASH_RETIRED.giving) return;
    var giftOk = dashData.results.giving, subOk = dashData.results.subscriptions;
    if (!giftOk && !subOk) { $('dash-giving').innerHTML = '<div class="dash-error">Square could not load right now. The rest of Studio is still available, and Refresh dashboard will try again.</div>'; return; }
    var monthKey = dashMonthKey(new Date());
    var monthGifts = giftOk ? dashData.gifts.filter(function (gift) { return dashMonthKey(gift.createdAt) === monthKey; }) : [];
    var net = monthGifts.reduce(function (total, gift) { return total + (parseInt(gift.netCents, 10) || 0); }, 0);
    var refunded = monthGifts.reduce(function (total, gift) { return total + (parseInt(gift.refundedCents, 10) || 0); }, 0);
    var active = subOk ? dashData.subscriptions.filter(function (item) { return item.status === 'ACTIVE'; }).length : 0;
    var review = subOk ? dashData.subscriptions.filter(function (item) { return ['PAUSED', 'DEACTIVATED', 'PENDING'].indexOf(item.status) >= 0; }).length : 0;
    var metrics = '<div class="dash-metrics">' +
      '<button class="dash-metric" type="button" data-dash-view="giving"><span>Net this month</span><strong>' + (giftOk ? esc(giftMoney(net)) : 'Unavailable') + '</strong><small>' + (giftOk ? (monthGifts.length + (monthGifts.length === 1 ? ' completed gift' : ' completed gifts')) : 'Square history did not load') + '</small></button>' +
      '<button class="dash-metric" type="button" data-dash-view="giving"><span>Active monthly</span><strong>' + (subOk ? active : 'Unavailable') + '</strong><small>' + (subOk ? 'Automatic monthly gifts' : 'Monthly giving did not load') + '</small></button>' +
      '<button class="dash-metric" type="button" data-dash-view="giving"><span>Refunded this month</span><strong>' + (giftOk ? esc(giftMoney(refunded)) : 'Unavailable') + '</strong><small>' + (giftOk ? (monthGifts.filter(function (gift) { return (parseInt(gift.refundedCents, 10) || 0) > 0; }).length + ' affected payments') : 'Square history did not load') + '</small></button>' +
      '<button class="dash-metric" type="button" data-dash-view="giving"><span>Monthly gifts to review</span><strong>' + (subOk ? review : 'Unavailable') + '</strong><small>' + (subOk ? (review ? 'Paused, pending, or deactivated' : 'No monthly gifts need review') : 'Monthly giving did not load') + '</small></button></div>';
    var partial = (!giftOk || !subOk);
    var note = '<div class="dash-panel-note' + (partial ? ' warn' : '') + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg><span>' +
      (partial ? 'One Square summary could not load. Available totals are still shown.' : 'Square stays the source of truth. These private totals are visible only to Studio owners.') + '</span></div>';
    $('dash-giving').innerHTML = metrics + note;
  }
  function dashRenderHealth() {
    var html = '', result = dashData.results;
    if (result.missionaries) {
      var published = dashData.missionaries.filter(function (item) { return item.status !== 'draft'; });
      var incomplete = published.filter(function (item) { return !item.photo || !item.bio || !item.prayer || (!item.location && !item.region); });
      var incompleteNames = incomplete.slice(0, 2).map(function (item) { return item.name || 'Unnamed profile'; }).join(', ');
      if (incomplete.length > 2) incompleteNames += ' and ' + (incomplete.length - 2) + ' more';
      html += dashHealthRow('missions', incomplete.length ? 'Missionary profiles missing key details' : 'Missionary profiles have their core details', incomplete.length ? incompleteNames : (published.length + ' published profiles checked'), incomplete.length || '✓', incomplete.length > 0);
      var cutoff = Date.now() - (180 * 86400000);
      var stale = published.filter(function (item) { var date = new Date(item.latest_update_date || ''); return !item.latest_update_date || isNaN(date) || date.getTime() < cutoff; });
      html += dashHealthRow('missions', stale.length ? 'Missionary updates to refresh' : 'Missionary updates are current', stale.length ? 'No dated update in the past six months.' : 'Every published profile has a recent update.', stale.length || '✓', stale.length > 0);
    } else {
      html += dashHealthRow('missions', 'Missionary profiles could not be checked', 'Refresh the dashboard to try again.', '?', true);
    }
    if (result.events) {
      var now = Date.now();
      var past = dashData.events.filter(function (item) {
        if (!item || item.status === 'draft' || item.recurring) return false;
        var date = new Date(item.end_at || item.start_at).getTime();
        return !isNaN(date) && date < now;
      });
      html += dashHealthRow('events', past.length ? 'Past events ready to review' : 'Event list is current', past.length ? 'Archive, update, or leave them published as needed.' : 'No past published events need attention.', past.length || '✓', past.length > 0);
    } else html += dashHealthRow('events', 'Events could not be checked', 'Refresh the dashboard to try again.', '?', true);
    if (result.events || result.posts) {
      var eventDrafts = result.events ? dashData.events.filter(function (item) { return item.status === 'draft'; }).length : 0;
      var postDrafts = (!DASH_RETIRED.blog && result.posts) ? dashData.posts.filter(function (item) { return item.status === 'draft'; }).length : 0;
      var drafts = eventDrafts + postDrafts;
      html += dashHealthRow(postDrafts ? 'blog' : 'events', drafts ? 'Draft content saved in Studio' : 'No unfinished drafts', drafts ? 'Drafts remain private until you publish them.' : 'Everything saved in Studio is published.', drafts || '✓', false);
    }
    $('dash-health').innerHTML = '<div class="dash-health-list">' + html + '</div>';
  }
  function dashActivityRow(item) {
    return '<button class="dash-activity-row" type="button" data-dash-view="' + esc(item.view) + '"><span class="dash-activity-icon">' + item.icon + '</span>' +
      '<span class="dash-activity-main"><strong>' + esc(item.title) + '</strong><small>' + esc(item.detail) + '</small></span><span class="dash-activity-time">' + esc(dashRelativeTime(item.date)) + '</span></button>';
  }
  function dashRenderActivity() {
    var items = [], result = dashData.results;
    if (!DASH_RETIRED.giving && result.giving) dashData.gifts.slice(0, 2).forEach(function (gift) {
      items.push({ view: 'giving', icon: DASH_ICONS.gift, date: gift.createdAt, title: (gift.name || 'A giver') + ' gave ' + giftMoney(gift.amountCents), detail: [gift.fund, gift.method].filter(Boolean).join(' · ') || 'Square payment' });
    });
    if (result.submissions) dashData.submissions.slice(0, 3).forEach(function (item) {
      var detail = item.email || item.phone || dashPreview(item.message, 70) || 'Website submission';
      items.push({ view: 'inbox', icon: DASH_ICONS.inbox, date: item.created_at, title: ibKind(item.kind) + ' from ' + (item.name || 'Someone'), detail: detail });
    });
    if (!DASH_RETIRED.prayers && result.prayers && dashData.prayers[0]) {
      var prayer = dashData.prayers[0];
      items.push({ view: 'prayers', icon: DASH_ICONS.prayer, date: prayer.created_at, title: 'Prayer request from ' + (prayer.name || 'Anonymous'), detail: dashPreview(prayer.request, 80) });
    }
    if (!DASH_RETIRED.blog && result.posts && dashData.posts[0]) {
      var post = dashData.posts.slice().sort(function (a, b) { return new Date(b.updated_at || b.date || 0) - new Date(a.updated_at || a.date || 0); })[0];
      items.push({ view: 'blog', icon: DASH_ICONS.post, date: post.updated_at || post.date, title: 'Blog post updated: ' + (post.title || 'Untitled post'), detail: post.status === 'draft' ? 'Saved as a private draft' : 'Published on the blog' });
    }
    items = items.filter(function (item) { return item.date && !isNaN(new Date(item.date)); }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 7);
    if (!items.length) { $('dash-activity').innerHTML = '<div class="dash-empty">No recent activity has been recorded yet.</div>'; return; }
    var sourceFailures = ['giving', 'submissions', 'prayers', 'posts'].filter(function (key) { return !result[key]; }).length;
    $('dash-activity').innerHTML = '<div class="dash-activity-list">' + items.map(dashActivityRow).join('') + '</div>' +
      (sourceFailures ? '<div class="dash-panel-note warn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg><span>Some recent activity could not load. The available items are shown.</span></div>' : '');
  }
  function dashRender() {
    dashRenderFocus(); dashRenderGiving(); dashRenderHealth(); dashRenderActivity();
    var result = dashData.results;
    var failures = Object.keys(result).filter(function (key) { return !result[key]; }).length;
    var sync = $('dash-sync');
    if (sync) {
      sync.className = 'dash-sync' + (failures ? ' partial' : '');
      sync.textContent = failures ? 'Updated with ' + failures + (failures === 1 ? ' section unavailable. Tap Refresh dashboard to retry.' : ' sections unavailable. Tap Refresh dashboard to retry.') : 'Everything updated at ' + new Date(dashLoadedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) + '.';
    }
    var button = $('dash-refresh');
    if (button) { button.disabled = false; button.classList.remove('loading'); button.querySelector('span').textContent = 'Refresh dashboard'; }
  }
  function loadDashboard(force) {
    if (dashLoading) return;
    if (!force && dashLoaded && Date.now() - dashLoadedAt < 60000) { dashRender(); return; }
    dashLoading = true; dashSetLoading();
    var tokenPromise = sb.auth.getSession().then(function (sessionResult) {
      var token = sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token;
      if (!token) throw new Error('Your Studio session expired. Sign in again.');
      return token;
    });
    var year = dashEasternDateParts(new Date()).year;
    Promise.all([
      dashSettled(dashQuery(sb.from('submissions').select('*').order('created_at', { ascending: false }).limit(250))),
      dashSettled(dashQuery(sb.from('prayers').select('*').order('created_at', { ascending: false }).limit(250))),
      dashSettled(dashQuery(sb.from('events').select('*').order('start_at', { ascending: true }))),
      dashSettled(dashQuery(sb.from('site_content').select('key,value,updated_at').in('key', ['bulletins']))),
      dashSettled(dashQuery(sb.from('missionaries').select('*').order('sort', { ascending: true }))),
      dashSettled(dashQuery(sb.from('posts').select('*').order('date', { ascending: false }).limit(100))),
      DASH_RETIRED.giving ? dashSettled(Promise.resolve({ gifts: [] })) : dashSettled(dashApi('/api/giving-history?year=' + encodeURIComponent(year), tokenPromise)),
      DASH_RETIRED.giving ? dashSettled(Promise.resolve({ subscriptions: [] })) : dashSettled(dashApi('/api/giving-subscriptions', tokenPromise))
    ]).then(function (results) {
      var keys = ['submissions', 'prayers', 'events', 'content', 'missionaries', 'posts', 'giving', 'subscriptions'];
      dashData.results = {};
      results.forEach(function (result, index) { dashData.results[keys[index]] = result.ok; });
      if (results[0].ok) { dashData.submissions = results[0].data; inbox = results[0].data.slice(); inboxBadge(); }
      if (results[1].ok) { dashData.prayers = results[1].data; prayers = results[1].data.slice(); prayersBadge(); }
      if (results[2].ok) { dashData.events = results[2].data; events = results[2].data.slice(); }
      if (results[3].ok) {
        dashData.content = results[3].data;
        var info = dashBulletinInfo(); bulletins = info.list.slice();
      }
      if (results[4].ok) { dashData.missionaries = results[4].data; miss = results[4].data.slice(); miReady = true; }
      if (results[5].ok) { dashData.posts = results[5].data; posts = results[5].data.slice(); }
      if (results[6].ok) {
        dashData.gifts = Array.isArray(results[6].data.gifts) ? results[6].data.gifts : [];
        dashData.givingLimited = results[6].data.limited === true;
        giving = dashData.gifts.slice(); givingYear = year;
      }
      if (results[7].ok) {
        dashData.subscriptions = Array.isArray(results[7].data.subscriptions) ? results[7].data.subscriptions : [];
        dashData.subscriptionLimited = results[7].data.limited === true;
        givingSubscriptions = dashData.subscriptions.slice(); givingSubscriptionsLoaded = true;
      }
      dashLoaded = true; dashLoadedAt = Date.now(); dashLoading = false; dashRender();
    }, function () {
      dashLoading = false;
      var button = $('dash-refresh'); if (button) { button.disabled = false; button.classList.remove('loading'); button.querySelector('span').textContent = 'Refresh dashboard'; }
      var sync = $('dash-sync'); if (sync) { sync.className = 'dash-sync partial'; sync.textContent = 'The dashboard could not refresh. The rest of Studio is still available.'; }
    });
  }
  if ($('view-dashboard')) $('view-dashboard').addEventListener('click', function (event) {
    var viewButton = event.target.closest('[data-dash-view]');
    if (viewButton) { showView(viewButton.getAttribute('data-dash-view')); return; }
    var action = event.target.closest('[data-dash-action]');
    if (!action) return;
    var name = action.getAttribute('data-dash-action');
    if (name === 'site-text') { showView('settings'); var sm = $('studio-main'); if (sm) sm.scrollTo ? sm.scrollTo(0, 0) : null; window.scrollTo(0, 0); }
    if (name === 'design') { showView('settings'); var fd = document.getElementById('fs-design'); if (fd) fd.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (name === 'new-event') { showView('events'); openEdit(null); }
    if (name === 'bulletin') { showView('bulletin'); if ($('blt-date')) $('blt-date').focus(); }
    if (name === 'new-post') { showView('blog'); openPostEdit(null); }
    if (name === 'new-missionary') { showView('missions'); openMiEdit(null); }
  });
  if ($('dash-refresh')) $('dash-refresh').addEventListener('click', function () { loadDashboard(true); });

  // ---------- inbox (form submissions from the website) ----------
  var inbox = [], inboxFilter = 'all';
  function ibCap(s) { s = String(s).replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); }
  function ibFmt(v) { return Array.isArray(v) ? v.join(', ') : (v && typeof v === 'object' ? JSON.stringify(v) : String(v)); }
  function ibKind(k) { return ({
    visit: 'Visit', contact: 'Message', prayer: 'Prayer', rsvp: 'RSVP', newsletter: 'Newsletter',
    next_step_follow_jesus: 'Follow Jesus', next_step_baptism: 'Baptism',
    next_step_membership: 'Membership', next_step_group: 'Find a group',
    next_step_serve: 'Serve', next_step_pastor: 'Talk to a pastor'
  })[k] || (k ? ibCap(k) : 'Message'); }
  function inboxBadge() {
    var n = inbox.filter(function (s) { return !s.handled; }).length;
    var b = $('inbox-badge'); if (b) { b.hidden = !n; b.textContent = n; }
  }
  function renderInbox() {
    var rows = $('inbox-rows'); if (!rows) return;
    inboxBadge();
    var list = inbox.filter(function (s) { return inboxFilter === 'all' || !s.handled; });
    var empty = $('inbox-empty'); if (empty) empty.hidden = list.length > 0;
    rows.innerHTML = list.map(function (s) {
      var det = s.details || {};
      var chips = Object.keys(det).filter(function (k) { return det[k] !== '' && det[k] != null; })
        .map(function (k) { return '<span class="ib-chip">' + esc(ibCap(k)) + ': ' + esc(ibFmt(det[k])) + '</span>'; }).join('');
      var contact = [s.email, s.phone].filter(Boolean).map(esc).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
      return '<div class="ib-item' + (s.handled ? ' done' : '') + '">' +
        '<div class="ib-top"><span class="ib-kind">' + esc(ibKind(s.kind)) + '</span>' +
        '<strong>' + esc(s.name || 'Someone') + '</strong>' +
        '<span class="ib-date">' + esc(fmtDate(s.created_at)) + '</span></div>' +
        (contact ? '<div class="ib-contact">' + contact + '</div>' : '') +
        (chips ? '<div class="ib-chips">' + chips + '</div>' : '') +
        (s.message ? '<div class="ib-msg">' + esc(s.message) + '</div>' : '') +
        '<div class="ib-acts">' +
        (s.email ? '<a class="btn btn-o" href="mailto:' + esc(s.email) + '">Reply</a>' : '') +
        '<button class="btn btn-o" data-ib-toggle="' + esc(s.id) + '">' + (s.handled ? 'Mark new' : 'Mark handled') + '</button>' +
        '<button class="btn btn-o" data-ib-del="' + esc(s.id) + '">Delete</button>' +
        '</div></div>';
    }).join('');
  }
  function loadInbox() {
    var rows = $('inbox-rows'); if (!rows) return;
    if (!inbox.length) rows.innerHTML = '<p class="muted" style="padding:20px;">Loading…</p>';
    sb.from('submissions').select('*').order('created_at', { ascending: false }).limit(500).then(function (r) {
      if (r.error) { rows.innerHTML = '<p class="muted" style="padding:20px;">Could not load messages yet. If this is the first time, create the <code>submissions</code> table (see CMS-SETUP.md).</p>'; return; }
      inbox = r.data || []; renderInbox();
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.inbox-tab'), function (b) {
    b.addEventListener('click', function () {
      inboxFilter = b.getAttribute('data-inbox');
      Array.prototype.forEach.call(document.querySelectorAll('.inbox-tab'), function (x) { x.classList.toggle('active', x === b); });
      renderInbox();
    });
  });
  (function () {
    var rows = $('inbox-rows'); if (!rows) return;
    rows.addEventListener('click', function (e) {
      var tg = e.target.closest('[data-ib-toggle]'), dl = e.target.closest('[data-ib-del]');
      if (tg) {
        var id = tg.getAttribute('data-ib-toggle'), row = inbox.filter(function (s) { return String(s.id) === String(id); })[0];
        if (!row) return; var nv = !row.handled;
        sb.from('submissions').update({ handled: nv }).eq('id', id).then(function (r) { if (!r.error) { row.handled = nv; renderInbox(); } });
      } else if (dl) {
        var id2 = dl.getAttribute('data-ib-del');
        if (!window.confirm('Delete this message? This cannot be undone.')) return;
        sb.from('submissions').delete().eq('id', id2).then(function (r) { if (!r.error) { inbox = inbox.filter(function (s) { return String(s.id) !== String(id2); }); renderInbox(); } });
      }
    });
  })();

  // ---------- giving history and monthly gifts (confirmed directly by Square) ----------
  var giving = [], givingYear = 0, givingSearch = '', activeGift = null, giftModalTrigger = null;
  var givingSubscriptions = [], givingSubscriptionsLoaded = false;
  var currentGivingYear = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric'
  }).format(new Date()), 10);
  function giftMoney(cents) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((parseInt(cents, 10) || 0) / 100);
  }
  function giftDate(value) {
    var d = new Date(value); if (isNaN(d)) return 'Date unavailable';
    return d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function giftDateOnly(value) {
    var d = new Date(value); if (isNaN(d)) return 'Date unavailable';
    return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
  }
  function giftTimeOnly(value) {
    var d = new Date(value); if (isNaN(d)) return '';
    return d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  }
  function giftStatus(value) {
    var labels = { COMPLETED: 'Completed', PENDING: 'Pending', APPROVED: 'Approved', CANCELED: 'Canceled', FAILED: 'Failed', REJECTED: 'Rejected' };
    value = String(value || '').toUpperCase();
    return labels[value] || (value ? value.charAt(0) + value.slice(1).toLowerCase() : 'Unavailable');
  }
  function giftApi(method, paymentId, body) {
    return sb.auth.getSession().then(function (sessionResult) {
      var token = sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token;
      if (!token) throw new Error('Your Studio session expired. Sign in again.');
      var options = { method: method, headers: { Authorization: 'Bearer ' + token } };
      var url = '/api/giving-payment';
      if (method === 'GET') url += '?paymentId=' + encodeURIComponent(paymentId);
      else {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body || {});
      }
      return fetch(url, options);
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Square could not manage this payment.');
        return data;
      });
    });
  }
  function giftActionMessage(message, type) {
    var element = $('gift-action-msg'); if (!element) return;
    element.textContent = message || '';
    element.className = 'studio-msg' + (type ? ' ' + type : '');
  }
  function giftDetailCell(label, value) {
    return '<div class="gift-detail-cell"><span>' + esc(label) + '</span><strong>' + esc(value || 'Unavailable') + '</strong></div>';
  }
  function giftRefundDate(value) {
    var d = new Date(value); if (isNaN(d)) return '';
    return d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function renderGiftModal() {
    if (!activeGift) return;
    var payment = activeGift;
    $('gift-modal-title').textContent = payment.name || 'Payment details';
    $('gift-modal-subtitle').textContent = (payment.email || 'Email unavailable') + ' | ' + giftDate(payment.createdAt);
    $('gift-detail-grid').innerHTML =
      giftDetailCell('Gift amount', giftMoney(payment.amountCents)) +
      giftDetailCell('Square fees', giftMoney(payment.feeCents)) +
      giftDetailCell('Actual net', giftMoney(payment.netCents)) +
      giftDetailCell('Toward', payment.fund || 'Square payment') +
      giftDetailCell('Payment method', payment.method || 'Square') +
      giftDetailCell('Status', giftStatus(payment.status)) +
      giftDetailCell('Refunded', giftMoney(payment.refundedCents)) +
      giftDetailCell('Receipt number', payment.receiptNumber || 'Unavailable') +
      giftDetailCell('Source', (payment.source || 'Square') + (payment.recurring ? ' monthly gift' : ''));
    var receipt = $('gift-detail-receipt');
    receipt.hidden = !payment.receiptUrl;
    if (payment.receiptUrl) receipt.href = payment.receiptUrl;
    var resend = $('gift-resend');
    resend.disabled = !payment.email;
    resend.title = payment.email ? '' : 'This payment does not have a receipt email.';

    var refunds = Array.isArray(payment.refunds) ? payment.refunds : [];
    $('gift-refund-empty').hidden = refunds.length > 0;
    $('gift-refund-rows').innerHTML = refunds.map(function (refund) {
      return '<div class="gift-refund-row"><div><strong>' + esc(giftMoney(refund.amountCents)) + '</strong><small>' + esc(refund.reason || 'No reason recorded') + (refund.createdAt ? (' | ' + esc(giftRefundDate(refund.createdAt))) : '') + '</small></div><span class="gift-refund-status">' + esc(giftStatus(refund.status)) + '</span></div>';
    }).join('');

    var form = $('gift-refund-form');
    var help = $('gift-refund-help');
    $('gift-refund-warning-text').textContent = payment.recurring
      ? "This refunds this charge only. The donor's monthly schedule will stay active unless you manage it separately."
      : 'This refunds the payment through Square. Review the amount and reason carefully before continuing.';
    var refundable = payment.refundable === true && (parseInt(payment.refundableCents, 10) || 0) > 0;
    form.hidden = !refundable;
    if (refundable) {
      help.textContent = 'Up to ' + giftMoney(payment.refundableCents) + ' remains refundable through Square.';
      $('gift-refund-amount').value = ((parseInt(payment.refundableCents, 10) || 0) / 100).toFixed(2);
      $('gift-refund-reason').value = '';
      $('gift-refund-confirm').value = '';
      $('gift-refund-submit').disabled = true;
    } else if ((parseInt(payment.refundableCents, 10) || 0) <= 0) {
      help.textContent = 'This payment has been fully refunded.';
    } else if (payment.pendingRefund) {
      help.textContent = 'A refund is still pending in Square. Wait for it to finish before issuing another.';
    } else {
      help.textContent = 'This payment is outside Square’s one-year refund window or cannot be refunded in its current status.';
    }
    $('gift-modal-loading').hidden = true;
    $('gift-modal-content').hidden = false;
  }
  function closeGiftModal() {
    $('gift-modal').hidden = true;
    document.body.classList.remove('gift-modal-open');
    activeGift = null;
    giftActionMessage('');
    if (giftModalTrigger && document.body.contains(giftModalTrigger)) giftModalTrigger.focus();
    giftModalTrigger = null;
  }
  function openGiftModal(paymentId, trigger) {
    giftModalTrigger = trigger || null;
    activeGift = null;
    $('gift-modal').hidden = false;
    document.body.classList.add('gift-modal-open');
    $('gift-modal-loading').hidden = false;
    $('gift-modal-loading').textContent = 'Loading current details from Square...';
    $('gift-modal-content').hidden = true;
    $('gift-modal-title').textContent = 'Payment details';
    $('gift-modal-subtitle').textContent = '';
    giftApi('GET', paymentId).then(function (data) {
      activeGift = data.payment;
      renderGiftModal();
      $('gift-modal-close').focus();
    }).catch(function (error) {
      $('gift-modal-loading').textContent = error.message || 'Payment details could not load.';
    });
  }
  function dollarsToCents(value) {
    var match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value || '').trim().replace(/^\$/, '').replace(/,/g, ''));
    if (!match) return 0;
    var cents = parseInt(match[1], 10) * 100 + parseInt((match[2] || '').padEnd(2, '0') || '0', 10);
    return Number.isSafeInteger(cents) ? cents : 0;
  }
  function updateRefundButtonState() {
    var button = $('gift-refund-submit');
    if (!button) return;
    var amount = dollarsToCents($('gift-refund-amount').value);
    var available = activeGift ? (parseInt(activeGift.refundableCents, 10) || 0) : 0;
    var reason = $('gift-refund-reason').value.trim();
    var confirmed = $('gift-refund-confirm').value === 'REFUND';
    button.disabled = !(activeGift && activeGift.refundable === true && amount > 0 && amount <= available && reason.length >= 3 && confirmed);
  }
  function giftDay(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return 'Date unavailable';
    var d = new Date(Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10), 12));
    return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
  }
  function giftSubMessage(message, type) {
    var element = $('gift-sub-msg'); if (!element) return;
    element.textContent = message || '';
    element.className = 'studio-msg' + (type ? ' ' + type : '');
  }
  function scheduledSubscriptionAction(subscription) {
    var actions = Array.isArray(subscription.actions) ? subscription.actions : [];
    var order = ['CANCEL', 'PAUSE', 'RESUME'];
    for (var i = 0; i < order.length; i += 1) {
      var action = actions.filter(function (item) { return item.type === order[i]; })[0];
      if (action) return action;
    }
    return null;
  }
  function subscriptionStatus(subscription, scheduled) {
    if (scheduled) {
      if (scheduled.type === 'CANCEL') return { label: 'Cancellation scheduled', style: 'scheduled' };
      if (scheduled.type === 'PAUSE') return { label: 'Pause scheduled', style: 'scheduled' };
      if (scheduled.type === 'RESUME') return { label: 'Resume scheduled', style: 'scheduled' };
    }
    var status = String(subscription.status || '').toUpperCase();
    var labels = { ACTIVE: 'Active', PAUSED: 'Paused', DEACTIVATED: 'Paused', PENDING: 'Pending', CANCELED: 'Canceled', COMPLETED: 'Completed' };
    return { label: labels[status] || 'Status unavailable', style: status.toLowerCase() || 'unknown' };
  }
  function subscriptionTiming(subscription, scheduled) {
    if (scheduled && scheduled.effectiveDate) {
      var verbs = { CANCEL: 'Stops after the current period on ', PAUSE: 'Pauses on ', RESUME: 'Resumes on ' };
      return (verbs[scheduled.type] || 'Changes on ') + giftDay(scheduled.effectiveDate);
    }
    if (subscription.canceledDate) return 'Ended ' + giftDay(subscription.canceledDate);
    if (subscription.paidUntilDate) return 'Paid through ' + giftDay(subscription.paidUntilDate);
    if (subscription.chargedThroughDate) return 'Current period through ' + giftDay(subscription.chargedThroughDate);
    if (subscription.startDate) return 'Started ' + giftDay(subscription.startDate);
    return 'Billing date unavailable';
  }
  function renderGivingSubscriptions() {
    var rows = $('gift-sub-rows'); if (!rows) return;
    var current = givingSubscriptions.filter(function (subscription) {
      return ['CANCELED', 'COMPLETED'].indexOf(String(subscription.status || '').toUpperCase()) < 0;
    }).length;
    $('gift-sub-count').textContent = String(current) + ' current';
    $('gift-sub-empty').hidden = givingSubscriptions.length > 0;
    rows.hidden = givingSubscriptions.length === 0;
    rows.innerHTML = givingSubscriptions.map(function (subscription) {
      var scheduled = scheduledSubscriptionAction(subscription);
      var status = subscriptionStatus(subscription, scheduled);
      var person = subscription.name || 'Name unavailable';
      var email = subscription.email ? '<a href="mailto:' + esc(subscription.email) + '">' + esc(subscription.email) + '</a>' : '<small>Email unavailable</small>';
      var hasAmount = (parseInt(subscription.amountCents, 10) || 0) > 0;
      var amount = hasAmount ? esc(giftMoney(subscription.amountCents)) : 'Amount unavailable';
      var amountNote = hasAmount ? 'per month' : 'Check Square';
      var actions = '';
      if (scheduled) {
        actions = '<button class="btn btn-o" type="button" data-sub-action="undo" data-sub-id="' + esc(subscription.id) + '" data-action-id="' + esc(scheduled.id) + '" data-action-type="' + esc(scheduled.type) + '">Undo scheduled ' + esc(scheduled.type.toLowerCase()) + '</button>';
      } else if (subscription.status === 'ACTIVE') {
        actions = '<button class="btn btn-o" type="button" data-sub-action="pause" data-sub-id="' + esc(subscription.id) + '">Pause</button>' +
          '<button class="btn gift-sub-cancel" type="button" data-sub-action="cancel" data-sub-id="' + esc(subscription.id) + '">Cancel monthly gift</button>';
      } else if (subscription.status === 'PAUSED' || subscription.status === 'DEACTIVATED') {
        actions = '<button class="btn btn-o" type="button" data-sub-action="resume" data-sub-id="' + esc(subscription.id) + '">Resume</button>' +
          '<button class="btn gift-sub-cancel" type="button" data-sub-action="cancel" data-sub-id="' + esc(subscription.id) + '">Cancel monthly gift</button>';
      }
      return '<div class="gift-sub-row">' +
        '<div class="gift-sub-main"><strong>' + esc(person) + '</strong>' + email + '<small>Started ' + esc(subscription.startDate ? giftDay(subscription.startDate) : 'date unavailable') + '</small></div>' +
        '<div class="gift-sub-amount"><strong>' + amount + '</strong><small>' + amountNote + '</small></div>' +
        '<div class="gift-sub-state"><span class="gift-sub-status ' + esc(status.style) + '">' + esc(status.label) + '</span><small>' + esc(subscriptionTiming(subscription, scheduled)) + '</small></div>' +
        (actions ? '<div class="gift-sub-actions">' + actions + '</div>' : '') +
        '</div>';
    }).join('');
  }
  function loadGivingSubscriptions(force, preserveMessage) {
    var rows = $('gift-sub-rows'); if (!rows) return Promise.resolve(false);
    if (!force && givingSubscriptionsLoaded) { renderGivingSubscriptions(); return Promise.resolve(true); }
    if (!preserveMessage) giftSubMessage('');
    rows.hidden = false;
    rows.innerHTML = '<div class="studio-empty">Loading monthly gifts…</div>';
    $('gift-sub-empty').hidden = true;
    return sb.auth.getSession().then(function (sessionResult) {
      var token = sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token;
      if (!token) throw new Error('Your Studio session expired. Sign in again.');
      return fetch('/api/giving-subscriptions', { headers: { Authorization: 'Bearer ' + token } });
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Monthly gifts could not load.');
        return data;
      });
    }).then(function (data) {
      givingSubscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];
      givingSubscriptionsLoaded = true;
      renderGivingSubscriptions();
      if (data.limited) giftSubMessage('Only the newest 1,000 monthly gifts are shown. Older subscriptions remain available in Square.');
      return true;
    }).catch(function (error) {
      givingSubscriptions = [];
      givingSubscriptionsLoaded = false;
      rows.hidden = false;
      rows.innerHTML = '<div class="studio-empty">' + esc(error.message || 'Monthly gifts could not load.') + '</div>';
      $('gift-sub-count').textContent = 'Unavailable';
      return false;
    });
  }
  function manageGivingSubscription(button) {
    var subscriptionId = button.getAttribute('data-sub-id');
    var action = button.getAttribute('data-sub-action');
    var subscription = givingSubscriptions.filter(function (item) { return item.id === subscriptionId; })[0];
    if (!subscription || !action) return;
    var person = subscription.name || 'this donor';
    var prompts = {
      pause: 'Pause ' + person + "'s monthly gift? Square will pause future charges at the end of the current billing period.",
      resume: 'Resume ' + person + "'s monthly gift? Square will restart automatic monthly charges.",
      cancel: 'Cancel ' + person + "'s monthly gift? Square will stop future charges at the end of the current billing period. This does not refund previous gifts.",
      undo: 'Undo the scheduled ' + String(button.getAttribute('data-action-type') || 'change').toLowerCase() + ' for ' + person + '?'
    };
    if (!window.confirm(prompts[action] || 'Make this change?')) return;
    button.disabled = true;
    giftSubMessage('Updating the monthly gift…');
    sb.auth.getSession().then(function (sessionResult) {
      var token = sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token;
      if (!token) throw new Error('Your Studio session expired. Sign in again.');
      return fetch('/api/giving-subscriptions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: subscriptionId,
          action: action,
          actionId: button.getAttribute('data-action-id') || ''
        })
      });
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'The monthly gift could not be updated.');
      });
    }).then(function () {
      givingSubscriptionsLoaded = false;
      return loadGivingSubscriptions(true, true);
    }).then(function (loaded) {
      if (loaded) giftSubMessage('Monthly gift updated in Square.', 'ok');
      else giftSubMessage('Square updated the monthly gift, but Studio could not refresh the list. Use Refresh to try again.', 'err');
    }).catch(function (error) {
      button.disabled = false;
      giftSubMessage(error.message || 'The monthly gift could not be updated.', 'err');
    });
  }
  function giftYears() {
    var select = $('gift-year'); if (!select || select.options.length) return;
    for (var year = currentGivingYear; year >= 2013; year -= 1) {
      var option = document.createElement('option'); option.value = String(year); option.textContent = String(year); select.appendChild(option);
    }
    select.value = String(currentGivingYear);
  }
  function renderGivingHistory() {
    var rows = $('gift-rows'); if (!rows) return;
    var q = givingSearch.toLowerCase();
    var list = giving.filter(function (gift) {
      if (!q) return true;
      return [gift.name, gift.email, gift.fund, gift.method, gift.source, gift.receiptNumber]
        .join(' ').toLowerCase().indexOf(q) >= 0;
    });
    var refunds = giving.reduce(function (total, gift) { return total + (parseInt(gift.refundedCents, 10) || 0); }, 0);
    var fees = giving.reduce(function (total, gift) { return total + (parseInt(gift.feeCents, 10) || 0); }, 0);
    var net = giving.reduce(function (total, gift) {
      if (Number.isFinite(parseInt(gift.netCents, 10))) return total + parseInt(gift.netCents, 10);
      return total + (parseInt(gift.amountCents, 10) || 0) - (parseInt(gift.refundedCents, 10) || 0) - (parseInt(gift.feeCents, 10) || 0);
    }, 0);
    $('gift-total').textContent = giftMoney(net);
    $('gift-count').textContent = String(giving.length);
    $('gift-fees').textContent = giftMoney(fees);
    $('gift-refunds').textContent = giftMoney(refunds);
    $('gift-export').disabled = !giving.length;
    $('gift-visible-count').textContent = String(list.length) + (list.length === 1 ? ' payment' : ' payments');
    $('gift-empty').hidden = list.length > 0;
    $('gift-empty').textContent = giving.length ? 'No gifts match this search.' : 'No completed Square gifts were found for this year.';
    rows.hidden = list.length === 0;
    rows.innerHTML = list.map(function (gift) {
      var hasName = !!String(gift.name || '').trim();
      var person = hasName ? gift.name : (gift.email || 'Donor not recorded');
      var email = hasName && gift.email ? '<a href="mailto:' + esc(gift.email) + '">' + esc(gift.email) + '</a>'
        : (!hasName ? '<span class="gift-no-name">Name not recorded in Square</span>' : '<span class="gift-no-name">Email not recorded in Square</span>');
      var fund = gift.fund || 'Square payment';
      var detail = esc(gift.method || 'Square');
      var tags = '<span class="gift-tag ' + (String(gift.source || '').toLowerCase() === 'website' ? 'website' : '') + '">' + esc(gift.source || 'Square') + '</span>' +
        (gift.recurring ? '<span class="gift-tag monthly">Monthly</span>' : '') +
        (gift.cardOnFile ? '<span class="gift-tag">Card on file</span>' : '');
      var refund = gift.refundedCents ? '<small>Refunded ' + esc(giftMoney(gift.refundedCents)) + '</small>' : '';
      var receipt = gift.receiptUrl ? '<a class="gift-receipt" href="' + esc(gift.receiptUrl) + '" target="_blank" rel="noopener">View receipt</a>' : '<span></span>';
      return '<div class="gift-row">' +
        '<div class="gift-person"><span class="gift-meta-label">Donor</span><strong>' + esc(person) + '</strong>' + email + '</div>' +
        '<div class="gift-detail"><span class="gift-meta-label">Gift details</span><strong>' + esc(fund) + '</strong><small>' + detail + '</small><div class="gift-tags">' + tags + '</div></div>' +
        '<div class="gift-date-block"><span class="gift-meta-label">Received</span><time datetime="' + esc(gift.createdAt || '') + '">' + esc(giftDateOnly(gift.createdAt)) + '</time><small>' + esc(giftTimeOnly(gift.createdAt)) + '</small></div>' +
        '<div class="gift-money"><span class="gift-meta-label">Amount</span><strong>' + esc(giftMoney(gift.amountCents)) + '</strong>' + refund + '</div>' +
        '<div class="gift-row-actions"><button class="btn gift-manage" type="button" data-gift-manage="' + esc(gift.id) + '" aria-label="Manage gift from ' + esc(person) + '">Manage gift</button>' + receipt + '</div>' +
        '</div>';
    }).join('');
  }
  function loadGivingHistory(force) {
    var rows = $('gift-rows'); if (!rows) return;
    giftYears();
    var year = parseInt($('gift-year').value, 10) || currentGivingYear;
    if (!force && givingYear === year && giving.length) { renderGivingHistory(); return; }
    givingYear = year;
    rows.hidden = false;
    rows.innerHTML = '<div class="studio-empty">Loading confirmed Square gifts…</div>';
    $('gift-visible-count').textContent = 'Loading';
    $('gift-empty').hidden = true; $('gift-limit').hidden = true; $('gift-export').disabled = true;
    sb.auth.getSession().then(function (sessionResult) {
      var token = sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token;
      if (!token) throw new Error('Your Studio session expired. Sign in again.');
      return fetch('/api/giving-history?year=' + encodeURIComponent(year), {
        headers: { Authorization: 'Bearer ' + token }
      });
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Giving history could not load.');
        return data;
      });
    }).then(function (data) {
      giving = Array.isArray(data.gifts) ? data.gifts : [];
      $('gift-limit').hidden = !data.limited;
      renderGivingHistory();
    }).catch(function (error) {
      giving = [];
      rows.hidden = false;
      rows.innerHTML = '<div class="studio-empty">' + esc(error.message || 'Giving history could not load.') + '</div>';
      $('gift-visible-count').textContent = 'Unavailable';
      $('gift-total').textContent = '$0.00'; $('gift-count').textContent = '0'; $('gift-fees').textContent = '$0.00'; $('gift-refunds').textContent = '$0.00';
    });
  }
  if ($('gift-year')) $('gift-year').addEventListener('change', function () { giving = []; loadGivingHistory(true); });
  if ($('gift-refresh')) $('gift-refresh').addEventListener('click', function () { giving = []; givingSubscriptionsLoaded = false; loadGivingSubscriptions(true); loadGivingHistory(true); });
  if ($('gift-sub-rows')) $('gift-sub-rows').addEventListener('click', function (event) {
    var button = event.target.closest('[data-sub-action]');
    if (button) manageGivingSubscription(button);
  });
  if ($('gift-rows')) $('gift-rows').addEventListener('click', function (event) {
    var button = event.target.closest('[data-gift-manage]');
    if (button) openGiftModal(button.getAttribute('data-gift-manage'), button);
  });
  if ($('gift-modal-close')) $('gift-modal-close').addEventListener('click', closeGiftModal);
  if ($('gift-modal')) $('gift-modal').addEventListener('click', function (event) { if (event.target === this) closeGiftModal(); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !$('gift-modal').hidden) closeGiftModal(); });
  if ($('gift-refund-full')) $('gift-refund-full').addEventListener('click', function () {
    if (activeGift) $('gift-refund-amount').value = ((parseInt(activeGift.refundableCents, 10) || 0) / 100).toFixed(2);
    updateRefundButtonState();
  });
  if ($('gift-resend')) $('gift-resend').addEventListener('click', function () {
    if (!activeGift || !activeGift.email) return;
    var button = this;
    button.disabled = true;
    giftActionMessage('Sending the Fairview receipt...');
    giftApi('POST', activeGift.id, { action: 'resend_receipt', paymentId: activeGift.id }).then(function (data) {
      giftActionMessage(data.sent ? ('The Fairview receipt was sent to ' + data.email + '.') : ('The receipt request is processing for ' + data.email + '.'), 'ok');
    }).catch(function (error) {
      giftActionMessage(error.message || 'The Fairview receipt could not be sent.', 'err');
    }).then(function () { button.disabled = false; });
  });
  if ($('gift-refund-form')) $('gift-refund-form').addEventListener('input', updateRefundButtonState);
  if ($('gift-refund-form')) $('gift-refund-form').addEventListener('submit', function () {
    if (!activeGift) return;
    var amount = dollarsToCents($('gift-refund-amount').value);
    var reason = $('gift-refund-reason').value.trim();
    var confirmation = $('gift-refund-confirm').value;
    var available = parseInt(activeGift.refundableCents, 10) || 0;
    if (!amount) { giftActionMessage('Enter a valid refund amount.', 'err'); return; }
    if (amount > available) { giftActionMessage('The refund is larger than the remaining refundable amount.', 'err'); return; }
    if (reason.length < 3) { giftActionMessage('Enter a refund reason with at least 3 characters.', 'err'); return; }
    if (confirmation !== 'REFUND') { giftActionMessage('Type REFUND exactly to confirm this action.', 'err'); return; }
    var person = activeGift.name || 'this donor';
    if (!window.confirm('Issue a ' + giftMoney(amount) + ' refund to ' + person + '? This sends real money through Square.')) return;
    var button = $('gift-refund-submit');
    button.disabled = true;
    giftActionMessage('Submitting the refund to Square...');
    var requestId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
    giftApi('POST', activeGift.id, {
      action: 'refund', paymentId: activeGift.id, amountCents: amount,
      reason: reason, confirmation: confirmation, requestId: requestId
    }).then(function (data) {
      activeGift = data.payment;
      renderGiftModal();
      giftActionMessage('Refund submitted to Square. Current status: ' + giftStatus(data.refund && data.refund.status) + '.', 'ok');
      giving = [];
      loadGivingHistory(true);
    }).catch(function (error) {
      giftActionMessage(error.message || 'The refund could not be issued.', 'err');
      updateRefundButtonState();
    });
  });
  if ($('gift-search')) $('gift-search').addEventListener('input', function () { givingSearch = this.value.trim(); renderGivingHistory(); });
  if ($('gift-export')) $('gift-export').addEventListener('click', function () {
    if (!giving.length) return;
    function csvCell(value) { return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'; }
    var lines = [['Date', 'Donor', 'Email', 'Fund', 'Amount', 'Refunded', 'Square fees', 'Actual net', 'Status', 'Method', 'Source', 'Monthly', 'Card on file', 'Square receipt number']];
    giving.forEach(function (gift) {
      var amount = (parseInt(gift.amountCents, 10) || 0) / 100;
      var refunded = (parseInt(gift.refundedCents, 10) || 0) / 100;
      var fees = (parseInt(gift.feeCents, 10) || 0) / 100;
      var net = Number.isFinite(parseInt(gift.netCents, 10)) ? parseInt(gift.netCents, 10) / 100 : amount - refunded - fees;
      lines.push([giftDate(gift.createdAt), gift.name, gift.email, gift.fund, amount.toFixed(2), refunded.toFixed(2), fees.toFixed(2), net.toFixed(2), gift.status, gift.method, gift.source, gift.recurring ? 'Yes' : 'No', gift.cardOnFile ? 'Yes' : 'No', gift.receiptNumber]);
    });
    var csv = lines.map(function (line) { return line.map(csvCell).join(','); }).join('\r\n');
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    var link = document.createElement('a'); link.href = url; link.download = 'fairview-giving-' + givingYear + '.csv'; document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  // ---------- prayer wall (moderated public requests) ----------
  var prayers = [], prayFilter = 'pending', editingPrayer = null;
  function prayersBadge() {
    var n = prayers.filter(function (p) { return !p.approved; }).length;
    var b = $('prayers-badge'); if (b) { b.hidden = !n; b.textContent = n; }
  }
  function renderPrayers() {
    var rows = $('prayers-rows'); if (!rows) return;
    prayersBadge();
    var list = prayers.filter(function (p) {
      if (prayFilter === 'pending') return !p.approved;
      if (prayFilter === 'approved') return p.approved;
      return true;
    });
    var empty = $('prayers-empty'); if (empty) empty.hidden = list.length > 0;
    var elabel = 'display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:.82rem;color:var(--mut);margin:6px 0 6px;font-weight:600;';
    var anonBtn = 'background:none;border:none;color:var(--accent);cursor:pointer;font-size:.8rem;text-decoration:underline;font-family:inherit;padding:0;';
    var fld = 'width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#fff;font-family:inherit;font-size:.95rem;';
    rows.innerHTML = list.map(function (p) {
      var head = '<div class="ib-top"><span class="ib-kind">' + (p.approved ? 'On the wall' : 'Pending') + (p.answered ? ' · Answered' : '') + '</span>' +
        '<strong>' + esc(p.name && p.name.trim() ? p.name : 'Anonymous') + '</strong>' +
        '<span class="ib-date">' + esc(fmtDate(p.created_at)) + '</span></div>';
      if (String(editingPrayer) === String(p.id)) {
        return '<div class="ib-item editing">' + head +
          '<label style="' + elabel + '">Name shown on the wall <button type="button" data-pr-anon style="' + anonBtn + '">Make anonymous</button></label>' +
          '<input id="pr-edit-name" type="text" value="' + esc(p.name || '') + '" placeholder="Anonymous" style="' + fld + 'margin-bottom:12px;">' +
          '<label style="' + elabel + '">Wording shown publicly. Reword or blur any private details before it goes up</label>' +
          '<textarea id="pr-edit-text" rows="4" style="' + fld + 'resize:vertical;">' + esc(p.request) + '</textarea>' +
          '<div class="ib-acts" style="margin-top:12px;flex-wrap:wrap;">' +
          '<button class="btn btn-b" data-pr-save="' + esc(p.id) + '">Save wording</button>' +
          '<button class="btn btn-o" data-pr-soften="' + esc(p.id) + '">&#10024; Suggest a private version</button>' +
          '<button class="btn btn-o" data-pr-cancel="1">Cancel</button>' +
          '</div><p id="pr-soften-msg" class="muted" style="font-size:.85rem;margin-top:8px;" hidden></p></div>';
      }
      return '<div class="ib-item' + (p.approved ? ' done' : '') + '">' + head +
        '<div class="ib-msg">' + esc(p.request) + '</div>' +
        '<div class="ib-acts">' +
        '<button class="btn ' + (p.approved ? 'btn-o' : 'btn-b') + '" data-pr-approve="' + esc(p.id) + '">' + (p.approved ? 'Take off the wall' : 'Approve for the wall') + '</button>' +
        '<button class="btn btn-o" data-pr-edit="' + esc(p.id) + '">Edit wording</button>' +
        '<button class="btn btn-o" data-pr-answered="' + esc(p.id) + '">' + (p.answered ? 'Mark unanswered' : 'Mark answered') + '</button>' +
        '<button class="btn btn-o" data-pr-del="' + esc(p.id) + '">Delete</button>' +
        '</div></div>';
    }).join('');
  }
  function loadPrayers() {
    var rows = $('prayers-rows'); if (!rows) return;
    if (!prayers.length) rows.innerHTML = '<p class="muted" style="padding:20px;">Loading…</p>';
    sb.from('prayers').select('*').order('created_at', { ascending: false }).limit(500).then(function (r) {
      if (r.error) { rows.innerHTML = '<p class="muted" style="padding:20px;">Could not load prayers yet. If this is the first time, create the <code>prayers</code> table (see CMS-SETUP.md).</p>'; return; }
      prayers = r.data || []; renderPrayers();
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.pray-tab'), function (b) {
    b.addEventListener('click', function () {
      prayFilter = b.getAttribute('data-pray');
      Array.prototype.forEach.call(document.querySelectorAll('.pray-tab'), function (x) { x.classList.toggle('active', x === b); });
      renderPrayers();
    });
  });
  (function () {
    var rows = $('prayers-rows'); if (!rows) return;
    rows.addEventListener('click', function (e) {
      var ap = e.target.closest('[data-pr-approve]'), an = e.target.closest('[data-pr-answered]'), dl = e.target.closest('[data-pr-del]');
      var ed = e.target.closest('[data-pr-edit]'), sv = e.target.closest('[data-pr-save]'), cx = e.target.closest('[data-pr-cancel]'), anon = e.target.closest('[data-pr-anon]'), sfn = e.target.closest('[data-pr-soften]');
      function row(id) { return prayers.filter(function (p) { return String(p.id) === String(id); })[0]; }
      if (ed) { editingPrayer = ed.getAttribute('data-pr-edit'); renderPrayers(); return; }
      if (sfn) {
        var ta = $('pr-edit-text'), pm = $('pr-soften-msg'); if (!ta) return;
        if (!ta.value.trim()) { if (pm) { pm.hidden = false; pm.textContent = 'Nothing to reword yet.'; } return; }
        sfn.disabled = true; var was = sfn.textContent; sfn.textContent = 'Rewording…';
        if (pm) { pm.hidden = false; pm.textContent = 'Asking the AI helper to gently reword this…'; }
        fetch('/api/soften-prayer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: ta.value }) })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            sfn.disabled = false; sfn.textContent = was;
            if (j && j.ok && j.text) { ta.value = j.text; if (pm) pm.textContent = 'Reworded. Read it over and tweak anything before you save.'; }
            else if (pm) pm.textContent = (j && j.reason) || 'Couldn’t reword that just now.';
          }, function () { sfn.disabled = false; sfn.textContent = was; if (pm) pm.textContent = 'Couldn’t reach the AI helper.'; });
        return;
      }
      if (cx) { editingPrayer = null; renderPrayers(); return; }
      if (anon) { var ni = $('pr-edit-name'); if (ni) ni.value = ''; return; }
      if (sv) {
        var rs = row(sv.getAttribute('data-pr-save')); if (!rs) return;
        var nameEl = $('pr-edit-name'), textEl = $('pr-edit-text');
        var newText = textEl ? textEl.value.trim() : rs.request;
        var newName = nameEl ? nameEl.value.trim() : rs.name;
        if (!newText) { window.alert('The request can’t be empty.'); return; }
        sb.from('prayers').update({ name: newName, request: newText }).eq('id', rs.id).then(function (r) {
          if (r.error) { window.alert('Could not save: ' + (r.error.message || r.error)); return; }
          rs.name = newName; rs.request = newText; editingPrayer = null; renderPrayers();
        });
        return;
      }
      if (ap) {
        var r1 = row(ap.getAttribute('data-pr-approve')); if (!r1) return; var nv = !r1.approved;
        sb.from('prayers').update({ approved: nv }).eq('id', r1.id).then(function (r) { if (!r.error) { r1.approved = nv; renderPrayers(); } });
      } else if (an) {
        var r2 = row(an.getAttribute('data-pr-answered')); if (!r2) return; var nv2 = !r2.answered;
        sb.from('prayers').update({ answered: nv2 }).eq('id', r2.id).then(function (r) { if (!r.error) { r2.answered = nv2; renderPrayers(); } });
      } else if (dl) {
        var id = dl.getAttribute('data-pr-del');
        if (!window.confirm('Delete this prayer request? This cannot be undone.')) return;
        sb.from('prayers').delete().eq('id', id).then(function (r) { if (!r.error) { prayers = prayers.filter(function (p) { return String(p.id) !== String(id); }); renderPrayers(); } });
      }
    });
  })();

  // ---------- weekly bulletin (PDF -> site_content['bulletins'] JSON) ----------
  var bulletins = [];
  function sortBulletins() { bulletins.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); }); }
  function loadBulletins() {
    var rows = $('blt-rows'); if (!rows) return;
    sb.from('site_content').select('value').eq('key', 'bulletins').then(function (r) {
      bulletins = [];
      if (!r.error && r.data && r.data[0]) { try { bulletins = JSON.parse(r.data[0].value) || []; } catch (e) { } }
      sortBulletins(); renderBulletins();
    });
  }
  function renderBulletins() {
    var rows = $('blt-rows'); if (!rows) return;
    var empty = $('blt-empty'); if (empty) empty.hidden = bulletins.length > 0;
    rows.innerHTML = bulletins.map(function (b, i) {
      return '<div class="ib-item"><div class="ib-top"><span class="ib-kind">' + esc(b.date || '') + '</span>' +
        '<strong>' + esc(b.title || 'Bulletin') + '</strong></div>' +
        '<div class="ib-acts">' +
        '<a class="btn btn-o" href="' + esc(b.url) + '" target="_blank" rel="noopener">Open</a>' +
        '<button class="btn btn-o" data-blt-del="' + i + '">Delete</button>' +
        '</div></div>';
    }).join('');
  }
  function saveBulletins(cb) {
    sb.from('site_content').upsert({ key: 'bulletins', value: JSON.stringify(bulletins) }, { onConflict: 'key' }).then(function (r) { if (cb) cb(r); });
  }
  var blAdd = $('blt-add');
  if (blAdd) blAdd.addEventListener('click', function () {
    var msg = $('blt-msg'), file = ($('blt-file').files || [])[0], date = v('blt-date'), title = v('blt-title').trim() || 'Weekly Bulletin';
    if (!date) { msg.textContent = 'Pick the Sunday date first.'; return; }
    if (!file) { msg.textContent = 'Choose a PDF first.'; return; }
    blAdd.disabled = true; msg.textContent = 'Uploading…';
    var path = 'bulletins/' + date + '-' + Date.now() + '.pdf';
    sb.storage.from(bucket).upload(path, file, { upsert: true, contentType: 'application/pdf' }).then(function (r) {
      if (r.error) { blAdd.disabled = false; msg.textContent = 'Upload failed: ' + r.error.message; return; }
      var url = sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      bulletins = bulletins.filter(function (b) { return b.date !== date; }); // one per Sunday
      bulletins.unshift({ date: date, title: title, url: url });
      sortBulletins();
      saveBulletins(function (sr) {
        blAdd.disabled = false; $('blt-file').value = '';
        if (sr.error) { msg.textContent = 'Uploaded, but couldn\'t update the list: ' + sr.error.message + (/row-level|policy/i.test(sr.error.message) ? ' (not on the editor allow-list?)' : ''); return; }
        msg.textContent = 'Posted ✓ It\'s live on the home page.'; renderBulletins();
      });
    });
  });
  (function () {
    var rows = $('blt-rows'); if (!rows) return;
    rows.addEventListener('click', function (e) {
      var d = e.target.closest('[data-blt-del]'); if (!d) return;
      var i = +d.getAttribute('data-blt-del'); if (!bulletins[i]) return;
      if (!window.confirm('Remove this bulletin from the website?')) return;
      bulletins.splice(i, 1);
      saveBulletins(function () { renderBulletins(); });
    });
  })();

  // ---------- blog manager ----------
  var posts = [], editingPost = null;
  function postById(id) { return posts.filter(function (p) { return String(p.id) === String(id); })[0]; }
  function fmtPostDate(d) { if (!d) return 'No date'; var p = String(d).split('-'); var dt = new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); return isNaN(dt) ? d : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }

  function loadPosts() {
    var rows = $('bl-rows');
    rows.innerHTML = '<div class="studio-empty">Loading posts…</div>';
    sb.from('posts').select('*').order('date', { ascending: false }).then(function (r) {
      if (r.error) { rows.innerHTML = '<div class="studio-empty">Couldn\'t load posts: ' + esc(r.error.message) + '</div>'; return; }
      posts = r.data || [];
      $('bl-import').hidden = posts.length > 0 || !((window.FBT_POSTS || []).length);
      renderPostRows();
    });
  }
  function renderPostRows() {
    var rows = $('bl-rows');
    if (!posts.length) { rows.innerHTML = '<div class="studio-empty">No posts in the studio yet.' + ((window.FBT_POSTS || []).length ? ' Import your existing posts above, or click <b>+ New post</b>.' : ' Click <b>+ New post</b> to write one.') + '</div>'; return; }
    rows.innerHTML = posts.map(function (p) {
      var pill = p.status === 'draft' ? '<span class="spill draft">Draft</span>' : '<span class="spill live">Published</span>';
      var thumb = p.cover ? '<div class="srow-thumb" style="background-image:url(&quot;' + esc(p.cover) + '&quot;)"></div>' : '<div class="srow-thumb">' + DOC_SVG + '</div>';
      return '<div class="srow">' + thumb +
        '<div class="srow-main"><div class="srow-title">' + esc(p.title) + '</div><div class="srow-meta">' + esc(fmtPostDate(p.date)) + (p.author ? ' · ' + esc(p.author) : '') + '</div></div>' +
        pill +
        '<button class="sicon" data-pedit="' + esc(p.id) + '" aria-label="Edit ' + esc(p.title) + '">' + EDIT_SVG + '</button>' +
        '<button class="sicon" data-pdel="' + esc(p.id) + '" aria-label="Delete ' + esc(p.title) + '">' + TRASH_SVG + '</button>' +
        '</div>';
    }).join('');
  }
  $('bl-rows').addEventListener('click', function (e) {
    var ed = e.target.closest('[data-pedit]'), dl = e.target.closest('[data-pdel]');
    if (ed) { var a = postById(ed.getAttribute('data-pedit')); if (a) openPostEdit(a); }
    else if (dl) { var b = postById(dl.getAttribute('data-pdel')); if (b) delPost(b); }
  });

  function setBcover(url) { var p = $('b-cover-prev'); if (url) { p.style.backgroundImage = 'url("' + url + '")'; p.classList.add('has'); } else { p.style.backgroundImage = ''; p.classList.remove('has'); } }
  function openPostEdit(p) {
    editingPost = p || null;
    $('bl-edit-title').textContent = p ? 'Edit post' : 'New post';
    setV('b-title', p && p.title); setV('b-slug', p && p.slug); setV('b-date', p && p.date); setV('b-author', p && p.author);
    setV('b-tags', ((p && p.tags) || []).join(', ')); setV('b-status', (p && p.status) || 'published');
    setV('b-excerpt', p && p.excerpt); setV('b-video', p && p.video); setV('b-body', p && p.body);
    setV('b-cover', p && p.cover); setBcover(p && p.cover); $('b-cover-msg').textContent = ''; $('b-cover-file').value = '';
    $('bl-list').hidden = true; $('bl-edit').hidden = false; window.scrollTo(0, 0);
  }
  function closePostEdit() { $('bl-edit').hidden = true; $('bl-list').hidden = false; window.scrollTo(0, 0); }
  $('bl-new').addEventListener('click', function () { openPostEdit(null); });
  $('bl-back').addEventListener('click', closePostEdit);
  $('bl-cancel').addEventListener('click', closePostEdit);
  $('b-cover').addEventListener('input', function () { setBcover(v('b-cover')); });
  $('b-cover-file').addEventListener('change', function () {
    var file = this.files && this.files[0]; if (!file) return;
    var msg = $('b-cover-msg'); msg.textContent = 'Uploading…';
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    var path = 'posts/' + (slugify(v('b-title')) || 'post') + '-' + Date.now() + '.' + ext;
    sb.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type }).then(function (r) {
      if (r.error) { msg.textContent = 'Upload failed: ' + r.error.message; return; }
      var url = sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      setV('b-cover', url); setBcover(url); msg.textContent = 'Uploaded ✓';
    });
  });

  $('bl-save').addEventListener('click', savePost);
  function savePost() {
    var title = v('b-title').trim(); if (!title) { alert('Please add a title.'); return; }
    var slug = v('b-slug').trim() || slugify(title);
    var tags = v('b-tags').split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    var row = {
      slug: slug, title: title, date: v('b-date') || null, author: v('b-author').trim() || null,
      tags: tags, cover: v('b-cover').trim() || null, excerpt: v('b-excerpt').trim() || null,
      video: ytid(v('b-video').trim()) || null, body: v('b-body') || null,
      status: v('b-status'), updated_at: new Date().toISOString()
    };
    var btn = $('bl-save'); btn.disabled = true; btn.textContent = 'Saving…';
    // Editing → UPDATE by id (never re-inserts the row, so it can't trip the
    // primary-key constraint). New → INSERT (the id column defaults). The old
    // upsert(onConflict:'slug') re-inserted the row's id and raised
    // "duplicate key posts_pkey" whenever the slug arbiter matched a different
    // row than the id (e.g. reusing a slug that already exists).
    var q = (editingPost && editingPost.id)
      ? sb.from('posts').update(row).eq('id', editingPost.id).select()
      : sb.from('posts').insert(row).select();
    q.then(function (r) {
      btn.disabled = false; btn.textContent = 'Save post';
      if (r.error) { alert('Couldn\'t save: ' + r.error.message + saveHint(r.error.message)); return; }
      closePostEdit(); loadPosts();
    });
  }
  function delPost(p) {
    if (!window.confirm('Delete “' + p.title + '”? This can\'t be undone.')) return;
    sb.from('posts').delete().eq('id', p.id).then(function (r) {
      if (r.error) { alert('Couldn\'t delete: ' + r.error.message); return; }
      loadPosts();
    });
  }

  // import existing posts from posts.js + the posts/<slug>.html fragments
  $('bl-import-btn').addEventListener('click', importPosts);
  function importPosts() {
    var src = window.FBT_POSTS || [];
    if (!src.length) { alert('No existing posts found to import.'); return; }
    var btn = $('bl-import-btn'); btn.disabled = true; btn.textContent = 'Importing…';
    Promise.all(src.map(function (p, i) {
      return fetch('posts/' + encodeURIComponent(p.slug) + '.html').then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; })
        .then(function (body) {
          return { slug: p.slug, title: p.title, date: p.date || null, author: p.author || null, tags: p.tags || [], cover: p.cover || null, excerpt: p.excerpt || null, body: (body && body.trim()) || null, video: p.video || null, status: 'published', sort: i, updated_at: new Date().toISOString() };
        });
    })).then(function (rows) {
      return sb.from('posts').upsert(rows, { onConflict: 'slug' }).select();
    }).then(function (r) {
      btn.disabled = false; btn.textContent = 'Import existing posts';
      if (r.error) { alert('Import failed: ' + r.error.message + (/row-level|policy/i.test(r.error.message) ? '\n\n(You may not be on the editor allow-list.)' : '')); return; }
      loadPosts();
    });
  }

  // ---------- settings (site_content key/value, read by content.js across the site) ----------
  var settingsLoaded = false;
  function loadSettings() {
    if (settingsLoaded) return;
    sb.from('site_content').select('key,value').then(function (r) {
      if (r.error) return;
      var map = {}; (r.data || []).forEach(function (row) { map[row.key] = row.value; });
      Array.prototype.forEach.call(document.querySelectorAll('#view-settings [data-key]'), function (inp) {
        var k = inp.getAttribute('data-key'); if (map[k] != null && String(map[k]).trim()) inp.value = normalizeSetting(k, map[k]);
      });
      settingsLoaded = true;
    });
  }
  function normalizeSetting(key, value) {
    var s = String(value == null ? '' : value).trim();
    if (key === 'contact_city' && /^clay$/i.test(s)) return 'Clay, WV 25043';
    if (key === 'contact_phone') {
      var digits = s.replace(/\D/g, '');
      if (digits.length === 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
    }
    if (/^style_\w+_color$/.test(key) && s) {
      var hx = (s.charAt(0) === '#' ? s : '#' + s).toUpperCase();
      if (/^#[0-9A-F]{6}$/.test(hx)) return hx;
    }
    if (/^time_/.test(key)) {
      s = s.replace(/^wednesdays?\s*/i, '').trim();
      var m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(a|p|am|pm)$/i);
      if (m) return m[1] + ':' + (m[2] || '00') + (m[3].charAt(0).toLowerCase() === 'a' ? 'am' : 'pm');
    }
    return s;
  }
  $('set-save').addEventListener('click', function () {
    var btn = $('set-save'), msg = $('set-msg'); btn.disabled = true; btn.textContent = 'Saving…'; msg.textContent = ''; msg.className = 'studio-msg';
    var rows = [];
    Array.prototype.forEach.call(document.querySelectorAll('#view-settings [data-key]'), function (inp) {
      var key = inp.getAttribute('data-key'), value = normalizeSetting(key, inp.value);
      inp.value = value;
      rows.push({ key: key, value: value });
    });
    sb.from('site_content').upsert(rows, { onConflict: 'key' }).then(function (r) {
      btn.disabled = false; btn.textContent = 'Save settings';
      if (r.error) { msg.className = 'studio-msg err'; msg.textContent = 'Couldn\'t save: ' + r.error.message + (/row-level|policy/i.test(r.error.message) ? ' (not on the editor allow-list?)' : ''); return; }
      msg.className = 'studio-msg ok'; msg.textContent = 'Saved ✓ Your changes are live across the site.';
    });
  });

  // ---------- people & ministries (site_content, shown on Staff + Get Involved) ----------
  var peopleLoaded = false;
  function loadPeople() {
    if (peopleLoaded) return;
    var msg = $('people-msg');
    if (msg) { msg.className = 'studio-msg'; msg.textContent = 'Loading current public content…'; }
    sb.from('site_content').select('key,value').then(function (r) {
      if (r.error) {
        if (msg) { msg.className = 'studio-msg err'; msg.textContent = 'Couldn\'t load: ' + r.error.message; }
        return;
      }
      var map = {}; (r.data || []).forEach(function (row) { map[row.key] = row.value; });
      Array.prototype.forEach.call(document.querySelectorAll('#view-people [data-key]'), function (inp) {
        var k = inp.getAttribute('data-key');
        if (map[k] != null && String(map[k]).trim() !== '') inp.value = String(map[k]);
      });
      peopleLoaded = true;
      if (msg) { msg.className = 'studio-msg'; msg.textContent = ''; }
    });
  }
  function setPeopleSaving(saving) {
    ['people-save', 'people-save-bottom'].forEach(function (id) {
      var btn = $(id); if (!btn) return;
      btn.disabled = saving; btn.textContent = saving ? 'Saving…' : 'Save changes';
    });
  }
  function savePeople() {
    var form = $('people-form'), msg = $('people-msg');
    if (!form || !form.reportValidity()) return;
    setPeopleSaving(true);
    if (msg) { msg.className = 'studio-msg'; msg.textContent = ''; }
    var rows = [];
    Array.prototype.forEach.call(document.querySelectorAll('#view-people [data-key]'), function (inp) {
      rows.push({ key: inp.getAttribute('data-key'), value: String(inp.value || '').trim() });
    });
    sb.from('site_content').upsert(rows, { onConflict: 'key' }).then(function (r) {
      setPeopleSaving(false);
      if (r.error) {
        if (msg) { msg.className = 'studio-msg err'; msg.textContent = 'Couldn\'t save: ' + r.error.message + (/row-level|policy/i.test(r.error.message) ? ' (not on the editor allow-list?)' : ''); }
        return;
      }
      peopleLoaded = true;
      if (msg) { msg.className = 'studio-msg ok'; msg.textContent = 'Saved ✓ Get Involved and Our Staff are updated.'; }
    });
  }
  ['people-save', 'people-save-bottom'].forEach(function (id) { var btn = $(id); if (btn) btn.addEventListener('click', savePeople); });
  if ($('people-media')) $('people-media').addEventListener('click', function () { showView('media'); });

  // ---------- sermons (sermon_tags overrides on the YouTube library) ----------
  var vids = [], smTags = {}, smReady = false, editingVid = null, hubFilter = '';
  var TYPE_LABEL = { message: 'Messages', music: 'Music', service: 'Watch', clip: 'Hidden' };
  function fmtSmDate(d) { if (!d) return ''; var dt = new Date(d); return isNaN(dt) ? '' : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function vidById(id) { return vids.filter(function (x) { return x.id === id; })[0]; }
  function loadSermons() {
    if (smReady) { renderVidRows(); return; }
    var rows = $('sm-rows'); rows.innerHTML = '<div class="studio-empty">Loading your videos…</div>';
    var pVids = (window.FBTVideos && window.FBTVideos.load) ? window.FBTVideos.load() : Promise.resolve([]);
    var pTags = sb.from('sermon_tags').select('*').then(function (r) { return (r && !r.error && r.data) ? r.data : []; }, function () { return []; });
    Promise.all([pVids, pTags]).then(function (res) {
      vids = (res[0] || []).filter(function (vv) { return vv && vv.id; });
      smTags = {}; (res[1] || []).forEach(function (t) { smTags[t.video_id] = t; });
      smReady = true; updateHubCounts(); renderVidRows();
    }, function () { rows.innerHTML = '<div class="studio-empty">Couldn\'t load videos right now.</div>'; });
  }
  function updateHubCounts() {
    var counts = { '': vids.length, message: 0, music: 0, service: 0, clip: 0 };
    vids.forEach(function (vv) { var ty = vv.type || 'message'; if (counts[ty] != null) counts[ty]++; });
    Array.prototype.forEach.call(document.querySelectorAll('#hub-chips .hub-chip'), function (c) {
      if (!c.getAttribute('data-base')) c.setAttribute('data-base', c.textContent.trim());
      var h = c.getAttribute('data-hub');
      c.innerHTML = esc(c.getAttribute('data-base')) + ' <span class="n">' + (counts[h] || 0) + '</span>';
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('#hub-chips .hub-chip'), function (c) {
    c.addEventListener('click', function () {
      hubFilter = c.getAttribute('data-hub');
      Array.prototype.forEach.call(document.querySelectorAll('#hub-chips .hub-chip'), function (x) { x.classList.toggle('active', x === c); });
      renderVidRows();
    });
  });
  function renderVidRows() {
    var rows = $('sm-rows');
    var q = ($('sm-search').value || '').toLowerCase().trim();
    var list = vids.filter(function (vv) {
      if (hubFilter && (vv.type || 'message') !== hubFilter) return false;
      if (q && (vv.rawTitle || vv.title || '').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (!list.length) { rows.innerHTML = '<div class="studio-empty">No videos in this hub' + (q ? ' match that search' : '') + '.</div>'; return; }
    rows.innerHTML = list.slice(0, 200).map(function (vv) {
      var tagged = !!smTags[vv.id];
      var typePill = '<span class="spill ' + (tagged ? 'tag' : 'auto') + '">' + esc(TYPE_LABEL[vv.type] || vv.type || '-') + (tagged ? '' : ' · auto') + '</span>';
      var thumb = vv.thumb ? '<div class="srow-thumb wide" style="background-image:url(&quot;' + esc(vv.thumb) + '&quot;)"></div>' : '<div class="srow-thumb wide"></div>';
      var meta = [vv.speaker, vv.reference].filter(function (x) { return x; }).join(' · ') || fmtSmDate(vv.date);
      return '<div class="srow">' + thumb +
        '<div class="srow-main"><div class="srow-title">' + esc(vv.title || vv.rawTitle) + '</div><div class="srow-meta">' + esc(meta) + '</div></div>' +
        typePill +
        '<button class="sicon" data-sedit="' + esc(vv.id) + '" aria-label="Edit">' + EDIT_SVG + '</button>' +
        '</div>';
    }).join('');
  }
  $('sm-search').addEventListener('input', function () { if (smReady) renderVidRows(); });
  $('sm-rows').addEventListener('click', function (e) {
    var ed = e.target.closest('[data-sedit]'); if (ed) { var vv = vidById(ed.getAttribute('data-sedit')); if (vv) openVidEdit(vv); }
  });
  function openVidEdit(vv) {
    editingVid = vv; var t = smTags[vv.id] || {};
    $('sm-vid-thumb').style.backgroundImage = vv.thumb ? 'url("' + vv.thumb + '")' : '';
    var dateLabel = vv.dateKind === 'published' ? 'YouTube published ' : 'Service date ';
    $('sm-vid-meta').innerHTML = '<b>' + esc(vv.rawTitle || vv.title) + '</b><br>' + esc(dateLabel + fmtSmDate(vv.date)) + ' · youtube.com/watch?v=' + esc(vv.id);
    setV('s-type', t.type || ''); setV('s-service', t.service || ''); setV('s-preached-on', t.preached_on || '');
    setV('s-speaker', t.speaker || ''); setV('s-reference', t.reference || '');
    setV('s-series', t.series || ''); setV('s-title', t.title || ''); setV('s-topics', (t.topics || []).join(', '));
    setV('s-summary', t.summary || ''); setV('s-notes', t.notes || ''); setV('s-transcript', t.transcript || '');
    $('sm-msg').textContent = ''; $('sm-msg').className = 'studio-msg';
    $('sm-reset').style.display = smTags[vv.id] ? '' : 'none';
    $('sm-list').hidden = true; $('sm-edit').hidden = false; window.scrollTo(0, 0);
  }
  function closeVidEdit() { $('sm-edit').hidden = true; $('sm-list').hidden = false; window.scrollTo(0, 0); }
  $('sm-back').addEventListener('click', closeVidEdit);
  $('sm-save').addEventListener('click', function () {
    if (!editingVid) return;
    var topics = v('s-topics').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    var row = {
      video_id: editingVid.id, type: v('s-type') || null, service: v('s-service') || null,
      preached_on: v('s-preached-on') || null, speaker: v('s-speaker').trim() || null,
      reference: v('s-reference').trim() || null, series: v('s-series').trim() || null,
      title: v('s-title').trim() || null, topics: topics,
      summary: v('s-summary').trim() || null, notes: v('s-notes').trim() || null,
      transcript: v('s-transcript').trim() || null, updated_at: new Date().toISOString()
    };
    var btn = $('sm-save'), msg = $('sm-msg'); btn.disabled = true; btn.textContent = 'Saving…'; msg.textContent = '';
    sb.from('sermon_tags').upsert(row, { onConflict: 'video_id' }).then(function (r) {
      btn.disabled = false; btn.textContent = 'Save';
      if (r.error) { msg.className = 'studio-msg err'; msg.textContent = 'Couldn\'t save: ' + r.error.message + (/row-level|policy/i.test(r.error.message) ? ' (not on the editor allow-list?)' : ''); return; }
      smTags[editingVid.id] = row;
      // Rebuild the library from YouTube plus the just-saved database row.
      // This also removes values an editor intentionally cleared instead of
      // leaving an older in-memory override visible until the next page load.
      var finishSave = function (fresh) {
        if (fresh && fresh.length) vids = fresh.filter(function (vv) { return vv && vv.id; });
        editingVid = vidById(row.video_id) || editingVid;
        updateHubCounts(); renderVidRows();
        msg.className = 'studio-msg ok'; msg.textContent = 'Saved ✓ Live on the site.'; $('sm-reset').style.display = '';
      };
      if (window.FBTVideos && window.FBTVideos.refresh) {
        window.FBTVideos.refresh().then(finishSave, function () { finishSave(); });
      } else {
        ['type', 'service', 'speaker', 'reference', 'series', 'title', 'summary', 'notes', 'transcript'].forEach(function (f) { editingVid[f] = row[f] || ''; });
        editingVid.topics = (row.topics || []).slice();
        if (row.preached_on) { editingVid.date = row.preached_on; editingVid.dateKind = 'service'; }
        finishSave();
      }
    });
  });
  $('sm-reset').addEventListener('click', function () {
    if (!editingVid) return;
    if (!window.confirm('Reset this video to automatic categorization?')) return;
    sb.from('sermon_tags').delete().eq('video_id', editingVid.id).then(function (r) {
      if (r.error) { $('sm-msg').className = 'studio-msg err'; $('sm-msg').textContent = 'Couldn\'t reset: ' + r.error.message; return; }
      delete smTags[editingVid.id]; smReady = false; loadSermons(); closeVidEdit();
    });
  });

  // ---------- media designer ----------
  // Asset URLs remain in their original site_content rows. Appearance is kept
  // in a separate JSON row, so changing a crop or choosing a color background
  // never destroys an existing photo or video.
  var mediaStyleApi = window.FBTMediaStyles || null;
  var MEDIA_BG = [
    { key: 'hero_bg_home', label: 'Home', page: '/', pageLabel: 'Home page' },
    { key: 'hero_bg_visit', label: 'Plan a Visit', page: '/visit', pageLabel: 'Visit page' },
    { key: 'hero_bg_beliefs', label: 'What We Believe', page: '/beliefs', pageLabel: 'Beliefs page' },
    { key: 'hero_bg_staff', label: 'Our Staff', page: '/staff', pageLabel: 'Staff page' },
    { key: 'hero_bg_getinvolved', label: 'Get Involved', page: '/get-involved', pageLabel: 'Get Involved page' },
    { key: 'hero_bg_nextsteps', label: 'Next Steps', page: '/next-steps', pageLabel: 'Next Steps page' },
    { key: 'hero_bg_live', label: 'The Overlook: Live', page: '/watch#live', pageLabel: 'Live panel' },
    { key: 'hero_bg_messages', label: 'The Overlook: Messages', page: '/watch#messages', pageLabel: 'Messages panel' },
    { key: 'hero_bg_music', label: 'The Overlook: Music', page: '/watch#music', pageLabel: 'Music panel' },
    { key: 'hero_bg_events', label: 'Events', page: '/events', pageLabel: 'Events page' },
    { key: 'hero_bg_missions', label: 'Missions', page: '/missions', pageLabel: 'Missions page' },
    { key: 'hero_bg_give', label: 'Give', page: '/give', pageLabel: 'Giving page' },
    { key: 'hero_bg_contact', label: 'Contact', page: '/contact', pageLabel: 'Contact page' },
    { key: 'hero_bg_tile_new', label: 'Home tile: I\'m New', page: '/', pageLabel: 'Home page', ratio: 'tile-card', stage: "I'M NEW" },
    { key: 'hero_bg_tile_overlook', label: 'Home tile: The Overlook', page: '/', pageLabel: 'Home page', ratio: 'tile-card', stage: 'THE OVERLOOK' },
    { key: 'hero_bg_tile_ministries', label: 'Home tile: Ministries', page: '/', pageLabel: 'Home page', ratio: 'tile-card', stage: 'MINISTRIES' },
    { key: 'hero_bg_hope', label: 'Home: H.O.P.E. band photo', page: '/', pageLabel: 'Home page', ratio: 'tile-card', noCopy: true },
    { key: 'hero_bg_stream_home', label: 'Home: The Overlook section', page: '/', pageLabel: 'Home page', ratio: 'hero-page' },
    { key: 'hero_bg_missions_home', label: 'Home: missions section', page: '/', pageLabel: 'Home page', ratio: 'hero-page' },
    { key: 'hero_bg_contact_home', label: 'Home: come visit section', page: '/', pageLabel: 'Home page', ratio: 'hero-page' },
    { key: 'hero_bg_welcome_home', label: 'Home: welcome section', page: '/', pageLabel: 'Home page', ratio: 'hero-page', backdrop: '#FAF6ED' }
  ].map(function (item) {
    item.kind = 'background';
    item.ratio = item.ratio || (item.key === 'hero_bg_home'
      ? 'hero-home'
      : ['hero_bg_live', 'hero_bg_messages', 'hero_bg_music'].indexOf(item.key) >= 0
        ? 'hero-slim'
        : 'hero-page');
    return item;
  });
  // Generated per-section cards: every section of every page, editable like
  // the homepage (background photo, overlay, text, colors).
  var MEDIA_BG_GEN = [
  {
    "key": "hero_bg_visit_s1",
    "label": "Visit: What to expect",
    "page": "/visit",
    "pageLabel": "Visit page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_visit_s2",
    "label": "Visit: Here's exactly how it goes",
    "page": "/visit",
    "pageLabel": "Visit page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_visit_s3",
    "label": "Visit: Let us know you're coming",
    "page": "/visit",
    "pageLabel": "Visit page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_visit_s4",
    "label": "Visit: When we gather",
    "page": "/visit",
    "pageLabel": "Visit page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_visit_s5",
    "label": "Visit: Common questions",
    "page": "/visit",
    "pageLabel": "Visit page",
    "backdrop": "#E6F1EE",
    "dark": false
  },
  {
    "key": "hero_bg_visit_s6",
    "label": "Visit: Find us",
    "page": "/visit",
    "pageLabel": "Visit page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_visit_s7",
    "label": "Visit: Get the latest from Fairview",
    "page": "/visit",
    "pageLabel": "Visit page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_visit_s8",
    "label": "Visit: We saved you a seat",
    "page": "/visit",
    "pageLabel": "Visit page",
    "backdrop": "radial-gradient(90% 100% at 85% 0%,rgba(127,209,203,.18),transparent 55%),linear-gradient(135deg,#24466B,#16304D)",
    "dark": true
  },
  {
    "key": "hero_bg_beliefs_s1",
    "label": "Beliefs: \"I will lift up mine eyes unto the...",
    "page": "/beliefs",
    "pageLabel": "Beliefs page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_beliefs_s2",
    "label": "Beliefs: What we hold to",
    "page": "/beliefs",
    "pageLabel": "Beliefs page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_beliefs_s3",
    "label": "Beliefs: What we stand on",
    "page": "/beliefs",
    "pageLabel": "Beliefs page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_beliefs_s4",
    "label": "Beliefs: Jesus has made a way",
    "page": "/beliefs",
    "pageLabel": "Beliefs page",
    "backdrop": "#E6F1EE",
    "dark": false
  },
  {
    "key": "hero_bg_beliefs_s5",
    "label": "Beliefs: Come and see.",
    "page": "/beliefs",
    "pageLabel": "Beliefs page",
    "backdrop": "radial-gradient(90% 100% at 85% 0%,rgba(127,209,203,.18),transparent 55%),linear-gradient(135deg,#24466B,#16304D)",
    "dark": true
  },
  {
    "key": "hero_bg_staff_s1",
    "label": "Staff: The people who serve",
    "page": "/staff",
    "pageLabel": "Staff page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_staff_s2",
    "label": "Staff: Have a question? We are here.",
    "page": "/staff",
    "pageLabel": "Staff page",
    "backdrop": "#E6F1EE",
    "dark": false
  },
  {
    "key": "hero_bg_staff_s3",
    "label": "Staff: Come meet us in person.",
    "page": "/staff",
    "pageLabel": "Staff page",
    "backdrop": "radial-gradient(90% 100% at 85% 0%,rgba(127,209,203,.18),transparent 55%),linear-gradient(135deg,#24466B,#16304D)",
    "dark": true
  },
  {
    "key": "hero_bg_getinvolved_s1",
    "label": "Get Involved: Your next step",
    "page": "/get-involved",
    "pageLabel": "Get Involved page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_getinvolved_s2",
    "label": "Get Involved: Where you can belong",
    "page": "/get-involved",
    "pageLabel": "Get Involved page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_getinvolved_s3",
    "label": "Get Involved: Take the first step.",
    "page": "/get-involved",
    "pageLabel": "Get Involved page",
    "backdrop": "radial-gradient(90% 100% at 85% 0%,rgba(127,209,203,.18),transparent 55%),linear-gradient(135deg,#24466B,#16304D)",
    "dark": true
  },
  {
    "key": "hero_bg_nextsteps_s1",
    "label": "Next Steps: What feels like your next step?",
    "page": "/next-steps",
    "pageLabel": "Next Steps page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_nextsteps_s2",
    "label": "Next Steps: Let us walk with you",
    "page": "/next-steps",
    "pageLabel": "Next Steps page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_nextsteps_s3",
    "label": "Next Steps: Still getting to know Fairview?",
    "page": "/next-steps",
    "pageLabel": "Next Steps page",
    "backdrop": "radial-gradient(90% 100% at 85% 0%,rgba(127,209,203,.18),transparent 55%),linear-gradient(135deg,#24466B,#16304D)",
    "dark": true
  },
  {
    "key": "hero_bg_events_s1",
    "label": "Events: Upcoming events",
    "page": "/events",
    "pageLabel": "Events page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_events_s2",
    "label": "Events: The short list",
    "page": "/events",
    "pageLabel": "Events page",
    "backdrop": "#E6F1EE",
    "dark": false
  },
  {
    "key": "hero_bg_events_s3",
    "label": "Events: Our weekly rhythm",
    "page": "/events",
    "pageLabel": "Events page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_events_s4",
    "label": "Events: Recent highlights",
    "page": "/events",
    "pageLabel": "Events page",
    "backdrop": "#E6F1EE",
    "dark": false
  },
  {
    "key": "hero_bg_events_s5",
    "label": "Events: Have an idea or a question?",
    "page": "/events",
    "pageLabel": "Events page",
    "backdrop": "radial-gradient(90% 100% at 85% 0%,rgba(127,209,203,.18),transparent 55%),linear-gradient(135deg,#24466B,#16304D)",
    "dark": true
  },
  {
    "key": "hero_bg_missions_s1",
    "label": "Missions: Where we serve",
    "page": "/missions",
    "pageLabel": "Missions page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_missions_s2",
    "label": "Missions: Feeling the call?",
    "page": "/missions",
    "pageLabel": "Missions page",
    "backdrop": "radial-gradient(90% 100% at 85% 0%,rgba(127,209,203,.18),transparent 55%),linear-gradient(135deg,#24466B,#16304D)",
    "dark": true
  },
  {
    "key": "hero_bg_give_s1",
    "label": "Give: Make a gift",
    "page": "/give",
    "pageLabel": "Give page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_give_s2",
    "label": "Give: Prefer to give another way?",
    "page": "/give",
    "pageLabel": "Give page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_give_s3",
    "label": "Give: Every gift fuels real ministry",
    "page": "/give",
    "pageLabel": "Give page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_give_s4",
    "label": "Give: \"God loveth a cheerful giver.\"",
    "page": "/give",
    "pageLabel": "Give page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_give_s5",
    "label": "Give: Questions about giving",
    "page": "/give",
    "pageLabel": "Give page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_give_s6",
    "label": "Give: Thank you for giving.",
    "page": "/give",
    "pageLabel": "Give page",
    "backdrop": "radial-gradient(90% 100% at 85% 0%,rgba(127,209,203,.18),transparent 55%),linear-gradient(135deg,#24466B,#16304D)",
    "dark": true
  },
  {
    "key": "hero_bg_contact_s1",
    "label": "Contact: Come say hello",
    "page": "/contact",
    "pageLabel": "Contact page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_contact_s2",
    "label": "Contact: Right here in Clay",
    "page": "/contact",
    "pageLabel": "Contact page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_contact_s3",
    "label": "Contact: We can't wait to meet you.",
    "page": "/contact",
    "pageLabel": "Contact page",
    "backdrop": "radial-gradient(90% 100% at 85% 0%,rgba(127,209,203,.18),transparent 55%),linear-gradient(135deg,#24466B,#16304D)",
    "dark": true
  },
  {
    "key": "hero_bg_watch_s1",
    "label": "The Overlook: Service archive",
    "page": "/watch",
    "pageLabel": "The Overlook page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_watch_s2",
    "label": "The Overlook: Set a reminder",
    "page": "/watch",
    "pageLabel": "The Overlook page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_watch_s3",
    "label": "The Overlook: Latest message",
    "page": "/watch",
    "pageLabel": "The Overlook page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_watch_s4",
    "label": "The Overlook: Browse past messages",
    "page": "/watch",
    "pageLabel": "The Overlook page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_watch_s5",
    "label": "The Overlook: Latest",
    "page": "/watch",
    "pageLabel": "The Overlook page",
    "backdrop": "#FAF6ED",
    "dark": false
  },
  {
    "key": "hero_bg_watch_s6",
    "label": "The Overlook: Singing and specials",
    "page": "/watch",
    "pageLabel": "The Overlook page",
    "backdrop": "#F2ECDD",
    "dark": false
  },
  {
    "key": "hero_bg_watch_s7",
    "label": "The Overlook: Better yet, join us in person",
    "page": "/watch",
    "pageLabel": "The Overlook page",
    "backdrop": "radial-gradient(90% 100% at 85% 0%,rgba(127,209,203,.18),transparent 55%),linear-gradient(135deg,#24466B,#16304D)",
    "dark": true
  }
];
  MEDIA_BG = MEDIA_BG.concat(MEDIA_BG_GEN.map(function (item) {
    item.kind = 'background'; item.ratio = 'hero-page'; return item;
  }));
  var MEDIA_PHOTO = [
    { key: 'photo_welcome', label: 'Home: welcome photo (page shows no box until one is added)', page: '/', ratio: 'four-three' },
    { key: 'photo_visit', label: 'Visit: welcome photo', page: '/visit', ratio: 'landscape' },
    { key: 'pastor_photo', label: 'Staff: Pastor Michael Spurlock', page: '/staff', ratio: 'portrait' },
    { key: 'staff1_photo', label: 'Staff: Jamie Taylor', page: '/staff', ratio: 'square' },
    { key: 'staff2_photo', label: 'Staff: Robbie King', page: '/staff', ratio: 'square' },
    { key: 'staff3_photo', label: 'Staff: Frank Kleman', page: '/staff', ratio: 'square' },
    { key: 'staff4_photo', label: 'Staff: Curtis Moore', page: '/staff', ratio: 'square' },
    { key: 'staff5_photo', label: 'Staff: Joyce Legg', page: '/staff', ratio: 'square' },
    { key: 'staff6_photo', label: 'Staff: Kris Moore', page: '/staff', ratio: 'square' },
    { key: 'photo_staff_group', label: 'Staff: group photo', page: '/staff', ratio: 'four-three', builtIn: 'staff-collage' },
    { key: 'photo_gi_kids', label: 'Get Involved: Sunday School', page: '/get-involved', ratio: 'wide' },
    { key: 'photo_gi_youth', label: 'Get Involved: Youth Ministry', page: '/get-involved', ratio: 'wide' },
    { key: 'photo_gi_groups', label: 'Get Involved: H.O.P.E. Recovery', page: '/get-involved', ratio: 'wide' },
    { key: 'photo_gi_van', label: 'Get Involved: Van Ministry', page: '/get-involved', ratio: 'wide' },
    { key: 'photo_gi_menswomens', label: 'Get Involved: Soul-Winning Visitation', page: '/get-involved', ratio: 'wide' },
    { key: 'photo_gi_missions', label: 'Get Involved: Missions', page: '/get-involved', ratio: 'wide' },
    { key: 'photo_gi_music', label: 'Get Involved: Music and Choir', page: '/get-involved', ratio: 'wide' },
  ].map(function (item) {
    item.kind = 'photo';
    item.pageLabel = ({ '/': 'Home page', '/visit': 'Visit page', '/staff': 'Staff page', '/get-involved': 'Get Involved page' })[item.page] || 'Photos';
    return item;
  });
  // Text that lives on top of each background slot. Edited inside the media
  // designer, previewed live on the stage, and saved with the design. Defs
  // mirror the baked page copy (and FBT_SCHEMA).
  var MEDIA_TEXT = {
    hero_bg_home: [
      { key: 'home_hero_kick', label: 'Script line', def: 'Welcome home to' },
      { key: 'home_hero_heading', label: 'Headline (*words* turn teal)', def: 'Fairview *Baptist Temple*', rich: true },
      { key: 'home_hero_sub', label: 'Subtext', def: 'An independent Baptist church on Main Street in Clay, West Virginia. Old fashioned singing, preaching from the King James Bible, and a seat saved for you this Sunday.', multi: true }
    ],
    hero_bg_visit: [
      { key: 'visit_hero_kick', label: 'Script line', def: 'New to Fairview?' },
      { key: 'visit_hero_heading', label: 'Headline (*words* turn teal)', def: 'Walking in somewhere new is *easier* than you think', rich: true },
      { key: 'visit_hero_sub', label: 'Subtext', def: 'This page answers the questions folks usually have when they are looking for a church home. Come as you are. There is no pressure, and no spotlight on the new face in the room.', multi: true }
    ],
    hero_bg_beliefs: [
      { key: 'beliefs_hero_kick', label: 'Script line', def: 'What we believe' },
      { key: 'beliefs_hero_heading', label: 'Headline (*words* turn teal)', def: 'We take God at His *Word*', rich: true },
      { key: 'beliefs_hero_sub', label: 'Subtext', def: 'Fairview Baptist Temple is an independent, fundamental Baptist church in Clay, West Virginia. We stand on the King James Bible, we preach the gospel of Jesus Christ, and we hold to the old paths without apology.', multi: true }
    ],
    hero_bg_staff: [
      { key: 'staff_hero_kick', label: 'Script line', def: 'Our staff' },
      { key: 'staff_hero_heading', label: 'Headline (*words* turn teal)', def: 'Come meet the church *family*', rich: true },
      { key: 'staff_hero_sub', label: 'Subtext', def: 'There is no front desk between you and us. When you pull in off Main Street, real folks are glad to see you. Meet our pastor here, then come shake hands with the whole church family on Sunday.', multi: true }
    ],
    hero_bg_getinvolved: [
      { key: 'getinvolved_hero_kick', label: 'Script line', def: 'Get Involved' },
      { key: 'getinvolved_hero_heading', label: 'Headline (*words* turn teal)', def: "There's a place *for you* here", rich: true },
      { key: 'getinvolved_hero_sub', label: 'Subtext', def: 'Church is meant to be lived together. Whatever season you are in and whatever you carry, there is a place for you at Fairview and people ready to walk with you.', multi: true }
    ],
    hero_bg_nextsteps: [
      { key: 'nextsteps_hero_kick', label: 'Script line', def: 'Your Next Step' },
      { key: 'nextsteps_hero_heading', label: 'Headline (*words* turn teal)', def: 'You do not have to take it *alone*', rich: true },
      { key: 'nextsteps_hero_sub', label: 'Subtext', def: 'Whether you are wondering about salvation, ready to be baptized, looking for a church family, or simply need someone to talk with, there is a place to begin. Tell us where you are, and a real person from Fairview will walk with you.', multi: true }
    ],
    hero_bg_events: [
      { key: 'events_hero_heading', label: 'Headline (*words* turn teal)', def: "What's happening at *Fairview*", rich: true },
      { key: 'events_hero_sub', label: 'Subtext', def: 'Revival meetings, homecoming Sundays, church fellowships, Vacation Bible School, and special services. There is always a seat for you here.', multi: true }
    ],
    hero_bg_missions: [
      { key: 'missions_hero_heading', label: 'Headline (*words* turn teal)', def: 'Beyond these *hills*', rich: true },
      { key: 'missions_hero_sub', label: 'Subtext', def: 'Praying for and supporting missionaries from the hills of Clay County unto the uttermost part of the earth. Acts 1:8, KJV.', multi: true }
    ],
    hero_bg_give: [
      { key: 'give_hero_kick', label: 'Script line', def: 'Give' },
      { key: 'give_hero_heading', label: 'Headline (*words* turn teal)', def: 'Tithes and offerings are *worship*', rich: true },
      { key: 'give_hero_sub', label: 'Subtext', def: 'At Fairview Baptist Temple we bring our tithes and offerings to the Lord with grateful hearts, as part of our worship. Thank you for having a part in carrying the gospel through Clay County and far beyond these hills.', multi: true }
    ],
    hero_bg_contact: [
      { key: 'contact_hero_kick', label: 'Script line', def: 'Contact' },
      { key: 'contact_hero_heading', label: 'Headline (*words* turn teal)', def: 'We would *love* to hear from you', rich: true },
      { key: 'contact_hero_sub', label: 'Subtext', def: 'The best way to reach us is a phone call. Have a question, need a ride to church, or want help planning your first visit? Call 304-587-4709 and a real person will help you out.', multi: true }
    ],
    hero_bg_hope: [
      { key: 'hope_band_heading', label: 'Band headline (*words* turn aqua)', def: 'Fighting addiction? There is H.O.P.E.', rich: true },
      { key: 'hope_band_sub', label: 'Band paragraph', def: 'A Christ centered recovery program that meets Friday evenings at the church. No judgment, just the gospel and people who care. Our van will even come get you. Call 304-587-4709.', multi: true },
      { key: 'hope_band_cta', label: 'Button label', def: 'Learn about H.O.P.E.' }
    ],
    hero_bg_welcome_home: [
      { key: 'home_welcome_kick', label: 'Script line', def: 'Welcome home to Fairview' },
      { key: 'home_welcome_heading', label: 'Heading', def: 'A church family in the hills' },
      { key: 'home_welcome_body', label: 'Paragraph', def: 'We are a church family in the hills of Clay County that believes the Bible, loves people, and preaches Christ crucified, buried, and risen again. However you come and whatever you carry, you will find a warm welcome, honest preaching, and a place to belong.', multi: true }
    ],
    hero_bg_stream_home: [
      { key: 'home_stream_kick', label: 'Script line', def: 'The Overlook' },
      { key: 'home_stream_heading', label: 'Heading (*words* turn teal)', def: 'Catch the latest message', rich: true },
      { key: 'home_stream_sub', label: 'Paragraph', def: 'Join us live on Sundays, or stream any past service and the singing from our church family, anytime and free.', multi: true }
    ],
    hero_bg_missions_home: [
      { key: 'home_missions_kick', label: 'Script line', def: 'Beyond the hills' },
      { key: 'home_missions_heading', label: 'Heading (*words* turn teal)', def: 'Our reach around the *world*', rich: true },
      { key: 'home_missions_sub', label: 'Paragraph', def: 'Fairview keeps a strong missions program, sending and supporting missionaries carrying the gospel far beyond Clay County. Explore where they serve and pray with them.', multi: true },
      { key: 'home_missions_cta', label: 'Button label', def: 'Explore the map' }
    ],
    hero_bg_contact_home: [
      { key: 'home_contact_kick', label: 'Script line', def: "We'd love to meet you" },
      { key: 'home_contact_heading', label: 'Heading (*words* turn teal)', def: 'Come visit us *this Sunday.*', rich: true }
    ],
    hero_bg_tile_new: [
      { key: 'tile_new_title', label: 'Tile title', def: "I'm New" },
      { key: 'tile_new_sub', label: 'Tile subtitle', def: 'Plan your first visit' }
    ],
    hero_bg_tile_overlook: [
      { key: 'tile_overlook_title', label: 'Tile title', def: 'The Overlook' },
      { key: 'tile_overlook_sub', label: 'Tile subtitle', def: 'Watch live and past messages' }
    ],
    hero_bg_tile_ministries: [
      { key: 'tile_ministries_title', label: 'Tile title', def: 'Ministries' },
      { key: 'tile_ministries_sub', label: 'Tile subtitle', def: 'H.O.P.E. · Van · Youth · Missions' }
    ]
  };
  var MEDIA_TEXT_GEN = {
  "hero_bg_visit_s1": [
    {
      "key": "visit_s1_kick",
      "label": "Script line",
      "def": "Your first visit"
    },
    {
      "key": "visit_s1_heading",
      "label": "Heading (*words* turn teal)",
      "def": "What to *expect*",
      "rich": true
    },
    {
      "key": "visit_s1_sub",
      "label": "Paragraph",
      "def": "A simple, honest Sunday. Here is the feel of a service with us.",
      "multi": true
    }
  ],
  "hero_bg_visit_s2": [
    {
      "key": "visit_s2_kick",
      "label": "Script line",
      "def": "Your first Sunday"
    },
    {
      "key": "visit_s2_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Here's exactly *how it goes*",
      "rich": true
    },
    {
      "key": "visit_s2_sub",
      "label": "Paragraph",
      "def": "No guessing, no surprises. From Main Street to the last amen, here is what a Sunday looks like.",
      "multi": true
    }
  ],
  "hero_bg_visit_s3": [
    {
      "key": "visit_s3_kick",
      "label": "Script line",
      "def": "Plan your visit"
    },
    {
      "key": "visit_s3_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Let us know you're *coming*",
      "rich": true
    },
    {
      "key": "visit_s3_sub",
      "label": "Paragraph",
      "def": "Tell us a little about your visit and we will be watching for you, save you a seat, and have a friendly face ready to say hello. No pressure, and no sales pitch.",
      "multi": true
    }
  ],
  "hero_bg_visit_s4": [
    {
      "key": "visit_s4_kick",
      "label": "Script line",
      "def": "Service times"
    },
    {
      "key": "visit_s4_heading",
      "label": "Heading (*words* turn teal)",
      "def": "When we *gather*",
      "rich": true
    },
    {
      "key": "visit_s4_sub",
      "label": "Paragraph",
      "def": "Join us any week. Here is the schedule.",
      "multi": true
    }
  ],
  "hero_bg_visit_s5": [
    {
      "key": "visit_s5_kick",
      "label": "Script line",
      "def": "Good to know"
    },
    {
      "key": "visit_s5_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Common *questions*",
      "rich": true
    },
    {
      "key": "visit_s5_sub",
      "label": "Paragraph",
      "def": "The things first-time visitors usually want to ask.",
      "multi": true
    }
  ],
  "hero_bg_visit_s6": [
    {
      "key": "visit_s6_kick",
      "label": "Script line",
      "def": "Plan your visit"
    },
    {
      "key": "visit_s6_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Find *us*",
      "rich": true
    },
    {
      "key": "visit_s6_sub",
      "label": "Paragraph",
      "def": "We are right on Main Street in Clay, and we would love to see you Sunday.",
      "multi": true
    }
  ],
  "hero_bg_visit_s7": [
    {
      "key": "visit_s7_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Get the *latest from Fairview*",
      "rich": true
    },
    {
      "key": "visit_s7_sub",
      "label": "Paragraph",
      "def": "Service updates, upcoming events, and the occasional note of encouragement. No spam, and you can unsubscribe anytime.",
      "multi": true
    }
  ],
  "hero_bg_visit_s8": [
    {
      "key": "visit_s8_heading",
      "label": "Heading (*words* turn teal)",
      "def": "We saved you a *seat*",
      "rich": true
    },
    {
      "key": "visit_s8_sub",
      "label": "Paragraph",
      "def": "This Sunday \u00b7 Worship at 11:00am \u00b7 Clay, WV",
      "multi": true
    }
  ],
  "hero_bg_beliefs_s1": [
    {
      "key": "beliefs_s1_kick",
      "label": "Script line",
      "def": "Unto the hills"
    },
    {
      "key": "beliefs_s1_heading",
      "label": "Verse or quote",
      "def": "\"I will lift up mine eyes unto the hills, from whence cometh my help.\"",
      "rich": true
    },
    {
      "key": "beliefs_s1_ref",
      "label": "Reference line",
      "def": "Psalm 121:1 \u00b7 KJV"
    }
  ],
  "hero_bg_beliefs_s2": [
    {
      "key": "beliefs_s2_kick",
      "label": "Script line",
      "def": "Our heart"
    },
    {
      "key": "beliefs_s2_heading",
      "label": "Heading (*words* turn teal)",
      "def": "What we hold *to*",
      "rich": true
    },
    {
      "key": "beliefs_s2_sub",
      "label": "Paragraph",
      "def": "Four plain truths that shape who we are and how we serve.",
      "multi": true
    }
  ],
  "hero_bg_beliefs_s3": [
    {
      "key": "beliefs_s3_kick",
      "label": "Script line",
      "def": "Our statement"
    },
    {
      "key": "beliefs_s3_heading",
      "label": "Heading (*words* turn teal)",
      "def": "What we *stand on*",
      "rich": true
    }
  ],
  "hero_bg_beliefs_s4": [
    {
      "key": "beliefs_s4_kick",
      "label": "Script line",
      "def": "Good news"
    },
    {
      "key": "beliefs_s4_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Jesus has made a *way*",
      "rich": true
    }
  ],
  "hero_bg_beliefs_s5": [
    {
      "key": "beliefs_s5_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Come and *see*.",
      "rich": true
    },
    {
      "key": "beliefs_s5_sub",
      "label": "Paragraph",
      "def": "Sundays 10:00am, 11:00am & 6:00pm \u00b7 Wednesday 7:00pm",
      "multi": true
    }
  ],
  "hero_bg_staff_s1": [
    {
      "key": "staff_s1_kick",
      "label": "Script line",
      "def": "The team"
    },
    {
      "key": "staff_s1_heading",
      "label": "Heading (*words* turn teal)",
      "def": "The people *who serve*",
      "rich": true
    },
    {
      "key": "staff_s1_sub",
      "label": "Paragraph",
      "def": "Fairview is served by folks who love this church and love the people who walk through its doors. Come put faces to the names on Sunday.",
      "multi": true
    }
  ],
  "hero_bg_staff_s2": [
    {
      "key": "staff_s2_kick",
      "label": "Script line",
      "def": "Reach out"
    },
    {
      "key": "staff_s2_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Have a question? *We are here.*",
      "rich": true
    },
    {
      "key": "staff_s2_sub",
      "label": "Paragraph",
      "def": "Whether you are new to church, coming back after years away, or just need somebody to pray with you, we would love to hear from you. Call or send a note and we will get back to you.",
      "multi": true
    }
  ],
  "hero_bg_staff_s3": [
    {
      "key": "staff_s3_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Come meet us *in person*.",
      "rich": true
    },
    {
      "key": "staff_s3_sub",
      "label": "Paragraph",
      "def": "Sunday School 10:00am \u00b7 Worship 11:00am & 6:00pm \u00b7 Wednesday 7:00pm",
      "multi": true
    }
  ],
  "hero_bg_getinvolved_s1": [
    {
      "key": "getinvolved_s1_kick",
      "label": "Script line",
      "def": "Start here"
    },
    {
      "key": "getinvolved_s1_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Your *next step*",
      "rich": true
    },
    {
      "key": "getinvolved_s1_sub",
      "label": "Paragraph",
      "def": "Not sure where to begin? Take the first small step, and we'll help you find the rest.",
      "multi": true
    }
  ],
  "hero_bg_getinvolved_s2": [
    {
      "key": "getinvolved_s2_kick",
      "label": "Script line",
      "def": "Ministries"
    },
    {
      "key": "getinvolved_s2_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Where you can *belong*",
      "rich": true
    },
    {
      "key": "getinvolved_s2_sub",
      "label": "Paragraph",
      "def": "Sunday School meets at 10:00am and worship begins at 11:00am. From the van route to the mission field, here is where Fairview serves. Reach out and we'll help you find the right place to start.",
      "multi": true
    }
  ],
  "hero_bg_getinvolved_s3": [
    {
      "key": "getinvolved_s3_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Take the *first step.*",
      "rich": true
    },
    {
      "key": "getinvolved_s3_sub",
      "label": "Paragraph",
      "def": "We'd love to help you find your place at Fairview.",
      "multi": true
    }
  ],
  "hero_bg_nextsteps_s1": [
    {
      "key": "nextsteps_s1_kick",
      "label": "Script line",
      "def": "Start Where You Are"
    },
    {
      "key": "nextsteps_s1_heading",
      "label": "Heading (*words* turn teal)",
      "def": "What feels like your *next step?*",
      "rich": true
    },
    {
      "key": "nextsteps_s1_sub",
      "label": "Paragraph",
      "def": "You do not need to have the right words or know the whole plan. Choose the place that best fits today, and we will help with what comes next.",
      "multi": true
    }
  ],
  "hero_bg_nextsteps_s2": [
    {
      "key": "nextsteps_s2_kick",
      "label": "Script line",
      "def": "We Are Here to Help"
    },
    {
      "key": "nextsteps_s2_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Let us walk *with you*",
      "rich": true
    },
    {
      "key": "nextsteps_s2_sub",
      "label": "Paragraph",
      "def": "This is not a commitment or an application. It is simply a way to start a real conversation with someone who cares.",
      "multi": true
    }
  ],
  "hero_bg_nextsteps_s3": [
    {
      "key": "nextsteps_s3_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Still getting to know *Fairview?*",
      "rich": true
    },
    {
      "key": "nextsteps_s3_sub",
      "label": "Paragraph",
      "def": "Come see what a Sunday is like",
      "multi": true
    }
  ],
  "hero_bg_events_s1": [
    {
      "key": "events_s1_kick",
      "label": "Script line",
      "def": "Mark your calendar"
    },
    {
      "key": "events_s1_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Upcoming *events*",
      "rich": true
    },
    {
      "key": "events_s1_sub",
      "label": "Paragraph",
      "def": "Special days come around all year at Fairview: revivals, homecomings, fellowships, and more. Tap any event for details and to register.",
      "multi": true
    }
  ],
  "hero_bg_events_s2": [
    {
      "key": "events_s2_kick",
      "label": "Script line",
      "def": "At a glance"
    },
    {
      "key": "events_s2_heading",
      "label": "Heading (*words* turn teal)",
      "def": "The *short list*",
      "rich": true
    }
  ],
  "hero_bg_events_s3": [
    {
      "key": "events_s3_kick",
      "label": "Script line",
      "def": "Every week"
    },
    {
      "key": "events_s3_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Our weekly *rhythm*",
      "rich": true
    },
    {
      "key": "events_s3_sub",
      "label": "Paragraph",
      "def": "The services you can count on, week in and week out.",
      "multi": true
    }
  ],
  "hero_bg_events_s4": [
    {
      "key": "events_s4_kick",
      "label": "Script line",
      "def": "Looking back"
    },
    {
      "key": "events_s4_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Recent *highlights*",
      "rich": true
    },
    {
      "key": "events_s4_sub",
      "label": "Paragraph",
      "def": "A look back at what God has been doing at Fairview.",
      "multi": true
    }
  ],
  "hero_bg_events_s5": [
    {
      "key": "events_s5_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Have an idea or a question?",
      "rich": true
    },
    {
      "key": "events_s5_sub",
      "label": "Paragraph",
      "def": "We'd love to hear from you",
      "multi": true
    }
  ],
  "hero_bg_missions_s1": [
    {
      "key": "missions_s1_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Where we *serve*",
      "rich": true
    },
    {
      "key": "missions_s1_sub",
      "label": "Paragraph",
      "def": "Missions is not a side project at Fairview, it is part of who we are. Our church gives to send and support missionaries carrying the gospel around the world, and Fairview appears in the AFBM missions directory. As our missionaries are added in Studio, their pins and stories will show up on the map and in the list below.",
      "multi": true
    }
  ],
  "hero_bg_missions_s2": [
    {
      "key": "missions_s2_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Feeling the *call?*",
      "rich": true
    },
    {
      "key": "missions_s2_sub",
      "label": "Paragraph",
      "def": "Whether you want to pray, give, or go, we would love to talk with you about missions.",
      "multi": true
    }
  ],
  "hero_bg_give_s1": [
    {
      "key": "give_s1_kick",
      "label": "Script line",
      "def": "Secure online giving"
    },
    {
      "key": "give_s1_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Make a gift",
      "rich": true
    },
    {
      "key": "give_s1_sub",
      "label": "Paragraph",
      "def": "Choose an amount, a fund, and the way you would like to give.",
      "multi": true
    }
  ],
  "hero_bg_give_s2": [
    {
      "key": "give_s2_kick",
      "label": "Script line",
      "def": "Other ways to give"
    },
    {
      "key": "give_s2_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Prefer to give *another way?*",
      "rich": true
    }
  ],
  "hero_bg_give_s3": [
    {
      "key": "give_s3_kick",
      "label": "Script line",
      "def": "Where it goes"
    },
    {
      "key": "give_s3_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Every gift fuels *real ministry*",
      "rich": true
    },
    {
      "key": "give_s3_sub",
      "label": "Paragraph",
      "def": "Here's how your giving goes to work, in Clay and far beyond.",
      "multi": true
    }
  ],
  "hero_bg_give_s4": [
    {
      "key": "give_s4_kick",
      "label": "Script line",
      "def": "A cheerful heart"
    },
    {
      "key": "give_s4_heading",
      "label": "Verse or quote",
      "def": "\"God loveth a cheerful giver.\"",
      "rich": true
    },
    {
      "key": "give_s4_ref",
      "label": "Reference line",
      "def": "2 Corinthians 9:7 \u00b7 KJV"
    }
  ],
  "hero_bg_give_s5": [
    {
      "key": "give_s5_kick",
      "label": "Script line",
      "def": "Good to know"
    },
    {
      "key": "give_s5_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Questions about *giving*",
      "rich": true
    }
  ],
  "hero_bg_give_s6": [
    {
      "key": "give_s6_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Thank you for *giving*.",
      "rich": true
    },
    {
      "key": "give_s6_sub",
      "label": "Paragraph",
      "def": "Every gift matters here, and every gift goes to work.",
      "multi": true
    }
  ],
  "hero_bg_contact_s1": [
    {
      "key": "contact_s1_kick",
      "label": "Script line",
      "def": "Reach Out"
    },
    {
      "key": "contact_s1_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Come say *hello*",
      "rich": true
    },
    {
      "key": "contact_s1_sub",
      "label": "Paragraph",
      "def": "Stop by any service, give us a call, or drop us a note below. We would be glad to hear from you.",
      "multi": true
    }
  ],
  "hero_bg_contact_s2": [
    {
      "key": "contact_s2_kick",
      "label": "Script line",
      "def": "Find Us"
    },
    {
      "key": "contact_s2_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Right here in *Clay*",
      "rich": true
    },
    {
      "key": "contact_s2_sub",
      "label": "Paragraph",
      "def": "We are at 2294 Main Street in downtown Clay, an easy drive from anywhere in the county. If you need a ride, our van ministry will come get you free of charge.",
      "multi": true
    }
  ],
  "hero_bg_contact_s3": [
    {
      "key": "contact_s3_heading",
      "label": "Heading (*words* turn teal)",
      "def": "We can't wait to *meet* you.",
      "rich": true
    },
    {
      "key": "contact_s3_sub",
      "label": "Paragraph",
      "def": "This Sunday \u00b7 Worship at 11:00am \u00b7 Clay, WV",
      "multi": true
    }
  ],
  "hero_bg_watch_s1": [
    {
      "key": "watch_s1_kick",
      "label": "Script line",
      "def": "Watch again"
    },
    {
      "key": "watch_s1_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Service *archive*",
      "rich": true
    },
    {
      "key": "watch_s1_sub",
      "label": "Paragraph",
      "def": "Every recorded service in one place. Search by title or date, or filter by year and service type.",
      "multi": true
    }
  ],
  "hero_bg_watch_s2": [
    {
      "key": "watch_s2_kick",
      "label": "Script line",
      "def": "When we stream"
    },
    {
      "key": "watch_s2_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Set a *reminder*",
      "rich": true
    },
    {
      "key": "watch_s2_sub",
      "label": "Paragraph",
      "def": "The same times we gather in person in Clay. We hope you'll join us.",
      "multi": true
    }
  ],
  "hero_bg_watch_s3": [
    {
      "key": "watch_s3_kick",
      "label": "Script line",
      "def": "Latest message"
    }
  ],
  "hero_bg_watch_s4": [
    {
      "key": "watch_s4_kick",
      "label": "Script line",
      "def": "Watch and search"
    },
    {
      "key": "watch_s4_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Browse *past messages*",
      "rich": true
    },
    {
      "key": "watch_s4_sub",
      "label": "Paragraph",
      "def": "Every video message in one place. Search and filter by speaker, Scripture, or topic.",
      "multi": true
    }
  ],
  "hero_bg_watch_s5": [
    {
      "key": "watch_s5_kick",
      "label": "Script line",
      "def": "Latest"
    }
  ],
  "hero_bg_watch_s6": [
    {
      "key": "watch_s6_kick",
      "label": "Script line",
      "def": "Music library"
    },
    {
      "key": "watch_s6_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Singing and *specials*",
      "rich": true
    },
    {
      "key": "watch_s6_sub",
      "label": "Paragraph",
      "def": "Congregational singing and specials from our services. Everything is also on our YouTube channel.",
      "multi": true
    }
  ],
  "hero_bg_watch_s7": [
    {
      "key": "watch_s7_heading",
      "label": "Heading (*words* turn teal)",
      "def": "Better yet, join us *in person*",
      "rich": true
    },
    {
      "key": "watch_s7_sub",
      "label": "Paragraph",
      "def": "This Sunday \u00b7 Worship at 11:00am & 6:00pm \u00b7 Clay, WV",
      "multi": true
    }
  ],
  "hero_bg_live": [
    {
      "key": "watch_hero_kick",
      "label": "Script line",
      "def": "The Overlook"
    },
    {
      "key": "watch_hero_heading",
      "label": "Headline (*words* turn teal)",
      "def": "Worship with us, *anytime*",
      "rich": true
    },
    {
      "key": "watch_hero_sub",
      "label": "Subtext",
      "def": "Join us live, rewatch past preaching, or sing along with the music. Pick what you came for below.",
      "multi": true
    }
  ]
};
  Object.keys(MEDIA_TEXT_GEN).forEach(function (k) {
    MEDIA_TEXT[k] = (MEDIA_TEXT[k] || []).concat(MEDIA_TEXT_GEN[k]);
  });
  function mediaTextFields(meta) { return (meta && MEDIA_TEXT[meta.key]) || []; }
  function mediaTextValue(field, draft) {
    if (draft && mediaEdit && Object.prototype.hasOwnProperty.call(mediaEdit.pendingValues, field.key)) {
      return mediaEdit.pendingValues[field.key];
    }
    var saved = nn(mediaVals[field.key]);
    return saved || field.def;
  }
  // The church palette, offered on every text color control so pages match.
  var MEDIA_PALETTE = ['#FFF8EA', '#7FD1CB', '#29A5A0', '#1A9088', '#223A5E', '#16212B', '#FFFFFF'];
  function mediaColorRoles(meta) {
    var fields = mediaTextFields(meta);
    if (!fields.length || meta.key.indexOf('hero_bg_tile_') === 0) return [];
    var roles = [];
    fields.forEach(function (f) {
      if (/_kick$/.test(f.key)) roles.push({ key: f.key + '_color', label: 'Script line color', role: 'kick' });
      else if (/_heading$/.test(f.key)) {
        roles.push({ key: f.key + '_color', label: 'Headline color', role: 'heading' });
        roles.push({ key: f.key.replace(/_heading$/, '_accent') + '_color', label: 'Accent word color', role: 'accent' });
      }
      else if (/_sub$|_body$/.test(f.key)) roles.push({ key: f.key + '_color', label: 'Subtext color', role: 'sub' });
    });
    return roles;
  }
  function mediaColorValue(key) {
    var v;
    if (mediaEdit && Object.prototype.hasOwnProperty.call(mediaEdit.pendingValues, key)) v = mediaEdit.pendingValues[key];
    else v = mediaVals[key];
    v = nn(v);
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '';
  }
  function mediaHeroOnPhoto() {
    if (!mediaEdit) return true;
    var st = mediaEdit.style || {};
    return st.source === 'image' || st.source === 'video' || st.source === 'background' ||
      (st.source === 'auto' && (mediaHasImage(mediaEdit.meta, true) || !!mediaVideo(mediaEdit.meta, true)));
  }
  function mediaColorAuto(role) {
    var dark = mediaHeroOnPhoto();
    if (role === 'heading') return dark ? '#FFF8EA' : '#223A5E';
    if (role === 'sub') return dark ? '#EDE4D3' : '#5C6670';
    return dark ? '#7FD1CB' : '#29A5A0';
  }
  function richem(text) {
    return esc(text).replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }
  var IMG_SVG = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>';
  var mediaBuilt = false, mediaReady = false, mediaLoading = false, mediaVals = {}, mediaEdit = null;
  var mediaEditorTrigger = null, mediaPointerDown = false, mediaPointerStart = null, mediaSessionSeq = 0;

  function nn(x) { return (x && String(x).trim()) ? String(x).trim() : ''; }
  function mediaAll() { return MEDIA_BG.concat(MEDIA_PHOTO); }
  function mediaByKey(key) { return mediaAll().filter(function (m) { return m.key === key; })[0] || null; }
  function mediaVideoKey(meta) { return meta && meta.kind === 'background' ? meta.key.replace('hero_bg_', 'hero_vid_') : ''; }
  function mediaValue(key, draft) {
    if (draft && mediaEdit && Object.prototype.hasOwnProperty.call(mediaEdit.pendingValues, key)) {
      return mediaEdit.pendingValues[key];
    }
    return mediaVals[key];
  }
  function mediaImage(meta, draft) { return meta ? nn(mediaValue(meta.key, draft)) || meta.fallback || '' : ''; }
  function mediaVideo(meta, draft) { return meta ? nn(mediaValue(mediaVideoKey(meta), draft)) : ''; }
  function mediaHasImage(meta, draft) { return !!mediaImage(meta, draft) || !!(meta && meta.builtIn); }
  function mediaStyleKey(meta) { return mediaStyleApi && meta ? mediaStyleApi.styleKey(meta.key) : ''; }
  function mediaStoredStyle(meta) {
    var key = mediaStyleKey(meta);
    return key ? mediaStyleApi.parse(mediaVals[key], meta.kind) : null;
  }
  function mediaStyle(meta) { return mediaStoredStyle(meta) || mediaStyleApi.defaults(meta.kind); }
  function mediaBackdrop(style, meta) {
    var chosen = mediaStyleApi.backgroundValue(style, meta.kind);
    if (chosen) return chosen;
    if (meta.backdrop) return meta.backdrop;
    // No color picked ("theme") = whatever the live page shows behind the
    // media. Mirror those exact defaults so the preview matches the site.
    if (meta.kind === 'background') {
      if (meta.key === 'hero_bg_tile_new') return 'radial-gradient(70% 70% at 30% 30%,#3f7d84,#16333c 82%)';
      if (meta.key === 'hero_bg_tile_overlook') return 'radial-gradient(70% 70% at 70% 40%,#2f6a71,#122b33 82%)';
      if (meta.key === 'hero_bg_tile_ministries') return 'radial-gradient(70% 70% at 50% 70%,#39757c,#14303a 82%)';
      if (meta.key === 'hero_bg_hope') return 'radial-gradient(70% 70% at 40% 40%,#3f7d84,#132a31 85%)';
      if (meta.key === 'hero_bg_stream_home' || meta.key === 'hero_bg_missions_home') return '#E6F1EE';
      if (meta.key === 'hero_bg_contact_home') return '#F2ECDD';
      return meta.ratio === 'hero-home'
        ? 'radial-gradient(70% 55% at 78% 12%,rgba(41,165,160,.15),transparent 60%),radial-gradient(50% 60% at 8% 90%,rgba(34,58,94,.07),transparent 60%),#FAF6ED'
        : 'radial-gradient(70% 90% at 88% 0%,rgba(23,126,121,.1),transparent 55%),#FAF6ED';
    }
    return 'linear-gradient(150deg,#1E938C,#14424A)';
  }
  function mediaActiveSource(meta, style, draft) {
    var image = mediaHasImage(meta, draft), video = mediaVideo(meta, draft), source = style.source;
    if (meta.kind !== 'background' && source === 'video') source = 'image';
    if (source === 'background') return 'background';
    if (source === 'video') return video ? 'video' : (image ? 'image' : 'background');
    if (source === 'image') return image ? 'image' : 'background';
    if (video) return 'video';
    if (image) return 'image';
    return 'background';
  }
  function mediaRender(host, meta, style, viewport, editorMode, originalPreview) {
    if (!host || !meta || !mediaStyleApi) return;
    style = mediaStyleApi.normalize(style, meta.kind);
    var present = mediaStyleApi.presentation(style, meta.kind, viewport);
    var source = mediaActiveSource(meta, style, editorMode);
    host.innerHTML = '';
    host.setAttribute('data-media-source', source);
    host.style.background = mediaBackdrop(style, meta);
    var media = null;
    if (source === 'video') {
      media = document.createElement('video');
      media.muted = true; media.loop = true; media.playsInline = true; media.preload = editorMode ? 'auto' : 'metadata';
      media.setAttribute('muted', '');
      media.src = mediaVideo(meta, editorMode);
      if (mediaImage(meta, editorMode)) media.poster = mediaImage(meta, editorMode);
      if (editorMode && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        media.autoplay = true;
        var playAttempt = media.play();
        if (playAttempt && playAttempt.catch) playAttempt.catch(function () {});
      }
    } else if (source === 'image') {
      if (meta.builtIn === 'staff-collage' && !mediaImage(meta, editorMode)) {
        media = document.createElement('span');
        media.className = 'media-preview-collage';
        ['pastor_photo', 'staff1_photo', 'staff2_photo', 'staff3_photo'].forEach(function (key) {
          var personMeta = mediaByKey(key);
          var image = document.createElement('img');
          image.src = mediaImage(personMeta, editorMode);
          image.alt = '';
          media.appendChild(image);
        });
      } else {
        media = document.createElement('img');
        media.src = mediaImage(meta, editorMode);
        media.alt = '';
        media.decoding = 'async';
      }
    }
    if (media) {
      media.classList.add('media-preview-object');
      media.style.objectFit = present.fit;
      media.style.objectPosition = present.x + '% ' + present.y + '%';
      media.style.transform = 'scale(' + present.zoom + ')';
      media.style.transformOrigin = present.x + '% ' + present.y + '%';
      media.style.opacity = String(present.imageOpacity);
      host.appendChild(media);
    } else {
      var empty = document.createElement('span');
      empty.className = 'media-preview-empty';
      empty.innerHTML = IMG_SVG + '<span>' + (style.source === 'background' ? 'Color background' : 'Add an image or use a color background') + '</span>';
      host.appendChild(empty);
    }
    var overlay = document.createElement('span');
    overlay.className = 'media-preview-overlay';
    overlay.style.background = (originalPreview || (editorMode && mediaEdit && mediaEdit.restoreOriginal)) && meta.kind === 'background'
      ? (source === 'video'
        ? 'linear-gradient(165deg,rgba(10,38,46,.6),rgba(10,38,46,.88))'
        : source === 'image'
          ? 'linear-gradient(165deg,rgba(10,38,46,.74),rgba(10,38,46,.90))'
          : 'transparent')
      : present.overlay;
    host.appendChild(overlay);
    var isHeroBg = meta.kind === 'background' && meta.key.indexOf('hero_bg_tile_') !== 0 && !meta.noCopy;
    var heroScrim = isHeroBg && (source === 'image' || source === 'video' || present.source === 'background' || style.source === 'background');
    if (heroScrim) {
      // Mirror the live hero: pages add a fixed readability scrim over any photo.
      var scrim = document.createElement('span');
      scrim.className = 'media-hero-scrim';
      scrim.setAttribute('aria-hidden', 'true');
      host.appendChild(scrim);
    }
    if (editorMode && meta.kind === 'background' && !meta.noCopy) {
      var copy = document.createElement('span');
      copy.className = 'media-stage-copy';
      if (isHeroBg && !heroScrim && !meta.dark) copy.className += ' stage-on-light';
      if (meta.key.indexOf('hero_bg_tile_') === 0) copy.className += ' stage-tile';
      if (mediaShadowNone(meta)) copy.className += ' no-shadow';
      copy.innerHTML = stageCopyHtml(meta);
      host.appendChild(copy);
    }
    if (editorMode) {
      var point = viewport === 'mobile' ? style.mobile : style.desktop;
      var focal = document.createElement('span');
      focal.className = 'media-focal';
      focal.style.left = point.x + '%';
      focal.style.top = point.y + '%';
      focal.setAttribute('aria-hidden', 'true');
      host.appendChild(focal);
    }
    return source;
  }
  function stageCopyHtml(meta) {
    var fields = mediaTextFields(meta);
    if (!fields.length) {
      return '<span class="stage-kick">Fairview Baptist Temple</span><strong>' + esc(meta.label) + '</strong>';
    }
    var byRole = {};
    fields.forEach(function (f) {
      if (/_kick$/.test(f.key)) byRole.kick = f;
      else if (/_heading$|_title$/.test(f.key)) byRole.heading = f;
      else if (/_sub$/.test(f.key)) byRole.sub = f;
    });
    var html = '';
    if (meta.key.indexOf('hero_bg_tile_') === 0) {
      if (byRole.heading) html += '<strong>' + esc(mediaTextValue(byRole.heading, true)) + '</strong>';
      if (byRole.sub) html += '<span class="stage-tile-sub">' + esc(mediaTextValue(byRole.sub, true)) + '</span>';
      return html;
    }
    function tint(key) {
      var c = mediaColorValue(key);
      return c ? ' style="color:' + c + '"' : '';
    }
    if (byRole.kick) html += '<span class="stage-kick"' + tint(byRole.kick.key + '_color') + '>' + esc(mediaTextValue(byRole.kick, true)) + '</span>';
    if (byRole.heading) {
      var headingHtml = richem(mediaTextValue(byRole.heading, true));
      var accent = mediaColorValue(byRole.heading.key.replace(/_heading$/, '_accent') + '_color');
      if (accent) headingHtml = headingHtml.replace(/<em>/g, '<em style="color:' + accent + '">');
      html += '<strong' + tint(byRole.heading.key + '_color') + '>' + headingHtml + '</strong>';
    }
    if (byRole.sub && meta.ratio === 'hero-home') html += '<span class="stage-sub"' + tint(byRole.sub.key + '_color') + '>' + esc(mediaTextValue(byRole.sub, true)) + '</span>';
    return html;
  }
  function refreshStageText() {
    if (!mediaEdit) return;
    var copy = $('media-stage').querySelector('.media-stage-copy');
    if (!copy) return;
    copy.classList.toggle('no-shadow', mediaShadowNone(mediaEdit.meta));
    copy.innerHTML = stageCopyHtml(mediaEdit.meta);
  }
  var MATCH_FIELDS = ['background', 'backgroundColor', 'overlay', 'overlayColor', 'overlayOpacity', 'imageOpacity'];
  function buildMediaMatch(meta) {
    var grid = $('media-match-grid'), group = $('media-match-group');
    if (!grid || !group) return;
    group.hidden = false;
    $('media-match-undo').hidden = true;
    var textWrap = $('media-match-text-wrap');
    if (textWrap) textWrap.hidden = !mediaColorRoles(meta).length;
    var others = mediaAll().filter(function (m) { return m.key !== meta.key; });
    var samePage = others.filter(function (m) { return m.page === meta.page; });
    var pages = others.filter(function (m) { return m.page !== meta.page && m.kind === 'background'; });
    var photos = others.filter(function (m) { return m.page !== meta.page && m.kind === 'photo'; });
    function section(title, list) {
      if (!list.length) return '';
      return '<div class="media-match-head">' + title + '</div><div class="media-match-row">' + list.map(function (m) {
        var custom = !!mediaStoredStyle(m);
        return '<button type="button" class="media-match-item" data-match="' + esc(m.key) + '">' +
          '<span class="media-match-thumb" id="mmatch-' + esc(m.key) + '"></span>' +
          '<span>' + esc(m.label) + (custom ? '' : ' <small>(default)</small>') + '</span></button>';
      }).join('') + '</div>';
    }
    grid.innerHTML = '<details id="media-match-details"><summary>Browse designs to copy</summary><div class="media-match-list">' +
      section('On the same page', samePage) + section('Other pages', pages) + section('Photos', photos) +
      '</div></details>';
    var details = document.getElementById('media-match-details');
    details.addEventListener('toggle', function () {
      if (!details.open || details.getAttribute('data-rendered')) return;
      details.setAttribute('data-rendered', '1');
      others.forEach(function (m) {
        var el = document.getElementById('mmatch-' + m.key);
        if (!el) return;
        var stored = mediaStoredStyle(m);
        mediaRender(el, m, stored || mediaStyleApi.defaults(m.kind), 'desktop', false, !stored);
      });
    });
  }
  function applyMediaMatch(sourceKey) {
    if (!mediaEdit || !sourceKey) return;
    var srcMeta = mediaByKey(sourceKey);
    if (!srcMeta) return;
    var copyLook = !$('media-match-look') || $('media-match-look').checked;
    var copyText = $('media-match-text') && $('media-match-text').checked && !$('media-match-text-wrap').hidden;
    if (!copyLook && !copyText) { setMediaEditorMessage('Tick what to copy first: the look, the text colors, or both.', ''); return; }
    // First match this session: remember how things were, for Undo.
    if (!mediaEdit.matchUndo) {
      mediaEdit.matchUndo = {
        style: JSON.parse(JSON.stringify(mediaEdit.style)),
        pending: JSON.parse(JSON.stringify(mediaEdit.pendingValues)),
        dirty: mediaEdit.dirty
      };
    }
    var stored = mediaStoredStyle(srcMeta);
    var srcStyle = stored || mediaStyleApi.defaults(srcMeta.kind);
    if (copyLook) {
      MATCH_FIELDS.forEach(function (field) {
        if (srcStyle[field] !== undefined) mediaEdit.style[field] = srcStyle[field];
      });
    }
    if (copyText) {
      var srcRoles = {}, destRoles = {};
      mediaColorRoles(srcMeta).forEach(function (r) { srcRoles[r.role] = r.key; });
      mediaColorRoles(mediaEdit.meta).forEach(function (r) { destRoles[r.role] = r.key; });
      Object.keys(destRoles).forEach(function (role) {
        mediaEdit.pendingValues[destRoles[role]] = srcRoles[role] ? nn(mediaVals[srcRoles[role]]) : '';
      });
      mediaEdit.pendingValues[mediaEdit.meta.key + '_shadow'] = nn(mediaVals[srcMeta.key + '_shadow']);
    }
    Array.prototype.forEach.call(document.querySelectorAll('.media-match-item'), function (item) {
      item.classList.toggle('active', item.getAttribute('data-match') === sourceKey);
    });
    $('media-match-undo').hidden = false;
    mediaMarkDirty();
    buildMediaTextFields(mediaEdit.meta);
    syncMediaEditor(false);
    setMediaEditorMessage('Matched "' + srcMeta.label + '". Save to keep it, or Undo match to go back.', '');
  }
  function undoMediaMatch() {
    if (!mediaEdit || !mediaEdit.matchUndo) return;
    var undo = mediaEdit.matchUndo;
    mediaEdit.matchUndo = null;
    mediaEdit.style = undo.style;
    mediaEdit.pendingValues = undo.pending;
    mediaEdit.dirty = undo.dirty;
    Array.prototype.forEach.call(document.querySelectorAll('.media-match-item'), function (item) { item.classList.remove('active'); });
    $('media-match-undo').hidden = true;
    buildMediaTextFields(mediaEdit.meta);
    syncMediaEditor(false);
    setMediaEditorMessage(mediaEdit.dirty ? 'Match undone. Earlier unsaved changes are still here.' : 'Match undone.', '');
  }
  function mediaShadowNone(meta) {
    var key = meta.key + '_shadow';
    var v;
    if (mediaEdit && Object.prototype.hasOwnProperty.call(mediaEdit.pendingValues, key)) v = mediaEdit.pendingValues[key];
    else v = mediaVals[key];
    return String(v || '').trim() === 'none';
  }
  function buildMediaTextFields(meta) {
    var group = $('media-text-group'), wrap = $('media-text-fields');
    if (!group || !wrap) return;
    var fields = mediaTextFields(meta);
    group.hidden = !fields.length;
    var html = fields.map(function (f) {
      var v = esc(mediaTextValue(f, true));
      return '<div class="media-text-field"><label for="mtext-' + esc(f.key) + '">' + esc(f.label) + '</label>' +
        (f.multi
          ? '<textarea id="mtext-' + esc(f.key) + '" data-mtext="' + esc(f.key) + '" rows="3">' + v + '</textarea>'
          : '<input id="mtext-' + esc(f.key) + '" data-mtext="' + esc(f.key) + '" value="' + v + '">') +
        '</div>';
    }).join('');
    var roles = mediaColorRoles(meta);
    if (roles.length) {
      html += '<div class="media-text-colors">' + roles.map(function (r) {
        var saved = mediaColorValue(r.key);
        var dots = MEDIA_PALETTE.map(function (hex) {
          return '<button type="button" class="media-color-dot" data-mcolor-dot="' + esc(r.key) + '" data-hex="' + hex + '" style="--dot:' + hex + '" aria-label="Use ' + hex + '"></button>';
        }).join('');
        return '<div class="media-text-color"><label for="mcolor-' + esc(r.key) + '">' + esc(r.label) + '</label>' +
          '<span class="media-text-color-row"><input type="color" id="mcolor-' + esc(r.key) + '" data-mcolor="' + esc(r.key) + '" value="' + (saved || mediaColorAuto(r.role)) + '">' +
          '<button type="button" class="media-color-auto" data-mcolor-clear="' + esc(r.key) + '" data-mcolor-role="' + esc(r.role) + '"' + (saved ? '' : ' disabled') + '>Auto</button></span>' +
          '<span class="media-color-dots">' + dots + '</span></div>';
      }).join('') + '</div>' +
        '<div class="media-text-field media-shadow-field"><label for="mshadow-' + esc(meta.key) + '">Text shadow over the photo</label>' +
        '<select id="mshadow-' + esc(meta.key) + '" data-mshadow="' + esc(meta.key + '_shadow') + '">' +
        '<option value=""' + (mediaShadowNone(meta) ? '' : ' selected') + '>Soft: helps reading on busy photos</option>' +
        '<option value="none"' + (mediaShadowNone(meta) ? ' selected' : '') + '>None: clean flat text</option>' +
        '</select></div>' +
        '<p class="media-color-note">Auto follows the page: light text over a photo, navy on the plain background.</p>';
    }
    wrap.innerHTML = html;
  }
  function mediaFileControl(key, label, accept, video) {
    var id = 'media-file-' + key;
    return '<button class="media-up" type="button" data-media-file-button="' + esc(id) + '">' + esc(label) + '</button>' +
      '<input id="' + esc(id) + '" type="file" accept="' + esc(accept) + '" data-mkey="' + esc(key) + '"' +
      (video ? ' data-media-video="true"' : '') + ' hidden>';
  }
  function mediaTile(meta) {
    var isBg = meta.kind === 'background';
    var vidUp = isBg ? mediaFileControl(mediaVideoKey(meta), 'Video', 'video/mp4', true) : '';
    return '<article class="media-tile" data-media-card="' + esc(meta.key) + '" data-media-label="' + esc((meta.label + ' ' + (meta.pageLabel || '')).toLowerCase()) + '">' +
      '<button class="media-prev" id="mprev-' + esc(meta.key) + '" type="button" data-media-edit="' + esc(meta.key) + '" aria-label="Design ' + esc(meta.label) + '"></button>' +
      '<div class="media-tile-foot"><div class="media-tile-copy"><strong>' + esc(meta.label) + '</strong><div class="media-tile-meta"><small id="mstatus-' + esc(meta.key) + '">Loading media...</small><a class="media-page-link" href="' + esc(meta.page) + '" target="_blank" rel="noopener">View page</a></div></div>' +
      '<div class="media-acts"><button class="media-edit-btn" type="button" data-media-edit="' + esc(meta.key) + '">Design</button>' +
      mediaFileControl(meta.key, 'Image', 'image/jpeg,image/png,image/webp,image/avif', false) + vidUp + '</div></div></article>';
  }
  var mediaPrevRendered = {};
  var mediaPrevObserver = null;
  function renderMediaPreview(meta) {
    var el = document.getElementById('mprev-' + meta.key); if (!el) return;
    var stored = mediaStoredStyle(meta);
    var style = stored || mediaStyleApi.defaults(meta.kind);
    var source = mediaRender(el, meta, style, 'desktop', false, !stored);
    var badge = document.createElement('span');
    badge.className = 'media-preview-badge';
    badge.textContent = source === 'video' ? 'Video' : source === 'image' ? 'Image' : 'Background';
    el.appendChild(badge);
    var edit = document.createElement('span');
    edit.className = 'media-preview-edit';
    edit.innerHTML = EDIT_SVG + ' Edit design';
    el.appendChild(edit);
    var status = $('mstatus-' + meta.key);
    if (status) status.textContent = stored ? 'Custom design saved' : 'Using the page default';
    mediaPrevRendered[meta.key] = true;
  }
  function refreshMediaPreviews() {
    if (!mediaPrevObserver && 'IntersectionObserver' in window) {
      mediaPrevObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          mediaPrevObserver.unobserve(entry.target);
          var meta = mediaByKey(entry.target.getAttribute('data-media-prev'));
          if (meta) renderMediaPreview(meta);
        });
      }, { rootMargin: '400px' });
    }
    mediaAll().forEach(function (meta) {
      var el = document.getElementById('mprev-' + meta.key); if (!el) return;
      el.setAttribute('data-media-prev', meta.key);
      // Already-drawn cards refresh in place (after a save); new ones wait
      // until they scroll near the viewport, so the big grid opens fast.
      if (mediaPrevRendered[meta.key] || !mediaPrevObserver) renderMediaPreview(meta);
      else mediaPrevObserver.observe(el);
    });
  }
  function mediaStageClass() {
    var stage = $('media-stage');
    stage.className = 'media-stage';
    if (!mediaEdit) return;
    if (mediaEdit.meta.kind === 'background') {
      stage.classList.add(mediaEdit.meta.ratio || 'hero-page');
      if (mediaEdit.viewport === 'mobile') stage.classList.add('mobile');
    } else {
      stage.classList.add('photo-' + (mediaEdit.meta.ratio || 'wide'));
      if (mediaEdit.viewport === 'mobile') stage.classList.add('mobile-photo');
    }
  }
  function setMediaEditorMessage(text, type) {
    var msg = $('media-editor-msg');
    msg.className = 'studio-msg' + (type ? ' ' + type : '');
    msg.textContent = text || '';
  }
  var MEDIA_DRAFT_KEY = 'fbt-studio-media-draft';
  function saveMediaDraft() {
    if (!mediaEdit || !mediaEdit.dirty) return;
    try {
      window.sessionStorage.setItem(MEDIA_DRAFT_KEY, JSON.stringify({
        key: mediaEdit.meta.key,
        style: mediaEdit.style,
        pending: mediaEdit.pendingValues
      }));
    } catch (err) { /* storage full or blocked; drafts are best-effort */ }
  }
  function clearMediaDraft() {
    try { window.sessionStorage.removeItem(MEDIA_DRAFT_KEY); } catch (err) { /* ignore */ }
  }
  function takeMediaDraft(key) {
    try {
      var raw = window.sessionStorage.getItem(MEDIA_DRAFT_KEY);
      if (!raw) return null;
      var draft = JSON.parse(raw);
      return draft && draft.key === key ? draft : null;
    } catch (err) { return null; }
  }
  function mediaMarkDirty() {
    if (!mediaEdit) return;
    mediaEdit.dirty = true;
    mediaEdit.restoreOriginal = false;
    // Every edit path must light up Save itself; text and color tweaks do not
    // rebuild the whole editor the way the framing controls do.
    var save = $('media-editor-save');
    if (save && !mediaEdit.busy) { save.disabled = false; save.textContent = 'Save changes'; }
    saveMediaDraft();
    setMediaEditorMessage('Unsaved design changes', '');
  }
  function mediaSourceNote(meta, style) {
    var hasImage = mediaHasImage(meta, true), hasVideo = !!mediaVideo(meta, true);
    if (style.source === 'video' && !hasVideo) return 'No video is saved yet. Add an MP4, or the image will be used.';
    if (style.source === 'image' && !hasImage) return 'No image is saved yet. Add one, or the background color will show.';
    if (style.source === 'background') return 'Your saved image and video are kept and can be switched back on later.';
    if (meta.kind === 'background' && hasVideo) return 'Automatic currently shows the video. The image remains its still frame.';
    if (meta.builtIn && !mediaImage(meta, true)) return 'The built-in staff collage is active. Upload one photo if you want to replace it.';
    return hasImage ? 'The saved image is active.' : 'Add an image, or choose a color background.';
  }
  function paintMediaStage() {
    if (!mediaEdit) return;
    var stage = $('media-stage');
    var style = mediaStyleApi.normalize(mediaEdit.style, mediaEdit.meta.kind);
    var source = mediaActiveSource(mediaEdit.meta, style, true);
    if (stage.getAttribute('data-media-source') !== source) {
      mediaRender(stage, mediaEdit.meta, style, mediaEdit.viewport, true);
      return;
    }
    var present = mediaStyleApi.presentation(style, mediaEdit.meta.kind, mediaEdit.viewport);
    stage.style.background = mediaBackdrop(style, mediaEdit.meta);
    var object = stage.querySelector('.media-preview-object');
    if (object) {
      object.style.objectFit = present.fit;
      object.style.objectPosition = present.x + '% ' + present.y + '%';
      object.style.transform = 'scale(' + present.zoom + ')';
      object.style.transformOrigin = present.x + '% ' + present.y + '%';
      object.style.opacity = String(present.imageOpacity);
    }
    var overlay = stage.querySelector('.media-preview-overlay');
    if (overlay) {
      overlay.style.background = mediaEdit.restoreOriginal && mediaEdit.meta.kind === 'background'
        ? (source === 'video'
          ? 'linear-gradient(165deg,rgba(10,38,46,.6),rgba(10,38,46,.88))'
          : source === 'image'
            ? 'linear-gradient(165deg,rgba(10,38,46,.74),rgba(10,38,46,.90))'
            : 'transparent')
        : present.overlay;
    }
    var focal = stage.querySelector('.media-focal');
    if (focal) { focal.style.left = present.x + '%'; focal.style.top = present.y + '%'; }
  }
  function syncMediaEditor(rebuildPreview) {
    if (!mediaEdit) return;
    mediaEdit.style = mediaStyleApi.normalize(mediaEdit.style, mediaEdit.meta.kind);
    var style = mediaEdit.style;
    var point = mediaEdit.viewport === 'mobile' ? style.mobile : style.desktop;
    var backgroundOnly = style.source === 'background';
    var noOverlay = style.overlay === 'none';
    var busy = !!mediaEdit.busy;
    $('media-source').options[0].textContent = mediaEdit.meta.kind === 'background'
      ? 'Automatic: video first, then image'
      : 'Automatic: saved image';
    $('media-source').value = style.source;
    $('media-source').disabled = busy;
    Array.prototype.forEach.call(document.querySelectorAll('[data-media-fit]'), function (button) {
      var active = button.getAttribute('data-media-fit') === style.fit;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.disabled = busy || backgroundOnly;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-media-background]'), function (button) {
      var active = button.getAttribute('data-media-background') === style.background;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.disabled = busy;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-media-viewport]'), function (button) {
      var active = button.getAttribute('data-media-viewport') === mediaEdit.viewport;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.disabled = busy;
    });
    $('media-frame-label').textContent = mediaEdit.viewport === 'mobile' ? 'Phone framing' : 'Desktop framing';
    $('media-zoom').value = point.zoom; $('media-zoom-out').textContent = point.zoom + '%';
    $('media-x').value = point.x; $('media-x-out').textContent = point.x + '%';
    $('media-y').value = point.y; $('media-y-out').textContent = point.y + '%';
    $('media-image-opacity').value = style.imageOpacity; $('media-image-opacity-out').textContent = style.imageOpacity + '%';
    ['media-zoom', 'media-x', 'media-y', 'media-image-opacity'].forEach(function (id) {
      $(id).disabled = busy || backgroundOnly;
    });
    $('media-framing-controls').classList.toggle('is-disabled', backgroundOnly);
    $('media-focal-status').textContent = 'Focal point: ' + point.x + '% across, ' + point.y + '% down.';
    $('media-background-color').value = style.backgroundColor; $('media-background-picker').value = style.backgroundColor;
    $('media-background-color').disabled = busy; $('media-background-picker').disabled = busy;
    $('media-background-color').setAttribute('aria-invalid', 'false');
    Array.prototype.forEach.call(document.querySelectorAll('[data-media-overlay]'), function (button) {
      var active = button.getAttribute('data-media-overlay') === style.overlay;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.disabled = busy;
    });
    $('media-overlay-color').value = style.overlayColor; $('media-overlay-picker').value = style.overlayColor;
    $('media-overlay-opacity').value = style.overlayOpacity; $('media-overlay-opacity-out').textContent = style.overlayOpacity + '%';
    $('media-overlay-color').disabled = busy || noOverlay; $('media-overlay-picker').disabled = busy || noOverlay;
    $('media-overlay-opacity').disabled = busy || noOverlay;
    $('media-overlay-color').setAttribute('aria-invalid', 'false');
    $('media-overlay-controls').classList.toggle('is-disabled', noOverlay);
    $('media-source-note').textContent = mediaSourceNote(mediaEdit.meta, style);
    $('media-contrast-warning').hidden = mediaEdit.meta.kind !== 'background' || (style.overlay !== 'none' && style.overlayOpacity >= 32);
    $('media-editor-video-pick').hidden = mediaEdit.meta.kind !== 'background';
    $('media-remove-video').hidden = mediaEdit.meta.kind !== 'background';
    $('media-editor-image-pick').disabled = busy;
    $('media-editor-video-pick').disabled = busy;
    $('media-remove-video').disabled = busy || !nn(mediaValue(mediaVideoKey(mediaEdit.meta), true));
    $('media-remove-image').disabled = busy || !nn(mediaValue(mediaEdit.meta.key, true));
    $('media-editor-close').disabled = busy;
    $('media-editor-cancel').disabled = busy;
    $('media-editor-save').disabled = busy || !mediaEdit.dirty;
    $('media-editor-save').textContent = mediaEdit.busy === 'saving' ? 'Saving...' : mediaEdit.busy === 'uploading' ? 'Uploading...' : 'Save changes';
    $('media-restore').disabled = busy || (!mediaEdit.stored && !mediaEdit.dirty);
    Array.prototype.forEach.call($('media-source').options, function (option) {
      if (option.value === 'video') {
        option.hidden = mediaEdit.meta.kind !== 'background';
        option.disabled = mediaEdit.meta.kind !== 'background';
      }
    });
    mediaStageClass();
    $('media-stage').classList.toggle('media-stage-disabled', backgroundOnly || busy);
    $('media-stage').setAttribute('aria-disabled', backgroundOnly || busy ? 'true' : 'false');
    if (rebuildPreview === false) paintMediaStage();
    else mediaRender($('media-stage'), mediaEdit.meta, style, mediaEdit.viewport, true);
  }
  function setMediaBackgroundInert(inert) {
    ['studio-sidebar', 'studio-nav-toggle'].forEach(function (id) {
      var node = $(id); if (node) node.inert = inert;
    });
    Array.prototype.forEach.call(document.querySelectorAll('#studio-main > [data-view-pane]'), function (pane) {
      pane.inert = inert;
    });
  }
  function sameMediaSession(edit) {
    return !!(edit && mediaEdit && edit.token === mediaEdit.token);
  }
  function openMediaEditor(key, trigger) {
    var meta = mediaByKey(key);
    if (!meta || !mediaStyleApi || !mediaReady) return;
    mediaEditorTrigger = trigger || document.activeElement;
    var stored = mediaStoredStyle(meta);
    mediaEdit = {
      token: ++mediaSessionSeq,
      meta: meta,
      style: stored || mediaStyleApi.defaults(meta.kind),
      viewport: 'desktop',
      dirty: false,
      restoreOriginal: !stored,
      stored: !!stored,
      pendingValues: {},
      busy: false
    };
    $('media-editor-title').textContent = meta.label;
    $('media-editor-subtitle').textContent = meta.kind === 'background'
      ? 'Design the page background for desktop and phone screens.'
      : 'Position this photo without changing the original file.';
    $('media-editor').hidden = false;
    document.body.classList.add('media-editor-open');
    try { window.history.replaceState(null, '', '#media/' + meta.key); } catch (err) { /* ignore */ }
    setMediaBackgroundInert(true);
    var draft = takeMediaDraft(key);
    if (draft) {
      mediaEdit.style = mediaStyleApi.normalize(draft.style, meta.kind);
      mediaEdit.pendingValues = draft.pending || {};
      mediaEdit.dirty = true;
      mediaEdit.restoreOriginal = false;
      setMediaEditorMessage('Restored your unsaved changes from before the page reloaded. Save to keep them, or Cancel to let them go.', '');
    } else {
      setMediaEditorMessage(stored ? 'Saved custom design loaded' : 'Using the original page look', '');
    }
    buildMediaTextFields(meta);
    buildMediaMatch(meta);
    syncMediaEditor(false);
    window.setTimeout(function () { $('media-editor-close').focus(); }, 20);
  }
  function closeMediaEditor(force) {
    if (!mediaEdit) return;
    if (mediaEdit.busy) return;
    if (!force && mediaEdit.dirty && !window.confirm('Close without saving these design changes?')) return;
    clearMediaDraft();
    $('media-editor').hidden = true;
    document.body.classList.remove('media-editor-open');
    try { window.history.replaceState(null, '', '#media'); } catch (err) { /* ignore */ }
    setMediaBackgroundInert(false);
    mediaEdit = null;
    mediaPointerDown = false;
    mediaPointerStart = null;
    if (mediaEditorTrigger && document.body.contains(mediaEditorTrigger)) studioFocus(mediaEditorTrigger);
    mediaEditorTrigger = null;
  }
  function mediaUpdatePoint(field, value) {
    if (!mediaEdit) return;
    var view = mediaEdit.viewport === 'mobile' ? 'mobile' : 'desktop';
    mediaEdit.style[view][field] = Math.round(Number(value));
    mediaMarkDirty();
    syncMediaEditor(false);
  }
  function mediaSetFocal(event) {
    if (!mediaEdit || mediaEdit.busy || mediaEdit.style.source === 'background') return;
    var stage = $('media-stage');
    var rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    var y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    var view = mediaEdit.viewport === 'mobile' ? 'mobile' : 'desktop';
    mediaEdit.style[view].x = Math.round(x);
    mediaEdit.style[view].y = Math.round(y);
    mediaMarkDirty();
    syncMediaEditor(false);
  }
  function saveMediaDesign() {
    if (!mediaEdit || !mediaEdit.dirty || mediaEdit.busy) return;
    var edit = mediaEdit;
    var meta = edit.meta;
    var key = mediaStyleKey(meta);
    var value = edit.restoreOriginal ? '' : mediaStyleApi.serialize(edit.style, meta.kind);
    var now = new Date().toISOString();
    var rows = [{ key: key, value: value, updated_at: now }];
    Object.keys(edit.pendingValues).forEach(function (assetKey) {
      rows.push({ key: assetKey, value: edit.pendingValues[assetKey], updated_at: now });
    });
    edit.busy = 'saving';
    syncMediaEditor(false);
    setMediaEditorMessage('Saving the media and design together...', '');
    sb.from('site_content').upsert(rows, { onConflict: 'key' }).then(function (result) {
      if (!sameMediaSession(edit)) return;
      edit.busy = false;
      if (result.error) {
        setMediaEditorMessage('Could not save: ' + result.error.message, 'err');
        syncMediaEditor(false);
        return;
      }
      rows.forEach(function (row) { mediaVals[row.key] = row.value; });
      clearMediaDraft();
      edit.pendingValues = {};
      edit.dirty = false;
      edit.stored = !!value;
      refreshMediaPreviews();
      syncMediaEditor(false);
      setMediaEditorMessage('Saved. The media and design are live on the site.', 'ok');

    }, function () {
      if (!sameMediaSession(edit)) return;
      edit.busy = false;
      syncMediaEditor(false);
      setMediaEditorMessage('Could not save because the connection was interrupted. Your changes are still here.', 'err');
    });
  }
  function restoreMediaLook() {
    if (!mediaEdit) return;
    mediaEdit.style = mediaStyleApi.defaults(mediaEdit.meta.kind);
    mediaEdit.restoreOriginal = true;
    mediaEdit.dirty = true;
    syncMediaEditor();
    setMediaEditorMessage('Original page look selected. Save to apply it.', '');
  }
  function removeMedia(key, label) {
    if (!mediaEdit || !key || mediaEdit.busy ||
        !window.confirm('Remove this ' + label + ' from the page when you save? The uploaded file will stay safely stored.')) return;
    mediaEdit.pendingValues[key] = '';
    mediaEdit.style.source = 'auto';
    mediaMarkDirty();
    syncMediaEditor();
    setMediaEditorMessage('The ' + label + ' will be removed from the page when you save. Cancel keeps it.', '');
  }
  function validateMediaFile(file, video) {
    var imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    var imageName = /\.(?:jpe?g|png|webp|avif)$/i.test(file.name || '');
    if (video) {
      if (!/\.mp4$/i.test(file.name) || (file.type && file.type !== 'video/mp4')) return 'Choose an MP4 video so it plays reliably on phones and computers.';
      if (file.size > 50 * 1024 * 1024) return 'That video is over 50 MB. Compress it to a short web background video first.';
    } else {
      if (imageTypes.indexOf(file.type) < 0 && !(imageName && !file.type)) return 'Choose a JPG, PNG, WebP, or AVIF image.';
      if (file.size > 15 * 1024 * 1024) return 'That image is over 15 MB. Resize or compress it before uploading.';
    }
    return '';
  }
  function uploadMedia(inp) {
    var file = inp.files && inp.files[0]; if (!file) return;
    var editorUpload = inp.getAttribute('data-editor-upload');
    var initialKey = editorUpload && mediaEdit
      ? (editorUpload === 'video' ? mediaVideoKey(mediaEdit.meta) : mediaEdit.meta.key)
      : inp.getAttribute('data-mkey');
    if (!initialKey) { inp.value = ''; return; }
    var logicalKey = initialKey.indexOf('hero_vid_') === 0 ? initialKey.replace('hero_vid_', 'hero_bg_') : initialKey;
    var video = editorUpload === 'video' || initialKey.indexOf('hero_vid_') === 0;
    var problem = validateMediaFile(file, video);
    inp.value = '';
    if (problem) {
      if (editorUpload) setMediaEditorMessage(problem, 'err');
      else { $('media-msg').className = 'studio-msg err'; $('media-msg').textContent = problem; }
      return;
    }
    if (!editorUpload) openMediaEditor(logicalKey, inp.previousElementSibling);
    if (!mediaEdit || mediaEdit.meta.key !== logicalKey || mediaEdit.busy) return;
    var edit = mediaEdit;
    var key = video ? mediaVideoKey(edit.meta) : edit.meta.key;
    var prev = document.getElementById('mprev-' + logicalKey); if (prev) prev.classList.add('uploading');
    edit.busy = 'uploading';
    syncMediaEditor(false);
    setMediaEditorMessage('Uploading ' + (video ? 'video' : 'image') + ' safely. Nothing changes on the site until you save.', '');
    var imageExt = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
    var fileExt = ((file.name || '').match(/\.([a-z0-9]+)$/i) || [])[1];
    var ext = video ? 'mp4' : (imageExt[file.type] || String(fileExt || 'jpg').toLowerCase().replace('jpeg', 'jpg'));
    var path = 'site/' + key + '-' + Date.now() + '.' + ext;
    var uploadOptions = { upsert: false };
    if (file.type) uploadOptions.contentType = file.type;
    sb.storage.from(bucket).upload(path, file, uploadOptions).then(function (result) {
      if (prev) prev.classList.remove('uploading');
      if (!sameMediaSession(edit)) return;
      edit.busy = false;
      if (result.error) {
        syncMediaEditor(false);
        setMediaEditorMessage('Upload failed: ' + result.error.message, 'err');
        return;
      }
      var url = sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      edit.pendingValues[key] = url;
      edit.style.source = video ? 'video' : 'image';
      mediaMarkDirty();
      syncMediaEditor();
      setMediaEditorMessage((video ? 'Video' : 'Image') + ' uploaded. Finish the design, then Save changes to publish it.', 'ok');
    }, function () {
      if (prev) prev.classList.remove('uploading');
      if (!sameMediaSession(edit)) return;
      edit.busy = false;
      syncMediaEditor(false);
      setMediaEditorMessage('Upload failed because the connection was interrupted. Try again.', 'err');
    });
  }
  function loadMedia() {
    if (!mediaBuilt) {
      if (!mediaStyleApi) {
        $('media-msg').className = 'studio-msg err';
        $('media-msg').textContent = 'The media designer did not load. Refresh Studio and try again.';
        return;
      }
      var view = $('view-media');
      view.addEventListener('change', function (event) {
        var input = event.target.closest && event.target.closest('input[type=file][data-mkey]');
        if (input) uploadMedia(input);
      });
      view.addEventListener('click', function (event) {
        var picker = event.target.closest && event.target.closest('[data-media-file-button]');
        if (picker) {
          var fileInput = document.getElementById(picker.getAttribute('data-media-file-button'));
          if (fileInput) fileInput.click();
          return;
        }
        var edit = event.target.closest && event.target.closest('[data-media-edit]');
        if (edit) openMediaEditor(edit.getAttribute('data-media-edit'), edit);
      });
      $('media-editor').addEventListener('change', function (event) {
        var input = event.target.closest && event.target.closest('input[type=file][data-editor-upload]');
        if (input) uploadMedia(input);
      });
      $('media-editor').addEventListener('click', function (event) { if (event.target === this) closeMediaEditor(false); });
      $('media-editor-close').addEventListener('click', function () { closeMediaEditor(false); });
      $('media-editor-cancel').addEventListener('click', function () { closeMediaEditor(false); });
      $('media-editor-image-pick').addEventListener('click', function () { $('media-editor-image-file').click(); });
      $('media-editor-video-pick').addEventListener('click', function () { $('media-editor-video-file').click(); });
      $('media-editor-save').addEventListener('click', saveMediaDesign);
      $('media-match-grid').addEventListener('click', function (event) {
        var item = event.target.closest('[data-match]');
        if (item) applyMediaMatch(item.getAttribute('data-match'));
      });
      $('media-match-undo').addEventListener('click', undoMediaMatch);
      if ($('media-search')) $('media-search').addEventListener('input', function () {
        var q = this.value.trim().toLowerCase();
        // Strip punctuation on both sides so "hope" finds "H.O.P.E."
        var qs = q.replace(/[^a-z0-9]/g, '');
        Array.prototype.forEach.call(document.querySelectorAll('#media-bg .media-tile, #media-photo .media-tile'), function (card) {
          var label = card.getAttribute('data-media-label') || '';
          var match = !q || label.indexOf(q) >= 0 || (qs && label.replace(/[^a-z0-9]/g, '').indexOf(qs) >= 0);
          card.hidden = !match;
        });
        Array.prototype.forEach.call(document.querySelectorAll('#media-bg .media-grid'), function (grid) {
          var any = !!grid.querySelector('.media-tile:not([hidden])');
          grid.hidden = !any;
          var head = grid.previousElementSibling;
          if (head && head.classList.contains('media-group-head')) head.hidden = !any;
        });
      });
      $('media-text-fields').addEventListener('input', function (event) {
        if (!mediaEdit) return;
        var field = event.target.closest('[data-mtext]');
        if (field) {
          mediaEdit.pendingValues[field.getAttribute('data-mtext')] = field.value;
          mediaMarkDirty();
          refreshStageText();
          return;
        }
        var shadow = event.target.closest('[data-mshadow]');
        if (shadow) {
          mediaEdit.pendingValues[shadow.getAttribute('data-mshadow')] = shadow.value;
          mediaMarkDirty();
          refreshStageText();
          return;
        }
        var color = event.target.closest('[data-mcolor]');
        if (color) {
          var key = color.getAttribute('data-mcolor');
          mediaEdit.pendingValues[key] = color.value;
          var clear = $('media-text-fields').querySelector('[data-mcolor-clear="' + key + '"]');
          if (clear) clear.disabled = false;
          mediaMarkDirty();
          refreshStageText();
        }
      });
      $('media-text-fields').addEventListener('click', function (event) {
        var dot = event.target.closest('[data-mcolor-dot]');
        if (dot && mediaEdit) {
          var dotKey = dot.getAttribute('data-mcolor-dot');
          mediaEdit.pendingValues[dotKey] = dot.getAttribute('data-hex');
          var dotPicker = $('media-text-fields').querySelector('[data-mcolor="' + dotKey + '"]');
          if (dotPicker) dotPicker.value = dot.getAttribute('data-hex');
          var dotClear = $('media-text-fields').querySelector('[data-mcolor-clear="' + dotKey + '"]');
          if (dotClear) dotClear.disabled = false;
          mediaMarkDirty();
          refreshStageText();
          return;
        }
        var clear = event.target.closest('[data-mcolor-clear]');
        if (!clear || !mediaEdit) return;
        var key = clear.getAttribute('data-mcolor-clear');
        mediaEdit.pendingValues[key] = '';
        var picker = $('media-text-fields').querySelector('[data-mcolor="' + key + '"]');
        if (picker) picker.value = mediaColorAuto(clear.getAttribute('data-mcolor-role'));
        clear.disabled = true;
        mediaMarkDirty();
        refreshStageText();
      });
      $('media-restore').addEventListener('click', restoreMediaLook);
      $('media-remove-image').addEventListener('click', function () { if (mediaEdit) removeMedia(mediaEdit.meta.key, 'image'); });
      $('media-remove-video').addEventListener('click', function () { if (mediaEdit) removeMedia(mediaVideoKey(mediaEdit.meta), 'video'); });
      $('media-source').addEventListener('change', function () { if (!mediaEdit) return; mediaEdit.style.source = this.value; mediaMarkDirty(); syncMediaEditor(); });
      Array.prototype.forEach.call(document.querySelectorAll('[data-media-overlay]'), function (button) {
        button.addEventListener('click', function () { if (!mediaEdit) return; mediaEdit.style.overlay = button.getAttribute('data-media-overlay'); mediaMarkDirty(); syncMediaEditor(false); });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-media-fit]'), function (button) {
        button.addEventListener('click', function () { if (!mediaEdit) return; mediaEdit.style.fit = button.getAttribute('data-media-fit'); mediaMarkDirty(); syncMediaEditor(false); });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-media-viewport]'), function (button) {
        button.addEventListener('click', function () { if (!mediaEdit) return; mediaEdit.viewport = button.getAttribute('data-media-viewport'); syncMediaEditor(false); });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-media-background]'), function (button) {
        button.addEventListener('click', function () { if (!mediaEdit) return; mediaEdit.style.background = button.getAttribute('data-media-background'); mediaMarkDirty(); syncMediaEditor(false); });
      });
      $('media-zoom').addEventListener('input', function () { mediaUpdatePoint('zoom', this.value); });
      $('media-x').addEventListener('input', function () { mediaUpdatePoint('x', this.value); });
      $('media-y').addEventListener('input', function () { mediaUpdatePoint('y', this.value); });
      $('media-image-opacity').addEventListener('input', function () { if (!mediaEdit) return; mediaEdit.style.imageOpacity = Number(this.value); mediaMarkDirty(); syncMediaEditor(false); });
      $('media-overlay-opacity').addEventListener('input', function () { if (!mediaEdit) return; mediaEdit.style.overlayOpacity = Number(this.value); mediaMarkDirty(); syncMediaEditor(false); });
      function syncColor(textId, pickerId, field, background) {
        var textInput = $(textId), picker = $(pickerId);
        textInput.addEventListener('input', function () {
          if (!mediaEdit) return;
          if (!/^#[0-9a-f]{6}$/i.test(this.value)) {
            this.setAttribute('aria-invalid', this.value.length >= 7 ? 'true' : 'false');
            return;
          }
          this.setAttribute('aria-invalid', 'false');
          mediaEdit.style[field] = this.value;
          if (background) mediaEdit.style.background = 'custom';
          picker.value = this.value;
          mediaMarkDirty(); syncMediaEditor(false);
        });
        textInput.addEventListener('blur', function () {
          if (!/^#[0-9a-f]{6}$/i.test(this.value)) {
            this.setAttribute('aria-invalid', 'true');
            setMediaEditorMessage('Use a six-digit color such as #123B42.', 'err');
          }
        });
        picker.addEventListener('input', function () {
          if (!mediaEdit) return;
          mediaEdit.style[field] = this.value;
          if (background) mediaEdit.style.background = 'custom';
          textInput.value = this.value;
          mediaMarkDirty(); syncMediaEditor(false);
        });
      }
      syncColor('media-background-color', 'media-background-picker', 'backgroundColor', true);
      syncColor('media-overlay-color', 'media-overlay-picker', 'overlayColor', false);
      $('media-stage').addEventListener('pointerdown', function (event) {
        if (!mediaEdit || mediaEdit.busy || mediaEdit.style.source === 'background') return;
        if (event.pointerType === 'touch') {
          mediaPointerStart = { x: event.clientX, y: event.clientY };
          return;
        }
        mediaPointerDown = true;
        try { this.setPointerCapture(event.pointerId); } catch (e) {}
        mediaSetFocal(event);
      });
      $('media-stage').addEventListener('pointermove', function (event) {
        if (mediaPointerDown && event.pointerType !== 'touch') mediaSetFocal(event);
      });
      $('media-stage').addEventListener('pointerup', function (event) {
        if (event.pointerType === 'touch' && mediaPointerStart) {
          var moved = Math.hypot(event.clientX - mediaPointerStart.x, event.clientY - mediaPointerStart.y);
          if (moved < 10) mediaSetFocal(event);
        }
        mediaPointerDown = false; mediaPointerStart = null;
      });
      $('media-stage').addEventListener('pointercancel', function () { mediaPointerDown = false; mediaPointerStart = null; });
      $('media-stage').addEventListener('keydown', function (event) {
        if (!mediaEdit || mediaEdit.busy || mediaEdit.style.source === 'background' ||
            ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(event.key) < 0) return;
        event.preventDefault();
        var viewName = mediaEdit.viewport === 'mobile' ? 'mobile' : 'desktop';
        var point = mediaEdit.style[viewName], amount = event.shiftKey ? 10 : 2;
        if (event.key === 'ArrowLeft') point.x = Math.max(0, point.x - amount);
        if (event.key === 'ArrowRight') point.x = Math.min(100, point.x + amount);
        if (event.key === 'ArrowUp') point.y = Math.max(0, point.y - amount);
        if (event.key === 'ArrowDown') point.y = Math.min(100, point.y + amount);
        mediaMarkDirty(); syncMediaEditor(false);
      });
      document.addEventListener('keydown', function (event) {
        if (!mediaEdit || $('media-editor').hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); closeMediaEditor(false); return; }
        if (event.key !== 'Tab') return;
        var focusable = Array.prototype.filter.call(
          $('media-editor').querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]'),
          function (element) { return !element.hidden && element.offsetParent !== null; }
        );
        if (!focusable.length) return;
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (!$('media-editor').contains(document.activeElement)) { event.preventDefault(); first.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
      mediaBuilt = true;
    }
    if (mediaReady || mediaLoading) return;
    mediaLoading = true;
    $('media-bg').innerHTML = '<div class="studio-empty">Loading page backgrounds...</div>';
    $('media-photo').innerHTML = '<div class="studio-empty">Loading photos...</div>';
    $('media-msg').className = 'studio-msg';
    $('media-msg').textContent = 'Loading saved media...';
    sb.from('site_content').select('key,value').then(function (result) {
      mediaLoading = false;
      if (result.error) {
        $('media-msg').className = 'studio-msg err';
        $('media-msg').textContent = 'Could not load media: ' + result.error.message;
        return;
      }
      mediaVals = {};
      (result.data || []).forEach(function (row) { mediaVals[row.key] = row.value; });
      var groups = [], groupIndex = {};
      mediaAll().forEach(function (m) {
        var name = m.pageLabel || 'Other';
        if (!(name in groupIndex)) { groupIndex[name] = groups.length; groups.push({ name: name, items: [] }); }
        groups[groupIndex[name]].items.push(m);
      });
      // Home first, then site order, photos folded into their page's group.
      groups.sort(function (a, b) {
        return (a.name === 'Home page' ? -1 : b.name === 'Home page' ? 1 : 0);
      });
      $('media-bg').className = 'media-groups';
      $('media-bg').innerHTML = groups.map(function (g) {
        return '<div class="media-group-head">' + esc(g.name) + '</div><div class="media-grid">' + g.items.map(mediaTile).join('') + '</div>';
      }).join('');
      $('media-photo').innerHTML = '';
      var photoHead = document.querySelector('[data-media-photo-head]');
      if (photoHead) photoHead.hidden = true;
      mediaReady = true;
      refreshMediaPreviews();
      $('media-msg').textContent = '';
      if (pendingMediaSlot) {
        var reopen = pendingMediaSlot;
        pendingMediaSlot = '';
        if (mediaByKey(reopen)) openMediaEditor(reopen);
      }
    });
  }

  // ---------- pages and menu (nav_config in site_content, applied by content.js) ----------
  var PAGES_DEFAULT = [
    { page: 'visit.html', label: 'Plan a Visit', menu: true }, { page: 'beliefs.html', label: 'What We Believe', menu: true },
    { page: 'watch.html', label: 'The Overlook', menu: true }, { page: 'next-steps.html', label: 'Next Steps', menu: true },
    { page: 'events.html', label: 'Events', menu: true },
    { page: 'blog.html', label: 'Blog', menu: true }, { page: 'missions.html', label: 'Missions', menu: true },
    { page: 'get-involved.html', label: 'Get Involved', menu: true }, { page: 'prayer.html', label: 'Prayer', menu: true },
    { page: 'staff.html', label: 'Our Staff', menu: true }, { page: 'contact.html', label: 'Contact', menu: true },
    { page: 'give.html', label: 'Give', menu: true }
  ];
  // These sections mirror the hand-built public navigation. Pages can be
  // reordered inside a dropdown; The Overlook and Give keep their fixed spots.
  var PAGE_SECTIONS = [
    { id: 'visit', label: 'Visit menu', note: 'Service Times stays with Plan a Visit.', pages: ['visit.html', 'beliefs.html'] },
    { id: 'stream', label: 'The Overlook', note: 'Fixed main-menu link', pages: ['watch.html'], fixed: true },
    { id: 'connect', label: 'Connect menu', note: 'Order these pages for the Connect dropdown.', pages: ['next-steps.html', 'events.html', 'blog.html', 'missions.html', 'get-involved.html', 'prayer.html'] },
    { id: 'about', label: 'About menu', note: 'Order these pages for the About dropdown.', pages: ['staff.html', 'contact.html'] },
    { id: 'give', label: 'Give', note: 'Fixed giving button', pages: ['give.html'], fixed: true }
  ];
  var pages = [], pagesReady = false;
  function pageSectionId(page) {
    var match = PAGE_SECTIONS.filter(function (section) { return section.pages.indexOf(page) >= 0; })[0];
    return match ? match.id : 'other';
  }
  function mergePages(cfg) {
    if (!Array.isArray(cfg) || !cfg.length) return PAGES_DEFAULT.map(function (p) { return { page: p.page, label: p.label, menu: p.menu }; });
    var seen = {}, out = [];
    cfg.forEach(function (c) {
      if (!c || !c.page || seen[c.page]) return; seen[c.page] = 1;
      var d = PAGES_DEFAULT.filter(function (x) { return x.page === c.page; })[0];
      out.push({ page: c.page, label: c.label || (d && d.label) || c.page, menu: c.menu !== false });
    });
    if (!seen['next-steps.html']) {
      var connectAt = out.findIndex(function (item) { return ['events.html', 'blog.html', 'missions.html', 'get-involved.html', 'prayer.html'].indexOf(item.page) >= 0; });
      var nextStep = { page: 'next-steps.html', label: 'Next Steps', menu: true };
      if (connectAt >= 0) out.splice(connectAt, 0, nextStep); else out.push(nextStep);
      seen['next-steps.html'] = 1;
    }
    PAGES_DEFAULT.forEach(function (d) { if (!seen[d.page]) out.push({ page: d.page, label: d.label, menu: d.menu }); });
    return out;
  }
  function loadPages() {
    if (pagesReady) { renderPages(); return; }
    sb.from('site_content').select('value').eq('key', 'nav_config').then(function (r) {
      var cfg = null;
      if (!r.error && r.data && r.data[0]) { try { cfg = JSON.parse(r.data[0].value); } catch (e) { } }
      pages = mergePages(cfg); pagesReady = true; renderPages();
    }, function () { pages = mergePages(null); pagesReady = true; renderPages(); });
  }
  function renderPageRow(entry, section, position, total) {
    var p = entry.item, i = entry.index;
    var canMove = !section.fixed && total > 1;
    var controls = canMove
      ? '<div class="pg-reorder" aria-label="Reorder ' + esc(p.label) + '">' +
          '<button type="button" class="pg-arrow" data-move="-1" data-page="' + esc(p.page) + '" data-section="' + esc(section.id) + '"' + (position === 0 ? ' disabled' : '') + ' aria-label="Move ' + esc(p.label) + ' up">' + UP_SVG + '</button>' +
          '<button type="button" class="pg-arrow" data-move="1" data-page="' + esc(p.page) + '" data-section="' + esc(section.id) + '"' + (position === total - 1 ? ' disabled' : '') + ' aria-label="Move ' + esc(p.label) + ' down">' + DOWN_SVG + '</button>' +
        '</div>'
      : '<span class="pg-fixed" title="This item has a fixed place in the menu">' + LOCK_SVG + ' Fixed</span>';
    return '<div class="pg-row" data-i="' + i + '" data-page="' + esc(p.page) + '">' +
      controls +
      '<input class="pg-label" value="' + esc(p.label) + '" data-label aria-label="Label for ' + esc(p.label) + '">' +
      '<span class="pg-page">' + esc(p.page) + '</span>' +
      '<label class="pg-toggle"><input type="checkbox" data-menu' + (p.menu ? ' checked' : '') + '> Show in menu</label>' +
      '</div>';
  }
  function renderPages() {
    var sections = PAGE_SECTIONS.slice();
    var extras = pages.filter(function (p) { return pageSectionId(p.page) === 'other'; });
    if (extras.length) sections.push({ id: 'other', label: 'Other pages', note: 'Additional menu pages', pages: extras.map(function (p) { return p.page; }) });
    $('pg-list').innerHTML = sections.map(function (section) {
      var entries = [];
      pages.forEach(function (p, i) { if (section.pages.indexOf(p.page) >= 0) entries.push({ item: p, index: i }); });
      if (!entries.length) return '';
      return '<section class="pg-section" aria-labelledby="pg-section-' + esc(section.id) + '">' +
        '<div class="pg-section-head"><strong id="pg-section-' + esc(section.id) + '">' + esc(section.label) + '</strong><small>' + esc(section.note || '') + '</small></div>' +
        '<div class="pg-section-list">' + entries.map(function (entry, position) { return renderPageRow(entry, section, position, entries.length); }).join('') + '</div>' +
        '</section>';
    }).join('');
  }
  function syncPagesFromDom() {
    Array.prototype.forEach.call($('pg-list').querySelectorAll('.pg-row'), function (row) {
      var i = +row.getAttribute('data-i'); if (!pages[i]) return;
      pages[i].label = row.querySelector('[data-label]').value.trim() || pages[i].label;
      pages[i].menu = row.querySelector('[data-menu]').checked;
    });
  }
  $('pg-list').addEventListener('click', function (e) {
    var button = e.target.closest('[data-move]');
    if (!button || button.disabled) return;
    syncPagesFromDom();
    var page = button.getAttribute('data-page');
    var sectionId = button.getAttribute('data-section');
    var direction = +button.getAttribute('data-move');
    var members = [];
    pages.forEach(function (p, i) { if (pageSectionId(p.page) === sectionId) members.push({ item: p, index: i }); });
    var position = -1;
    members.forEach(function (entry, i) { if (entry.item.page === page) position = i; });
    var nextPosition = position + direction;
    if (position < 0 || nextPosition < 0 || nextPosition >= members.length) return;
    var from = members[position].index, to = members[nextPosition].index;
    var moved = pages[from]; pages[from] = pages[to]; pages[to] = moved;
    renderPages();
    var movedRow = $('pg-list').querySelector('.pg-row[data-page="' + page + '"]');
    var focusButton = movedRow && movedRow.querySelector('[data-move="' + direction + '"]');
    if (focusButton && focusButton.disabled) focusButton = movedRow.querySelector('[data-move]:not([disabled])');
    if (focusButton) focusButton.focus();
    var msg = $('pg-msg');
    msg.className = 'studio-msg';
    msg.textContent = 'Moved ' + moved.label + ' to ' + (nextPosition + 1) + ' of ' + members.length + ' in this section. Save menu to publish.';
  });
  $('pg-list').addEventListener('input', function (e) {
    if (!e.target.matches('[data-label], [data-menu]')) return;
    var msg = $('pg-msg'); msg.className = 'studio-msg'; msg.textContent = 'Changes not saved yet.';
  });
  $('pg-save').addEventListener('click', function () {
    syncPagesFromDom();
    var btn = $('pg-save'), msg = $('pg-msg'); btn.disabled = true; btn.textContent = 'Saving…'; msg.textContent = ''; msg.className = 'studio-msg';
    var json = JSON.stringify(pages.map(function (p) { return { page: p.page, label: p.label, menu: p.menu }; }));
    sb.from('site_content').upsert({ key: 'nav_config', value: json }, { onConflict: 'key' }).then(function (r) {
      btn.disabled = false; btn.textContent = 'Save menu';
      if (r.error) { msg.className = 'studio-msg err'; msg.textContent = 'Couldn\'t save: ' + r.error.message + (/row-level|policy/i.test(r.error.message) ? ' (not on the editor allow-list?)' : ''); return; }
      msg.className = 'studio-msg ok'; msg.textContent = 'Saved. Your menu labels, visibility, and order are live across the site.';
    });
  });

  // ---------- missions (missionaries table + drop-a-pin map) ----------
  var miss = [], miReady = false, editingMi = null, miMap = null, miMarker = null, miLat = null, miLng = null, miLetters = [], miPhotos = [];
  var miStatuses = ['On the field', 'Home on furlough', 'Sending soon'];
  var miRegions = ['Africa', 'Asia', 'Europe', 'Middle East', 'North America', 'Central America', 'South America', 'Oceania'];
  var COMMON_TIMEZONES = [
    ['America/New_York', 'Eastern Time: West Virginia, New York, Florida'],
    ['America/Chicago', 'Central Time: Alabama, Texas, Midwest'],
    ['America/Denver', 'Mountain Time: Colorado and surrounding states'],
    ['America/Phoenix', 'Arizona'],
    ['America/Los_Angeles', 'Pacific Time: California, Oregon, Washington'],
    ['America/Anchorage', 'Alaska'],
    ['Pacific/Honolulu', 'Hawaii'],
    ['Australia/Melbourne', 'Melbourne, Victoria'],
    ['Australia/Sydney', 'Sydney, New South Wales'],
    ['Australia/Brisbane', 'Brisbane, Queensland'],
    ['Australia/Adelaide', 'Adelaide, South Australia'],
    ['Australia/Perth', 'Perth, Western Australia'],
    ['Africa/Nairobi', 'Nairobi, Kenya'],
    ['Africa/Johannesburg', 'Johannesburg, South Africa'],
    ['Asia/Manila', 'Manila, Philippines'],
    ['Asia/Kolkata', 'India'],
    ['Asia/Bangkok', 'Bangkok, Thailand'],
    ['Europe/London', 'London, United Kingdom'],
    ['Europe/Prague', 'Prague, Czechia'],
    ['America/Mexico_City', 'Mexico City, Mexico'],
    ['America/Lima', 'Lima, Peru'],
    ['America/Sao_Paulo', 'São Paulo, Brazil']
  ];
  var FALLBACK_TIMEZONES = [
    'Africa/Abidjan','Africa/Accra','Africa/Addis_Ababa','Africa/Cairo','Africa/Casablanca','Africa/Harare','Africa/Kampala','Africa/Lagos','Africa/Maputo','Africa/Monrovia','Africa/Windhoek',
    'America/Argentina/Buenos_Aires','America/Bogota','America/Caracas','America/Costa_Rica','America/Detroit','America/Guatemala','America/Guyana','America/Halifax','America/Havana','America/Indiana/Indianapolis','America/La_Paz','America/Managua','America/Montevideo','America/Panama','America/Puerto_Rico','America/Santo_Domingo','America/Tegucigalpa','America/Toronto','America/Vancouver',
    'Asia/Almaty','Asia/Amman','Asia/Baghdad','Asia/Beirut','Asia/Bishkek','Asia/Colombo','Asia/Damascus','Asia/Dhaka','Asia/Dubai','Asia/Ho_Chi_Minh','Asia/Hong_Kong','Asia/Jakarta','Asia/Jerusalem','Asia/Kabul','Asia/Kathmandu','Asia/Kuala_Lumpur','Asia/Phnom_Penh','Asia/Riyadh','Asia/Seoul','Asia/Shanghai','Asia/Singapore','Asia/Taipei','Asia/Tashkent','Asia/Tbilisi','Asia/Tehran','Asia/Tokyo','Asia/Ulaanbaatar','Asia/Yangon',
    'Atlantic/Azores','Atlantic/Cape_Verde','Australia/Darwin','Australia/Hobart','Pacific/Auckland','Pacific/Fiji','Pacific/Guam','Pacific/Port_Moresby','Pacific/Tahiti','Pacific/Tongatapu',
    'Europe/Athens','Europe/Belgrade','Europe/Berlin','Europe/Brussels','Europe/Bucharest','Europe/Budapest','Europe/Chisinau','Europe/Dublin','Europe/Helsinki','Europe/Istanbul','Europe/Kyiv','Europe/Lisbon','Europe/Madrid','Europe/Moscow','Europe/Paris','Europe/Riga','Europe/Rome','Europe/Sofia','Europe/Stockholm','Europe/Tallinn','Europe/Tirane','Europe/Vienna','Europe/Vilnius','Europe/Warsaw','Europe/Zurich','Indian/Antananarivo','Indian/Maldives','Indian/Mauritius','Etc/UTC'
  ];
  function isValidTimeZone(zone) {
    if (!zone) return true;
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); return true; } catch (e) { return false; }
  }
  function fillTimeZones() {
    var list = $('mi-tz-list'); if (!list) return;
    var supported = [];
    try { if (Intl.supportedValuesOf) supported = Intl.supportedValuesOf('timeZone'); } catch (e) { supported = []; }
    var labels = {}, seen = {};
    COMMON_TIMEZONES.forEach(function (item) { labels[item[0]] = item[1]; });
    var zones = COMMON_TIMEZONES.map(function (item) { return item[0]; }).concat(supported.length ? supported : FALLBACK_TIMEZONES);
    list.innerHTML = zones.filter(function (zone) {
      if (seen[zone]) return false; seen[zone] = true; return true;
    }).map(function (zone) {
      var label = labels[zone] || zone.replace(/_/g, ' ').replace('/', ': ');
      return '<option value="' + esc(zone) + '" label="' + esc(label) + '"></option>';
    }).join('');
  }
  function updateTimeZonePreview() {
    var field = $('mi-tz'), preview = $('mi-tz-preview'); if (!field || !preview) return;
    var zone = field.value.trim();
    preview.style.color = '';
    if (!zone) { preview.textContent = 'Choose the nearest city. The correct daylight-saving adjustment happens automatically.'; return; }
    if (!isValidTimeZone(zone)) {
      preview.style.color = '#ff9e9e';
      preview.textContent = 'That is not a recognized time zone. Choose one of the city-based options.';
      return;
    }
    var now = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date());
    preview.style.color = 'var(--accent)';
    preview.textContent = 'Current local time there: ' + now;
  }
  fillTimeZones();
  if ($('mi-tz')) $('mi-tz').addEventListener('input', updateTimeZonePreview);
  function buildSelect(id, list, cur, noneLabel) {
    var opts = list.slice();
    if (cur && opts.indexOf(cur) < 0) opts.push(cur);
    $(id).innerHTML = '<option value="">' + (noneLabel || 'None') + '</option>' + opts.map(function (s) { return '<option' + (s === cur ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
  }
  var PDF_SVG2 = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
  function miById(id) { return miss.filter(function (m) { return String(m.id) === String(id); })[0]; }
  function loadMissions() {
    sb.from('site_content').select('key,value').in('key', ['missionary_statuses', 'missionary_regions']).then(function (r) {
      if (r && !r.error && r.data) r.data.forEach(function (row) {
        var list = String(row.value || '').split(/[\n,]/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (!list.length) return;
        if (row.key === 'missionary_statuses') miStatuses = list;
        if (row.key === 'missionary_regions') miRegions = list;
      });
    });
    if (miReady) { renderMiRows(); return; }
    var rows = $('mi-rows'); rows.innerHTML = '<div class="studio-empty">Loading missionaries…</div>';
    sb.from('missionaries').select('*').order('sort', { ascending: true }).then(function (r) {
      if (r.error) { rows.innerHTML = '<div class="studio-empty">Couldn\'t load: ' + esc(r.error.message) + '</div>'; return; }
      miss = r.data || []; miReady = true; renderMiRows();
    });
  }
  function renderMiRows() {
    var rows = $('mi-rows');
    if (!miss.length) { rows.innerHTML = '<div class="studio-empty">No missionaries yet. Click <b>+ New missionary</b> to add your first.</div>'; return; }
    rows.innerHTML = miss.map(function (m) {
      var pill = m.status === 'draft' ? '<span class="spill draft">Draft</span>' : '<span class="spill live">On the map</span>';
      var thumb = m.photo ? '<div class="srow-thumb" style="background-image:url(&quot;' + esc(m.photo) + '&quot;)"></div>' : '<div class="srow-thumb">' + PIN_SVG + '</div>';
      return '<div class="srow">' + thumb +
        '<div class="srow-main"><div class="srow-title">' + esc(m.name) + '</div><div class="srow-meta">' + esc([m.region, m.location].filter(Boolean).join(' · ')) + '</div></div>' +
        pill +
        '<button class="sicon" data-miedit="' + esc(m.id) + '" aria-label="Edit ' + esc(m.name) + '">' + EDIT_SVG + '</button>' +
        '<button class="sicon" data-midel="' + esc(m.id) + '" aria-label="Delete ' + esc(m.name) + '">' + TRASH_SVG + '</button>' +
        '</div>';
    }).join('');
  }
  $('mi-rows').addEventListener('click', function (e) {
    var ed = e.target.closest('[data-miedit]'), dl = e.target.closest('[data-midel]');
    if (ed) { var a = miById(ed.getAttribute('data-miedit')); if (a) openMiEdit(a); }
    else if (dl) { var b = miById(dl.getAttribute('data-midel')); if (b) delMi(b); }
  });
  function miPhotoPrev(url) { var p = $('mi-photo-prev'); if (url) { p.style.backgroundImage = 'url("' + url + '")'; p.classList.add('has'); } else { p.style.backgroundImage = ''; p.classList.remove('has'); } }
  function setMiCoords(lat, lng) {
    miLat = lat; miLng = lng;
    $('mi-coords').textContent = (lat == null) ? 'No location set yet. Click the map to drop a pin.' : ('Pin set at ' + lat.toFixed(3) + ', ' + lng.toFixed(3));
    if (miMap && window.L) {
      if (lat == null) { if (miMarker) { miMap.removeLayer(miMarker); miMarker = null; } }
      else if (!miMarker) miMarker = L.marker([lat, lng]).addTo(miMap); else miMarker.setLatLng([lat, lng]);
    }
  }
  function ensureMiMap() {
    if (!window.L) return;
    if (miMap) { setTimeout(function () { miMap.invalidateSize(); }, 60); return; }
    miMap = L.map('mi-map', { worldCopyJump: true, minZoom: 1, scrollWheelZoom: false, attributionControl: false }).setView([20, 0], 1);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 18 }).addTo(miMap);
    miMap.on('click', function (e) { setMiCoords(e.latlng.lat, e.latlng.lng); });
    setTimeout(function () { miMap.invalidateSize(); }, 90);
  }
  function openMiEdit(m) {
    editingMi = m || null;
    $('mi-edit-title').textContent = m ? 'Edit missionary' : 'New missionary';
    setV('mi-name', m && m.name); buildSelect('mi-region', miRegions, (m && m.region) || '', 'Choose a continent'); setV('mi-location', m && m.location);
    setV('mi-status', (m && m.status) || 'published');
    setV('mi-field', m && m.field); setV('mi-org', m && m.org);
    setV('mi-bio', m && m.bio); setV('mi-connection', m && m.our_connection); setV('mi-prayer', m && m.prayer);
    setV('mi-update', m && m.latest_update); setV('mi-update-date', m && m.latest_update_date);
    setV('mi-video', m && m.video); setV('mi-support', m && m.support_url); setV('mi-contact', m && m.contact_email);
    setV('mi-ministry', m && m.ministry); buildSelect('mi-statuslabel', miStatuses, (m && m.status_label) || '', 'None'); setV('mi-country', m && m.country); setV('mi-year', m && m.sent_year); setV('mi-tz', m && m.timezone); updateTimeZonePreview();
    setV('mi-videos', ((m && m.videos) || []).join('\n'));
    setV('mi-photo', m && m.photo); miPhotoPrev(m && m.photo); $('mi-photo-msg').textContent = ''; $('mi-photo-file').value = '';
    miPhotos = (m && Array.isArray(m.photos)) ? m.photos.slice() : []; renderMiPhotos(); $('mi-photos-msg').textContent = '';
    miLetters = (m && Array.isArray(m.letters)) ? m.letters.slice() : []; renderMiLetters(); $('mi-letter-msg').textContent = '';
    $('mi-msg').textContent = ''; $('mi-msg').className = 'studio-msg';
    $('mi-list').hidden = true; $('mi-edit').hidden = false; window.scrollTo(0, 0);
    ensureMiMap();
    var lat = (m && m.lat != null) ? Number(m.lat) : null, lng = (m && m.lng != null) ? Number(m.lng) : null;
    if (lat != null && isNaN(lat)) lat = null; if (lng != null && isNaN(lng)) lng = null;
    setMiCoords(lat, lng);
    if (lat != null && miMap) setTimeout(function () { try { miMap.setView([lat, lng], 4); miMap.invalidateSize(); } catch (e) { } }, 150);
  }
  function closeMiEdit() { $('mi-edit').hidden = true; $('mi-list').hidden = false; window.scrollTo(0, 0); }
  $('mi-new').addEventListener('click', function () { openMiEdit(null); });
  $('mi-back').addEventListener('click', closeMiEdit);
  $('mi-cancel').addEventListener('click', closeMiEdit);
  $('mi-clear').addEventListener('click', function () { setMiCoords(null, null); });
  $('mi-photo').addEventListener('input', function () { miPhotoPrev(v('mi-photo')); });
  $('mi-photo-file').addEventListener('change', function () {
    var file = this.files && this.files[0]; if (!file) return; var msg = $('mi-photo-msg'); msg.textContent = 'Uploading…';
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    var path = 'missionaries/' + (slugify(v('mi-name')) || 'photo') + '-' + Date.now() + '.' + ext;
    sb.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type }).then(function (r) {
      if (r.error) { msg.textContent = 'Upload failed: ' + r.error.message; return; }
      var url = sb.storage.from(bucket).getPublicUrl(path).data.publicUrl; setV('mi-photo', url); miPhotoPrev(url); msg.textContent = 'Uploaded ✓';
    });
  });
  function renderMiLetters() {
    $('mi-letters').innerHTML = miLetters.map(function (l, i) {
      return '<div class="mi-letter-row">' + PDF_SVG2 +
        '<input class="mi-letter-label" data-li="' + i + '" value="' + esc(l.label || '') + '" placeholder="Label, e.g. June prayer letter">' +
        '<a class="mi-letter-view" href="' + esc(l.url) + '" target="_blank" rel="noopener">View</a>' +
        '<button type="button" class="mi-letter-rm" data-lirm="' + i + '" aria-label="Remove">&times;</button></div>';
    }).join('');
  }
  function gatherMiLetters() {
    Array.prototype.forEach.call($('mi-letters').querySelectorAll('.mi-letter-label'), function (inp) {
      var i = +inp.getAttribute('data-li'); if (miLetters[i]) miLetters[i].label = inp.value.trim();
    });
  }
  $('mi-letters').addEventListener('click', function (e) {
    var rm = e.target.closest('[data-lirm]'); if (!rm) return;
    gatherMiLetters(); miLetters.splice(+rm.getAttribute('data-lirm'), 1); renderMiLetters();
  });
  $('mi-letter-file').addEventListener('change', function () {
    var inp = this, file = inp.files && inp.files[0]; if (!file) return;
    var msg = $('mi-letter-msg'); msg.textContent = 'Uploading PDF…';
    var base = (file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Letter');
    var path = 'missionaries/letters/' + (slugify(v('mi-name')) || 'm') + '-' + Date.now() + '.pdf';
    sb.storage.from(bucket).upload(path, file, { upsert: true, contentType: 'application/pdf' }).then(function (r) {
      inp.value = '';
      if (r.error) { msg.textContent = 'Upload failed: ' + r.error.message; return; }
      var url = sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      gatherMiLetters(); miLetters.push({ label: base, url: url }); renderMiLetters(); msg.textContent = 'Added ✓';
    });
  });
  function renderMiPhotos() {
    $('mi-photos').innerHTML = miPhotos.map(function (u, i) {
      return '<div class="mi-gphoto" style="background-image:url(&quot;' + esc(u) + '&quot;)"><button type="button" data-prm="' + i + '" aria-label="Remove">&times;</button></div>';
    }).join('');
  }
  $('mi-photos').addEventListener('click', function (e) { var rm = e.target.closest('[data-prm]'); if (rm) { miPhotos.splice(+rm.getAttribute('data-prm'), 1); renderMiPhotos(); } });
  $('mi-photo-more').addEventListener('change', function () {
    var inp = this, file = inp.files && inp.files[0]; if (!file) return;
    var msg = $('mi-photos-msg'); msg.textContent = 'Uploading…';
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    var path = 'missionaries/' + (slugify(v('mi-name')) || 'm') + '-' + Date.now() + '.' + ext;
    sb.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type }).then(function (r) {
      inp.value = '';
      if (r.error) { msg.textContent = 'Upload failed: ' + r.error.message; return; }
      miPhotos.push(sb.storage.from(bucket).getPublicUrl(path).data.publicUrl); renderMiPhotos(); msg.textContent = 'Added ✓';
    });
  });
  $('mi-save').addEventListener('click', function () {
    var name = v('mi-name').trim(); if (!name) { alert('Please add a name.'); return; }
    var timeZone = v('mi-tz').trim();
    if (timeZone && !isValidTimeZone(timeZone)) {
      var timeZoneMsg = $('mi-msg'); timeZoneMsg.className = 'studio-msg err';
      timeZoneMsg.textContent = 'Choose a recognized city-based time zone before saving.';
      $('mi-tz').focus(); return;
    }
    gatherMiLetters();
    var slug = (editingMi && editingMi.slug) ? editingMi.slug : (slugify(name) + '-' + Date.now().toString(36).slice(-4));
    var row = {
      slug: slug, name: name, region: v('mi-region').trim() || null, location: v('mi-location').trim() || null,
      lat: miLat, lng: miLng, field: v('mi-field').trim() || null, org: v('mi-org').trim() || null,
      photo: v('mi-photo').trim() || null, bio: v('mi-bio') || null, our_connection: v('mi-connection') || null, prayer: v('mi-prayer') || null,
      latest_update: v('mi-update') || null, latest_update_date: v('mi-update-date') || null,
      support_url: v('mi-support').trim() || null, contact_email: v('mi-contact').trim() || null,
      video: ytid(v('mi-video').trim()) || null,
      videos: v('mi-videos').split('\n').map(function (x) { return ytid(x.trim()); }).filter(Boolean),
      photos: miPhotos, letters: miLetters,
      ministry: v('mi-ministry').trim() || null, status_label: v('mi-statuslabel') || null,
      country: v('mi-country').trim() || null, sent_year: parseInt(v('mi-year'), 10) || null, timezone: timeZone || null,
      status: v('mi-status'), updated_at: new Date().toISOString()
    };
    var btn = $('mi-save'), msg = $('mi-msg'); btn.disabled = true; btn.textContent = 'Saving…'; msg.textContent = '';
    // Editing updates by id; new profiles insert. Keeping this in a function also
    // lets older databases save their existing fields while the two new profile
    // columns are being rolled out.
    function writeMi(payload) {
      return (editingMi && editingMi.id)
        ? sb.from('missionaries').update(payload).eq('id', editingMi.id).select()
        : sb.from('missionaries').insert(payload).select();
    }
    function finishMiSave(r) {
      btn.disabled = false; btn.textContent = 'Save';
      if (r.error) { msg.className = 'studio-msg err'; msg.textContent = 'Couldn\'t save: ' + r.error.message + saveHint(r.error.message).replace(/\n+/g, ' '); return; }
      miReady = false; closeMiEdit(); loadMissions();
    }
    writeMi(row).then(function (r) {
      var missingNewColumns = r.error && /our_connection|latest_update_date/i.test(String(r.error.message || ''));
      if (!missingNewColumns) { finishMiSave(r); return; }

      // Do not let deployment order break edits to already-filled profiles.
      // Save every established field, but never silently discard text entered in
      // one of the new fields.
      var legacyRow = {};
      Object.keys(row).forEach(function (key) {
        if (key !== 'our_connection' && key !== 'latest_update_date') legacyRow[key] = row[key];
      });
      var hasPendingProfileDetails = !!(row.our_connection || row.latest_update_date);
      writeMi(legacyRow).then(function (legacyResult) {
        btn.disabled = false; btn.textContent = 'Save';
        if (legacyResult.error) {
          msg.className = 'studio-msg err';
          msg.textContent = 'Couldn\'t save: ' + legacyResult.error.message + saveHint(legacyResult.error.message).replace(/\n+/g, ' ');
          return;
        }
        miReady = false;
        if (hasPendingProfileDetails) {
          // An insert now has an id, so a later retry updates this same profile
          // instead of creating a duplicate. The unsaved new text stays visible.
          if (legacyResult.data && legacyResult.data[0]) editingMi = legacyResult.data[0];
          $('mi-edit-title').textContent = 'Edit missionary';
          msg.className = 'studio-msg err';
          msg.textContent = 'Your other changes were saved. Our connection and the update date are still on this screen, but need the one-time website database update before those two details can save.';
          return;
        }
        window.alert('Your changes were saved. The two new profile details will become available after the one-time website database update.');
        closeMiEdit(); loadMissions();
      });
    });
  });
  function delMi(m) {
    if (!window.confirm('Delete “' + m.name + '”? This can\'t be undone.')) return;
    sb.from('missionaries').delete().eq('id', m.id).then(function (r) {
      if (r.error) { alert('Couldn\'t delete: ' + r.error.message); return; }
      miReady = false; loadMissions();
    });
  }
})();
