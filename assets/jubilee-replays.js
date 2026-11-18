/* Appalachian Jubilee 2026, using the same verified stream feed as The Overlook. */
var FBTJubileeReplays = (function () {
  'use strict';

  // Verified against /api/streams on November 18, 2026. Calendar dates come
  // from each stream's weekday title and the supplied November 14-18 flyer,
  // not YouTube's later upload date. No individual preacher is inferred.
  var KNOWN = {
    aIf9VFENyuw: { title: 'Tuesday Night', date: '2026-11-17', order: 5, replay: true },
    r7KDaDpHNPU: { title: 'Monday Night', date: '2026-11-16', order: 4, replay: true },
    hH5FXxjj6bY: { title: 'Sunday Evening', date: '2026-11-15', order: 3, replay: true },
    KU4VbX_ClTM: { title: 'Sunday Morning', date: '2026-11-15', order: 2, replay: true },
    _YJ_iAbvlfc: { title: 'Sunday School', date: '2026-11-15', order: 1, replay: true },
    // This was scheduled when verified. Keep its player after it leaves the
    // feed, with an unknown status. It becomes a replay only when the stream
    // feed reports completion, never merely because its time passed.
    'Io5HCX-cNXU': { title: 'Wednesday Night', date: '2026-11-18', order: 6, replay: false }
  };

  function eventDate(value) {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    var date = new Date(value);
    if (isNaN(date)) return '';
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    var fields = {};
    parts.forEach(function (part) { fields[part.type] = part.value; });
    return fields.year + '-' + fields.month + '-' + fields.day;
  }

  function normalize(item) {
    if (!item) return null;
    var id = item.id || item.videoId || '';
    if (!/^[\w-]{11}$/.test(id)) return null;
    var known = Object.prototype.hasOwnProperty.call(KNOWN, id) ? KNOWN[id] : null;
    var title = String(item.t || item.title || '').trim();
    if (/\b(test(?:ing)?|reels?|shorts?|promo|trailer|teaser)\b|#\w/i.test(title)) return null;
    var start = item.startTime || '';
    var date = known ? known.date : eventDate(start || item.d || item.published);
    if (!known && (!/\bappalachian jubilee\b/i.test(title) || date < '2026-11-14' || date > '2026-11-18')) return null;
    return {
      id: id,
      title: known ? known.title : title.replace(/^appalachian jubilee\s*[-:]*\s*/i, '') || 'Jubilee service',
      // Only a broadcast timestamp or verified title mapping is a service date.
      date: known ? known.date : eventDate(start),
      startTime: start,
      order: known ? known.order : 0,
      ended: !!item.endTime,
      status: item.endTime ? 'replay' : item.live ? 'live' : item.upcoming ? 'upcoming' : 'replay'
    };
  }

  function select(streams, state) {
    var byId = Object.create(null);
    Object.keys(KNOWN).forEach(function (id) {
      var row = normalize({ id: id });
      row.status = KNOWN[id].replay ? 'replay' : 'unknown';
      byId[id] = row;
    });
    (streams || []).forEach(function (item) {
      var row = normalize(item);
      if (row) byId[row.id] = row;
    });
    ['upcoming', 'live'].forEach(function (status) {
      var item = state && state[status];
      if (!item) return;
      var row = normalize(Object.assign({}, item, { upcoming: status === 'upcoming', live: status === 'live' }));
      // An actual end timestamp is stronger than a briefly stale /api/live.
      if (row && !(byId[row.id] && byId[row.id].ended)) byId[row.id] = row;
    });
    var rank = { live: 0, upcoming: 1, replay: 2, unknown: 3 };
    return Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a, b) {
      return rank[a.status] - rank[b.status] || b.date.localeCompare(a.date) || b.order - a.order;
    });
  }

  return { select: select, eventDate: eventDate };
})();

if (typeof module === 'object' && module.exports) module.exports = FBTJubileeReplays;

