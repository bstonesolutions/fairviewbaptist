/* Keep event discovery metadata aligned with the content saved in Studio. */
(function () {
  'use strict';
  var ORIGIN = 'https://fairviewbaptisttemple.com';
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
  function image(key) {
    var el = document.querySelector('[data-cms-img="' + key + '"] img');
    if (!el) return '';
    try {
      var url = new URL(el.getAttribute('src'), ORIGIN);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (e) { return ''; }
  }
  function update(map) {
    if (!map || typeof map !== 'object') return;
    var node = document.getElementById('jubilee-event-schema');
    var start = date(value(map, 'jubilee_start_date', '2026-11-14'));
    var end = date(value(map, 'jubilee_end_date', '2026-11-18'));
    // A cleared or invalid event date should not leave an old event in search.
    if (!start || !end || end < start) { if (node) node.remove(); return; }
    var descriptions = [text('jubilee_hero_sub'), text('jubilee_dates'), text('jubilee_intro_copy'), text('jubilee_schedule_sub')];
    ['sat', 'sun', 'mon', 'tue', 'wed'].forEach(function (day) {
      var parts = [text('jubilee_' + day + '_day'), text('jubilee_' + day + '_time'), text('jubilee_' + day + '_speakers')].filter(Boolean);
      if (parts.length) descriptions.push(parts.join(': ') + '.');
    });
    descriptions.push(text('jubilee_host'), text('jubilee_music_heading'), text('jubilee_music_family_dates'), text('jubilee_music_copy'));
    var schema = {
      '@context': 'https://schema.org', '@type': 'Event',
      name: text('jubilee_hero_heading') || 'The Appalachian Jubilee',
      startDate: start, endDate: end,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/MixedEventAttendanceMode',
      url: ORIGIN + '/jubilee',
      description: descriptions.filter(Boolean).join(' '),
      image: [image('photo_jubilee_music_flyer'), image('photo_jubilee_flyer')].filter(Boolean),
      location: [
        { '@type': 'Place', name: 'Fairview Baptist Temple', address: [text('contact_address'), text('contact_city')].filter(Boolean).join(', ') },
        { '@type': 'VirtualLocation', url: ORIGIN + '/watch' }
      ],
      organizer: { '@type': 'Organization', name: 'Fairview Baptist Temple', url: ORIGIN + '/' }
    };
    if (!node) { node = document.createElement('script'); node.id = 'jubilee-event-schema'; node.type = 'application/ld+json'; document.head.appendChild(node); }
    node.textContent = JSON.stringify(schema);
  }
  document.addEventListener('fbt:content', function (event) { update(event.detail); });
})();
