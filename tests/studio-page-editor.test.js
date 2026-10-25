const test = require('node:test');
const assert = require('node:assert/strict');
const editor = require('../assets/studio-page-editor.js');
const layout = require('../assets/page-editor.js');

const page = {
  id: 'visit', label: 'Plan a Visit', path: '/visit', sections: [
    { id: 'intro', fields: [
      { key: 'heading', label: 'Heading', type: 'rich', def: 'Welcome' },
      { key: 'photo', label: 'Photo', type: 'image', def: '/assets/welcome.jpg' },
      { key: 'link', label: 'Link', type: 'url', def: '/visit' }
    ] },
    { id: 'details', fields: [{ key: 'heading', type: 'rich', def: 'Different duplicate default' }, { key: 'body', def: 'Church family' }] }
  ]
};
function fakeClient(options = {}) {
  const database = new Map(Object.entries({ untouched: 'Keep me', ...(options.initial || {}) }));
  const calls = [];
  return {
    database, calls,
    from(table) {
      assert.equal(table, 'site_content');
      return {
        async upsert(rows, config) {
          calls.push({ type: 'upsert', rows, config });
          if (options.failWrite) return { error: { message: 'Permission denied' } };
          for (const row of rows) database.set(row.key, row.value);
          if (options.afterWrite) options.afterWrite(rows);
          return { error: null };
        },
        select(columns) {
          assert.equal(columns, 'key,value');
          return { async in(column, keys) {
            assert.equal(column, 'key'); calls.push({ type: 'readback', keys });
            if (options.failRead) return { error: { message: 'Network unavailable' } };
            return { data: keys.filter(key => database.has(key)).map(key => ({ key, value: options.mismatch ? 'Different value' : database.get(key) })), error: null };
          } };
        }
      };
    }
  };
}

test('loaded blanks remain blank, shared keys dedupe, and opening a page writes nothing', async () => {
  const session = editor.createSession(page, [{ key: 'heading', value: '' }], { body: 'Default from schema' });
  assert.equal(session.values.heading, '');
  assert.equal(session.values.body, 'Default from schema');
  assert.equal(session.values.photo, '/assets/welcome.jpg');
  assert.equal(editor.fieldsFor(page).length, 4);
  const client = fakeClient();
  assert.deepEqual(await editor.saveSession(session, client), { changed: false, rows: [] });
  assert.equal(client.calls.length, 0);
});