(function (selection) {
  'use strict';
  if (typeof document === 'undefined') return;
  var grid = document.getElementById('jubilee-replays');
  if (!grid) return;
  var count = document.querySelector('[data-jubilee-replay-count]');
  var lastStreams = [], lastState = {}, activeId = '';

  function esc(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function when(row) {
    var value = row.status === 'upcoming' && row.startTime ? row.startTime : row.date ? row.date + 'T12:00:00-05:00' : '';
    if (!value || isNaN(new Date(value))) return '';
    var options = { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' };
    if (row.status === 'upcoming' && row.startTime) {
      options.hour = 'numeric'; options.minute = '2-digit'; options.timeZoneName = 'short';
    }
    return new Date(value).toLocaleString('en-US', options);
  }

  function render() {
    var rows = selection.select(lastStreams, lastState);
    if (count) {
      var replays = rows.filter(function (row) { return row.status === 'replay'; }).length;
      count.textContent = replays + (replays === 1 ? ' service replay' : ' service replays');
    }
    // A feed refresh must not destroy the iframe or restart a service while
    // someone is watching. Apply the newest card data after the player closes.
    if (activeId) return;
    var markup = rows.map(function (row) {
      var label = row.status === 'live' ? 'Live now' : row.status === 'upcoming' ? 'Scheduled' : row.status === 'replay' ? 'Service replay' : 'Jubilee service';
      var action = row.status === 'live' ? 'Watch live here' : row.status === 'upcoming' ? 'Open the waiting room' : row.status === 'replay' ? 'Watch the service' : 'Open service player';
      var playAttrs = ' type="button" data-jubilee-play="' + row.id + '" aria-label="' + esc(action + ': ' + row.title) + '"';
      var date = when(row);
      return '<article class="mc jubilee-replay-card" data-jubilee-service="' + row.id + '">' +
        '<div data-jubilee-media><button class="th jubilee-service-play"' + playAttrs + '><img class="thumb-img" src="https://i.ytimg.com/vi/' + row.id + '/hqdefault.jpg" alt="" loading="lazy" width="480" height="360"><span class="s">' + label + '</span><span class="play" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="#FCF8EE"><path d="M8 5v14l11-7z"/></svg></span></button></div>' +
        '<div class="bd">' + (date ? '<div class="dt"><time datetime="' + esc(row.status === 'upcoming' && row.startTime ? row.startTime : row.date) + '">' + esc(date) + '</time></div>' : '') +
        '<h3>' + esc(row.title) + '</h3><div class="me" data-jubilee-action><button class="jubilee-service-action"' + playAttrs + '>' + action + '</button></div></div></article>';
    }).join('');
    // Preserve focus during automatic status checks when nothing changed.
    if (grid.innerHTML !== markup) grid.innerHTML = markup;
    grid.removeAttribute('aria-busy');
  }

  function openPlayer(id) {
    if (activeId === id) return;
    var row = selection.select(lastStreams, lastState).filter(function (item) { return item.id === id; })[0];
    if (!row) return;
    // Switching services is an explicit viewer action. Stop the previous
    // player so two recordings cannot play at the same time.
    activeId = '';
    render();
    var card = grid.querySelector('[data-jubilee-service="' + id + '"]');
    if (!card) return;
    var media = card.querySelector('[data-jubilee-media]');
    var action = card.querySelector('[data-jubilee-action]');
    if (!media || !action) return;
    document.dispatchEvent(new CustomEvent('fbt:jubilee-play', { detail: { source: 'services' } }));
    activeId = id;
    card.classList.add('is-playing');
    media.innerHTML = '<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0" title="' + esc('Appalachian Jubilee: ' + row.title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
    action.innerHTML = '<button class="btn btn-o" type="button" data-jubilee-close="' + id + '">Close player</button>';
    var frame = media.querySelector('iframe');
    if (frame) frame.focus();
  }

  grid.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var close = target.closest('[data-jubilee-close]');
    if (close) {
      var id = activeId;
      activeId = '';
      render();
      var button = grid.querySelector('[data-jubilee-play="' + id + '"]');
      if (button) button.focus();
      return;
    }
    var play = target.closest('[data-jubilee-play]');
    if (play) openPlayer(play.getAttribute('data-jubilee-play'));
  });

  document.addEventListener('fbt:jubilee-play', function (event) {
    if (!activeId || !event.detail || event.detail.source !== 'clips') return;
    activeId = '';
    render();
  });

  function read(url) {
    return fetch(url, { headers: { accept: 'application/json' } })
      .then(function (response) { if (!response.ok) throw new Error('Feed unavailable'); return response.json(); })
      .catch(function () { return null; });
  }

  function refresh() {
    Promise.all([read('/api/streams'), read('/api/live')]).then(function (results) {
      var streams = results[0], state = results[1];
      if (streams && Array.isArray(streams.items) && streams.items.length) lastStreams = streams.items;
      if (state && !state.error && ('live' in state || 'upcoming' in state)) lastState = state;
      render();
    });
  }

  render();
  refresh();
  setInterval(function () { if (!document.hidden) refresh(); }, 45000);
})(FBTJubileeReplays);
