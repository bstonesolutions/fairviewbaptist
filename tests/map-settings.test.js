const test = require('node:test');
const assert = require('node:assert/strict');
const maps = require('../assets/map-settings');
test('empty configuration gives a usable address map and directions', () => {
  const result = maps.resolve({});
  assert.equal(new URL(result.embed).searchParams.get('q'), '2294 Main Street, Clay, WV 25043');
  assert.equal(new URL(result.embed).searchParams.get('output'), 'embed');
  assert.equal(new URL(result.directions).searchParams.get('destination'), result.address);
});
test('changing the church address updates both map and directions', () => {
  const result = maps.resolve({ contact_address: '10 Church Lane', contact_city: 'Clay, WV' });
  assert.equal(new URL(result.embed).searchParams.get('q'), '10 Church Lane, Clay, WV');
  assert.equal(new URL(result.directions).searchParams.get('destination'), '10 Church Lane, Clay, WV');
});
test('a saved Google embed and directions override the address defaults', () => {
  const embed = 'https://www.google.com/maps/embed?pb=test';
  const directions = 'https://maps.app.goo.gl/example';
  assert.equal(maps.resolve({ maps_embed_url: embed, maps_url: directions }).embed, embed);
  assert.equal(maps.resolve({ maps_url: directions }).directions, directions);
});
test('untrusted map origins and executable schemes cannot become embeds', () => {
  ['javascript:alert(1)', 'https://google.com.evil.test/maps/embed', 'http://www.google.com/maps/embed', 'https://www.google.com/search?q=test', 'https://example.com/'].forEach(url => {
    assert.equal(maps.embedURL(url), '');
  });
  assert.equal(maps.directionsURL('javascript:alert(1)'), '');
});
