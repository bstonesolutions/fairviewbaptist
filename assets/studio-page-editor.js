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
  function auxiliaryKeys(page) {
    var keys = [];
    fieldsFor(page).forEach(function (field) {
      if (field.type === 'image') {
        keys.push('media_style_' + field.key, field.key + '_shadow');
        if (/^hero_bg_/.test(field.key)) keys.push(field.key.replace('hero_bg_', 'hero_vid_'));
        if (field.key === 'hero_bg_welcome_home') keys.push('welcome_photo_layout');
      } else {
        keys.push(field.key + '_color', field.key.replace(/_heading$/, '_accent') + '_color');
      }
    });
    return keys.filter(function (key, at) { return keys.indexOf(key) === at; });
  }
  function createSession(page, rows, defaults) {
    var stored = Object.create(null), values = Object.create(null), mediaStyles = Object.create(null), auxValues = Object.create(null);
    (rows || []).forEach(function (row) { if (row && typeof row.key === 'string') stored[row.key] = string(row.value); });
    fieldsFor(page).forEach(function (field) {
      values[field.key] = own(stored, field.key) ? stored[field.key] :
        string(defaults && own(defaults, field.key) ? defaults[field.key] : field.def);
      if (Media && field.type === 'image') {
        var styleKey = Media.styleKey(field.key);
        if (styleKey && (own(stored, styleKey) || defaults && own(defaults, styleKey))) mediaStyles[styleKey] = own(stored, styleKey) ? stored[styleKey] : string(defaults[styleKey]);
      }
    });
    auxiliaryKeys(page).forEach(function (key) { auxValues[key] = own(stored, key) ? stored[key] : string(defaults && defaults[key]); });
    var layout = Layout.normalize(stored[Layout.layoutKey(page)], page);
    return { page: page, values: values, baseValues: Object.assign(Object.create(null), values), mediaStyles: mediaStyles, auxValues: auxValues, baseAuxValues: Object.assign(Object.create(null), auxValues), layout: layout, baseLayout: Layout.serialize(layout, page) };
  }
  function applyInlineEdit(session, key, value) {
    var field = fieldsFor(session.page).filter(function (item) { return item.key === key; })[0];
    if (!field || ['text', 'rich', 'url'].indexOf(field.type || 'text') < 0 || typeof value !== 'string' || value.length > 50000 || field.type === 'url' && !Layout.validateUrl(value, 'url')) return false;
    session.values[key] = value;
    return true;
  }
  function stageDesign(session, values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return 0;
    var fields = fieldsFor(session.page), allowed = auxiliaryKeys(session.page), changes = [];
    Object.keys(values).forEach(function (key) {
      var field = fields.filter(function (item) { return item.key === key; })[0];
      if (!field && allowed.indexOf(key) < 0) return;
      var value = values[key];
      if (typeof value !== 'string' || value.length > 50000) throw new Error('A design value is too long or could not be read.');
      var type = field && field.type || (/^hero_vid_/.test(key) ? 'image' : '');
      if ((type === 'url' || type === 'image') && !Layout.validateUrl(value, type)) throw new Error('Enter a valid website or image address before applying this design.');
      changes.push({ key: key, value: value, auxiliary: !field });
    });
    changes.forEach(function (change) { (change.auxiliary ? session.auxValues : session.values)[change.key] = change.value; });
    return changes.length;
  }
  function mediaRows(session) {
    if (!Media) return [];
    return fieldsFor(session.page).filter(function (field) {
      return field.type === 'image' && string(session.values[field.key]).trim() && Layout.validateUrl(string(session.values[field.key]), 'image') && session.values[field.key] !== session.baseValues[field.key];
    }).map(function (field) {
      var key = Media.styleKey(field.key), kind = /^hero_bg_/.test(field.key) ? 'background' : 'photo';
      var style = Media.parse(session.auxValues[key], kind) || Media.defaults(kind);
      if (session.auxValues[key] !== session.baseAuxValues[key]) return null;
      if (style.source === 'image') return null;
      style.source = 'image';
      return { key: key, value: Media.serialize(style, kind) };
    }).filter(Boolean);
  }
  function contentForPreview(session) {
    var content = Object.assign({}, session.values, session.auxValues);
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
    auxiliaryKeys(session.page).forEach(function (key) {
      if (session.auxValues[key] !== session.baseAuxValues[key]) rows.push({ key: key, value: session.auxValues[key] });
    });
    mediaRows(session).forEach(function (row) {
      var existing = rows.filter(function (item) { return item.key === row.key; })[0];
      if (existing) existing.value = row.value; else rows.push(row);
    });
    var layout = Layout.serialize(session.layout, session.page);
    if (layout !== session.baseLayout) rows.push({ key: Layout.layoutKey(session.page), value: layout });
    return rows;
  }
  async function saveSession(session, client) {
    var rows = dirtyRows(session, true);
    if (!rows.length) return { rows: [], changed: false };
    var submittedAux = Object.assign({}, session.auxValues);
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
      else if (own(session.auxValues, row.key)) {
        session.baseAuxValues[row.key] = row.value;
        if (session.auxValues[row.key] === submittedAux[row.key]) session.auxValues[row.key] = row.value;
        if (/^media_style_/.test(row.key)) session.mediaStyles[row.key] = row.value;
      }
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
    var catalog = options.catalog || root.FBT_PAGE_CATALOG || { pages: [] }, pages = catalog.pages || [];
    var session = null, destroyed = false, busy = false, request = 0, previewTimer, previewSize = 'desktop';
    var selectedSection = '', selectedField = '', selectedMedia = '', history = [], lastHistoryToken = '', lastHistoryAt = 0;
    var inlineReady = false, inlineActive = false, commitSequence = 0, pendingCommit = null;
    var defaults = options.defaults || (root.FBT_SCHEMA && root.FBT_SCHEMA.defaults) || {};
    var document = element.ownerDocument, currentStatus = '', currentStatusKind = '';
    element.classList.add('fbt-page-editor');
    element.innerHTML = '<div class="pe-toolbar"><label class="pe-page-label"><span>Page</span><select data-pe-page aria-label="Choose a page"></select></label>' +
      '<div class="pe-view-tools" role="group" aria-label="Page width"><button type="button" data-pe-size="desktop" aria-pressed="true">Desktop</button><button type="button" data-pe-size="phone" aria-pressed="false">Phone</button></div>' +
      '<div class="pe-save-tools"><button type="button" data-pe-undo disabled>Undo</button><button type="button" class="pe-primary" data-pe-save>Save page</button></div></div>' +
      '<div class="pe-feedback"><p class="pe-status" data-pe-status role="status" aria-live="polite"></p><a data-pe-open target="_blank" rel="noopener">Open saved page ↗</a></div>' +
      '<div class="pe-workspace"><section class="pe-preview" aria-label="Editable page"><p class="pe-canvas-hint">Click text to edit it. Select a photo or section to change its design.</p>' +
      '<div class="pe-frame-shell"><iframe title="Edit this page" sandbox="allow-scripts allow-same-origin" data-pe-frame></iframe></div></section>' +
      '<aside class="pe-inspector" aria-label="Selected section settings"><details class="pe-outline" data-pe-outline><summary>Page sections <span data-pe-count></span></summary>' +
      '<div data-pe-sections></div><div class="pe-outline-actions"><button type="button" data-pe-reset>Reset layout</button><button type="button" data-pe-reload>Reload saved page</button></div></details>' +
      '<div data-pe-inspector></div></aside></div>';
    var picker = element.querySelector('[data-pe-page]'), list = element.querySelector('[data-pe-sections]');
    var inspector = element.querySelector('[data-pe-inspector]'), frame = element.querySelector('[data-pe-frame]');
    var saveButton = element.querySelector('[data-pe-save]');
    function sizePreview() {
      var shell = element.querySelector('.pe-frame-shell'), width = shell.clientWidth;
      if (!width) return;
      var viewport = previewSize === 'phone' ? 390 : 1200, scale = Math.min(1, width / viewport);
      var height = Math.max(420, Math.min(900, root.innerHeight - 150));
      shell.style.height = height + 'px';
      frame.style.width = viewport + 'px'; frame.style.height = Math.round(height / scale) + 'px'; frame.style.transform = 'scale(' + scale + ')';
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
      saveButton.disabled = busy || !session || !(changed || inlineActive);
      element.querySelector('[data-pe-undo]').disabled = busy || !history.length;
      element.querySelector('[data-pe-reset]').disabled = busy || !session;
      element.querySelector('[data-pe-reload]').disabled = busy || !pages.length;
      saveButton.textContent = busy ? 'Please wait…' : 'Save page';
      element.setAttribute('aria-busy', busy ? 'true' : 'false');
      if (!busy && currentStatusKind !== 'error' && currentStatusKind !== 'saved') status(changed || inlineActive ? 'Unsaved changes' : 'Your saved page. Changes stay here until you save.', changed || inlineActive ? 'draft' : '');
    }
    function setBusy(value) {
      busy = value;
      // A second inline edit must not begin while a save or page load is in flight.
      // postMessage can still flush the existing edit while its frame is inert.
      frame.inert = value;
      frame.style.pointerEvents = value ? 'none' : '';
      if (value) frame.setAttribute('tabindex', '-1'); else frame.removeAttribute('tabindex');
      Array.prototype.forEach.call(element.querySelectorAll('input,select,textarea,button'), function (input) { input.disabled = value || input.getAttribute('data-pe-boundary') === 'true'; });
      syncState();
    }
    function postPreview() {
      if (!session || !frame.contentWindow || destroyed) return;
      frame.contentWindow.postMessage({ type: 'fbt:page-preview', pageId: session.page.id, layout: copy(session.layout), content: contentForPreview(session) }, root.location.origin);
    }
    function postFocus() {
      if (!session || !frame.contentWindow || !selectedSection || destroyed) return;
      frame.contentWindow.postMessage({ type: 'fbt:page-focus', pageId: session.page.id, sectionId: selectedSection, fieldKey: selectedField || undefined }, root.location.origin);
    }
    function flushInline() {
      if (!inlineReady || !session || !frame.contentWindow) return Promise.resolve();
      if (pendingCommit) return pendingCommit.promise;
      var id = String(++commitSequence), resolveCommit, rejectCommit;
      var promise = new Promise(function (resolve, reject) { resolveCommit = resolve; rejectCommit = reject; });
      var timer = root.setTimeout(function () {
        if (pendingCommit && pendingCommit.id === id) { pendingCommit = null; rejectCommit(new Error('The page is still updating. Please try again. Your draft is here.')); }
      }, 2500);
      pendingCommit = { id: id, promise: promise, resolve: resolveCommit, reject: rejectCommit, timer: timer };
      frame.contentWindow.postMessage({ type: 'fbt:page-commit', pageId: session.page.id, requestId: id }, root.location.origin);
      return promise;
    }
    function update() {
      if (currentStatusKind === 'error' || currentStatusKind === 'saved') status('', '');
      syncState(); root.clearTimeout(previewTimer); previewTimer = root.setTimeout(postPreview, 180);
    }
    function snapshot() { return { values: copy(session.values), auxValues: copy(session.auxValues), layout: copy(session.layout) }; }
    function remember(token) {
      var now = Date.now();
      if (token && token === lastHistoryToken && now - lastHistoryAt < 900) { lastHistoryAt = now; return; }
      history.push(snapshot()); if (history.length > 60) history.shift(); lastHistoryToken = token || ''; lastHistoryAt = now;
    }
    async function undo() {
      if (!session || !history.length || busy) return;
      setBusy(true);
      try { await flushInline(); } catch (error) { status(error.message, 'error'); setBusy(false); return; }
      var previous = history.pop(); session.values = previous.values; session.auxValues = previous.auxValues; session.layout = previous.layout;
      lastHistoryToken = ''; renderOutline(); renderInspector(); update(); setBusy(false);
    }
    function sectionById(id) { return session && session.page.sections.filter(function (item) { return item.id === id; })[0]; }
    function sectionFields(section) {
      var known = fieldsFor(session.page);
      return (section.fields || []).filter(function (field, index, all) { return known.some(function (item) { return item.key === field.key; }) && all.findIndex(function (item) { return item.key === field.key; }) === index; });
    }
    function focusSection(id, key, mediaKey, fromFrame) {
      var section = sectionById(id); if (!section) return false;
      var fields = sectionFields(section);
      var field = fields.filter(function (item) { return item.key === key; })[0];
      var media = fields.filter(function (item) { return item.key === mediaKey && item.type === 'image'; })[0];
      var changed = selectedSection !== id || selectedField !== (field ? field.key : '') || selectedMedia !== (media ? media.key : '');
      selectedSection = id; selectedField = field ? field.key : ''; selectedMedia = media ? media.key : field && field.type === 'image' ? field.key : '';
      if (changed) { renderOutline(); renderInspector(); }
      if (!fromFrame) postFocus();
      return true;
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
      var multiline = field.type === 'rich' || value.length > 100 || /paragraph|description|subtext|\bbody\b|\bcopy\b|\bbio\b|\banswer\b/i.test(field.label || '');
      var input = multiline ? '<textarea rows="' + (value.length > 200 ? '5' : '3') + '"' + attrs + '>' + escape(value) + '</textarea>' : '<input type="text"' + attrs + ' value="' + escape(value) + '">';
      var help = field.type === 'rich' ? '<small>Use *words* for emphasis. Add a blank line for a new paragraph.</small>' : '';
      var media = '';
      if (field.type === 'image') {
        var library = (root.FBT_PHOTOS || []).filter(function (photo) { return photo && Layout.validateUrl(photo.url, 'image'); });
        media = '<div class="pe-image-tools"><label>Library photo<select data-pe-library="' + escape(field.key) + '"><option value="">Choose a photo…</option>' + library.map(function (photo) {
          return '<option value="' + escape(photo.url) + '">' + escape(photo.label || photo.url) + '</option>';
        }).join('') + '</select></label><label class="pe-upload">Upload photo<input type="file" data-pe-upload="' + escape(field.key) + '" accept="image/jpeg,image/png,image/webp,image/avif"></label>' +
          '<button type="button" data-pe-clear="' + escape(field.key) + '">Clear photo</button></div>';
        if (typeof options.onDesign === 'function') media += '<button class="pe-design-button" type="button" data-pe-design="' + escape(field.key) + '">Edit photo &amp; design ↗</button>';
        help = '<small>Photo address. Choose from the library, upload, or paste an HTTPS image address.</small>';
      }
      return '<div class="pe-field"><label><span>' + escape(field.label || field.key) + '</span>' + input + '</label>' + help + media + '</div>';
    }
    function renderOutline() {
      if (!session) return;
      element.querySelector('[data-pe-count]').textContent = session.layout.order.length;
      list.innerHTML = session.layout.order.map(function (id, index) {
        var section = sectionById(id), setting = session.layout.sections[id]; if (!section) return '';
        var peers = Layout.sectionPeers(session.layout.order, session.page, id), peerIndex = peers.indexOf(id);
        var grouped = session.page.sections.some(function (candidate) { return candidate.parentGroup !== section.parentGroup; });
        var heading = grouped && peerIndex === 0 ? '<p class="pe-group-label">' + escape(section.parentLabel || 'Page') + '</p>' : '';
        return heading + '<div class="pe-outline-row' + (setting.visible ? '' : ' pe-section-muted') + '"><button type="button" class="pe-section-select" data-pe-select="' + escape(id) + '" aria-pressed="' + (id === selectedSection ? 'true' : 'false') + '"><span class="pe-number">' + (index + 1) + '</span><span>' + escape(section.label) + (setting.visible ? '' : '<small>Hidden</small>') + '</span></button>' + orderButtons(id, peerIndex, peers.length) + '</div>';
      }).join('');
      syncState();
    }
    function renderInspector() {
      var section = sectionById(selectedSection);
      if (!section) { inspector.innerHTML = '<div class="pe-empty"><h3>Select something on the page</h3><p>Click a section, a photo, or the words you want to change.</p></div>'; return; }
      var setting = session.layout.sections[section.id], fields = sectionFields(section);
      var field = fields.filter(function (item) { return item.key === selectedField; })[0];
      var mediaField = fields.filter(function (item) { return item.key === selectedMedia; })[0] || fields.filter(function (item) { return item.type === 'image' && /^hero_bg_/.test(item.key); })[0];
      var opened = [];
      Array.prototype.forEach.call(inspector.querySelectorAll('details[open]'), function (node) { if (node.dataset.peSection === section.id) opened.push(node.dataset.peDetails); });
      function details(name, title, html) { return '<details data-pe-details="' + escape(name) + '" data-pe-section="' + escape(section.id) + '"' + (opened.indexOf(name) >= 0 ? ' open' : '') + '><summary>' + title + '</summary>' + html + '</details>'; }
      var fieldsList = fields.map(function (item) { return '<button type="button" class="pe-field-choice" data-pe-pick-field="' + escape(item.key) + '" aria-pressed="' + (item.key === selectedField ? 'true' : 'false') + '"><span>' + escape(item.label || item.key) + '</span><small>' + (item.type === 'image' ? 'Photo' : item.type === 'url' ? 'Link' : 'Text') + '</small></button>'; }).join('');
      var collections = (section.collections || []).map(function (collection) {
        var config = session.layout.collections[collection.id]; if (!config) return '';
        return details(collection.id, escape(collection.label || 'Items') + ' <span>' + config.order.length + '</span>', '<div class="pe-items">' + config.order.map(function (itemId, itemIndex) {
          var item = (collection.items || []).filter(function (candidate) { return candidate.id === itemId; })[0];
          return '<div class="pe-item"><label class="pe-check"><input type="checkbox" data-pe-item="' + escape(itemId) + '" data-pe-collection="' + escape(collection.id) + '"' + (config.hidden.indexOf(itemId) < 0 ? ' checked' : '') + '><span>' + escape(item && item.label || itemId) + '</span></label>' + orderButtons(itemId, itemIndex, config.order.length, collection.id) + '</div>';
        }).join('') + '</div>');
      }).join('');
      inspector.innerHTML = '<article class="pe-section' + (setting.visible ? '' : ' pe-section-muted') + '" data-pe-card="' + escape(section.id) + '"><p class="pe-eyebrow">Selected section</p><h3>' + escape(section.label) + '</h3>' +
        '<label class="pe-check pe-visibility"><input type="checkbox" data-pe-visible="' + escape(section.id) + '"' + (setting.visible ? ' checked' : '') + '>Show this section</label>' +
        (field ? '<div class="pe-selected-field">' + fieldHtml(field) + '</div>' : '<p class="pe-hint">Click the words you want to edit directly on the page.</p>') +
        (mediaField && (!field || field.key !== mediaField.key) && typeof options.onDesign === 'function' ? '<button class="pe-design-button" type="button" data-pe-design="' + escape(mediaField.key) + '">Section photo &amp; design ↗</button>' : '') +
        details('layout', 'Layout &amp; spacing', '<div class="pe-settings">' +
          select('layout', 'Layout', [['original', 'Current design'], ['stacked', 'Stacked'], ['image-left', 'Photo on left'], ['image-right', 'Photo on right']], setting.layout, section.id) +
          select('align', 'Text alignment', [['original', 'Current design'], ['left', 'Left'], ['center', 'Centered']], setting.align, section.id) +
          select('width', 'Content width', [['original', 'Current design'], ['wide', 'Wide'], ['narrow', 'Narrow']], setting.width, section.id) +
          select('spacing', 'Vertical spacing', [['original', 'Current design'], ['compact', 'Compact'], ['roomy', 'Roomy']], setting.spacing, section.id) + '</div><p class="pe-hint">Photo position applies where a photo sits beside text. Phone layouts stay stacked.</p>') +
        (fields.length ? details('fields', 'More content in this section <span>' + fields.length + '</span>', '<div class="pe-field-list">' + fieldsList + '</div>') : '') + collections + '</article>';
      syncState();
    }
    function setValue(key, value) {
      if (!session || !own(session.values, key) || session.values[key] === value) return;
      remember('field:' + key); session.values[key] = value;
      Array.prototype.forEach.call(inspector.querySelectorAll('[data-pe-field]'), function (input) { if (input.dataset.peField === key && input.value !== value) input.value = value; });
      update();
    }
    function frameUrl(page) { var url = new URL(page.path, root.location.href); url.searchParams.set('studio_preview', '1'); url.searchParams.set('visual_edit', '1'); return url.pathname + url.search + url.hash; }
    async function load(page) {
      var current = ++request;
      setBusy(true); status('Loading page…');
      try {
        var keys = fieldsFor(page).map(function (field) { return field.key; }).concat(Layout.layoutKey(page), auxiliaryKeys(page));
        var result = await client.from('site_content').select('key,value').in('key', keys);
        if (destroyed || current !== request) return false;
        if (result.error) throw new Error(result.error.message || 'The page could not be loaded.');
        session = createSession(page, result.data, defaults); picker.value = page.id; history = []; lastHistoryToken = '';
        if (!sectionById(selectedSection)) { selectedSection = session.layout.order[0] || ''; selectedField = ''; selectedMedia = ''; }
        renderOutline(); renderInspector(); status('Your saved page. Changes stay here until you save.');
        element.querySelector('[data-pe-open]').href = page.path; inlineReady = false; inlineActive = false; frame.src = frameUrl(page);
        return true;
      } catch (error) {
        if (current === request && !destroyed) { if (session) picker.value = session.page.id; status(error.message || 'The page could not be loaded. Please retry.', 'error'); }
        return false;
      } finally { if (current === request && !destroyed) setBusy(false); }
    }
    async function selectPage(id) {
      var page = pages.filter(function (item) { return item.id === id; })[0];
      if (!page || busy) return false;
      if (session && session.page.id === id) { sizePreview(); return true; }
      setBusy(true);
      try { await flushInline(); } catch (error) { status(error.message, 'error'); setBusy(false); if (session) picker.value = session.page.id; return false; }
      setBusy(false);
      if (session && dirty() && !root.confirm('Discard the unsaved changes on this page?')) { picker.value = session.page.id; return false; }
      var loaded = await load(page);
      if (loaded && typeof options.onPageChange === 'function') {
        try { options.onPageChange(page); } catch (error) { /* Host navigation must not interrupt a loaded page. */ }
      }
      return loaded;
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
      if (busy || !session) return false;
      setBusy(true); status('Saving and verifying…');
      try {
        await flushInline();
        var result = await saveSession(session, client);
        if (destroyed) return false;
        var newerEdits = dirty();
        history = newerEdits ? [{ values: copy(session.baseValues), auxValues: copy(session.baseAuxValues), layout: Layout.normalize(session.baseLayout, session.page) }] : [];
        lastHistoryToken = ''; status(newerEdits ? 'Saved submitted changes. New edits are still unsaved.' : result.changed ? 'Saved and verified. The page is live.' : 'No changes to save.', newerEdits ? 'draft' : 'saved');
        if (result.changed) {
          inlineReady = false; inlineActive = false; frame.src = frameUrl(session.page) + '&saved=' + Date.now();
          if (typeof options.onSaved === 'function') {
            try { options.onSaved({ page: session.page, rows: result.rows, content: contentForPreview(session), layout: copy(session.layout) }); }
            catch (error) { /* The completed save must not depend on a host refresh. */ }
          }
        }
        return true;
      } catch (error) { status(error.message || 'The page could not be saved. Your changes are still here.', 'error'); return false; }
      finally { if (!destroyed) setBusy(false); }
    }
    async function openDesign(key) {
      var field = session && fieldsFor(session.page).filter(function (item) { return item.key === key && item.type === 'image'; })[0];
      if (!field || typeof options.onDesign !== 'function' || busy) return;
      var editingSession = session;
      try {
        setBusy(true); await flushInline(); setBusy(false);
        await options.onDesign(key, { content: contentForPreview(session), onApply: function (values) {
          if (destroyed || session !== editingSession) return false;
          var previous = snapshot();
          try {
            var applied = stageDesign(session, values);
            if (!applied) return false;
            history.push(previous); if (history.length > 60) history.shift(); lastHistoryToken = '';
            renderInspector(); update(); return true;
          } catch (error) { status(error.message || 'The design could not be applied.', 'error'); return false; }
        } });
      } catch (error) { status(error.message || 'The designer could not be opened.', 'error'); setBusy(false); }
    }
    async function reloadSaved() {
      var page = session ? session.page : pages.filter(function (candidate) { return candidate.id === picker.value; })[0];
      if (!page || busy) return;
      setBusy(true);
      try { await flushInline(); }
      catch (error) { status(error.message, 'error'); setBusy(false); return; }
      setBusy(false);
      if (!dirty() || root.confirm('Discard the unsaved changes and reload this page?')) load(page);
    }
    function input(event) {
      if (busy || !session || !event.target.dataset.peField) return;
      setValue(event.target.dataset.peField, event.target.value);
    }
    function change(event) {
      var target = event.target, data = target.dataset;
      if (busy) return;
      if (target === picker) { selectPage(picker.value); return; }
      if (!session) return;
      if (data.peSetting && own(session.layout.sections, data.peSection)) { remember(); session.layout.sections[data.peSection][data.peSetting] = target.value; update(); }
      if (data.peVisible && own(session.layout.sections, data.peVisible)) { remember(); session.layout.sections[data.peVisible].visible = target.checked; renderOutline(); update(); }
      if (data.peItem && own(session.layout.collections, data.peCollection)) {
        remember(); var config = session.layout.collections[data.peCollection];
        config.hidden = config.hidden.filter(function (id) { return id !== data.peItem; });
        if (!target.checked) config.hidden.push(data.peItem); update();
      }
      if (data.peLibrary && target.value) { setValue(data.peLibrary, target.value); target.value = ''; }
      if (data.peUpload) upload(target);
    }
    function click(event) {
      var target = event.target.closest('button'); if (!target || !element.contains(target) || busy) return;
      var data = target.dataset;
      if (own(data, 'peSave')) { save(); return; }
      if (own(data, 'peUndo')) { undo(); return; }
      if (own(data, 'peReload')) { reloadSaved(); return; }
      if (data.peSize) {
        previewSize = data.peSize; element.querySelector('.pe-frame-shell').classList.toggle('pe-phone', data.peSize === 'phone');
        Array.prototype.forEach.call(element.querySelectorAll('[data-pe-size]'), function (button) { button.setAttribute('aria-pressed', button === target ? 'true' : 'false'); });
        sizePreview(); return;
      }
      if (!session) return;
      if (data.peSelect) { focusSection(data.peSelect); return; }
      if (data.pePickField) { focusSection(selectedSection, data.pePickField); return; }
      if (data.peDesign) { openDesign(data.peDesign); return; }
      if (own(data, 'peReset')) { remember(); session.layout = Layout.normalize(null, session.page); renderOutline(); renderInspector(); update(); }
      if (data.peClear) setValue(data.peClear, '');
      if (data.peMove) {
        var previous = snapshot();
        var changed = data.peCollection ? move(session.layout.collections[data.peCollection].order, data.peMove, Number(data.peDelta)) : moveSection(session, data.peMove, Number(data.peDelta));
        if (changed) { history.push(previous); lastHistoryToken = ''; renderOutline(); renderInspector(); update(); }
      }
    }
    function message(event) {
      if (event.origin !== root.location.origin || event.source !== frame.contentWindow || !event.data || !session || event.data.pageId !== session.page.id) return;
      var data = event.data;
      if (data.type === 'fbt:page-preview-ready') { postPreview(); return; }
      if (data.type === 'fbt:page-inline-ready') { inlineReady = true; postFocus(); return; }
      if (data.type === 'fbt:page-editing' && typeof data.active === 'boolean') { inlineActive = data.active; syncState(); return; }
      if (data.type === 'fbt:page-committed') {
        if (pendingCommit && data.requestId === pendingCommit.id) { var pending = pendingCommit; pendingCommit = null; root.clearTimeout(pending.timer); pending.resolve(); }
        return;
      }
      if (data.type === 'fbt:page-edit') {
        var before = snapshot();
        if (applyInlineEdit(session, data.key, data.value) && JSON.stringify(before.values) !== JSON.stringify(session.values)) {
          history.push(before); if (history.length > 60) history.shift(); lastHistoryToken = '';
          Array.prototype.forEach.call(inspector.querySelectorAll('[data-pe-field]'), function (input) { if (input.dataset.peField === data.key) input.value = data.value; });
          update();
        }
        return;
      }
      if (busy) return;
      if (data.type === 'fbt:page-selection') { focusSection(data.sectionId, data.fieldKey, data.mediaKey, true); return; }
      if (data.type === 'fbt:page-image') { if (focusSection(data.sectionId, data.key, data.key, true)) openDesign(data.key); }
    }
    function beforeUnload(event) { if (dirty() || inlineActive) { event.preventDefault(); event.returnValue = ''; } }
    element.addEventListener('input', input); element.addEventListener('change', change); element.addEventListener('click', click);
    frame.addEventListener('load', postPreview); frame.addEventListener('load', sizePreview); root.addEventListener('message', message); root.addEventListener('beforeunload', beforeUnload);
    var controller = {
      refresh: async function () {
        if (!session) return false;
        var loaded = !dirty() && !inlineActive ? await load(session.page) : true;
        await Promise.resolve();
        if (loaded && typeof options.onPageChange === 'function') {
          try { options.onPageChange(session.page); } catch (error) { /* Keep the active editor usable if host navigation fails. */ }
        }
        return loaded;
      },
      selectPage: selectPage,
      focusSection: function (id, key) { return focusSection(id, key); },
      hasUnsavedChanges: function () { return dirty() || inlineActive; },
      save: save,
      destroy: function () {
        destroyed = true; request++; root.clearTimeout(previewTimer);
        if (pendingCommit) { root.clearTimeout(pendingCommit.timer); pendingCommit.reject(new Error('The page editor was closed.')); pendingCommit = null; }
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
  return { mount: mount, fieldsFor: fieldsFor, auxiliaryKeys: auxiliaryKeys, createSession: createSession, applyInlineEdit: applyInlineEdit, stageDesign: stageDesign, dirtyRows: dirtyRows, saveSession: saveSession, contentForPreview: contentForPreview, move: move, moveSection: moveSection };
});
