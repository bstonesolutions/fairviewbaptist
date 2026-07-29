/* Compact podcast player. Reads the public RSS feed and keeps the
   latest three audio episodes separate from the YouTube message library. */
(function () {
  var root = document.querySelector('[data-podcast-player]');
  if (!root) return;

  var audio = root.querySelector('[data-podcast-audio]');
  var now = root.querySelector('[data-podcast-now]');
  var list = root.querySelector('[data-podcast-episodes]');
  var feeds = window.FBT_FEEDS || {};
  var fallbackFeed = feeds.podcastRss || '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function cleanTitle(s) {
    return String(s || '').split('|')[0].replace(/^["“]+|["”]+$/g, '').trim() || 'Podcast episode';
  }
  function shortDate(s) {
    var d = new Date(s); if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function feedUrl() {
    var B = window.FBT;
    if (!B || !B.SUPABASE_URL || !window.supabase) return Promise.resolve(fallbackFeed);
    try {
      var sb = B.getPublicClient ? B.getPublicClient() : window.supabase.createClient(B.SUPABASE_URL, B.SUPABASE_ANON_KEY);
      if (!sb) return Promise.resolve(fallbackFeed);
      return sb.from('site_content').select('value').eq('key', 'podcast_rss').maybeSingle().then(function (r) {
        return r && !r.error && r.data && String(r.data.value || '').trim() || fallbackFeed;
      }, function () { return fallbackFeed; });
    } catch (e) { return Promise.resolve(fallbackFeed); }
  }
  function selectEpisode(episodes, index, play) {
    var ep = episodes[index]; if (!ep || !audio) return;
    audio.src = ep.audio;
    if (now) now.textContent = 'Now playing: ' + ep.title;
    Array.prototype.forEach.call(root.querySelectorAll('.podcast-episode'), function (button, i) {
      button.classList.toggle('active', i === index);
      button.setAttribute('aria-pressed', i === index ? 'true' : 'false');
    });
    if (play) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
  }
  function render(episodes) {
    if (!episodes.length) throw new Error('No podcast episodes');
    list.innerHTML = episodes.map(function (ep, i) {
      var meta = [shortDate(ep.date), ep.duration].filter(Boolean).join(' · ');
      return '<button class="podcast-episode" type="button" data-episode="' + i + '" aria-pressed="false">' +
        '<span class="podcast-episode-play" aria-hidden="true">▶</span>' +
        '<span class="podcast-episode-name">' + esc(ep.title) + '</span>' +
        '<span class="podcast-episode-meta">' + esc(meta) + '</span></button>';
    }).join('');
    list.addEventListener('click', function (e) {
      var button = e.target.closest('[data-episode]'); if (!button) return;
      selectEpisode(episodes, Number(button.getAttribute('data-episode')), true);
    });
    selectEpisode(episodes, 0, false);
  }
  function load(url) {
    return fetch(url, { headers: { accept: 'application/rss+xml, application/xml, text/xml' } })
      .then(function (r) { if (!r.ok) throw new Error('Feed unavailable'); return r.text(); })
      .then(function (text) {
        var xml = new DOMParser().parseFromString(text, 'application/xml');
        if (xml.querySelector('parsererror')) throw new Error('Invalid feed');
        return Array.prototype.slice.call(xml.querySelectorAll('item'), 0, 3).map(function (item) {
          var enclosure = item.querySelector('enclosure');
          var duration = item.getElementsByTagName('itunes:duration')[0];
          return {
            title: cleanTitle((item.querySelector('title') || {}).textContent),
            date: (item.querySelector('pubDate') || {}).textContent || '',
            duration: duration ? duration.textContent : '',
            audio: enclosure ? enclosure.getAttribute('url') : '',
          };
        }).filter(function (ep) { return ep.audio; });
      });
  }

  feedUrl().then(load).then(render).catch(function () {
    if (now) now.textContent = 'Recent episodes are available on Apple Podcasts and Spotify.';
    if (list) list.innerHTML = '<p class="muted">The episode player could not load right now.</p>';
  });
})();
