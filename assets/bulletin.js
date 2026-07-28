/* ============================================================
   Fairview Baptist Temple — weekly bulletin (home page).
   Reads the bulletin list from site_content['bulletins'] (a JSON array of
   { date, title, url } the Studio writes) and shows this week's bulletin as a
   card with an auto-generated cover preview (first page of the PDF, rendered
   with pdf.js), plus Open / Download buttons and a short archive of past weeks.
   If pdf.js or the preview can't load, it falls back to a clean branded cover,
   so it never looks broken. If there are no bulletins, the whole section hides.
   ============================================================ */
(function () {
  var host = document.querySelector('[data-bulletin]');
  if (!host) return;
  var section = host.closest('section');
  var B = window.FBT || {};
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function sbClient() {
    if (!window.supabase || !B.SUPABASE_URL || !B.SUPABASE_ANON_KEY) return null;
    try { return B.getPublicClient ? B.getPublicClient() : window.supabase.createClient(B.SUPABASE_URL, B.SUPABASE_ANON_KEY); } catch (e) { return null; }
  }
  var sb = sbClient();
  var PDF_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
  function hide() { if (section) section.hidden = true; }
  function fmtDate(s) {
    if (!s) return '';
    var p = String(s).split('-'); var d = new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
    return isNaN(d) ? String(s) : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  // ---- pdf.js cover preview (lazy-loaded from CDN; best-effort) ----
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var pdfLoading = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfLoading) return pdfLoading;
    pdfLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = PDFJS;
      s.onload = function () { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; } catch (e) {} resolve(window.pdfjsLib); };
      s.onerror = function () { reject(new Error('pdfjs failed to load')); };
      document.head.appendChild(s);
    });
    return pdfLoading;
  }
  function renderCover(canvas, url) {
    var wrap = canvas.parentNode;
    loadPdfJs()
      .then(function (lib) { return lib.getDocument({ url: url }).promise; })
      .then(function (pdf) { return pdf.getPage(1); })
      .then(function (page) {
        var cw = wrap.clientWidth || 300;
        var base = page.getViewport({ scale: 1 });
        var scale = (cw / base.width) * Math.min(window.devicePixelRatio || 1, 2);
        var vp = page.getViewport({ scale: scale });
        canvas.width = vp.width; canvas.height = vp.height;
        return page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      })
      .then(function () { wrap.classList.add('has-cover'); }, function () { /* keep branded fallback */ });
  }

  function render(list) {
    if (!list || !list.length) { hide(); return; }
    if (section) section.hidden = false;
    var latest = list[0], rest = list.slice(1, 7);
    host.innerHTML =
      '<div class="bl-feature rv">' +
        '<div class="bl-cover"><canvas id="bl-cover-cv" aria-hidden="true"></canvas>' +
          '<div class="bl-cover-fallback"><img src="assets/logo-mark-white.png" alt="">' +
          '<span>' + esc(latest.title || 'Weekly Bulletin') + '</span><em>' + esc(fmtDate(latest.date)) + '</em></div></div>' +
        '<div class="bl-info">' +
          '<span class="kick">This week at Fairview</span>' +
          '<h2>' + esc(latest.title || 'Weekly Bulletin') + '</h2>' +
          '<div class="bl-date">' + esc(fmtDate(latest.date)) + '</div>' +
          '<p>Everything for this Sunday in one place: the order of service, announcements, and what’s coming up. Read it here or take a copy with you.</p>' +
          '<div class="bl-acts"><a class="btn btn-b" href="' + esc(latest.url) + '" target="_blank" rel="noopener">Open the bulletin</a>' +
          '<a class="btn btn-o" href="' + esc(latest.url) + '" download>Download PDF</a></div>' +
        '</div>' +
      '</div>' +
      (rest.length
        ? '<div class="bl-archive rv"><h3>Past bulletins</h3><div class="bl-list">' +
          rest.map(function (b) {
            return '<a class="bl-past" href="' + esc(b.url) + '" target="_blank" rel="noopener">' + PDF_ICON +
              '<span class="bl-past-tx"><span class="bl-past-t">' + esc(b.title || 'Bulletin') + '</span><span class="bl-past-d">' + esc(fmtDate(b.date)) + '</span></span></a>';
          }).join('') + '</div></div>'
        : '');
    var cv = document.getElementById('bl-cover-cv');
    if (cv && latest.url) renderCover(cv, latest.url);
    if (window.fbtReveal) window.fbtReveal();
  }

  function init() {
    if (!sb) { hide(); return; }
    sb.from('site_content').select('value').eq('key', 'bulletins').then(function (r) {
      var list = [];
      if (r && !r.error && r.data && r.data[0]) { try { list = JSON.parse(r.data[0].value) || []; } catch (e) {} }
      list = (list || []).filter(function (b) { return b && b.url; });
      list.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
      render(list);
    }, function () { hide(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
