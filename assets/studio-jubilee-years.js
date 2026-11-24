// Each year's form reads and writes its own site_content row.
(function (root) {
  'use strict';

  function create(options) {
    var host = options.host;
    var yearsApi = root.FBTJubileeYears;
    var table = function () { return options.sb.from('site_content'); };
    var years = new Map(), records = new Map();
    var current = null, original = '', isNew = false, busy = false, session = 0;
    var selectedYear = null;

    host.innerHTML = '<div class="studio-head"><h1>Appalachian Jubilee</h1>' +
      '<button class="btn btn-o" type="button" data-year-design>Edit page design</button></div>' +
      '<p class="studio-msg" data-year-status role="status" aria-live="polite"></p>' +
      '<button type="button" class="btn btn-o" data-year-reload hidden>Reload saved years</button>' +
      '<div data-year-controls hidden>' +
      '<div class="jubilee-year-toolbar"><label>Jubilee year<select data-year-picker></select></label>' +
      '<button type="button" class="btn btn-o" data-year-add>Add a year</button>' +
      '<a class="btn btn-o" target="_blank" rel="noopener" data-year-view>View year</a></div>' +
      '<form class="form jubilee-year-new" data-year-new hidden><label>New Jubilee year<input type="number" min="1000" max="9999" step="1" required data-year-number></label>' +
      '<button class="btn btn-b" type="submit">Start editing</button><button class="btn btn-o" type="button" data-year-cancel>Cancel</button>' +
      '<span class="studio-msg err" data-year-add-error role="status"></span></form>' +
      '<form class="form studio-form" data-year-form novalidate>' +
      '<fieldset class="studio-fieldset"><legend data-year-legend></legend>' +
      '<label class="frow">Title<input data-year-field="title" type="text"></label>' +
      '<label class="frow">Announcement<textarea data-year-field="announcement" rows="2"></textarea></label>' +
      '<div class="jubilee-year-dates"><label>Start date<input type="date" data-year-field="startDate"></label>' +
      '<label>End date<input type="date" data-year-field="endDate"></label></div>' +
      '<label class="frow">Preachers <span class="field-help">One name per line</span><textarea rows="4" data-year-field="preachers"></textarea></label></fieldset>' +
      '<fieldset class="studio-fieldset"><legend>Photos</legend><label class="frow">Upload photos' +
      '<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif" data-year-upload></label>' +
      '<details data-year-gallery><summary data-year-photo-count></summary><div class="jubilee-year-photos" data-year-photos></div></details></fieldset>' +
      '<div class="people-save-foot"><p class="studio-msg" data-year-save-status role="status" aria-live="polite"></p>' +
      '<button type="submit" class="btn btn-b" data-year-save>Save year</button></div></form></div>';

    function find(attr) { return host.querySelector('[data-year-' + attr + ']'); }
    function status(message, error) {
      var node = find('status');
      node.textContent = message;
      node.className = 'studio-msg' + (error ? ' err' : '');
    }
    function dirty() { return !!current && (isNew || JSON.stringify(current) !== original); }
    function sync() {
      var changed = dirty();
      find('save').disabled = busy || !changed;
      host.querySelectorAll('fieldset, [data-year-picker], [data-year-add], [data-year-design]').forEach(function (el) { el.disabled = busy; });
      find('save-status').textContent = busy ? '' : changed ? 'Unsaved changes to ' + current.year : '';
    }
    function drawPhotos() {
      var list = find('photos');
      list.replaceChildren();
      find('gallery').hidden = current.photos.length === 0;
      find('photo-count').textContent = current.photos.length + (current.photos.length === 1 ? ' photo' : ' photos');
      current.photos.forEach(function (photo, i) {
        var item = document.createElement('div');
        item.className = 'jubilee-year-photo';
        var image = document.createElement('img');
        image.src = photo.url;
        image.alt = photo.alt || '';
        image.loading = 'lazy';
        var label = document.createElement('label');
        label.textContent = 'Photo ' + (i + 1) + ' description';
        var input = document.createElement('input');
        input.value = photo.alt;
        input.dataset.yearCaption = i;
        label.appendChild(input);
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-o';
        button.textContent = 'Remove';
        button.setAttribute('aria-label', 'Remove photo ' + (i + 1));
        button.dataset.yearRemove = i;
        item.append(image, label, button);
        list.appendChild(item);
      });
    }
    function choose(model, newYear) {
      current = JSON.parse(JSON.stringify(model));
      selectedYear = model.year;
      isNew = !!newYear;
      original = JSON.stringify(current);
      var available = Array.from(years.keys());
      if (isNew) available.push(model.year);
      var picker = find('picker');
      picker.replaceChildren();
      available.sort(function (a,b) { return b-a; }).forEach(function (year) {
        picker.add(new Option(String(year), String(year)));
      });
      picker.value = String(model.year);
      find('legend').textContent = model.year + ' Appalachian Jubilee';
      find('save').textContent = 'Save ' + model.year;
      find('view').href = '/jubilee#' + model.year;
      find('view').hidden = isNew;
      find('new').hidden = true;
      find('reload').hidden = true;
      host.querySelectorAll('[data-year-field]').forEach(function (el) {
        var field = el.dataset.yearField;
        el.value = field === 'preachers' ? model.preachers.join('\n') : model[field];
      });
      ['startDate','endDate'].forEach(function (field) {
        var el = host.querySelector('[data-year-field="' + field + '"]');
        el.min = model.year + '-01-01'; el.max = model.year + '-12-31';
      });
      find('gallery').open = false;
      drawPhotos();
      sync();
      status('');
    }
    function discardOK() {
      if (busy) { status('Wait for the upload or save to finish.'); return false; }
      return !dirty() || root.confirm('Discard your unsaved changes to the ' + current.year + ' Jubilee?');
    }
    async function load() {
      var token = ++session;
      current = null;
      find('controls').hidden = true;
      find('reload').hidden = true;
      status('Loading Jubilee years…');
      try {
        var response = await table().select('key,value,updated_at').or('key.like.jubilee*,key.like.photo_jubilee*,key.eq.page_layout_jubilee');
        if (token !== session) return;
        if (response.error) throw response.error;
        var map = Object.create(null);
        records = new Map();
        response.data.forEach(function (row) {
          map[row.key] = row.value;
          if (/^jubilee_year_\d{4}$/.test(row.key)) records.set(Number(row.key.slice(-4)), row);
        });
        years = yearsApi.fromContent(map);
        choose(years.get(selectedYear) || years.values().next().value);
        find('controls').hidden = false;
      } catch (error) {
        if (token !== session) return;
        status('Could not load the Jubilee years. ' + (error.message || 'Try again.'), true);
        find('reload').hidden = false;
      }
    }

    find('picker').addEventListener('change', function () {
      var next = years.get(Number(this.value));
      if (!next || !discardOK()) { this.value = String(current.year); return; }
      choose(next);
    });
    find('add').addEventListener('click', function () {
      find('new').hidden = false;
      find('number').value = Math.max.apply(null, Array.from(years.keys()).concat(current.year)) + 1;
      find('add-error').textContent = '';
      find('number').focus();
      find('number').select();
    });
    find('cancel').addEventListener('click', function () { find('new').hidden = true; find('add').focus(); });
    find('new').addEventListener('submit', function (event) {
      event.preventDefault();
      if (busy || !this.reportValidity()) return;
      var year = Number(find('number').value);
      if (current.year === year || years.has(year) || records.has(year)) { find('add-error').textContent = year + ' already exists.'; return; }
      if (!discardOK()) return;
      choose(yearsApi.blank(year), true);
      host.querySelector('[data-year-field="title"]').focus();
    });
    find('form').addEventListener('input', function (event) {
      if (!current) return;
      var field = event.target.dataset.yearField;
      if (field === 'preachers') {
        current.preachers = event.target.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      } else if (field) current[field] = event.target.value;
      else if (event.target.hasAttribute('data-year-caption')) {
        var index = Number(event.target.dataset.yearCaption);
        current.photos[index].alt = event.target.value;
        event.target.closest('.jubilee-year-photo').querySelector('img').alt = event.target.value;
      }
      sync();
    });
    find('photos').addEventListener('click', function (event) {
      var button = event.target.closest('[data-year-remove]');
      if (!button || busy) return;
      var index = Number(button.dataset.yearRemove);
      current.photos.splice(index, 1);
      drawPhotos(); sync();
      (find('photos').querySelectorAll('button')[Math.min(index, current.photos.length - 1)] || find('upload')).focus();
    });
    find('upload').addEventListener('change', async function () {
      var files = Array.from(this.files || []);
      this.value = '';
      if (!files.length || busy) return;
      var active = current, token = session, errors = [];
      find('new').hidden = true;
      busy = true; sync();
      for (var i = 0; i < files.length && token === session; i++) {
        var file = files[i];
        status('Uploading photo ' + (i + 1) + ' of ' + files.length + '…');
        try {
          if (!/^image\/(jpeg|png|gif|webp|avif)$/i.test(file.type)) throw new Error('Choose a JPG, PNG, WebP, GIF, or AVIF image.');
          var extension = file.type.slice(6).replace('jpeg','jpg');
          var path = 'jubilee/' + active.year + '/' + root.crypto.randomUUID() + '.' + extension;
          var result = await options.uploadImage(path, file, {upsert:false, contentType:file.type});
          if (token !== session) return;
          if (result.error || !result.publicUrl) throw result.error || new Error('No photo URL returned.');
          active.photos.push({url:result.publicUrl, alt:''});
        } catch (error) { errors.push(file.name + ': ' + (error.message || 'Upload failed.')); }
      }
      if (token !== session) return;
      busy = false; drawPhotos(); find('gallery').open = true; sync();
      status(errors.length ? errors.join(' ') : 'Photos uploaded. Save ' + current.year + ' to publish them.', !!errors.length);
    });
    find('form').addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy || !dirty()) return;
      var error = yearsApi.validate(current);
      if (error) { status(error, true); find('status').scrollIntoView({block:'center'}); return; }
      var year = current.year, row = records.get(year), token = session;
      if (row && !yearsApi.parseRecord(year, row.value)) {
        status('The saved data for ' + year + ' could not be read. It must be recovered before saving changes.',true); return;
      }
      busy = true; find('new').hidden = true; sync(); status('Saving ' + year + '…');
      var updated = new Date().toISOString();
      var entry = {key:yearsApi.key(year), value:JSON.stringify(current), updated_at:updated};
      try {
        var query = row
          ? table().update({value:entry.value, updated_at:updated}).eq('key',entry.key).eq('updated_at',row.updated_at)
          : table().insert(entry);
        var result = await query.select('key,updated_at');
        if (session !== token) return;
        if ((result.error && result.error.code === '23505') || (!result.error && !result.data.length)) {
          find('reload').hidden = false;
          throw new Error('Someone else saved this year. Reload saved years to see their changes.');
        }
        if (result.error) throw result.error;
        entry.updated_at = result.data[0].updated_at;
        records.set(year, entry);
        years.set(year, JSON.parse(entry.value));
        busy = false;
        choose(years.get(year));
        status(year + ' Jubilee saved.');
      } catch (reason) {
        if (session !== token) return;
        busy = false; sync();
        status('Could not save ' + year + '. ' + (reason.message || 'Try again.'),true);
        find('status').scrollIntoView({block:'center'});
      }
    });
    find('design').addEventListener('click', function () { options.openPageEditor(); });
    find('reload').addEventListener('click', function () { if (discardOK()) load(); });
    root.addEventListener('beforeunload', function (event) {
      if (busy || dirty()) { event.preventDefault(); event.returnValue = ''; }
    });
    return {
      open: function () { if (!dirty() && !busy) return load(); },
      canLeave: function () {
        if (!discardOK()) return false;
        current = null;
        session++;
        return true;
      },
      reset: function () {
        session++; busy = false; current = null; selectedYear = null;
        records.clear(); years.clear(); find('controls').hidden = true; status('');
      }
    };
  }
  root.FBTJubileeStudio = { create: create };
})(window);
