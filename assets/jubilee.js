/* Keep the Jubilee recap metadata aligned with the content saved in Studio. */
(function () {
  'use strict';
  var ORIGIN = 'https://www.fairviewbaptisttemple.com';
  // Keep the archived program visible while editing its text and photos.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('studio_preview') === '1') {
    var program = document.querySelector('.jubilee-program');
    if (program) program.open = true;
  }
  function value(map, key, fallback) {
    return Object.prototype.hasOwnProperty.call(map, key) ? String(map[key] == null ? '' : map[key]).trim() : fallback;
  }
  function date(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    var parsed = new Date(value + 'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
  }
  function text(key) {
    var el = document.querySelector('[data-cms-text="' + key + '"], [data-cms-rich="' + key + '"]');
    return el ? el.textContent.trim() : '';
  }
  function image(map) {
    var el = document.querySelector('[data-cms-bg="hero_bg_jubilee"] img');
    var source = value(map, 'hero_bg_jubilee', el ? el.getAttribute('src') : '');
    if (!source) return '';
    try {
      var url = new URL(source, ORIGIN);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (e) { return ''; }
  }
  function update(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return;
    var legacy = document.getElementById('jubilee-event-schema');
    if (legacy) legacy.remove();
    var node = document.getElementById('jubilee-recap-schema');
    var start = date(value(map, 'jubilee_start_date', '2026-11-14'));
    var end = date(value(map, 'jubilee_end_date', '2026-11-18'));
    var recap = {
      '@type': 'WebPageElement', '@id': ORIGIN + '/jubilee#2026',
      name: text('jubilee_2026_heading') || '2026 highlights',
      description: [text('jubilee_dates'), text('jubilee_intro_copy')].filter(Boolean).join(' ')
    };
    if (start.startsWith('2026-') && end.startsWith('2026-') && end >= start) {
      recap.temporalCoverage = start + '/' + end;
    }
    var schema = {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      '@id': ORIGIN + '/jubilee#page',
      name: text('jubilee_hero_heading') || 'The Appalachian Jubilee',
      url: ORIGIN + '/jubilee',
      hasPart: [{
        '@type': 'WebPageElement', '@id': ORIGIN + '/jubilee#2027',
        name: text('jubilee_2027_heading') || '2027 Appalachian Jubilee',
        description: text('jubilee_2027_announcement')
      }, recap],
      isPartOf: { '@id': ORIGIN + '/#website' },
      about: { '@id': ORIGIN + '/#church' },
      relatedLink: ORIGIN + '/watch'
    };
    var hero = image(map);
    if (hero) schema.primaryImageOfPage = { '@type': 'ImageObject', url: hero };
    if (!node) { node = document.createElement('script'); node.id = 'jubilee-recap-schema'; node.type = 'application/ld+json'; document.head.appendChild(node); }
    node.textContent = JSON.stringify(schema);
  }
  document.addEventListener('fbt:content', function (event) { update(event.detail); });
})();
