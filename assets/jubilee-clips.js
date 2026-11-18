/* Load Fairview's YouTube clips only when a visitor chooses to play one. */
(function () {
  'use strict';
  var section = document.getElementById('jubilee-clips');
  if (!section) return;

  function videoId(value) {
    try {
      var url = new URL(value);
      if (url.protocol !== 'https:') return '';
      var host = url.hostname.toLowerCase();
      var id = '';
      if (host === 'youtu.be') id = url.pathname.slice(1);
      else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].indexOf(host) !== -1) {
        id = url.searchParams.get('v') || url.pathname.replace(/^\/(?:shorts|embed)\//, '');
      }
      return /^[\w-]{11}$/.test(id) ? id : '';
    } catch (_) { return ''; }
  }

  function close(clip) {
    var frame = clip.querySelector('iframe');
    if (frame) frame.remove();
    var closeButton = clip.querySelector('.jubilee-clip-close');
    if (closeButton) closeButton.remove();
    clip.classList.remove('is-playing');
  }

  document.addEventListener('fbt:jubilee-play', function (event) {
    if (event.detail && event.detail.source === 'services') {
      section.querySelectorAll('.jubilee-clip.is-playing').forEach(close);
    }
  });

  section.addEventListener('click', function (event) {
    var button = event.target.closest('.jubilee-clip-play, .jubilee-clip-close');
    if (!button) return;
    var clip = button.closest('.jubilee-clip');
    if (button.classList.contains('jubilee-clip-close')) {
      close(clip);
      clip.querySelector('.jubilee-clip-play').focus();
      return;
    }
    var source = clip.querySelector('[data-cms-href]');
    var id = videoId(source && source.getAttribute('href'));
    if (!id) {
      var message = clip.querySelector('[role="status"]');
      if (!message) {
        message = document.createElement('p');
        message.setAttribute('role', 'status');
        clip.appendChild(message);
      }
      message.textContent = 'This clip is unavailable right now.';
      return;
    }
    section.querySelectorAll('.jubilee-clip.is-playing').forEach(close);
    document.dispatchEvent(new CustomEvent('fbt:jubilee-play', { detail: { source: 'clips' } }));
    var frame = document.createElement('iframe');
    frame.title = clip.querySelector('h3').textContent.trim();
    frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    clip.querySelector('.jubilee-clip-poster').appendChild(frame);
    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'jubilee-clip-close';
    closeButton.textContent = 'Close player';
    clip.appendChild(closeButton);
    clip.classList.add('is-playing');
    frame.focus();
  });
})();
