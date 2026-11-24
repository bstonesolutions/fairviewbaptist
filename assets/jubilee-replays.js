/* Completed Appalachian Jubilee services, in most recent service order. */
(function () {
  'use strict';
  // Fairview's broadcasts and 2026 program give the service dates in Clay, WV.
  var recordings = [
    { id: 'Io5HCX-cNXU', title: 'Wednesday Night', date: '2026-11-18' },
    { id: 'aIf9VFENyuw', title: 'Tuesday Night', date: '2026-11-17' },
    { id: 'r7KDaDpHNPU', title: 'Monday Night', date: '2026-11-16' },
    { id: 'hH5FXxjj6bY', title: 'Sunday Evening', date: '2026-11-15' },
    { id: 'KU4VbX_ClTM', title: 'Sunday Morning', date: '2026-11-15' },
    { id: '_YJ_iAbvlfc', title: 'Sunday School', date: '2026-11-15' }
  ];
  var grid = document.getElementById('jubilee-replays');
  if (!grid) return;
  var count = document.querySelector('[data-jubilee-replay-count]');
  var activeId = '';

  function esc(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var dateFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric'
  });

  function render() {
    if (count) count.textContent = recordings.length + ' service replays';
    grid.innerHTML = recordings.map(function (row) {
      var playAttrs = ' type="button" data-jubilee-play="' + row.id + '" aria-label="' + esc('Watch the service: ' + row.title) + '"';
      var date = dateFormat.format(new Date(row.date + 'T12:00:00Z'));
      return '<article class="mc jubilee-replay-card" data-jubilee-service="' + row.id + '">' +
        '<div data-jubilee-media><button class="th jubilee-service-play"' + playAttrs + '><img class="thumb-img" src="https://i.ytimg.com/vi/' + row.id + '/hqdefault.jpg" alt="" loading="lazy" width="480" height="360"><span class="s">Service replay</span><span class="play" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="#FCF8EE"><path d="M8 5v14l11-7z"/></svg></span></button></div>' +
        '<div class="bd"><div class="dt"><time datetime="' + row.date + '">' + date + '</time></div>' +
        '<h3>' + esc(row.title) + '</h3><div class="me" data-jubilee-action><button class="jubilee-service-action"' + playAttrs + '>Watch the service</button></div></div></article>';
    }).join('');
    grid.removeAttribute('aria-busy');
  }

  function openPlayer(id) {
    if (activeId === id) return;
    var row = recordings.find(function (item) { return item.id === id; });
    if (!row) return;
    // Switching services is an explicit viewer action. Stop the previous
    // player so two recordings cannot play at the same time.
    if (activeId) render();
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

  render();
})();
