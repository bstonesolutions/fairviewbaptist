/* The original program and service players stay together in the 2026 archive. */
(function () {
  'use strict';
  var ORIGIN = 'https://www.fairviewbaptisttemple.com';
  var years = window.FBTJubileeYears;
  var dynamicSections = new Map();
  var renderedDetails = new WeakMap();
  var currentHash = location.hash.slice(1);
  var previewMode = new URLSearchParams(location.search).get('studio_preview') === '1';
  if (previewMode) {
    var program = document.querySelector('.jubilee-program');
    if (program) program.open = true;
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function writeText(node, text) {
    if (!node) return;
    node.setAttribute('data-jubilee-year-managed', '');
    if (!node.hasAttribute('data-fbt-inline-editing') && node.textContent !== text) node.textContent = text;
  }
  function gallery(photos, archive) {
    var grid = element('div', archive ? 'jubilee-memories' : 'jubilee-year-photos');
    photos.forEach(function (photo) {
      var figure = element('figure', archive ? 'jubilee-memory' : '');
      var frame = archive ? figure.appendChild(element('div', 'jubilee-memory-image')) : figure;
      var img = element('img');
      img.alt = photo.alt;
      img.loading = 'lazy';
      img.decoding = 'async';
      if (archive) img.onload = function () {
        figure.classList.toggle('jubilee-memory-portrait', img.naturalHeight > img.naturalWidth);
      };
      img.src = photo.url;
      frame.appendChild(img);
      grid.appendChild(figure);
    });
    return grid;
  }

  function lineup(names) {
    var p = element('p', 'jubilee-year-lineup');
    p.appendChild(element('strong', '', names.length === 1 ? 'Guest preacher: ' : 'Guest preachers: '));
    p.appendChild(document.createTextNode(names.join(', ')));
    return p;
  }

  function renderArchive(year) {
    var intro = document.getElementById('2026');
    writeText(document.getElementById('jubilee-2026-title'), year.title);
    var dates = intro.querySelector('[data-cms-text="jubilee_dates"]');
    writeText(dates, years.formatDates(year.startDate, year.endDate));
    dates.hidden = !dates.textContent;
    writeText(intro.querySelector('[data-cms-text="jubilee_intro_copy"]'), year.announcement);
    var priorLineup = intro.querySelector('.jubilee-year-lineup');
    if (priorLineup) priorLineup.remove();
    if (year.preachers.length) {
      intro.querySelector('.jubilee-host').before(lineup(year.preachers));
    }
    var photoSection = document.getElementById('jubilee-photos');
    var original = photoSection.querySelector('[data-page-collection]');
    original.setAttribute('data-jubilee-year-managed', '');
    var custom = photoSection.querySelector('[data-year-gallery]');
    var imgs = Array.from(original.querySelectorAll('img'));
    var same = imgs.length === year.photos.length && year.photos.every(function (photo, i) {
      return imgs[i].getAttribute('src') === photo.url && imgs[i].alt === photo.alt;
    });
    original.hidden = !same;
    if (custom && (same || renderedDetails.get(custom) !== JSON.stringify(year.photos))) {
      custom.remove();
      custom = null;
    }
    if (!same && !custom && year.photos.length) {
      var replacement = gallery(year.photos, true);
      replacement.setAttribute('data-year-gallery', '');
      renderedDetails.set(replacement, JSON.stringify(year.photos));
      original.after(replacement);
    }
    photoSection.hidden = !year.photos.length;
    intro.querySelector('a[href="#jubilee-photos"]').hidden = !year.photos.length;
  }

  function renderSection(year, section) {
    var wrap = section.querySelector('.wrap');
    if (!wrap) {
      wrap = section.appendChild(element('div', 'wrap'));
      wrap.appendChild(element('h2'));
      wrap.appendChild(element('p'));
    }
    writeText(wrap.querySelector('h2'), year.title);
    writeText(wrap.querySelector('p'), year.announcement);
    var signature = JSON.stringify([year.startDate, year.endDate, year.preachers, year.photos]);
    if (renderedDetails.get(section) === signature) return;
    renderedDetails.set(section, signature);
    var current = wrap.querySelector('.jubilee-year-details');
    if (current) current.remove();
    var details = element('div', 'jubilee-year-details');
    var dates = years.formatDates(year.startDate, year.endDate);
    if (dates) details.appendChild(element('p', 'jubilee-year-dates', dates));
    if (year.preachers.length) details.appendChild(lineup(year.preachers));
    if (year.photos.length) details.appendChild(gallery(year.photos, false));
    if (details.childNodes.length) wrap.appendChild(details);
  }

  // Keep the full list in the masthead as the archive grows. The sticky
  // navigation can point to that list without wrapping onto the Give/menu row.
  function renderNavigation(numbers) {
    var nav = document.getElementById('jubilee-years');
    if (nav.dataset.years === numbers.join(',')) return;
    nav.dataset.years = numbers.join(',');
    nav.replaceChildren();
    numbers.forEach(function (n, i) {
      var link = element('a', 'btn ' + (i === 0 ? 'btn-b' : 'btn-o'), n + (n === 2026 ? ' highlights' : ' Jubilee'));
      link.href = '#' + n;
      nav.appendChild(link);
    });
    ['#hd', '#msh'].forEach(function (selector) {
      var slots = document.querySelectorAll(selector + ' [data-jubilee-nav-year]');
      var link = slots[0].matches('a') ? slots[0] : slots[0].querySelector('a');
      var compact = numbers.length > 2;
      link.href = compact ? '#jubilee-years' : '#2027';
      link.textContent = compact ? 'Jubilee years' : '2027 Jubilee';
      slots[1].hidden = compact;
    });
  }

  function renderYears(records, map) {
    var numbers = Array.from(records.keys()).sort(function (a, b) { return b - a; });
    dynamicSections.forEach(function (section, n) {
      if (!records.has(n)) { section.remove(); dynamicSections.delete(n); }
    });
    numbers.forEach(function (n, i) {
      if (!Object.prototype.hasOwnProperty.call(map, years.key(n))) return;
      var year = years.parseRecord(n, map[years.key(n)]);
      if (!year) return;
      if (n === 2026) { renderArchive(year); return; }
      var section = document.getElementById(String(n));
      if (!section) {
        section = element('section', 'jubilee-section jubilee-next-year');
        section.id = String(n);
        var nextNumber = numbers.slice(i + 1).find(function (candidate) { return document.getElementById(String(candidate)); });
        var anchor = nextNumber === 2026 ? document.getElementById('2026').parentNode : document.getElementById(String(nextNumber));
        document.getElementById('main').insertBefore(section, anchor);
        dynamicSections.set(n, section);
      }
      renderSection(year, section);
    });
    renderNavigation(numbers);
    // Native hash scrolling happens before asynchronously published years exist.
    if (/^[1-9]\d{3}$/.test(currentHash) && location.hash === '#' + currentHash && dynamicSections.has(Number(currentHash))) {
      var target = document.getElementById(currentHash);
      currentHash = '';
      requestAnimationFrame(function () {
        if (location.hash === '#' + target.id) target.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
    }
  }

  function updateMetadata(records, map) {
    var title = document.querySelector('[data-cms-rich="jubilee_hero_heading"]');
    var schema = {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      '@id': ORIGIN + '/jubilee#page', name: title.textContent.trim() || 'The Appalachian Jubilee',
      url: ORIGIN + '/jubilee',
      hasPart: Array.from(records.values(), function (year) {
        var dates = years.formatDates(year.startDate, year.endDate);
        var part = { '@type': 'WebPageElement', '@id': ORIGIN + '/jubilee#' + year.year,
          name: year.title, description: [dates, year.announcement].filter(Boolean).join(' ') };
        if (year.startDate && !years.validate(Object.assign(years.blank(year.year), { startDate: year.startDate, endDate: year.endDate }))) part.temporalCoverage = year.endDate ? year.startDate + '/' + year.endDate : year.startDate;
        return part;
      }),
      isPartOf: { '@id': ORIGIN + '/#website' }, about: { '@id': ORIGIN + '/#church' },
      relatedLink: ORIGIN + '/watch'
    };
    var img = document.querySelector('[data-cms-bg="hero_bg_jubilee"] img');
    var src = Object.prototype.hasOwnProperty.call(map, 'hero_bg_jubilee') ? map.hero_bg_jubilee : img && img.getAttribute('src');
    if (src) try {
      var url = new URL(src, ORIGIN);
      if (/^https?:$/.test(url.protocol)) schema.primaryImageOfPage = { '@type': 'ImageObject', url: url.href };
    } catch (error) { /* An invalid image is optional. */ }
    var legacy = document.getElementById('jubilee-event-schema');
    if (legacy) legacy.remove();
    var node = document.getElementById('jubilee-recap-schema');
    if (!node) {
      node = element('script'); node.id = 'jubilee-recap-schema'; node.type = 'application/ld+json';
      document.head.appendChild(node);
    }
    node.textContent = JSON.stringify(schema);
  }
  document.addEventListener('fbt:content', function (event) {
    var map = event.detail;
    if (!map || !years) return;
    var records = years.fromContent(map);
    if (Object.keys(map).some(function (key) { return /^jubilee_year_\d{4}$/.test(key); }) || dynamicSections.size) {
      renderYears(records, map);
    }
    updateMetadata(records, map);
  });
})();
