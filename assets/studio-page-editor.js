/* Page content and layout editor. The authenticated Studio client is supplied by its host. */
(function (root, factory) {
  var layoutApi = root && root.FBTPageLayout, mediaApi = root && root.FBTMediaStyles;
  if (typeof module === 'object' && module.exports) { layoutApi = require('./page-editor.js'); mediaApi = require('./media-styles.js'); }
  var api = factory(root, layoutApi, mediaApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FBT_PAGE_EDITOR = api;
})(typeof window !== 'undefined' ? window : null, function (root, Layout, Media) {
  'use strict';
  var own = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  var string = function (value) { return value == null ? '' : String(value); };
  var copy = function (value) { return JSON.parse(JSON.stringify(value)); };
  function fieldsFor(page) {
    var seen = Object.create(null), fields = [];
    (page.sections || []).forEach(function (section) {
      (section.fields || []).forEach(function (field) {
        if (!field || !/^[a-z0-9][a-z0-9_]{0,119}$/i.test(field.key) || /^(?:constructor|prototype|page_layout_)/i.test(field.key) || seen[field.key]) return;
        seen[field.key] = true;
        fields.push(field);
      });
    });
    return fields;
  }
  function createSession(page, rows, defaults) {
    var stored = Object.create(null), values = Object.create(null), mediaStyles = Object.create(null);
    (rows || []).forEach(function (row) { if (row && typeof row.key === 'string') stored[row.key] = string(row.value); });
    fieldsFor(page).forEach(function (field) {
      values[field.key] = own(stored, field.key) ? stored[field.key] :
        string(defaults && own(defaults, field.key) ? defaults[field.key] : field.def);
      if (Media && field.type === 'image') {
        var styleKey = Media.styleKey(field.key);
        if (styleKey && (own(stored, styleKey) || defaults && own(defaults, styleKey))) mediaStyles[styleKey] = own(stored, styleKey) ? stored[styleKey] : string(defaults[styleKey]);
      }
    });
    var layout = Layout.normalize(stored[Layout.layoutKey(page)], page);
    return { page: page, values: values, baseValues: Object.assign(Object.create(null), values), mediaStyles: mediaStyles, layout: layout, baseLayout: Layout.serialize(layout, page) };
  }
  function mediaRows(session) {
    if (!Media) return [];
    return fieldsFor(session.page).filter(function (field) {
      return field.type === 'image' && string(session.values[field.key]).trim() && Layout.validateUrl(string(session.values[field.key]), 'image') && session.values[field.key] !== session.baseValues[field.key];
    }).map(function (field) {
      var key = Media.styleKey(field.key), kind = /^hero_bg_/.test(field.key) ? 'background' : 'photo';
      var style = Media.parse(session.mediaStyles[key], kind) || Media.defaults(kind);
      if (style.source === 'image') return null;
      style.source = 'image';
      return { key: key, value: Media.serialize(style, kind) };
    }).filter(Boolean);
  }
  function contentForPreview(session) {
    var content = Object.assign({}, session.values, session.mediaStyles);
    mediaRows(session).forEach(function (row) { content[row.key] = row.value; });
    return content;
  }
  function dirtyRows(session, validate) {
    var rows = [];
    fieldsFor(session.page).forEach(function (field) {
      var value = string(session.values[field.key]);
      if (value === session.baseValues[field.key]) return;
      if (validate && (field.type === 'url' || field.type === 'image') && !Layout.validateUrl(value, field.type)) {
        throw new Error((field.label || field.key) + ': enter a valid website address or a link beginning with /.');
      }
      rows.push({ key: field.key, value: value });
    });
    rows = rows.concat(mediaRows(session));
    var layout = Layout.serialize(session.layout, session.page);
    if (layout !== session.baseLayout) rows.push({ key: Layout.layoutKey(session.page), value: layout });
    return rows;
  }
  async function saveSession(session, client) {
    var rows = dirtyRows(session, true);
    if (!rows.length) return { rows: [], changed: false };
    var timestamp = new Date().toISOString();
    var result = await client.from('site_content').upsert(rows.map(function (row) {
      return { key: row.key, value: row.value, updated_at: timestamp };
    }), { onConflict: 'key' });
    if (result.error) throw new Error(result.error.message || 'The page could not be saved.');
    var check = await client.from('site_content').select('key,value').in('key', rows.map(function (row) { return row.key; }));
    if (check.error) throw new Error('The save was sent, but could not be verified. Your changes are still here. Please retry.');
    var saved = Object.create(null);
    (check.data || []).forEach(function (row) { saved[row.key] = string(row.value); });
    if (rows.some(function (row) { return !own(saved, row.key) || saved[row.key] !== row.value; })) {
      throw new Error('The saved page did not match these changes. Your changes are still here. Please retry.');
    }
    rows.forEach(function (row) {
      if (row.key === Layout.layoutKey(session.page)) session.baseLayout = row.value;
      else if (/^media_style_/.test(row.key)) session.mediaStyles[row.key] = row.value;
      else session.baseValues[row.key] = row.value;
    });
    return { rows: rows, changed: true };
  }
  function move(array, id, delta) {
    var index = array.indexOf(id), next = index + delta;
    if (index < 0 || next < 0 || next >= array.length) return false;
    array.splice(index, 1); array.splice(next, 0, id); return true;
  }
  function moveSection(session, id, delta) {
    var peers = Layout.sectionPeers(session.layout.order, session.page, id);
    if (!move(peers, id, delta)) return false;
    var next = 0;
    session.layout.order = Layout.sectionOrder(session.layout.order, session.page).map(function (candidate) {
      return peers.indexOf(candidate) >= 0 ? peers[next++] : candidate;
    });
    return true;
  }
  function escape(value) { return string(value).replace(/[&<>"']/g, function (char) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]; }); }
  function mount(options) {
    options = options || {};
    var element = options.element, client = options.client;
    if (!element || !client || !Layout) throw new Error('The page editor needs a container, Studio client, and page layout module.');
    if (element.__fbtPageEditor) return element.__fbtPageEditor;
    var catalog = options.catalog || root.FBT_PAGE_CATALOG || { pages: [] };
    var pages = catalog.pages || [], session = null, destroyed = false, busy = false, request = 0, previewTimer, previewSize = 'desktop';
    var defaults = options.defaults || (root.FBT_SCHEMA && root.FBT_SCHEMA.defaults) || {};
    var document = element.ownerDocument, currentStatus = '', currentStatusKind = '';
    element.classList.add('fbt-page-editor');
    element.innerHTML = '<div class="pe-toolbar"><label class="pe-page-label">Choose a page<select data-pe-page></select></label>' +
      '<div class="pe-save-tools"><button type="button" data-pe-reset>Reset layout</button><button type="button" data-pe-reload>Discard changes</button><button type="button" class="pe-primary" data-pe-save>Save page</button></div></div>' +
      '<p class="pe-status" data-pe-status role="status" aria-live="polite"></p>' +
      '<div class="pe-workspace"><div class="pe-controls" data-pe-sections></div><aside class="pe-preview"><div class="pe-preview-toolbar"><strong>Page preview</strong>' +
      '<div><button type="button" data-pe-size="desktop" aria-pressed="true">Desktop</button><button type="button" data-pe-size="phone" aria-pressed="false">Phone width</button>' +
      '<a data-pe-open target="_blank" rel="noopener">Open saved page ↗</a></div></div><p class="pe-hint">Changes appear here before you save. Forms are disabled in this preview.</p>' +
      '<div class="pe-frame-shell"><iframe title="Page preview" sandbox="allow-scripts allow-same-origin" data-pe-frame></iframe></div></aside></div>';
    var picker = element.querySelector('[data-pe-page]'), list = element.querySelector('[data-pe-sections]');
    var frame = element.querySelector('[data-pe-frame]'), saveButton = element.querySelector('[data-pe-save]');
    function sizePreview() {
      var shell = element.querySelector('.pe-frame-shell'), width = shell.clientWidth;
      if (!width) return;
      var viewport = previewSize === 'phone' ? 390 : 1200, scale = Math.min(1, width / viewport);
      var height = Math.max(400, Math.min(780, root.innerHeight * .8));
      shell.style.height = height + 'px';
      frame.style.width = viewport + 'px'; frame.style.height = Math.round(height / scale) + 'px';
      frame.style.transform = 'scale(' + scale + ')';
    }
    var resizeObserver = root.ResizeObserver ? new root.ResizeObserver(sizePreview) : null;
    if (resizeObserver) resizeObserver.observe(element.querySelector('.pe-preview'));
    root.addEventListener('resize', sizePreview);
    pages.forEach(function (page) { var option = document.createElement('option'); option.value = page.id; option.textContent = page.label; picker.appendChild(option); });
    function dirty() { return !!session && dirtyRows(session, false).length > 0; }
    function status(message, kind) {
      currentStatus = message; currentStatusKind = kind || '';
      var node = element.querySelector('[data-pe-status]'); node.textContent = message; node.dataset.kind = currentStatusKind;
    }
    function syncState() {
      var changed = dirty();
      saveButton.disabled = busy || !session || !changed;
      element.querySelector('[data-pe-reset]').disabled = busy || !session;
      var reloadButton = element.querySelector('[data-pe-reload]');
      reloadButton.disabled = busy || !pages.length;
      reloadButton.textContent = changed ? 'Discard changes' : 'Reload saved page';
      saveButton.textContent = busy ? 'Please wait…' : 'Save page';
      element.setAttribute('aria-busy', busy ? 'true' : 'false');
      if (!busy && changed && currentStatusKind !== 'error') status('Unsaved changes. Save page to publish them.', 'draft');
    }
    function setBusy(value) {
      busy = value;
      Array.prototype.forEach.call(element.querySelectorAll('input,select,textarea,button'), function (input) {
        input.disabled = value || input.getAttribute('data-pe-boundary') === 'true';
      });
      syncState();
    }
    function postPreview() {
      if (!session || !frame.contentWindow || destroyed) return;
      frame.contentWindow.postMessage({ type: 'fbt:page-preview', pageId: session.page.id, layout: copy(session.layout), content: contentForPreview(session) }, root.location.origin);
    }
    function update() {
      if (currentStatusKind === 'error' || currentStatusKind === 'saved') status('', '');
      syncState(); root.clearTimeout(previewTimer); previewTimer = root.setTimeout(postPreview, 180);
    }
    function boundary(disabled) { return disabled ? ' disabled data-pe-boundary="true"' : ''; }
    function orderButtons(id, index, length, collection) {
      var attributes = ' data-pe-move="' + escape(id) + '"' + (collection ? ' data-pe-collection="' + escape(collection) + '"' : '');
      return '<div class="pe-order"><button type="button"' + attributes + ' data-pe-delta="-1" aria-label="Move up"' + boundary(index === 0) + '>↑</button>' +
        '<button type="button"' + attributes + ' data-pe-delta="1" aria-label="Move down"' + boundary(index === length - 1) + '>↓</button></div>';
    }
    function select(setting, label, choices, value, id) {
      return '<label>' + label + '<select data-pe-setting="' + setting + '" data-pe-section="' + escape(id) + '">' + choices.map(function (choice) {
        return '<option value="' + choice[0] + '"' + (value === choice[0] ? ' selected' : '') + '>' + choice[1] + '</option>';
      }).join('') + '</select></label>';
    }
    function fieldHtml(field) {
      if (!own(session.values, field.key)) return '';
      var value = session.values[field.key], attrs = ' data-pe-field="' + escape(field.key) + '"';
      var multiline = field.type === 'rich' || value.length > 110 || /paragraph|description|subtext|\bbody\b|\bcopy\b|\bbio\b|\banswer\b/i.test(field.label || '');
      var input = multiline ? '<textarea rows="' + (value.length > 130 ? '4' : '2') + '"' + attrs + '>' + escape(value) + '</textarea>' : '<input type="text"' + attrs + ' value="' + escape(value) + '">';
      var help = field.type === 'rich' ? '<small>Use *words* for emphasis. Paragraphs can be separated with a blank line.</small>' : '';
      var media = '';
      if (field.type === 'image') {
        var library = (root.FBT_PHOTOS || []).filter(function (photo) { return photo && Layout.validateUrl(photo.url, 'image'); });
        media = '<div class="pe-image-tools"><label>Choose a library photo<select data-pe-library="' + escape(field.key) + '"><option value="">Choose a photo…</option>' + library.map(function (photo) {
          return '<option value="' + escape(photo.url) + '">' + escape(photo.label || photo.url) + '</option>';
        }).join('') + '</select></label><label class="pe-upload">Upload photo<input type="file" data-pe-upload="' + escape(field.key) + '" accept="image/jpeg,image/png,image/webp,image/avif"></label>' +
          '<button type="button" data-pe-clear="' + escape(field.key) + '">Clear photo</button></div>';
        help = '<small>Use a library photo, upload an original, or enter an HTTPS image address. Save page to apply the change. Cropping and overlays are in Photos &amp; media.</small>';
      }
      return '<div class="pe-field"><label><span>' + escape(field.label || field.key) + '</span>' + input + '</label>' + help + media + '</div>';
    }
    function renderSections() {
      if (!session) return;
      var opened = [];
      Array.prototype.forEach.call(list.querySelectorAll('details[open]'), function (node) { opened.push(node.dataset.peDetails); });
      list.innerHTML = session.layout.order.map(function (id, index) {
        var section = session.page.sections.filter(function (candidate) { return candidate.id === id; })[0], setting = session.layout.sections[id];
        if (!section) return '';
        var peers = Layout.sectionPeers(session.layout.order, session.page, id), peerIndex = peers.indexOf(id);
        var grouped = session.page.sections.some(function (candidate) { return candidate.parentGroup !== section.parentGroup; });
        var groupHeading = grouped && peerIndex === 0 ? '<p class="pe-group-label">' + escape(section.parentLabel || 'Page sections') + '<small>Sections move within this area.</small></p>' : '';
        var fields = (section.fields || []).filter(function (field, at, all) { return all.findIndex(function (other) { return other.key === field.key; }) === at; });
        var collections = (section.collections || []).map(function (collection) {
          var config = session.layout.collections[collection.id];
          if (!config) return '';
          return '<details class="pe-collection" data-pe-details="' + escape(collection.id) + '"' + (opened.indexOf(collection.id) >= 0 ? ' open' : '') + '><summary>' + escape(collection.label || 'Items') + ' <span>' + config.order.length + '</span></summary><div class="pe-items">' + config.order.map(function (itemId, itemIndex) {
            var item = (collection.items || []).filter(function (candidate) { return candidate.id === itemId; })[0];
            return '<div class="pe-item"><label class="pe-check"><input type="checkbox" data-pe-item="' + escape(itemId) + '" data-pe-collection="' + escape(collection.id) + '"' + (config.hidden.indexOf(itemId) < 0 ? ' checked' : '') + '><span>' + escape(item && item.label || itemId) + '</span></label>' + orderButtons(itemId, itemIndex, config.order.length, collection.id) + '</div>';
          }).join('') + '</div></details>';
        }).join('');
        return groupHeading + '<article class="pe-section' + (setting.visible ? '' : ' pe-section-muted') + '" data-pe-card="' + escape(id) + '"><div class="pe-section-heading"><div><span class="pe-number">' + (index + 1) + '</span><h3>' + escape(section.label) + '</h3></div>' + orderButtons(id, peerIndex, peers.length) + '</div>' +
          '<label class="pe-check"><input type="checkbox" data-pe-visible="' + escape(id) + '"' + (setting.visible ? ' checked' : '') + '>Show this section</label>' +
          '<details data-pe-details="' + escape(id) + '"' + (opened.indexOf(id) >= 0 ? ' open' : '') + '><summary>Layout &amp; spacing</summary><div class="pe-settings">' +
          select('layout', 'Layout', [['original', 'Current design'], ['stacked', 'Stacked'], ['image-left', 'Photo on the left'], ['image-right', 'Photo on the right']], setting.layout, id) +
          select('align', 'Text alignment', [['original', 'Current design'], ['left', 'Left'], ['center', 'Centered']], setting.align, id) +
          select('width', 'Content width', [['original', 'Current design'], ['wide', 'Wide'], ['narrow', 'Narrow']], setting.width, id) +
          select('spacing', 'Vertical spacing', [['original', 'Current design'], ['compact', 'Compact'], ['roomy', 'Roomy']], setting.spacing, id) +
          '</div><p class="pe-hint">Photo position applies to sections with a photo beside text. Phone layouts remain stacked.</p></details>' +
          (fields.length ? '<details class="pe-fields" data-pe-details="fields-' + escape(id) + '"' + (opened.indexOf('fields-' + id) >= 0 ? ' open' : '') + '><summary>Text, links &amp; photos <span>' + fields.length + '</span></summary><div>' + fields.map(fieldHtml).join('') + '</div></details>' : '') + collections + '</article>';
      }).join('');
      syncState();
    }
    function setValue(key, value) {
      if (!session || !own(session.values, key)) return;
      session.values[key] = value;
      Array.prototype.forEach.call(list.querySelectorAll('[data-pe-field]'), function (input) { if (input.dataset.peField === key && input.value !== value) input.value = value; });
      update();
    }
    async function load(page) {
      var current = ++request;
      setBusy(true); status('Loading page…');
      try {
        var keys = fieldsFor(page).map(function (field) { return field.key; }).concat(Layout.layoutKey(page));
        if (Media) fieldsFor(page).forEach(function (field) { if (field.type === 'image' && Media.styleKey(field.key)) keys.push(Media.styleKey(field.key)); });
        var result = await client.from('site_content').select('key,value').in('key', keys);
        if (destroyed || current !== request) return;
        if (result.error) throw new Error(result.error.message || 'The page could not be loaded.');
        session = createSession(page, result.data, defaults); picker.value = page.id;
        renderSections(); status('Edit the page, then save when it is ready.');
        element.querySelector('[data-pe-open]').href = page.path;
        frame.src = page.path + (page.path.indexOf('?') >= 0 ? '&' : '?') + 'studio_preview=1';
      } catch (error) {
        if (current === request && !destroyed) { if (session) picker.value = session.page.id; status(error.message || 'The page could not be loaded. Please retry.', 'error'); }
      } finally { if (current === request && !destroyed) setBusy(false); }
    }
    async function upload(input) {
      var file = input.files && input.files[0], key = input.dataset.peUpload;
      if (!file) return;
      var types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
      if (!types[file.type] || file.size > 15 * 1024 * 1024) { status('Choose a JPG, PNG, WebP, or AVIF photo under 15 MB.', 'error'); input.value = ''; return; }
      setBusy(true); status('Uploading photo…');
      try {
        if (root.FBTImageUpload) file = await root.FBTImageUpload.prepare(file);
        var storage = client.storage.from((root.FBT && root.FBT.MEDIA_BUCKET) || 'fbt-media');
        var random = root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2);
        var path = 'page-editor/' + random + '.' + types[file.type];
        var result = await storage.upload(path, file, { upsert: false, contentType: file.type });
        if (result.error) throw new Error(result.error.message || 'The photo could not be uploaded.');
        var urlResult = storage.getPublicUrl(path), url = urlResult.data && urlResult.data.publicUrl;
        if (!url || !Layout.validateUrl(url, 'image')) throw new Error('The photo uploaded, but its address could not be read.');
        setValue(key, url); status('Photo uploaded. Save page to use it.', 'draft');
      } catch (error) { status(error.message || 'The photo could not be uploaded.', 'error'); }
      finally { input.value = ''; setBusy(false); }
    }
    async function save() {
      if (busy || !session) return;
      setBusy(true); status('Saving and verifying…');
      try {
        var result = await saveSession(session, client);
        if (destroyed) return;
        status(result.changed ? 'Saved and verified. The page is live.' : 'No changes to save.', 'saved');
        if (result.changed) {
          frame.src = session.page.path + '?studio_preview=1&saved=' + Date.now();
          if (typeof options.onSaved === 'function') {
            try { options.onSaved({ page: session.page, rows: result.rows, content: contentForPreview(session), layout: copy(session.layout) }); }
            catch (error) { /* The completed save must not depend on a host refresh. */ }
          }
        }
      } catch (error) { status(error.message || 'The page could not be saved. Your changes are still here.', 'error'); }
      finally { if (!destroyed) setBusy(false); }
    }
    function input(event) {
      if (busy || !session || !event.target.dataset.peField) return;
      setValue(event.target.dataset.peField, event.target.value);
    }
    function change(event) {
      var target = event.target, data = target.dataset;
      if (busy) return;
      if (target === picker) {
        var page = pages.filter(function (candidate) { return candidate.id === picker.value; })[0];
        if (session && dirty() && !root.confirm('Discard the unsaved changes on this page?')) { picker.value = session.page.id; return; }
        if (page) load(page); return;
      }
      if (!session) return;
      if (data.peSetting) { session.layout.sections[data.peSection][data.peSetting] = target.value; update(); }
      if (data.peVisible) { session.layout.sections[data.peVisible].visible = target.checked; target.closest('.pe-section').classList.toggle('pe-section-muted', !target.checked); update(); }
      if (data.peItem) {
        var config = session.layout.collections[data.peCollection];
        config.hidden = config.hidden.filter(function (id) { return id !== data.peItem; });
        if (!target.checked) config.hidden.push(data.peItem);
        update();
      }
      if (data.peLibrary && target.value) { setValue(data.peLibrary, target.value); target.value = ''; }
      if (data.peUpload) upload(target);
    }
    function click(event) {
      var target = event.target.closest('button'); if (!target || !element.contains(target) || busy) return;
      var data = target.dataset;
      if (own(data, 'peSave')) { save(); return; }
      if (own(data, 'peReload')) {
        var page = session ? session.page : pages.filter(function (candidate) { return candidate.id === picker.value; })[0];
        if (page && (!dirty() || root.confirm('Discard the unsaved changes and reload this page?'))) load(page);
        return;
      }
      if (data.peSize) {
        previewSize = data.peSize;
        element.querySelector('.pe-frame-shell').classList.toggle('pe-phone', data.peSize === 'phone');
        Array.prototype.forEach.call(element.querySelectorAll('[data-pe-size]'), function (button) { button.setAttribute('aria-pressed', button === target ? 'true' : 'false'); });
        sizePreview();
      }
      if (!session) return;
      if (own(data, 'peReset')) { session.layout = Layout.normalize(null, session.page); renderSections(); update(); }
      if (data.peClear) setValue(data.peClear, '');
      if (data.peMove) {
        var changed = data.peCollection ? move(session.layout.collections[data.peCollection].order, data.peMove, Number(data.peDelta)) : moveSection(session, data.peMove, Number(data.peDelta));
        if (changed) { renderSections(); update(); }
      }
    }
    function message(event) { if (event.origin === root.location.origin && event.source === frame.contentWindow && event.data && event.data.type === 'fbt:page-preview-ready' && session && event.data.pageId === session.page.id) postPreview(); }
    function beforeUnload(event) { if (dirty()) { event.preventDefault(); event.returnValue = ''; } }
    element.addEventListener('input', input); element.addEventListener('change', change); element.addEventListener('click', click);
    frame.addEventListener('load', postPreview); frame.addEventListener('load', sizePreview); root.addEventListener('message', message); root.addEventListener('beforeunload', beforeUnload);
    var controller = {
      refresh: function () { return session && !dirty() ? load(session.page) : Promise.resolve(); },
      hasUnsavedChanges: dirty,
      destroy: function () {
        destroyed = true; request++; root.clearTimeout(previewTimer);
        element.removeEventListener('input', input); element.removeEventListener('change', change); element.removeEventListener('click', click);
        frame.removeEventListener('load', postPreview); frame.removeEventListener('load', sizePreview); root.removeEventListener('resize', sizePreview);
        if (resizeObserver) resizeObserver.disconnect();
        root.removeEventListener('message', message); root.removeEventListener('beforeunload', beforeUnload);
        delete element.__fbtPageEditor;
      }
    };
    element.__fbtPageEditor = controller;
    if (pages.length) controller.ready = load(pages[0]); else { status('No editable pages are available.', 'error'); syncState(); controller.ready = Promise.resolve(); }
    return controller;
  }
  return { mount: mount, fieldsFor: fieldsFor, createSession: createSession, dirtyRows: dirtyRows, saveSession: saveSession, contentForPreview: contentForPreview, move: move, moveSection: moveSection };
});
