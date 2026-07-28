/* Individual message page, hydrated from the same YouTube library as /watch. */
(function () {
  'use strict';

  var DOMAIN = 'https://fairviewbaptisttemple.com';
  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var loading = $('[data-message-loading]');
  var view = $('[data-message-view]');
  var error = $('[data-message-error]');
  var params = new URLSearchParams(window.location.search);
  var videoId = String(params.get('v') || params.get('id') || '').trim();
  var rows = [];
  var current = null;
  var canonicalUrl = '';

  var ICONS = {
    date: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    service: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M7 8h10"/></svg>',
    scripture: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22zM20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22z"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
    series: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>'
  };

  function nonEmpty(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
  }

  function visibleCopy(value) {
    return String(value == null ? '' : value).replace(/[—–]/g, ' - ');
  }

  function formatDate(value, weekday) {
    if (!value) return '';
    if (window.FBTVideos && window.FBTVideos.fmtDate) return window.FBTVideos.fmtDate(value, weekday);
    var date = new Date(value);
    if (isNaN(date)) return '';
    var options = { month: 'long', day: 'numeric', year: 'numeric' };
    if (weekday) options.weekday = 'long';
    return date.toLocaleDateString('en-US', options);
  }

  function displayService(row) {
    var service = String(row.service || '').trim();
    var raw = String(row.rawTitle || '');
    if (service === 'Worship' && /sunday/i.test(raw)) return 'Sunday Morning Worship';
    return service || 'Worship';
  }

  function setLoading(done) {
    if (loading) {
      loading.hidden = done;
      loading.setAttribute('aria-busy', done ? 'false' : 'true');
    }
  }

  function showError() {
    setLoading(true);
    if (view) view.hidden = true;
    if (error) error.hidden = false;
    document.title = 'Message not found | Fairview Baptist Temple';
  }

  function addMetaPill(root, icon, label) {
    if (!root || !nonEmpty(label)) return;
    var pill = document.createElement('span');
    pill.className = 'message-meta-pill';
    pill.innerHTML = ICONS[icon] || '';
    pill.appendChild(document.createTextNode(String(label)));
    root.appendChild(pill);
  }

  function addDetail(root, icon, label, value) {
    if (!root || !nonEmpty(value)) return;
    var row = document.createElement('div');
    row.className = 'message-detail-row';
    var iconEl = document.createElement('span');
    iconEl.className = 'message-detail-icon';
    iconEl.innerHTML = ICONS[icon] || '';
    var copy = document.createElement('div');
    var dt = document.createElement('dt');
    var dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    copy.appendChild(dt);
    copy.appendChild(dd);
    row.appendChild(iconEl);
    row.appendChild(copy);
    root.appendChild(row);
  }

  function cleanDescription(value, title) {
    if (!value) return '';
    var lines = String(value).replace(/\r/g, '').split('\n');
    var cleaned = [];
    lines.forEach(function (line) {
      var text = line.trim();
      if (!text) { if (cleaned.length && cleaned[cleaned.length - 1] !== '') cleaned.push(''); return; }
      if (/^https?:\/\//i.test(text) || /^(subscribe|follow us|facebook|instagram|tiktok|website)\b/i.test(text)) return;
      if (/^welcome to fairview/i.test(text)) return;
      if (/^(copyright|all rights reserved)/i.test(text)) return;
      if (/^(fairview baptist temple\s*\||🎙|📖\s*scripture|#[a-z])/i.test(text)) return;
      if (title && text.toLowerCase().indexOf(String(title).trim().toLowerCase()) === 0) return;
      text = text.replace(/https?:\/\/\S+/g, '').trim();
      text = text.replace(/[—–]/g, ' - ');
      if (text) cleaned.push(text);
    });
    while (cleaned.length && cleaned[cleaned.length - 1] === '') cleaned.pop();
    var result = cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (result.length > 2400) result = result.slice(0, 2397).replace(/\s+\S*$/, '') + '...';
    return result.length >= 35 ? result : '';
  }

  function renderParagraphs(root, text) {
    if (!root || !text) return;
    root.textContent = '';
    String(text).split(/\n\s*\n/).filter(Boolean).forEach(function (paragraph) {
      var lines = paragraph.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
      if (lines.length >= 3) {
        var listStart = 0;
        if (/:$/.test(lines[0])) {
          var intro = document.createElement('p');
          intro.className = 'message-prose-lead';
          intro.textContent = lines[0];
          root.appendChild(intro);
          listStart = 1;
        }
        var list = document.createElement('ul');
        for (var i = listStart; i < lines.length; i++) {
          var item = document.createElement('li');
          item.textContent = lines[i];
          list.appendChild(item);
        }
        root.appendChild(list);
        return;
      }
      var p = document.createElement('p');
      p.textContent = lines.join(' ');
      root.appendChild(p);
    });
  }

  function introFor(row, fullDate) {
    var pieces = [];
    if (row.speaker) pieces.push(row.speaker + ' shared this message');
    else pieces.push('Watch this message');
    if (row.reference) pieces.push('from ' + row.reference);
    pieces.push('at Fairview Baptist Temple');
    if (fullDate) pieces.push('on ' + fullDate);
    return pieces.join(' ') + '.';
  }

  function setupShare(row) {
    var share = $('[data-message-share]');
    var copy = $('[data-message-copy]');
    var status = $('[data-message-share-status]');
    var payload = {
      title: row.title + ' | Fairview Baptist Temple',
      text: 'Watch "' + row.title + '" from Fairview Baptist Temple.',
      url: canonicalUrl
    };

    function say(message) {
      if (!status) return;
      status.textContent = message;
      window.clearTimeout(say.timer);
      say.timer = window.setTimeout(function () { status.textContent = ''; }, 3500);
    }

    function copyLink() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(canonicalUrl).then(function () { say('Link copied.'); });
      }
      var field = document.createElement('textarea');
      field.value = canonicalUrl;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      try { document.execCommand('copy'); say('Link copied.'); }
      catch (e) { say('Copy the link from your address bar.'); }
      field.remove();
      return Promise.resolve();
    }

    if (share) share.addEventListener('click', function () {
      if (navigator.share) {
        navigator.share(payload).catch(function (e) {
          if (e && e.name !== 'AbortError') copyLink();
        });
      } else copyLink();
    });
    if (copy) copy.addEventListener('click', copyLink);
  }

  function relatedScore(item, row) {
    var score = 0;
    if (item.series && row.series && item.series === row.series) score += 7;
    if (item.book && row.book && item.book === row.book) score += 5;
    if (item.speaker && row.speaker && item.speaker === row.speaker) score += 3;
    if (displayService(item) === displayService(row)) score += 1;
    (item.topics || []).forEach(function (topic) {
      if ((row.topics || []).indexOf(topic) !== -1) score += 2;
    });
    return score;
  }

  function relatedCard(item) {
    var link = document.createElement('a');
    link.className = 'message-related-card';
    link.href = '/message?v=' + encodeURIComponent(item.id);
    link.setAttribute('aria-label', 'View message: ' + item.title);

    var image = document.createElement('div');
    image.className = 'message-related-image';
    var img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    img.src = 'https://i.ytimg.com/vi/' + item.id + '/maxresdefault.jpg';
    img.onerror = function () { this.onerror = null; this.src = 'https://i.ytimg.com/vi/' + item.id + '/hqdefault.jpg'; };
    var play = document.createElement('span');
    play.className = 'message-related-play';
    play.setAttribute('aria-hidden', 'true');
    play.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    image.appendChild(img);
    image.appendChild(play);

    var copy = document.createElement('div');
    copy.className = 'message-related-copy';
    var date = document.createElement('div');
    date.className = 'message-related-date';
    date.textContent = (item.dateKind === 'published' ? 'Published ' : '') + (formatDate(item.date, true) || displayService(item));
    var title = document.createElement('h3');
    title.textContent = item.title || 'Message from Fairview Baptist Temple';
    var meta = document.createElement('div');
    meta.className = 'message-related-meta';
    meta.textContent = [item.speaker, item.reference].filter(nonEmpty).join(' · ') || displayService(item);
    copy.appendChild(date);
    copy.appendChild(title);
    copy.appendChild(meta);
    link.appendChild(image);
    link.appendChild(copy);
    return link;
  }

  function renderRelated(row) {
    var section = $('[data-message-related-section]');
    var root = $('[data-message-related]');
    if (!section || !root) return;
    var candidates = rows.filter(function (item) {
      return item && item.id && item.id !== row.id && item.type === 'message';
    }).map(function (item) {
      return { item: item, score: relatedScore(item, row) };
    });
    candidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.item.date || '').localeCompare(String(a.item.date || ''));
    });
    var related = candidates.slice(0, 3).map(function (candidate) { return candidate.item; });
    if (!related.length) return;
    root.textContent = '';
    related.forEach(function (item) { root.appendChild(relatedCard(item)); });
    section.hidden = false;
  }

  function updateSeo(row, summary, image, fullDate) {
    canonicalUrl = DOMAIN + '/message?v=' + encodeURIComponent(row.id);
    var title = row.title + ' | Fairview Baptist Temple';
    var description = summary || introFor(row, fullDate);
    var seoDescription = description.length > 160
      ? description.slice(0, 157).replace(/\s+\S*$/, '') + '...'
      : description;
    var robots = $('meta[name="robots"]');
    if (robots) robots.setAttribute('content', 'index, follow, max-image-preview:large');
    if (!window.FBTSeo || !window.FBTSeo.setItem) return;
    var videoSchema = {
      '@type': 'VideoObject',
      '@id': canonicalUrl + '#video',
      name: row.title,
      description: seoDescription,
      thumbnailUrl: [image],
      uploadDate: row.published || row.date || undefined,
      contentUrl: row.url,
      embedUrl: 'https://www.youtube-nocookie.com/embed/' + row.id,
      publisher: { '@type': 'Organization', '@id': DOMAIN + '/#church', name: 'Fairview Baptist Temple' }
    };
    if (row.speaker) videoSchema.creator = { '@type': 'Person', name: row.speaker };
    window.FBTSeo.setItem({
      title: title,
      description: seoDescription,
      image: image,
      url: canonicalUrl,
      type: 'video.other',
      jsonld: {
        '@context': 'https://schema.org',
        '@graph': [
          videoSchema,
          { '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: DOMAIN + '/' },
            { '@type': 'ListItem', position: 2, name: 'Messages', item: DOMAIN + '/watch#messages' },
            { '@type': 'ListItem', position: 3, name: row.title, item: canonicalUrl }
          ] }
        ]
      }
    });
  }

  function render(row) {
    current = row;
    var fullDate = formatDate(row.date, true);
    var summary = visibleCopy(row.summary).trim() || cleanDescription(row.description, row.title);
    var image = row.thumb || ('https://i.ytimg.com/vi/' + row.id + '/hqdefault.jpg');
    updateSeo(row, summary, image, fullDate);

    var title = $('[data-message-title]');
    var intro = $('[data-message-intro]');
    var frame = $('[data-message-frame]');
    var youtube = $('[data-message-youtube]');
    if (title) title.textContent = row.title || 'Message from Fairview Baptist Temple';
    if (intro) intro.textContent = introFor(row, fullDate);
    if (frame) {
      frame.title = row.title || 'Message video';
      frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(row.id) + '?rel=0';
    }
    if (youtube) youtube.href = row.url || ('https://www.youtube.com/watch?v=' + encodeURIComponent(row.id));

    var meta = $('[data-message-meta]');
    if (meta) {
      meta.textContent = '';
      addMetaPill(meta, 'date', (row.dateKind === 'published' ? 'Published ' : '') + fullDate);
      addMetaPill(meta, 'service', displayService(row));
      addMetaPill(meta, 'scripture', row.reference);
    }

    var details = $('[data-message-details]');
    if (details) {
      details.textContent = '';
      addDetail(details, 'speaker', 'Speaker', row.speaker);
      addDetail(details, 'scripture', 'Scripture', row.reference);
      addDetail(details, 'date', row.dateKind === 'published' ? 'YouTube published' : 'Message date', fullDate);
      addDetail(details, 'service', 'Service', displayService(row));
      addDetail(details, 'series', 'Series', row.series);
      if (!details.children.length) addDetail(details, 'service', 'From', 'Fairview Baptist Temple');
    }

    var aboutSection = $('[data-message-about-section]');
    if (summary && aboutSection) {
      renderParagraphs($('[data-message-about]'), summary);
      aboutSection.hidden = false;
    }
    var notesSection = $('[data-message-notes-section]');
    if (nonEmpty(row.notes) && notesSection) {
      $('[data-message-notes]').textContent = visibleCopy(row.notes);
      notesSection.hidden = false;
    }
    var transcriptSection = $('[data-message-transcript-section]');
    if (nonEmpty(row.transcript) && transcriptSection) {
      $('[data-message-transcript]').textContent = visibleCopy(row.transcript);
      transcriptSection.hidden = false;
    }

    var topicSection = $('[data-message-topics-section]');
    var topicRoot = $('[data-message-topics]');
    if (topicSection && topicRoot && row.topics && row.topics.length) {
      topicRoot.textContent = '';
      row.topics.forEach(function (topic) {
        var chip = document.createElement('span');
        chip.className = 'message-topic';
        chip.textContent = topic;
        topicRoot.appendChild(chip);
      });
      topicSection.hidden = false;
    }

    setupShare(row);
    renderRelated(row);
    setLoading(true);
    if (error) error.hidden = true;
    if (view) view.hidden = false;
  }

  function start() {
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) { showError(); return; }
    if (!window.FBTVideos || !window.FBTVideos.load) { showError(); return; }
    window.FBTVideos.load().then(function (loaded) {
      rows = loaded || [];
      // Detail pages belong to the sermon library only. Full-service replays,
      // music, and clips keep their existing homes in the Stream.
      var found = rows.filter(function (row) { return row && row.id === videoId && row.type === 'message'; })[0];
      if (!found) { showError(); return; }
      render(found);
    }).catch(showError);
  }

  start();
})();
