// Fairview Baptist Temple — shared site behavior (mobile menu, sticky header, scroll reveals).
// Ported verbatim from the approved homepage, made safe for pages that have no ticker.

// Build the hero ticker (homepage only) — duplicated for a seamless loop.
var trk = document.getElementById('trk');
if (trk) {
  var seg = 'Sunday School 10:00am  ●  Worship 11:00am  ●  Sunday Evening 6:00pm  ●  Wednesdays 7:00pm  ●  Everyone Welcome  ●  ';
  trk.textContent = seg + seg;
}

// Sticky header shadow on scroll.
var hd = document.getElementById('hd');
if (hd) addEventListener('scroll', function () { hd.classList.toggle('solid', scrollY > 60); }, { passive: true });

// Mobile-only Give button in the header (top-right). Injected here so it lives
// in one place instead of being copied into every page's header markup; it's
// hidden on desktop via CSS, where the nav already has a Give link.
var cta = document.querySelector('.nav .cta');
if (cta && !cta.querySelector('.mgive')) {
  var give = document.createElement('a');
  give.href = '/give';
  give.className = 'mgive';
  give.textContent = 'Give';
  cta.insertBefore(give, cta.firstChild);
}

// Mobile menu.
var mb = document.getElementById('mb'), msh = document.getElementById('msh'), ov = document.getElementById('ov');
if (mb && msh && ov) {
  var sm = function (o) {
    mb.classList.toggle('open', o);
    msh.classList.toggle('open', o);
    ov.classList.toggle('open', o);
  };
  mb.onclick = function () { sm(!msh.classList.contains('open')); };
  ov.onclick = function () { sm(false); };
  msh.querySelectorAll('a').forEach(function (a) { a.onclick = function () { sm(false); }; });
  addEventListener('keydown', function (e) { if (e.key === 'Escape') sm(false); });
}

// Scroll reveals — kept robust against content that arrives AFTER first paint
// (Supabase feeds: sermons, music, services) or that starts hidden (tab panels).
// Without this, anything injected or un-hidden later stays at opacity:0 until a
// resize forces a reflow — which is the "have to do something to the window for
// it to pop up" bug.
var io = new IntersectionObserver(function (es) {
  es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: .08, rootMargin: '0px 0px -40px 0px' });

// Observe every .rv we haven't already started watching (idempotent).
function rvObserve() {
  var list = document.querySelectorAll('.rv:not(.in)'), i;
  for (i = 0; i < list.length; i++) { if (!list[i].__rv) { list[i].__rv = 1; io.observe(list[i]); } }
}
// Immediately reveal anything already on screen (covers nodes the observer can
// miss: just-injected feed cards, or a panel switched from display:none).
function rvRevealVisible() {
  var vh = window.innerHeight || document.documentElement.clientHeight;
  var list = document.querySelectorAll('.rv:not(.in)'), i, r;
  for (i = 0; i < list.length; i++) {
    r = list[i].getBoundingClientRect();
    if ((r.width || r.height) && r.top < vh + 120 && r.bottom > -120) list[i].classList.add('in');
  }
}
// Public hook so the tab switcher (and anything else) can force a reveal pass.
window.fbtReveal = function () { rvObserve(); rvRevealVisible(); };

rvObserve();
// Re-scan when feeds inject content so new cards animate in instead of vanishing.
if (window.MutationObserver) {
  var rvTimer;
  new MutationObserver(function () {
    clearTimeout(rvTimer);
    rvTimer = setTimeout(function () { rvObserve(); rvRevealVisible(); }, 60);
  }).observe(document.body, { childList: true, subtree: true });
}
// Backstops so nothing ever stays stuck behind the animation, even on slow loads.
window.addEventListener('load', rvRevealVisible);
window.addEventListener('resize', rvRevealVisible, { passive: true });
[250, 900, 2200, 4000].forEach(function (ms) { setTimeout(rvRevealVisible, ms); });
