/* ============================================================
   Fairview Baptist Temple — analytics loader (off until you add an ID).
   TO TURN ON GOOGLE ANALYTICS: set GA_ID below to your Measurement
   ID (it looks like "G-XXXXXXXXXX"). That single line is the only
   change needed — this file loads on every page, so analytics goes
   live everywhere at once. Leave it empty to keep analytics off.
   ============================================================ */
(function () {
  var GA_ID = ''; // <-- paste the church's G-XXXXXXXXXX here to enable
  if (!GA_ID) return;
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', GA_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  window.gtag = gtag;
})();

/* Vercel Web Analytics for this static site. */
(function () {
  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };

  var s = document.createElement('script');
  s.defer = true;
  s.src = '/_vercel/insights/script.js';
  document.head.appendChild(s);
})();
