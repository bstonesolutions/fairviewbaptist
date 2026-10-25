/* Shared church map and directions, editable in Studio Settings. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FBTMapSettings = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  function embedURL(value) {
    try {
      var url = new URL(String(value || '').trim());
      if (url.protocol !== 'https:' || !/^(www\.)?google\.com$/.test(url.hostname)) return '';
      if (/^\/maps\/embed(?:\/v1\/place)?\/?$/.test(url.pathname)) return url.href;
      if (url.pathname === '/maps' && url.searchParams.get('output') === 'embed') return url.href;
    } catch (e) { /* Use the address map when no embed is configured. */ }
    return '';
  }
  function directionsURL(value) {
    try {
      var url = new URL(String(value || '').trim());
      if (url.protocol === 'https:' && (/^(www\.|maps\.)?google\.com$/.test(url.hostname) || url.hostname === 'maps.app.goo.gl')) return url.href;
    } catch (e) { /* Use directions to the church address. */ }
    return '';
  }
  function resolve(map) {
    map = map || {};
    var address = [String(map.contact_address || '2294 Main Street').trim(), String(map.contact_city || 'Clay, WV 25043').trim()].join(', ');
    return {
      address: address,
      embed: embedURL(map.maps_embed_url) || 'https://www.google.com/maps?q=' + encodeURIComponent(address) + '&output=embed',
      directions: directionsURL(map.maps_url) || 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(address)
    };
  }
  function apply(map) {
    if (typeof document === 'undefined') return;
    var settings = resolve(map);
    document.querySelectorAll('.mapc iframe').forEach(function (frame) {
      if (frame.getAttribute('src') !== settings.embed) frame.src = settings.embed;
      frame.title = 'Map to Fairview Baptist Temple, ' + settings.address;
    });
    document.querySelectorAll('[data-cms-href="maps_url"]').forEach(function (link) { link.href = settings.directions; });
  }
  return { embedURL: embedURL, directionsURL: directionsURL, resolve: resolve, apply: apply };
});
