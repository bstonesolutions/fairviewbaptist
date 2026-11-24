// Each annual edition has its own site_content row. The first two editions
// predate year records, so their existing page edits supply the initial values.
(function (root) {
  'use strict';

  function key(year) {
    return /^\d{4}$/.test(String(year)) && Number(year) >= 1000 ? 'jubilee_year_' + year : '';
  }

  function blank(year) {
    return {
      year: Number(year), title: year + ' Appalachian Jubilee', announcement: '',
      startDate: '', endDate: '', preachers: [], photos: []
    };
  }

  function calendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    var date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
  }

  var dateFormat = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  var monthFormat = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
  function formatDates(startDate, endDate) {
    var start = calendarDate(startDate), end = calendarDate(endDate);
    if (!start) return '';
    if (!end || endDate <= startDate) return dateFormat.format(start);
    var month = monthFormat.format(start);
    var lastMonth = monthFormat.format(end);
    if (start.getUTCFullYear() !== end.getUTCFullYear()) return dateFormat.format(start) + ' – ' + dateFormat.format(end);
    return month + ' ' + start.getUTCDate() + '–' + (month === lastMonth ? '' : lastMonth + ' ') +
      end.getUTCDate() + ', ' + end.getUTCFullYear();
  }

  function photoURL(value) {
    if (typeof value !== 'string' || !value.trim() || /[\\\u0000-\u001f]/.test(value)) return false;
    if (value.charAt(0) === '/') return value.charAt(1) !== '/';
    try { return new URL(value).protocol === 'https:'; }
    catch (_) { return false; }
  }

  function validate(record) {
    if (!record || !Number.isInteger(record.year) || !key(record.year)) return 'Enter a four-digit Jubilee year.';
    if (typeof record.title !== 'string' || !record.title.trim()) return 'Enter a title for this Jubilee.';
    if (typeof record.announcement !== 'string') return 'Enter the announcement as text.';
    var dates = [record.startDate, record.endDate];
    if (dates.some(function (date) { return date !== '' && (!calendarDate(date) || date.slice(0, 4) !== String(record.year)); })) {
      return 'Choose dates in ' + record.year + '.';
    }
    if (record.endDate && !record.startDate) return 'Choose a start date for this Jubilee.';
    if (record.endDate && record.endDate < record.startDate) return 'Choose an end date on or after the start date.';
    if (!Array.isArray(record.preachers) || record.preachers.some(function (name) { return typeof name !== 'string' || !name.trim(); })) {
      return 'Enter a name for each preacher.';
    }
    if (!Array.isArray(record.photos) || record.photos.some(function (photo) {
      return !photo || !photoURL(photo.url) || typeof photo.alt !== 'string';
    })) return 'Choose a valid photo or enter an HTTPS photo address.';
    return '';
  }

  function parseJSON(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function parseRecord(year, raw) {
    var record = parseJSON(raw);
    if (!record || record.year !== Number(year) || validate(record)) return null;
    return {
      year: record.year, title: record.title, announcement: record.announcement,
      startDate: record.startDate, endDate: record.endDate, preachers: record.preachers.slice(),
      photos: record.photos.map(function (photo) { return { url: photo.url, alt: photo.alt }; })
    };
  }

  // These are the original photo captions in the 2026 static archive.
  var archiveCaptions = [
    "The Jubilee congregation with hands raised during singing",
    "A preacher speaking to the congregation from the aisle",
    "A guest preacher at Fairview’s pulpit during the Jubilee",
    "A guest preacher with an open Bible at the Jubilee",
    "A guest preacher holding a microphone beside the pulpit",
    "Fairview’s choir singing during the Appalachian Jubilee",
    "Church members visiting together after a Jubilee service",
    "A smiling preacher stands behind the white church pulpit.",
    "A speaker in a navy pullover gestures at a wooden lectern.",
    "Adults and a child gather and smile inside the church.",
    "Pancakes, strawberry topping, and blueberries are arranged on the serving counter.",
    "A glass bowl of biscuits sits on the breakfast table.",
    "Platters of pastries and small cakes fill a serving table.",
    "Three people pose together in the fellowship hall.",
    "Adults and children gather around a table in the fellowship hall.",
    "A group sits around a long table during fellowship.",
    "Three people smile from their seats at a table with Bibles and drink cups.",
    "A preacher in a tan suit gestures while speaking at the white church pulpit.",
    "A preacher in a light-colored suit speaks from the pulpit.",
    "Musicians sing and play guitar and bass at the front of the church.",
    "A musician sings into a microphone while playing a bass guitar.",
    "A young singer stands at a microphone behind the pulpit.",
    "A preacher gestures with both hands above the pulpit.",
    "A preacher stands at the pulpit beneath an autumn wreath.",
    "Two men greet one another at the front of the church.",
    "People smile and talk together among the church pews.",
    "A group chats together beside the church pews.",
    "Members of the congregation stand together beside their pews.",
    "A wide view from the rear shows the congregation seated throughout the sanctuary.",
    "The choir fills the platform at the front of the church.",
    "People gather around a long table for a meal in the fellowship hall.",
    "People share food and conversation around a long table.",
    "A group visits together in a row of chairs along the fellowship hall wall.",
    "A wide view shows the congregation standing in the sanctuary."
  ];
  var program = {
    sat: 'Brandon Stone',
    sun: 'Travis Groves and Jason Holley',
    mon: 'Brandon Stone and Scott Matthews',
    tue: 'Jason Holley and David King',
    wed: 'Scott Matthews and Preston Milan'
  };

  function saved(map, name, fallback) {
    return Object.prototype.hasOwnProperty.call(map, name) ? String(map[name] == null ? '' : map[name]).trim() : fallback;
  }

  function archivePhotos(map) {
    var layout = parseJSON(map.page_layout_jubilee);
    var collection = layout && layout.collections && layout.collections['jubilee-recap-photo-items'];
    var order = collection && Array.isArray(collection.order) ? collection.order : [];
    var hidden = new Set(collection && Array.isArray(collection.hidden) ? collection.hidden : []);
    var photos = [];
    var ids = archiveCaptions.map(function (_, i) { return 'jubilee-photo-' + (i + 1); });
    new Set(order.concat(ids)).forEach(function (id) {
      var i = ids.indexOf(id);
      if (i === -1 || hidden.has(id)) return;
      var photoKey = 'photo_jubilee_recap_' + (i + 1);
      var url = saved(map, photoKey, '/assets/photos/jubilee-2026/photo-' + (i + 1) + '.webp');
      if (photoURL(url)) photos.push({ url: url, alt: saved(map, photoKey + '_alt', archiveCaptions[i]) });
    });
    return photos;
  }

  function fromContent(map) {
    map = map || {};
    var archive = blank(2026);
    archive.title = saved(map, 'jubilee_2026_heading', '2026 highlights');
    archive.announcement = saved(map, 'jubilee_intro_copy', 'Thank you to everyone who joined us in Clay for five days of preaching, singing, and fellowship.');
    archive.startDate = saved(map, 'jubilee_start_date', '2026-11-14');
    archive.endDate = saved(map, 'jubilee_end_date', '2026-11-18');
    var speakers = new Set();
    Object.keys(program).forEach(function (day) {
      saved(map, 'jubilee_' + day + '_speakers', program[day]).split(/\s+and\s+|\s*&\s*|[,;\n]/i).forEach(function (name) {
        if (name.trim()) speakers.add(name.trim());
      });
    });
    archive.preachers = Array.from(speakers);
    archive.photos = archivePhotos(map);
    var next = blank(2027);
    next.title = saved(map, 'jubilee_2027_heading', next.title);
    next.announcement = saved(map, 'jubilee_2027_announcement', 'Dates and guest preachers will be announced here.');
    var records = new Map([[2026, archive], [2027, next]]);
    Object.keys(map).forEach(function (name) {
      var result = /^jubilee_year_([1-9]\d{3})$/.exec(name);
      if (!result) return;
      var year = Number(result[1]);
      var record = parseRecord(year, map[name]);
      if (record) records.set(year, record);
    });
    return new Map(Array.from(records).sort(function (a, b) { return b[0] - a[0]; }));
  }

  var api = { key: key, blank: blank, fromContent: fromContent, parseRecord: parseRecord, validate: validate, formatDates: formatDates };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FBTJubileeYears = api;
})(typeof window === 'undefined' ? null : window);
