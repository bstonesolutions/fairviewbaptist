/* Media Designer renders the public page, with unsaved changes sent only to its own iframe. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FBT_MEDIA_PAGE_PREVIEW = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';
  function safeKey(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9_:-]{0,119}$/i.test(value) && !/^(?:constructor|prototype|__proto__)$/i.test(value);
  }
  function previewUrl(path, slot, origin) {
    if (typeof path !== 'string' || !/^\/(?!\/)/.test(path) || /[\\\u0000-\u001f\u007f]/.test(path) || !safeKey(slot)) return '';
    try {
      var url = new URL(path, origin);
      if (url.origin !== origin || !/^https?:$/.test(url.protocol)) return '';
      url.searchParams.set('studio_preview', '1'); url.searchParams.set('media_slot', slot);
      return url.pathname + url.search + url.hash;
    } catch (error) { return ''; }
  }
  function payload(pageId, slot, content, requestId) {
    if (!safeKey(pageId) || !safeKey(slot)) return null;
    var values = {};
    if (content && typeof content === 'object' && !Array.isArray(content)) Object.keys(content).forEach(function (key) {
      if (safeKey(key) && typeof content[key] === 'string' && content[key].length <= 50000) values[key] = content[key];
    });
    return { type: 'fbt:media-preview', pageId: pageId, slot: slot, content: values, requestId: Number.isSafeInteger(requestId) && requestId >= 0 ? requestId : 0 };
  }
  function mount(options) {
    var element = options && options.element;
    if (!root || !element) throw new Error('The media preview needs a container.');
    if (element.__fbtMediaPreview) return element.__fbtMediaPreview;
    var origin = root.location.origin, current = null, frameReady = false, timer = null, sent = '', sequence = 0, destroyed = false;
    element.classList.add('media-page-preview');
    element.innerHTML = '<div class="mpp-heading"><strong>Page preview</strong><a data-mpp-open target="_blank" rel="noopener">Open saved page ↗</a></div>' +
      '<p class="mpp-help">The actual page with your unsaved changes. Forms and links are disabled here.</p>' +
      '<div class="mpp-frame-shell"><iframe title="Media page preview" sandbox="allow-scripts allow-same-origin" data-mpp-frame></iframe></div>' +
      '<p class="mpp-status" data-mpp-status role="status" aria-live="polite"></p>';
    var frame = element.querySelector('[data-mpp-frame]'), shell = element.querySelector('.mpp-frame-shell'), status = element.querySelector('[data-mpp-status]');
    function size() {
      if (!current || !shell.clientWidth) return;
      var width = current.viewport === 'mobile' ? 390 : 1200;
      shell.classList.toggle('mpp-phone', current.viewport === 'mobile');
      var scale = Math.min(1, shell.clientWidth / width), height = Math.max(380, Math.min(640, root.innerHeight * .62));
      shell.style.height = height + 'px'; frame.style.width = width + 'px';
      frame.style.height = Math.round(height / scale) + 'px'; frame.style.transform = 'scale(' + scale + ')';
    }
    function post() {
      if (destroyed || !current || !frameReady || !frame.contentWindow) return;
      var message = payload(current.pageId, current.slot, current.content, current.requestId);
      var serialized = JSON.stringify(message);
      if (!message || serialized === sent) return;
      frame.contentWindow.postMessage(message, origin); sent = serialized;
      status.textContent = 'Preview ready. Save changes to publish.';
    }
    function loaded() {
      if (!current || !frame.getAttribute('src') || frame.getAttribute('src') === 'about:blank') return;
      frameReady = true; sent = ''; size(); post();
    }
    function message(event) {
      if (!current || event.origin !== origin || event.source !== frame.contentWindow || !event.data) return;
      if (event.data.type !== 'fbt:page-preview-ready' || event.data.pageId !== current.pageId) return;
      frameReady = true; size(); post();
    }
    var observer = root.ResizeObserver ? new root.ResizeObserver(size) : null;
    if (observer) observer.observe(element);
    root.addEventListener('resize', size); root.addEventListener('message', message); frame.addEventListener('load', loaded);
    var api = {
      update: function (next) {
        if (destroyed || !next) return;
        var url = previewUrl(next.path, next.slot, origin);
        var page = root.FBTPageLayout && root.FBTPageLayout.findPage(next.path, root.FBT_PAGE_CATALOG);
        if (!url || !page) { status.textContent = 'This page preview is unavailable. Open the saved page to review it.'; return; }
        var content = payload(page.id, next.slot, next.content, 0).content;
        var navigate = !current || current.url !== url;
        var changed = !current || navigate || current.viewport !== next.viewport || JSON.stringify(current.content) !== JSON.stringify(content);
        if (!changed) return;
        current = { url: url, pageId: page.id, slot: next.slot, viewport: next.viewport === 'mobile' ? 'mobile' : 'desktop', content: content, requestId: ++sequence };
        element.querySelector('[data-mpp-open]').href = next.path;
        if (navigate) { frameReady = false; sent = ''; status.textContent = 'Loading page preview…'; frame.src = url; }
        size(); root.clearTimeout(timer); timer = root.setTimeout(post, 100);
      },
      close: function () { current = null; frameReady = false; sent = ''; root.clearTimeout(timer); frame.src = 'about:blank'; },
      destroy: function () {
        api.close(); destroyed = true;
        root.removeEventListener('resize', size); root.removeEventListener('message', message); frame.removeEventListener('load', loaded);
        if (observer) observer.disconnect(); delete element.__fbtMediaPreview;
      }
    };
    element.__fbtMediaPreview = api;
    return api;
  }
  return { mount: mount, previewUrl: previewUrl, payload: payload };
});
