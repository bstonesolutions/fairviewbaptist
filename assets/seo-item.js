/* ============================================================
   Fairview Baptist Temple — per-item SEO for the dynamic template pages
   (a single event on event.html, a single post on post.html).
   Those pages load one item client-side, so their canonical URL,
   social preview, and structured data can only be set once the item
   is known. events-ui.js / blog.js call window.FBTSeo.setItem(...)
   with the loaded item; this drops the right tags into <head>.
   Best-effort and self-contained — never throws, never blocks render.
   ============================================================ */
(function () {
  var DOMAIN = 'https://fairviewbaptist.vercel.app';
  var SHARE_IMAGE = 'https://www.fairviewbaptisttemple.com/assets/fairview-share-2026-v2.jpg';
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
    // o: { title, description, image, url, type, jsonld }
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
          var imageAlt = o.image === SHARE_IMAGE ? 'Fairview Baptist Temple in Clay, West Virginia' : o.title;
          setM('property', 'og:image:alt', imageAlt); setM('name', 'twitter:image:alt', imageAlt);
          document.head.querySelectorAll('meta[property="og:image:width"],meta[property="og:image:height"]').forEach(function (old) { old.remove(); });
          if (o.image === SHARE_IMAGE) { setM('property', 'og:image:width', '1200'); setM('property', 'og:image:height', '630'); }
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
