const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const years = require('../assets/jubilee-years');

test('the legacy edition imports the same 34 photos and program in Studio and on the public page', () => {
  const context = {window: {}};
  for (const file of ['assets/cms-schema.js', 'assets/page-catalog.js']) {
    vm.runInNewContext(fs.readFileSync(require.resolve('../' + file), 'utf8'), context);
  }
  // Match the public hydration layer, which blends saved rows with schema defaults.
  const defaults = {...context.window.FBT_PAGE_CATALOG.defaults};
  for (const group of context.window.FBT_SCHEMA.groups) {
    for (const field of group.fields) if (field.def != null) defaults[field.key] = field.def;
  }
  const archive = years.fromContent({}).get(2026);
  assert.deepEqual(years.fromContent(defaults).get(2026), archive);
  const catalogPage = context.window.FBT_PAGE_CATALOG.pages.find(page => page.id === 'jubilee');
  const fields = Object.fromEntries(catalogPage.sections.flatMap(section => section.fields.map(field => [field.key, field.def])));
  const originalPhotos = Array.from({length: 34}, (_, index) => {
    const name = 'photo_jubilee_recap_' + (index + 1);
    return {url: fields[name], alt: fields[name + '_alt']};
  });
  assert.deepEqual(archive.photos, originalPhotos);
  assert.deepEqual(archive.preachers, ['Brandon Stone', 'Travis Groves', 'Jason Holley', 'Scott Matthews', 'David King', 'Preston Milan']);
});

test('an existing archive honors saved dates, preacher names, photo replacements, removals and order', () => {
  const archive = years.fromContent({
    jubilee_start_date: '2026-11-13',
    jubilee_sat_speakers: 'Visiting Preacher',
    photo_jubilee_recap_1: '',
    photo_jubilee_recap_2: 'https://example.org/updated.jpg',
    photo_jubilee_recap_2_alt: 'The choir at Fairview',
    page_layout_jubilee: JSON.stringify({collections: {
      'jubilee-recap-photo-items': {order: ['jubilee-photo-4','jubilee-photo-2'], hidden: ['jubilee-photo-3']}
    }})
  }).get(2026);
  assert.equal(archive.startDate, '2026-11-13');
  assert.deepEqual(archive.preachers.slice(0, 3), ['Visiting Preacher', 'Travis Groves', 'Jason Holley']);
  assert.equal(archive.photos.length, 32);
  assert.equal(archive.photos[0].url, '/assets/photos/jubilee-2026/photo-4.webp');
  assert.deepEqual(archive.photos[1], {url:'https://example.org/updated.jpg', alt:'The choir at Fairview'});
});

test('a year record only overrides its matching year and is detached from other reads', () => {
  const sample = years.blank(2028);
  sample.preachers.push('Guest');
  sample.photos.push({url:'/image.jpg', alt:'A guest at the pulpit'});
  const saved = {jubilee_year_2028: JSON.stringify(sample), jubilee_2027_announcement: 'November dates coming soon.'};
  const result = years.fromContent(saved);
  assert.deepEqual([...result.keys()], [2028, 2027, 2026]);
  assert.deepEqual(result.get(2026), years.fromContent({}).get(2026));
  assert.equal(result.get(2027).announcement, saved.jubilee_2027_announcement);
  result.get(2028).photos[0].alt = 'Edited';
  assert.equal(years.fromContent(saved).get(2028).photos[0].alt, sample.photos[0].alt);
  assert.equal(years.parseRecord(2027, saved.jubilee_year_2028), null);
  assert.equal(years.fromContent({jubilee_year_2026:'{bad', jubilee_year_2025:saved.jubilee_year_2028}).size, 2);
});

test('year and date validation protect dated editions without requiring dates before they are known', () => {
  const record = years.blank(2028);
  assert.equal(years.key(1980), 'jubilee_year_1980');
  assert.equal(years.key('2028extra'), '');
  assert.equal(years.validate(record), '');
  for (const invalid of [
    {startDate:'2027-11-10'}, {startDate:'2028-02-30'}, {endDate:'2028-10-03'},
    {startDate:'2028-10-02', endDate:'2028-10-01'},
    {photos:[{url:'javascript:alert(1)',alt:''}]}, {photos:[{url:'//other.site/a',alt:''}]}
  ]) assert.notEqual(years.validate({...record, ...invalid}), '');
  assert.equal(years.validate({...record,startDate:'2028-02-29'}), '');
  assert.equal(years.formatDates('2026-11-14','2026-11-18'), 'November 14–18, 2026');
  assert.equal(years.formatDates('2028-03-01',''), 'March 1, 2028');
  assert.equal(years.formatDates('',''), '');
});
