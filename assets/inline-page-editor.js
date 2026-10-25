/* Draft-only editing on the real page inside Studio's visual preview. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FBTInlinePageEditor = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';
  var controller = null;
  var blocked = 'form,button,input,textarea,select,nav,header,footer,[data-fbt-inline-ui],' +
    '[data-cms-no-reveal],[data-live-stage],[data-cms-sermons-grid],[data-cms-sermons-featured],' +
    '[data-fbt-services-grid],[data-fbt-music-grid],[data-fbt-music-featured],' +
    '[data-events-upcoming],[data-events-list],[data-events-past-grid],[data-event-featured],' +
    '[data-blog-grid],[data-prayer-wall],[data-mf],[data-sf],[data-lib],[data-svc],' +
    '#miss-grid,#miss-modal,#miss-search-results';

  function canStart(win) {
    try {
      var params = new URLSearchParams(win.location.search);
      return win.parent !== win && win.parent.location.origin === win.location.origin &&
        params.get('studio_preview') === '1' && params.get('visual_edit') === '1';
    } catch (error) { return false; }
  }
  function fieldsFor(section) {
    var fields = Object.create(null);
    (section && section.fields || []).forEach(function (field) {
      if (field && /^[a-z0-9][a-z0-9_]{0,119}$/i.test(field.key) &&
          ['text', 'rich', 'image'].indexOf(field.type) >= 0) fields[field.key] = field;
    });
    return fields;
  }
  function serialize(node, rich) {
    function read(current) {
      if (current.nodeType === 3) return current.nodeValue || '';
      var tag = String(current.tagName || '').toUpperCase();
      if (['SCRIPT', 'STYLE', 'IMG', 'SVG', 'IFRAME'].indexOf(tag) >= 0) return '';
      if (tag === 'BR') return '\n';
      var value = Array.prototype.map.call(current.childNodes || [], read).join('');
      if (rich && (tag === 'EM' || tag === 'I')) return '*' + value + '*';
      if (current !== node && (tag === 'DIV' || tag === 'P')) return '\n' + value + '\n';
      return value;
    }
    return read(node).replace(/\r\n?/g, '\n').replace(/\u200b/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }
  function serializeText(node) { return serialize(node, false); }
  function serializeRich(node) { return serialize(node, true); }

  function mount(win) {
    if (!canStart(win) || !win.FBTPageLayout) return null;
    var document = win.document, page = win.FBTPageLayout.findPage(win.location.pathname);
    if (!page) return null;
    var selected = null, active = null, pendingFocus = null, marked = [], destroyed = false;
    var sectionMap = Object.create(null);
    page.sections.forEach(function (section) { sectionMap[section.id] = section; });
    var ui = document.createElement('div');
    ui.setAttribute('data-fbt-inline-ui', '');
    ui.className = 'fbt-inline-tools';
    ui.innerHTML = '<div class="fbt-inline-status" role="status" aria-live="polite">Click text to edit. Select a photo to change it.</div>' +
      '<button class="fbt-inline-image" type="button" hidden>Edit image</button>';
    document.body.appendChild(ui);
    document.documentElement.classList.add('fbt-inline-enabled');
    var status = ui.querySelector('.fbt-inline-status'), imageButton = ui.querySelector('button');
    function send(type, detail) {
      win.parent.postMessage(Object.assign({ type: type, pageId: page.id }, detail), win.location.origin);
    }
    function sectionFor(node) {
      var element = node && node.closest && node.closest('[data-page-section]');
      var definition = element && sectionMap[element.getAttribute('data-page-section')];
      return definition ? { element: element, definition: definition } : null;
    }
    function fieldFor(node, section) {
      var element = node && node.closest && node.closest('[data-cms-text],[data-cms-rich]');
      if (!element || !section || !section.element.contains(element) || element.closest(blocked)) return null;
      var rich = element.hasAttribute('data-cms-rich');
      var key = element.getAttribute(rich ? 'data-cms-rich' : 'data-cms-text');
      var field = fieldsFor(section.definition)[key];
      return field && field.type === (rich ? 'rich' : 'text') ? { element: element, key: key, type: field.type } : null;
    }
    function mediaFor(node, section, fallback) {
      if (!section) return null;
      var element = node && node.closest && node.closest('[data-cms-img],[data-cms-bg]');
      if (!element && fallback) element = section.element.querySelector('[data-cms-bg]');
      if (!element || !section.element.contains(element) || element.closest(blocked)) return null;
      var key = element.getAttribute('data-cms-img') || element.getAttribute('data-cms-bg');
      var field = fieldsFor(section.definition)[key];
      return field && field.type === 'image' ? { element: element, key: key } : null;
    }
    function choose(section, field, media, notify) {
      if (!section) return;
      document.querySelectorAll('.fbt-inline-selected,.fbt-inline-field-selected').forEach(function (el) {
        el.classList.remove('fbt-inline-selected', 'fbt-inline-field-selected');
      });
      section.element.classList.add('fbt-inline-selected');
      var focus = field && field.element || media && media.element;
      if (focus) focus.classList.add('fbt-inline-field-selected');
      selected = { section: section, field: field, media: media };
      imageButton.hidden = !media;
      status.textContent = field ? 'Edit this text. Press Escape to cancel or Ctrl/Command + Enter to finish.' :
        section.definition.label + (media ? ': select Edit image to choose a photo.' : ': adjust this section in Studio.');
      if (notify) {
        var payload = { sectionId: section.definition.id };
        if (field) payload.fieldKey = field.key;
        if (media) payload.mediaKey = media.key;
        send('fbt:page-selection', payload);
      }
    }
    function remember(node, name) { return node.hasAttribute(name) ? node.getAttribute(name) : null; }
    function restore(node, name, value) { if (value === null) node.removeAttribute(name); else node.setAttribute(name, value); }
    function finish(commit) {
      if (!active) return;
      var edit = active, node = edit.field.element;
      var value = edit.field.type === 'rich' ? serializeRich(node) : serializeText(node);
      active = null;
      node.removeAttribute('data-fbt-inline-editing');
      restore(node, 'contenteditable', edit.contenteditable);
      restore(node, 'role', edit.role);
      restore(node, 'aria-multiline', edit.multiline);
      restore(node, 'spellcheck', edit.spellcheck);
      if (!commit) node.innerHTML = edit.html;
      if (commit && value !== edit.value) {
        send('fbt:page-edit', { sectionId: edit.section.definition.id, key: edit.field.key, value: value });
        status.textContent = 'Text changed in your draft. Save the page in Studio to publish it.';
      } else status.textContent = commit ? 'Text is unchanged.' : 'Text edit canceled.';
      send('fbt:page-editing', { active: false });
      if (pendingFocus) { var next = pendingFocus; pendingFocus = null; focusMessage(next); }
    }
    function edit(field, section) {
      if (active && active.field.element === field.element) return;
      finish(true);
      var node = field.element;
      active = { field: field, section: section, html: node.innerHTML,
        value: field.type === 'rich' ? serializeRich(node) : serializeText(node),
        contenteditable: remember(node, 'contenteditable'), role: remember(node, 'role'),
        multiline: remember(node, 'aria-multiline'), spellcheck: remember(node, 'spellcheck') };
      node.setAttribute('data-fbt-inline-editing', '');
      node.setAttribute('contenteditable', 'true');
      node.setAttribute('role', 'textbox');
      node.setAttribute('aria-multiline', 'true');
      node.setAttribute('spellcheck', 'true');
      node.focus({ preventScroll: true });
      var selection = win.getSelection(), range = document.createRange();
      range.selectNodeContents(node); range.collapse(false);
      selection.removeAllRanges(); selection.addRange(range);
      send('fbt:page-editing', { active: true });
    }
    function pointer(event) {
      var node = event.target;
      if (!node || !node.closest || node.closest('[data-fbt-inline-ui]') || node.closest(blocked)) return;
      if (active && active.field.element.contains(node)) return;
      var section = sectionFor(node);
      if (!section) { finish(true); return; }
      var field = fieldFor(node, section), media = mediaFor(node, section, !field);
      finish(true);
      choose(section, field, media, true);
      if (field) { event.preventDefault(); edit(field, section); }
    }
    function keydown(event) {
      if (active) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
        else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); finish(true); }
        return;
      }
      if (event.key !== 'Enter' || !event.target.closest) return;
      var section = sectionFor(event.target), field = fieldFor(event.target, section);
      if (!field) {
        var media = mediaFor(event.target, section, false);
        if (media) { event.preventDefault(); choose(section, null, media, true); imageButton.focus(); }
        return;
      }
      event.preventDefault(); choose(section, field, null, true); edit(field, section);
    }
    function paste(event) {
      if (!active || !active.field.element.contains(event.target)) return;
      event.preventDefault();
      var text = event.clipboardData && event.clipboardData.getData('text/plain') || '';
      if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
        document.execCommand('insertText', false, text);
      } else {
        var selection = win.getSelection();
        if (!selection.rangeCount) return;
        var range = selection.getRangeAt(0);
        if (!active.field.element.contains(range.commonAncestorContainer)) return;
        range.deleteContents();
        var textNode = document.createTextNode(text); range.insertNode(textNode);
        range.setStartAfter(textNode); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);
      }
    }
    function drop(event) { if (active && active.field.element.contains(event.target)) event.preventDefault(); }
    function blur(event) { if (active && event.target === active.field.element) finish(true); }
    function focusMessage(message) {
      var definition = sectionMap[message.sectionId];
      if (!definition) return;
      if (active) { pendingFocus = message; return; }
      var element = document.querySelector(definition.selector);
      if (!element) return;
      var section = { element: element, definition: definition }, field = null, media = null;
      if (message.fieldKey && fieldsFor(definition)[message.fieldKey]) {
        Array.prototype.some.call(element.querySelectorAll('[data-cms-text],[data-cms-rich]'), function (node) {
          var candidate = fieldFor(node, section);
          if (candidate && candidate.key === message.fieldKey) { field = candidate; return true; }
          return false;
        });
        if (!field) Array.prototype.some.call(element.querySelectorAll('[data-cms-img],[data-cms-bg]'), function (node) {
          var candidate = mediaFor(node, section, false);
          if (candidate && candidate.key === message.fieldKey) { media = candidate; return true; }
          return false;
        });
      }
      var panel = element.closest('[data-panel]');
      if (panel && win.location.hash !== '#' + panel.getAttribute('data-panel')) {
        win.history.replaceState(null, '', '#' + panel.getAttribute('data-panel'));
        win.dispatchEvent(new Event('hashchange'));
      }
      choose(section, field, media, false);
      var target = field ? field.element : media && media.element || element;
      target.scrollIntoView({ behavior: 'smooth', block: field ? 'center' : 'start' });
      if (field) target.focus({ preventScroll: true });
    }
    function message(event) {
      if (event.origin !== win.location.origin || event.source !== win.parent) return;
      var data = event.data;
      if (!data || data.pageId !== page.id) return;
      if (data.type === 'fbt:page-focus') focusMessage(data);
      if (data.type === 'fbt:page-commit' &&
          (typeof data.requestId === 'string' && data.requestId.length <= 128 || typeof data.requestId === 'number' && Number.isFinite(data.requestId))) {
        finish(true);
        send('fbt:page-committed', { requestId: data.requestId });
      }
    }
    function decorate() {
      page.sections.forEach(function (definition) {
        var element = document.querySelector(definition.selector);
        if (!element) return;
        var section = { element: element, definition: definition };
        element.querySelectorAll('[data-cms-text],[data-cms-rich]').forEach(function (node) {
          var field = fieldFor(node, section);
          if (!field || node.hasAttribute('data-fbt-inline-field')) return;
          marked.push({ node: node, tabindex: remember(node, 'tabindex'), title: remember(node, 'title') });
          node.setAttribute('data-fbt-inline-field', field.key);
          node.setAttribute('tabindex', '0');
          node.setAttribute('title', 'Click or press Enter to edit this text');
        });
        element.querySelectorAll('[data-cms-img]').forEach(function (node) {
          var media = mediaFor(node, section, false);
          if (!media || node.hasAttribute('data-fbt-inline-media')) return;
          marked.push({ node: node, tabindex: remember(node, 'tabindex'), title: remember(node, 'title') });
          node.setAttribute('data-fbt-inline-media', media.key);
          node.setAttribute('tabindex', '0');
          node.setAttribute('title', 'Press Enter to choose a different image');
        });
      });
    }
    function imageClick() {
      if (!selected || !selected.media) return;
      finish(true);
      send('fbt:page-image', { sectionId: selected.section.definition.id, key: selected.media.key, mediaKey: selected.media.key });
    }
    decorate();
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('paste', paste, true);
    document.addEventListener('drop', drop, true);
    document.addEventListener('blur', blur, true);
    document.addEventListener('fbt:content', decorate);
    imageButton.addEventListener('click', imageClick);
    win.addEventListener('message', message);
    send('fbt:page-preview-ready', {});
    send('fbt:page-inline-ready', {});
    return {
      isEditing: function () { return !!active; },
      destroy: function () {
        if (destroyed) return; destroyed = true; finish(false);
        document.removeEventListener('pointerdown', pointer, true);
        document.removeEventListener('keydown', keydown, true);
        document.removeEventListener('paste', paste, true);
        document.removeEventListener('drop', drop, true);
        document.removeEventListener('blur', blur, true);
        document.removeEventListener('fbt:content', decorate);
        imageButton.removeEventListener('click', imageClick); win.removeEventListener('message', message);
        marked.forEach(function (item) { item.node.removeAttribute('data-fbt-inline-field'); item.node.removeAttribute('data-fbt-inline-media'); restore(item.node, 'tabindex', item.tabindex); restore(item.node, 'title', item.title); });
        document.querySelectorAll('.fbt-inline-selected,.fbt-inline-field-selected').forEach(function (node) { node.classList.remove('fbt-inline-selected', 'fbt-inline-field-selected'); });
        document.documentElement.classList.remove('fbt-inline-enabled'); ui.remove();
      }
    };
  }
  if (root && root.document && canStart(root)) {
    var start = function () { if (!controller) controller = mount(root); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
  return { canStart: canStart, fieldsFor: fieldsFor, serializeText: serializeText, serializeRich: serializeRich,
    mount: mount, isEditing: function () { return !!controller && controller.isEditing(); } };
});
