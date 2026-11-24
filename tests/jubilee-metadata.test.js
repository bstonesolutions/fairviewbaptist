const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ORIGIN = 'https://www.fairviewbaptisttemple.com';
const source = fs.readFileSync(require.resolve('../assets/jubilee.js'), 'utf8');

function browser() {
  const nodes = [];
  const copy = {
    jubilee_hero_heading: 'The Appalachian Jubilee',
    jubilee_dates: 'November 14–18, 2026',
    jubilee_hero_sub: 'Preaching, singing, and moments from the week.',
    jubilee_intro_copy: 'Thank you for being part of the Jubilee.'
  };
  let listener;
  function script(id) {
    const node = { id, textContent: '', remove() { nodes.splice(nodes.indexOf(node), 1); } };
    nodes.push(node);
    return node;
  }
  script('jubilee-event-schema');
  const document = {
    getElementById(id) { return nodes.find(node => node.id === id); },
    querySelector(selector) {
      if (selector === '[data-cms-bg="hero_bg_jubilee"] img') return { getAttribute() { return '/assets/photos/wv-appalachian-mountains.jpg'; } };
      const key = selector.match(/data-cms-text="([^"]+)"/)[1];
      return Object.hasOwn(copy, key) ? { textContent: copy[key] } : null;
    },
    createElement() { return { textContent: '' }; },
    head: { appendChild(node) { nodes.push(node); } },
    addEventListener(name, handler) { assert.equal(name, 'fbt:content'); listener = handler; }
  };
  vm.runInNewContext(source, { document, URL });
  return {
    copy, nodes,
    update(map) { listener({ detail: map }); },
    schema() { return JSON.parse(document.getElementById('jubilee-recap-schema').textContent); }
  };
}

test('Jubilee hydration replaces legacy event metadata with a recap collection', () => {
  const page = browser();
  page.update({});
  const schema = page.schema();
  assert.equal(schema['@type'], 'CollectionPage');
  assert.equal(schema['@id'], ORIGIN + '/jubilee#page');
  assert.equal(schema.temporalCoverage, undefined);
  assert.equal(schema.hasPart[0]['@id'], ORIGIN + '/jubilee#2027');
  assert.equal(schema.hasPart[1]['@id'], ORIGIN + '/jubilee#2026');
  assert.equal(schema.hasPart[1].temporalCoverage, '2026-11-14/2026-11-18');
  assert.equal(schema.primaryImageOfPage.url, ORIGIN + '/assets/photos/wv-appalachian-mountains.jpg');
  assert.equal(schema.relatedLink, ORIGIN + '/watch');
  assert.equal(page.nodes.some(node => node.id === 'jubilee-event-schema'), false);
  for (const property of ['eventStatus', 'startDate', 'endDate', 'eventAttendanceMode']) assert.equal(Object.hasOwn(schema, property), false);
});

test('Studio changes replace the same schema with hydrated title, dates, copy, and hero', () => {
  const page = browser();
  page.update({});
  page.copy.jubilee_hero_heading = 'Jubilee memories';
  page.copy.jubilee_2027_announcement = 'The 2027 program is available.';
  page.copy.jubilee_dates = 'November 15–18, 2026';
  page.copy.jubilee_intro_copy = 'A new introduction from Studio.';
  page.update({ jubilee_start_date: '2026-11-15', jubilee_end_date: '2026-11-18', hero_bg_jubilee: 'https://images.example.org/jubilee.jpg' });
  const schema = page.schema();
  assert.equal(schema.name, 'Jubilee memories');
  assert.equal(schema.hasPart[1].temporalCoverage, '2026-11-15/2026-11-18');
  assert.match(schema.hasPart[0].description, /2027 program/);
  assert.match(schema.hasPart[1].description, /November 15–18, 2026/);
  assert.match(schema.hasPart[1].description, /A new introduction from Studio\./);
  assert.equal(schema.primaryImageOfPage.url, 'https://images.example.org/jubilee.jpg');
  assert.equal(page.nodes.length, 1);
});

test('cleared or invalid dates and hero URLs remove optional metadata without removing the recap', () => {
  const page = browser();
  const cases = [
    { jubilee_start_date: '', hero_bg_jubilee: '' },
    { jubilee_start_date: '2026-02-30', hero_bg_jubilee: 'javascript:alert(1)' },
    { jubilee_start_date: '2026-11-19', jubilee_end_date: '2026-11-18', hero_bg_jubilee: 'data:image/png;base64,abc' }
  ];
  for (const map of cases) {
    page.update({});
    page.update(map);
    const schema = page.schema();
    assert.equal(schema['@type'], 'CollectionPage');
    assert.equal(Object.hasOwn(schema.hasPart[1], 'temporalCoverage'), false);
    assert.equal(Object.hasOwn(schema, 'primaryImageOfPage'), false);
    assert.equal(page.nodes.length, 1);
  }
});
