/* Shared page layout rules. Content and authentication stay in their own modules. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FBTPageLayout = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  var own = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  var states = new WeakMap();
  var options = {
    layout: ['original', 'stacked', 'image-left', 'image-right'],
    align: ['original', 'left', 'center'],
    width: ['original', 'wide', 'narrow'],
    spacing: ['original', 'compact', 'roomy']
  };
  function validId(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value) &&
      ['__proto__', 'prototype', 'constructor'].indexOf(value.toLowerCase()) < 0;
  }
  function record(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function read(value) {
    if (typeof value === 'string') {
      if (value.length > 1000000) return {};
      try { value = JSON.parse(value); } catch (error) { return {}; }
    }
    if (!record(value) || (own(value, 'v') && value.v !== 1)) return {};
    return value;
  }
  function definitions(list) {
    var seen = Object.create(null);
    return (Array.isArray(list) ? list : []).filter(function (item) {
      if (!item || !validId(item.id) || seen[item.id]) return false;
      seen[item.id] = true;
      return true;
    });
  }
  function ordered(value, ids) {
    var found = Object.create(null), result = [];
    (Array.isArray(value) ? value : []).concat(ids).forEach(function (id) {
      if (!validId(id) || ids.indexOf(id) < 0 || found[id]) return;
      found[id] = true;
      result.push(id);
    });
    return result;
  }
  function sectionDefinitions(page) { return definitions(page && page.sections); }
  function sectionGroup(section) { return typeof section.parentGroup === 'string' && section.parentGroup ? section.parentGroup : 'page'; }
  function sectionOrder(value, page) {
    var sections = sectionDefinitions(page), groups = [];
    sections.forEach(function (section) {
      var key = sectionGroup(section);
      if (groups.indexOf(key) < 0) groups.push(key);
    });
    var ids = ordered(value, sections.map(function (section) { return section.id; }));
    return groups.reduce(function (result, group) {
      return result.concat(ids.filter(function (id) {
        return sections.some(function (section) { return section.id === id && sectionGroup(section) === group; });
      }));
    }, []);
  }
  function sectionPeers(value, page, id) {
    var sections = sectionDefinitions(page), section = sections.filter(function (item) { return item.id === id; })[0];
    if (!section) return [];
    return sectionOrder(value, page).filter(function (candidate) {
      return sections.some(function (item) { return item.id === candidate && sectionGroup(item) === sectionGroup(section); });
    });
  }
  function collectionDefinitions(page) {
    var collections = [];
    sectionDefinitions(page).forEach(function (section) {
      definitions(section.collections).forEach(function (collection) {
        if (!collections.some(function (item) { return item.id === collection.id; })) collections.push(collection);
      });
    });
    return collections;
  }
  function normalize(value, page) {
    var raw = read(value), sections = sectionDefinitions(page);
    var result = { v: 1, order: sectionOrder(raw.order, page), sections: {}, collections: {} };
    sections.forEach(function (section) {
      var saved = record(raw.sections) && own(raw.sections, section.id) && record(raw.sections[section.id]) ? raw.sections[section.id] : {};
      var setting = { visible: !(own(saved, 'visible') && saved.visible === false) };
      Object.keys(options).forEach(function (key) {
        setting[key] = own(saved, key) && options[key].indexOf(saved[key]) >= 0 ? saved[key] : 'original';
      });
      result.sections[section.id] = setting;
    });
    collectionDefinitions(page).forEach(function (collection) {
      var saved = record(raw.collections) && own(raw.collections, collection.id) && record(raw.collections[collection.id]) ? raw.collections[collection.id] : {};
      var ids = definitions(collection.items).map(function (item) { return item.id; });
      result.collections[collection.id] = {
        order: ordered(saved.order, ids),
        hidden: ordered(saved.hidden, ids).filter(function (id) { return Array.isArray(saved.hidden) && saved.hidden.indexOf(id) >= 0; })
      };
    });
    return result;
  }
  function serialize(value, page) { return JSON.stringify(normalize(value, page)); }
  function layoutKey(page) {
    var id = typeof page === 'string' ? page : page && page.id;
    return validId(id) ? 'page_layout_' + id : '';
  }
  function cleanPath(value) {
    var path = String(value || '/').trim();
    if (/^https?:\/\//i.test(path)) {
      try { path = new URL(path).pathname; } catch (error) { return ''; }
    }
    path = path.split(/[?#]/)[0];
    if (path.charAt(0) !== '/') path = '/' + path;
    path = path.replace(/\/+$/, '').replace(/\.html$/i, '');
    if (!path || path === '/index') return '/';
    return path;
  }
  function findPage(path, catalog) {
    catalog = catalog || (root && root.FBT_PAGE_CATALOG);
    var target = cleanPath(path);
    return definitions(catalog && catalog.pages).filter(function (page) { return typeof page.path === 'string' && cleanPath(page.path) === target; })[0] || null;
  }
  function fieldKeys(page) {
    var result = [];
    sectionDefinitions(page).forEach(function (section) {
      (Array.isArray(section.fields) ? section.fields : []).forEach(function (field) {
        if (field && validId(field.key) && result.indexOf(field.key) < 0) result.push(field.key);
      });
    });
    return result;
  }
  function validateUrl(value, type) {
    if (typeof value !== 'string') return false;
    var url = value.trim(), image = type === 'image' || type === 'bg';
    if (!url) return true;
    if (/[\s\u0000-\u001f\u007f]/.test(url) || /%0[ad]/i.test(url) || url.indexOf('\\') >= 0) return false;
    if (/^\/(?!\/)/.test(url)) return true;
    if (!image) {
      if (/^#[a-z0-9_-]+$/i.test(url)) return true;
      if (/^mailto:[^@:?]+@[^@:?]+(?:\?[^#]*)?$/i.test(url)) return true;
      if (/^tel:\+?[0-9().-]+$/i.test(url)) return true;
    }
    try {
      var protocol = new URL(url).protocol;
      return protocol === 'https:' || (!image && protocol === 'http:');
    } catch (error) { return false; }
  }
  function query(scope, selector) {
    if (!scope || typeof selector !== 'string') return null;
    try { return scope.matches && scope.matches(selector) ? scope : scope.querySelector(selector); } catch (error) { return null; }
  }
  function nodesFor(scope, list) {
    var seen = [];
    return definitions(list).map(function (item) { return { id: item.id, node: query(scope, item.selector) }; })
      .filter(function (item) {
        if (!item.node || !item.node.parentNode || seen.indexOf(item.node) >= 0) return false;
        seen.push(item.node);
        return true;
      });
  }
  function groupsFor(nodes) {
    var groups = [];
    nodes.forEach(function (item) {
      var parent = item.node.parentNode;
      var group = groups.filter(function (candidate) { return candidate.parent === parent; })[0];
      if (!group) { group = { parent: parent, items: [] }; groups.push(group); }
      group.items.push(item);
    });
    groups.forEach(function (group) {
      var siblings = Array.prototype.slice.call(group.parent.childNodes);
      group.items.sort(function (a, b) { return siblings.indexOf(a.node) - siblings.indexOf(b.node); });
    });
    return groups;
  }
  function reorder(nodes, order, baseline, document) {
    groupsFor(nodes).forEach(function (group) {
      var initial = baseline.get(group.parent);
      if (!initial) {
        initial = group.items.map(function (item) { return item.id; });
        baseline.set(group.parent, initial);
      }
      var ids = group.items.map(function (item) { return item.id; });
      var desiredIds = ordered(order || initial, ids);
      if (desiredIds.every(function (id, i) { return id === ids[i]; })) return;
      var desired = desiredIds.map(function (id) { return group.items.filter(function (item) { return item.id === id; })[0].node; });
      // Temporary markers keep text, navigation, and other unselected siblings in their original slots.
      var markers = group.items.map(function (item) {
        var marker = document.createComment('page-layout');
        group.parent.replaceChild(marker, item.node);
        return marker;
      });
      markers.forEach(function (marker, i) { group.parent.replaceChild(desired[i], marker); });
    });
  }
  function explicitOrder(raw, ids) {
    return Array.isArray(raw) && raw.some(function (id) { return ids.indexOf(id) >= 0; });
  }
  function apply(page, value, document) {
    var raw = read(value), layout = normalize(raw, page);
    document = document || (root && root.document);
    if (!page || !validId(page.id) || !document) return layout;
    var documents = states.get(document);
    if (!documents) { documents = Object.create(null); states.set(document, documents); }
    var state = documents[page.id];
    if (!state) { state = { sections: new Map(), collections: Object.create(null) }; documents[page.id] = state; }
    var sections = sectionDefinitions(page), sectionNodes = nodesFor(document, sections);
    reorder(sectionNodes, explicitOrder(raw.order, layout.order) ? layout.order : null, state.sections, document);
    sections.forEach(function (section) {
      var element = query(document, section.selector);
      if (!element) return;
      var setting = layout.sections[section.id];
      element.classList.toggle('fbt-section-hidden', !setting.visible);
      Object.keys(options).forEach(function (key) {
        if (setting[key] === 'original') element.removeAttribute('data-page-' + key);
        else element.setAttribute('data-page-' + key, setting[key]);
      });
      definitions(section.collections).forEach(function (collection) {
        var container = query(element, collection.selector), saved = layout.collections[collection.id];
        if (!container || !saved) return;
        var nodes = nodesFor(container, collection.items);
        var rawCollection = record(raw.collections) && own(raw.collections, collection.id) && record(raw.collections[collection.id]) ? raw.collections[collection.id] : {};
        if (!state.collections[collection.id]) state.collections[collection.id] = new Map();
        reorder(nodes, explicitOrder(rawCollection.order, saved.order) ? saved.order : null, state.collections[collection.id], document);
        nodes.forEach(function (item) { item.node.classList.toggle('fbt-item-hidden', saved.hidden.indexOf(item.id) >= 0); });
      });
    });
    return layout;
  }

  var api = { normalize: normalize, serialize: serialize, apply: apply, findPage: findPage, layoutKey: layoutKey, validateUrl: validateUrl, fieldKeys: fieldKeys, sectionOrder: sectionOrder, sectionPeers: sectionPeers };
  if (root && root.document) {
    var document = root.document;
    var currentPage = function () { return findPage(root.location.pathname); };
    var previewActive = false;
    var contentSeen = null;
    function ready() {
      var page = currentPage();
      if (!page) return;
      if (!previewActive) apply(page, contentSeen && contentSeen[layoutKey(page)], document);
      if (root.parent && root.parent !== root) root.parent.postMessage({ type: 'fbt:page-preview-ready', pageId: page.id }, root.location.origin);
    }
    document.addEventListener('fbt:content', function (event) {
      contentSeen = record(event.detail) ? event.detail : {};
      var page = currentPage();
      if (page && !previewActive) apply(page, contentSeen[layoutKey(page)], document);
    });
    root.addEventListener('message', function (event) {
      if (event.origin !== root.location.origin || event.source !== root.parent || root.parent === root) return;
      var message = event.data, page = currentPage();
      if (!record(message) || message.type !== 'fbt:page-preview' || !page || message.pageId !== page.id) return;
      previewActive = true;
      apply(page, message.layout, document);
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
  }
  return api;
});
