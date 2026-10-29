/* ============================================================
   Fairview Baptist Temple — per-item SEO for the dynamic template pages
   (a single event on event.html, a single post on post.html).
   The server supplies item metadata for link previews. events-ui.js /
   blog.js call window.FBTSeo.setItem(...) after loading the item to keep
   the browser metadata aligned with the current content.
   Best-effort and self-contained — never throws, never blocks render.
   ============================================================ */
(function () {
  var DOMAIN = 'https://www.fairviewbaptisttemple.com';
  var SHARE_IMAGE = 'https://www.fairviewbaptisttemple.com/assets/fairview-share-2026-v2.jpg';
  var SHARE_CARDS = {
    post: { image: DOMAIN + '/assets/share/blog-v1.jpg', alt: 'Notes from Fairview, church news and notes from Fairview Baptist Temple in Clay, West Virginia' },
    event: { image: DOMAIN + '/assets/share/events-v1.jpg', alt: 'Upcoming events at Fairview Baptist Temple in Clay, West Virginia' }
  };
  function shareCard(image) {
    if (image === SHARE_IMAGE) return { image: SHARE_IMAGE, alt: 'Fairview Baptist Temple in Clay, West Virginia' };
    return Object.keys(SHARE_CARDS).map(function (key) { return SHARE_CARDS[key]; }).filter(function (card) { return card.image === image; })[0];
  }
  function imageFor(kind, value) {
    var v = String(value || '').trim();
    if (!v) return (SHARE_CARDS[kind] || { image: SHARE_IMAGE }).image;
    if (/^https?:\/\//i.test(v)) return v;
    if (/^\/\//.test(v)) return 'https:' + v;
    return DOMAIN + '/' + v.replace(/^\//, '');
  }
  function metaEl(kind, key) {
    var el = document.head.querySelector('meta[' + kind + '="' + key + '"]');
    if (!el) { el = document.createElement('meta'); el.setAttribute(kind, key); document.head.appendChild(el); }
    return el;
  }
  function setM(kind, key, val) { if (val != null && val !== '') metaEl(kind, key).setAttribute('content', val); }
  function linkEl(rel) {
    var el = document.head.querySelector('link[rel="' + rel + '"]');
    if (!el) { el = document.createElement('link'); el.setAttribute('rel', rel); document.head.appendChild(el); }
    return el;
  }
  window.FBTSeo = {
    DOMAIN: DOMAIN,
    SHARE_IMAGE: SHARE_IMAGE,
    imageFor: imageFor,
    // o: { title, description, image, imageAlt, url, type, jsonld }
    setItem: function (o) {
      try {
        o = o || {};
        var url = o.url || location.href;
        if (o.title) document.title = o.title;
        linkEl('canonical').setAttribute('href', url);
        setM('property', 'og:type', o.type || 'article');
        setM('property', 'og:url', url);
        setM('property', 'og:title', o.title);
        setM('property', 'og:description', o.description);
        setM('name', 'twitter:title', o.title);
        setM('name', 'twitter:description', o.description);
        if (o.image) {
          setM('property', 'og:image', o.image); setM('name', 'twitter:image', o.image);
          var card = shareCard(o.image);
          var imageAlt = card ? card.alt : (o.imageAlt || o.title);
          setM('property', 'og:image:alt', imageAlt); setM('name', 'twitter:image:alt', imageAlt);
          document.head.querySelectorAll('meta[property="og:image:width"],meta[property="og:image:height"]').forEach(function (old) { old.remove(); });
          if (card) { setM('property', 'og:image:width', '1200'); setM('property', 'og:image:height', '630'); }
        }
        if (o.jsonld) {
          document.head.querySelectorAll('script[data-seo-item],script[data-server-item]').forEach(function (old) { old.remove(); });
          var s = document.createElement('script');
          s.type = 'application/ld+json';
          s.setAttribute('data-seo-item', '1');
          s.textContent = JSON.stringify(o.jsonld);
          document.head.appendChild(s);
        }
      } catch (e) { /* never block the page */ }
    }
  };
})();
