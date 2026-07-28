/* ============================================================
   Fairview Baptist Temple — shared form submissions.

   Any <form data-fbt-form="visit|contact|..."> on the site is wired to:
     1) save a validated row through Supabase           -> Studio inbox
     2) email the church via /api/notify                -> owner's inbox
   Both are best-effort. If neither succeeds, the visitor is asked to call
   or text instead, so a form can never silently swallow a message.

   One-time setup (see CMS-SETUP.md): create the `submissions` table, and set
   RESEND_API_KEY in the host env for the email half. Until then it degrades
   gracefully (the built-in fallback message).
   ============================================================ */
(function () {
  var B = window.FBT || {};
  var CONTACT = '304-587-4709';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function sbClient() {
    if (!window.supabase || !B.SUPABASE_URL || !B.SUPABASE_ANON_KEY) return null;
    try { return B.getPublicClient ? B.getPublicClient() : window.supabase.createClient(B.SUPABASE_URL, B.SUPABASE_ANON_KEY); } catch (e) { return null; }
  }

  // Save + notify. Returns { ok, saved, mailed }. Never rejects.
  function submit(kind, data) {
    if (data && data.details && data.details.website) {
      return Promise.resolve({ ok: true, saved: false, mailed: false, errs: [] });
    }
    var row = {
      kind: kind || 'contact',
      name: data.name || '', email: data.email || '', phone: data.phone || '',
      message: data.message || '', details: data.details || {},
    };
    var saved = false, mailed = false, jobs = [], errs = [];
    var sb = sbClient();
    if (sb) {
      jobs.push(Promise.resolve(sb.rpc('submit_public_form', {
        p_kind: row.kind,
        p_name: row.name,
        p_email: row.email,
        p_phone: row.phone,
        p_message: row.message,
        p_details: row.details,
      }))
        .then(function (r) { if (r && r.error) errs.push('save: ' + (r.error.message || r.error)); else saved = true; },
              function (e) { errs.push('save: ' + ((e && e.message) || e)); }));
    } else { errs.push('save: no database connection'); }
    jobs.push(fetch('/api/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row),
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) { if (j && j.sent) mailed = true; else errs.push('email: ' + ((j && j.reason) || 'not sent')); },
            function (e) { errs.push('email: ' + ((e && e.message) || e)); }));
    return Promise.all(jobs).then(function () { return { ok: saved || mailed, saved: saved, mailed: mailed, errs: errs }; });
  }
  window.FBTForms = { submit: submit };

  function collect(form) {
    var fd = new FormData(form), data = { name: '', email: '', phone: '', message: '', details: {} };
    fd.forEach(function (val, key) {
      if (typeof val === 'string') val = val.trim();
      if (key === 'name' || key === 'email' || key === 'phone' || key === 'message') { data[key] = val; return; }
      if (val !== '' && val != null) data.details[key] = val;
    });
    return data;
  }

  function wire(form) {
    if (!form.querySelector('[data-fbt-honeypot]')) {
      var trap = document.createElement('input');
      trap.type = 'text'; trap.name = 'website'; trap.tabIndex = -1;
      trap.autocomplete = 'off'; trap.setAttribute('aria-hidden', 'true');
      trap.setAttribute('data-fbt-honeypot', '');
      trap.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
      form.appendChild(trap);
    }
    var kind = form.getAttribute('data-fbt-form') || 'contact';
    var msg = form.querySelector('.ev-form-msg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var btn = form.querySelector('button[type=submit]') || form.querySelector('button');
      var label = btn ? btn.textContent : '';
      if (msg) msg.hidden = true;
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      var data = collect(form);
      submit(kind, data).then(function (r) {
        if (r.ok) {
          var box = form.closest('.vcard') || form.parentNode;
          var first = data.name ? ', ' + esc(data.name.split(' ')[0]) : '';
          var head = kind === 'visit' ? 'We saved you a seat' : kind === 'newsletter' ? 'You’re on the list' : 'Message sent';
          var sub = kind === 'visit'
            ? 'We’ll be watching for you and have someone ready to say hello.'
            : kind === 'newsletter'
            ? 'We’ll keep you posted on what’s happening at Fairview.'
            : 'Thanks for reaching out. We’ll get back to you soon.';
          box.innerHTML = '<div class="ev-thanks"><div class="ev-check">&#10003;</div><h3>' + head + '</h3><p>Thanks' + first + '. ' + sub + '</p></div>';
        } else {
          if (btn) { btn.disabled = false; btn.textContent = label; }
          if (msg) {
            msg.hidden = false; msg.className = 'ev-form-msg err';
            var txt = 'We couldn’t send that just now. Please call or text ' + CONTACT + ' and we’ll take care of you.';
            if (/[?&]debug=1/.test(location.search) && r.errs && r.errs.length) txt += '  [debug: ' + r.errs.join('  |  ') + ']';
            msg.textContent = txt;
          }
        }
      });
    });
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll('form[data-fbt-form]'), wire); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
