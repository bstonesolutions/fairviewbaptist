const test = require('node:test');
const assert = require('node:assert/strict');
const editor = require('../assets/inline-page-editor.js');
const text = value => ({ nodeType: 3, nodeValue: value });
const element = (tag, ...children) => ({ nodeType: 1, tagName: tag, childNodes: children });

test('visual editing requires both preview flags and an accessible same-origin parent', () => {
  const parent = { location: { origin: 'https://fairview.example' } };
  const win = { location: { origin: parent.location.origin, search: '?studio_preview=1&visual_edit=1' }, parent };
  assert.equal(editor.canStart(win), true);
  assert.equal(editor.canStart({ ...win, location: { ...win.location, search: '?studio_preview=1' } }), false);
  assert.equal(editor.canStart({ ...win, parent: { location: { origin: 'https://other.example' } } }), false);
  const standalone = { location: win.location }; standalone.parent = standalone;
  assert.equal(editor.canStart(standalone), false);
  const inaccessible = { get location() { throw new Error('cross-origin'); } };
  assert.equal(editor.canStart({ ...win, parent: inaccessible }), false);
});

test('rich edits preserve authored emphasis as CMS asterisks without saving HTML', () => {
  const heading = element('H2', text('Welcome '), element('EM', text('home')), text('.'));
  assert.equal(editor.serializeRich(heading), 'Welcome *home*.');
  assert.equal(editor.serializeText(heading), 'Welcome home.');
  assert.equal(editor.serializeRich(element('DIV', element('STRONG', text('Read this')), element('SCRIPT', text('alert(1)')))), 'Read this');
});

test('contenteditable line breaks and pasted text become plain content', () => {
  const paragraph = element('P', text('First'), element('BR'), text('second'), element('DIV', text('third')));
  assert.equal(editor.serializeText(paragraph), 'First\nsecond\nthird');
  assert.equal(editor.serializeText(element('P', text('<img src=x onerror=alert(1)>'))), '<img src=x onerror=alert(1)>');
});

test('field authorization excludes URL actions and invalid keys', () => {
  const fields = editor.fieldsFor({ fields: [
    { key: 'heading', type: 'rich' }, { key: 'photo', type: 'image' },
    { key: 'link', type: 'url' }, { key: '<script>', type: 'text' }
  ] });
  assert.deepEqual(Object.keys(fields), ['heading', 'photo']);
});
