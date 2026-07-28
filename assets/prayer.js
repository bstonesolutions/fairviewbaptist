/* ============================================================
   Fairview Baptist Temple — prayer page.

   The request form does two things:
     1) ALWAYS files a private record (via FBTForms → the `submissions`
        table + email) so the team sees it with the person's contact info, and
     2) if the person ticks "share on the wall", ALSO submits a minimal row
        through the moderated prayer RPC (display name + request only)
        — pending until an owner approves it in the Studio.
   The public wall below reads only approved `prayers` rows.

   Degrades gracefully: with no database it still shows the built-in states,
   and a private submission is attempted through FBTForms regardless.
   ============================================================ */
(function () {
  var B = window.FBT || {};
  var CONTACT = '304-587-4709';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function sbClient() {
    if (!window.supabase || !B.SUPABASE_URL || !B.SUPABASE_ANON_KEY) return null;
    try { return B.getPublicClient ? B.getPublicClient() : window.supabase.createClient(B.SUPABASE_URL, B.SUPABASE_ANON_KEY); } catch (e) { return null; }
  }
  var sb = sbClient();

  function fmtDate(iso) { try { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }

  // ---- the request form ----
  function collect(form) {
    var fd = new FormData(form), data = { name: '', email: '', phone: '', message: '', details: {} };
    fd.forEach(function (v, k) {
      if (typeof v === 'string') v = v.trim();
      if (k === 'name' || k === 'email' || k === 'phone' || k === 'message') data[k] = v;
      else if (v !== '' && v != null) data.details[k] = v;
    });
    return data;
  }
  function wireForm() {
    var form = document.getElementById('pray-form'); if (!form) return;
    if (!form.querySelector('[data-fbt-honeypot]')) {
      var trap = document.createElement('input');
      trap.type = 'text'; trap.name = 'website'; trap.tabIndex = -1;
      trap.autocomplete = 'off'; trap.setAttribute('aria-hidden', 'true');
      trap.setAttribute('data-fbt-honeypot', '');
      trap.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
      form.appendChild(trap);
    }
    var msg = form.querySelector('.ev-form-msg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var btn = form.querySelector('button[type=submit]'); var label = btn ? btn.textContent : '';
      if (msg) msg.hidden = true;
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      var data = collect(form);
      var share = !!data.details.shareWall;
      var trapped = !!data.details.website;
      delete data.details.website;
      // 1) private record + email (best-effort, never throws)
      var jobs = [trapped
        ? Promise.resolve({ ok: true })
        : (window.FBTForms ? window.FBTForms.submit('prayer', data) : Promise.resolve({ ok: false }))];
      // 2) public wall candidate (only if they opted in)
      if (share && !trapped && sb) {
        jobs.push(Promise.resolve(sb.rpc('submit_public_prayer', { p_name: firstName(data.name), p_request: data.message }))
          .then(function (r) { return { ok: !(r && r.error) }; }, function () { return { ok: false }; }));
      }
      Promise.all(jobs).then(function (res) {
        var privateOk = res[0] && res[0].ok;
        var wallOk = share && !!(res[1] && res[1].ok);
        var box = form.closest('.vcard') || form.parentNode;
        var first = data.name ? ', ' + esc(firstName(data.name)) : '';
        var sub = wallOk
          ? 'We’ll be praying, and once we’ve had a look it’ll go up on the wall for the church to pray with you.'
          : share && privateOk
          ? 'Our prayer team received your request. We could not add it to the wall for review this time, but your private request is safe with us.'
          : 'We’ll be praying with you. Thank you for trusting us with this.';
        if (privateOk || wallOk) {
          box.innerHTML = '<div class="ev-thanks"><div class="ev-check">&#10003;</div><h3>Thank you' + first + '</h3><p>' + sub + '</p></div>';
        } else {
          if (btn) { btn.disabled = false; btn.textContent = label; }
          if (msg) { msg.hidden = false; msg.className = 'ev-form-msg err'; msg.textContent = 'We couldn’t send that just now. Please call or text ' + CONTACT + ' and we’ll pray with you.'; }
        }
      });
    });
  }

  // ---- the public wall ----
  function renderWall() {
    var host = document.querySelector('[data-prayer-wall]');
    var empty = document.querySelector('[data-prayer-empty]');
    if (!host) return;
    if (!sb) { if (empty) empty.hidden = false; return; }
    sb.from('prayers').select('name,request,answered,created_at').eq('approved', true).order('created_at', { ascending: false }).limit(120)
      .then(function (r) {
        var rows = (r && !r.error && r.data) || [];
        if (!rows.length) { if (empty) empty.hidden = false; host.innerHTML = ''; return; }
        if (empty) empty.hidden = true;
        host.innerHTML = rows.map(function (p) {
          return '<figure class="pray-card' + (p.answered ? ' answered' : '') + '">' +
            (p.answered ? '<span class="pray-badge">Answered &#10003;</span>' : '') +
            '<blockquote>' + esc(p.request) + '</blockquote>' +
            '<figcaption>' + esc(p.name && p.name.trim() ? p.name : 'Anonymous') +
            (fmtDate(p.created_at) ? '<span>' + esc(fmtDate(p.created_at)) + '</span>' : '') +
            '</figcaption></figure>';
        }).join('');
        if (window.fbtReveal) window.fbtReveal();
      }, function () { if (empty) empty.hidden = false; });
  }

  function init() { wireForm(); renderWall(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