test('saving a changed field only touches that key and confirms the stored value', async () => {
  const session = editor.createSession(page, []);
  const client = fakeClient({ initial: { body: 'Another editor updated this', heading: 'Welcome' } });
  session.values.heading = 'A new *welcome*';
  const result = await editor.saveSession(session, client);
  assert.deepEqual(result.rows, [{ key: 'heading', value: 'A new *welcome*' }]);
  assert.equal(client.database.get('body'), 'Another editor updated this');
  assert.equal(client.database.get('untouched'), 'Keep me');
  assert.deepEqual(client.calls[1].keys, ['heading']);
  assert.equal(editor.dirtyRows(session).length, 0);
  assert.equal(client.calls[0].config.onConflict, 'key');
  assert.match(client.calls[0].rows[0].updated_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('clear values and layout changes persist in one batch with only catalog-approved settings', async () => {
  const session = editor.createSession(page, []);
  const client = fakeClient();
  session.values.photo = '';
  session.layout.order = ['details', 'intro', 'unknown'];
  session.layout.sections.intro.visible = false;
  session.layout.sections.intro.layout = 'position:fixed';
  const result = await editor.saveSession(session, client);
  assert.deepEqual(result.rows.map(row => row.key), ['photo', 'page_layout_visit']);
  assert.equal(client.database.get('photo'), '');
  const saved = JSON.parse(client.database.get('page_layout_visit'));
  assert.deepEqual(saved.order, ['details', 'intro']);
  assert.equal(saved.sections.intro.visible, false);
  assert.equal(saved.sections.intro.layout, 'original');
  assert.equal(editor.dirtyRows(session).length, 0);
});

test('reverting a change is a no-op, including an equivalent layout', () => {
  const session = editor.createSession(page, [{ key: 'page_layout_visit', value: JSON.stringify({ v: 1, order: ['details', 'intro'] }) }]);
  session.values.heading = 'Other'; session.values.heading = 'Welcome';
  session.layout = layout.normalize({ v: 1, order: ['details', 'intro'] }, page);
  assert.equal(editor.dirtyRows(session).length, 0);
});

test('unsafe image and link addresses fail before any write', async () => {
  for (const [key, value] of [['photo', 'data:image/svg+xml,<svg onload="alert(1)">'], ['link', 'javascript:alert(1)'], ['link', '//untrusted.test']]) {
    const session = editor.createSession(page, []), client = fakeClient();
    session.values[key] = value;
    await assert.rejects(editor.saveSession(session, client), /enter a valid website address/);
    assert.equal(client.calls.length, 0);
    assert.equal(editor.dirtyRows(session).length, 1);
  }
});

test('failed write or verification preserves the draft and never claims a clean state', async () => {
  for (const failure of [{ failWrite: true }, { failRead: true }, { mismatch: true }]) {
    const session = editor.createSession(page, []), client = fakeClient(failure);
    session.values.body = 'Please keep this draft';
    await assert.rejects(editor.saveSession(session, client));
    assert.equal(session.values.body, 'Please keep this draft');
    assert.equal(session.baseValues.body, 'Church family');
    assert.deepEqual(editor.dirtyRows(session), [{ key: 'body', value: 'Please keep this draft' }]);
  }
});

test('changes made during a save remain dirty against the verified snapshot', async () => {
  const session = editor.createSession(page, []);
  session.values.heading = 'First draft';
  const client = fakeClient({ afterWrite() { session.values.heading = 'Second draft'; } });
  await editor.saveSession(session, client);
  assert.equal(client.database.get('heading'), 'First draft');
  assert.equal(session.baseValues.heading, 'First draft');
  assert.deepEqual(editor.dirtyRows(session), [{ key: 'heading', value: 'Second draft' }]);
});

test('replacing a hidden photo restores its image source while preserving crop and overlay', async () => {
  const Media = require('../assets/media-styles.js');
  const style = Media.serialize({ source: 'background', fit: 'contain', overlay: 'bottom', overlayOpacity: 20, desktop: { x: 34, y: 72, zoom: 120 } }, 'photo');
  const session = editor.createSession(page, [{ key: 'media_style_photo', value: style }]);
  session.values.photo = '/assets/new.jpg';
  const preview = JSON.parse(editor.contentForPreview(session).media_style_photo);
  assert.equal(preview.source, 'image');
  assert.equal(preview.fit, 'contain');
  assert.deepEqual(preview.desktop, { x: 34, y: 72, zoom: 120 });
  assert.equal(preview.overlayOpacity, 20);
  const client = fakeClient();
  const result = await editor.saveSession(session, client);
  assert.deepEqual(result.rows.map(row => row.key), ['photo', 'media_style_photo']);
  assert.equal(editor.dirtyRows(session).length, 0);
  assert.equal(JSON.parse(editor.contentForPreview(session).media_style_photo).source, 'image');
});

test('reverting a replacement keeps the existing hidden-photo appearance unchanged', () => {
  const session = editor.createSession(page, [{ key: 'media_style_photo', value: '{"source":"background"}' }]);
  session.values.photo = '/assets/new.jpg';
  assert.equal(editor.dirtyRows(session).length, 2);
  session.values.photo = session.baseValues.photo;
  assert.equal(editor.dirtyRows(session).length, 0);
});

test('a changed background photo overrides a legacy or automatic video source and remains consistent after save', async () => {
  const backgroundPage = { id: 'watch', sections: [{ id: 'live', fields: [{ key: 'hero_bg_live', type: 'image', def: '' }] }] };
  for (const savedStyle of [undefined, '{"source":"auto","overlay":"left","overlayOpacity":40}']) {
    const rows = [{ key: 'hero_vid_live', value: 'https://example.test/legacy.mp4' }];
    if (savedStyle) rows.push({ key: 'media_style_hero_bg_live', value: savedStyle });
    const session = editor.createSession(backgroundPage, rows), client = fakeClient();
    session.values.hero_bg_live = '/assets/new.jpg';
    const previewStyle = JSON.parse(editor.contentForPreview(session).media_style_hero_bg_live);
    assert.equal(previewStyle.source, 'image');
    if (savedStyle) { assert.equal(previewStyle.overlay, 'left'); assert.equal(previewStyle.overlayOpacity, 40); }
    const result = await editor.saveSession(session, client);
    assert.deepEqual(result.rows.map(row => row.key), ['hero_bg_live', 'media_style_hero_bg_live']);
    assert.equal(editor.dirtyRows(session).length, 0);
    assert.equal(JSON.parse(editor.contentForPreview(session).media_style_hero_bg_live).source, 'image');
    session.values.hero_bg_live = '/assets/second.jpg';
    assert.deepEqual(editor.dirtyRows(session).map(row => row.key), ['hero_bg_live']);
  }
});

test('section controls reject crossing panel boundaries but move within the same panel', () => {
  const panelPage = { id: 'watch', sections: [
    { id: 'live-intro', parentGroup: 'live' }, { id: 'live-video', parentGroup: 'live' },
    { id: 'messages-intro', parentGroup: 'messages' }, { id: 'messages-grid', parentGroup: 'messages' }
  ] };
  const session = editor.createSession(panelPage, []);
  assert.equal(editor.moveSection(session, 'messages-intro', -1), false);
  assert.equal(editor.moveSection(session, 'live-video', 1), false);
  assert.equal(editor.dirtyRows(session).length, 0);
  assert.equal(editor.moveSection(session, 'messages-grid', -1), true);
  assert.deepEqual(session.layout.order, ['live-intro', 'live-video', 'messages-grid', 'messages-intro']);
  assert.equal(editor.moveSection(session, 'live-intro', 1), true);
  assert.deepEqual(session.layout.order, ['live-video', 'live-intro', 'messages-grid', 'messages-intro']);
});

test('unowned fields and prototype-like keys cannot be submitted', async () => {
  const specialPage = { ...page, sections: page.sections.concat([{ id: 'bad', fields: [{ key: '__proto__' }, { key: 'constructor' }, { key: 'page_layout_other' }] }]) };
  const session = editor.createSession(specialPage, []), client = fakeClient();
  session.values.unowned = 'Do not send';
  session.values.constructor = 'Do not send';
  session.values.page_layout_other = 'Do not send';
  assert.equal(editor.fieldsFor(specialPage).length, 4);
  await editor.saveSession(session, client);
  assert.equal(client.calls.length, 0);
});
