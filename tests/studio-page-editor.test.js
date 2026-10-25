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

const visualPage = {
  id: 'visit', sections: [{ id: 'hero', fields: [
    { key: 'hero_bg_visit', type: 'image', def: '/assets/visit.jpg' },
    { key: 'photo_visit', type: 'image', def: '/assets/family.jpg' },
    { key: 'visit_hero_heading', type: 'rich', def: 'Welcome *home*' },
    { key: 'visit_hero_sub', type: 'text', def: 'Come worship with us.' },
    { key: 'visit_cta', type: 'url', def: '/visit' }
  ] }]
};

test('visual auxiliary keys follow the existing media conventions and stay scoped to the page', () => {
  const keys = editor.auxiliaryKeys(visualPage);
  assert.deepEqual([...keys].sort(), [
    'media_style_hero_bg_visit', 'hero_vid_visit', 'hero_bg_visit_shadow',
    'media_style_photo_visit', 'photo_visit_shadow',
    'visit_hero_heading_color', 'visit_hero_accent_color', 'visit_hero_sub_color', 'visit_cta_color'
  ].sort());
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.includes('visit_hero_heading_accent_color'), false);
  assert.equal(keys.includes('hero_vid_photo_visit'), false);
  assert.equal(keys.includes('media_style_hero_bg_other'), false);
  assert.equal(keys.includes('welcome_photo_layout'), false);
  const welcomePage = { id: 'index', sections: [{ id: 'welcome', fields: [{ key: 'hero_bg_welcome_home', type: 'image' }] }] };
  assert.equal(editor.auxiliaryKeys(welcomePage).includes('welcome_photo_layout'), true);
});

test('auxiliary stored blanks override defaults and preview values are detached from the session', () => {
  const session = editor.createSession(visualPage, [
    { key: 'visit_hero_heading_color', value: '' },
    { key: 'hero_vid_visit', value: 'https://example.test/welcome.mp4' },
    { key: 'media_style_hero_bg_other', value: 'Unrelated stored row' }
  ], {
    visit_hero_heading_color: '#FFFFFF', visit_hero_accent_color: '#AABBCC',
    media_style_hero_bg_visit: '{"source":"auto","overlay":"left"}'
  });
  assert.equal(session.auxValues.visit_hero_heading_color, '');
  assert.equal(session.auxValues.visit_hero_accent_color, '#AABBCC');
  assert.equal(session.auxValues.hero_vid_visit, 'https://example.test/welcome.mp4');
  assert.equal(session.baseAuxValues.hero_vid_visit, session.auxValues.hero_vid_visit);
  assert.equal(Object.hasOwn(session.auxValues, 'media_style_hero_bg_other'), false);
  const preview = editor.contentForPreview(session);
  assert.equal(preview.visit_hero_accent_color, '#AABBCC');
  assert.equal(preview.media_style_hero_bg_visit, '{"source":"auto","overlay":"left"}');
  preview.visit_hero_accent_color = '#000000';
  assert.equal(session.auxValues.visit_hero_accent_color, '#AABBCC');
  assert.equal(editor.dirtyRows(session).length, 0);
});

test('staging a visual design accepts page content and media settings while filtering unrelated keys', () => {
  const session = editor.createSession(visualPage, []);
  const map = Object.create({ visit_hero_sub: 'Inherited content must not apply' });
  Object.assign(map, {
    visit_hero_heading: 'Come *visit*',
    photo_visit: '/assets/new-family.webp',
    media_style_photo_visit: '{"source":"image","fit":"contain"}',
    hero_vid_visit: 'https://example.test/welcome.mp4',
    hero_bg_visit_shadow: 'none',
    visit_hero_accent_color: '#7FD1CB',
    other_page_heading: 'Do not apply',
    page_layout_other: 'Do not apply',
    constructor: 'Do not apply'
  });
  Object.defineProperty(map, '__proto__', { value: { polluted: true }, enumerable: true });
  const before = JSON.stringify(map);
  assert.equal(editor.stageDesign(session, map), 6);
  assert.equal(session.values.visit_hero_heading, 'Come *visit*');
  assert.equal(session.values.visit_hero_sub, 'Come worship with us.');
  assert.equal(session.values.photo_visit, '/assets/new-family.webp');
  assert.equal(session.auxValues.visit_hero_accent_color, '#7FD1CB');
  assert.equal(session.auxValues.hero_bg_visit_shadow, 'none');
  assert.equal(Object.hasOwn(session.values, 'other_page_heading'), false);
  assert.equal(Object.hasOwn(session.auxValues, '__proto__'), false);
  assert.equal({}.polluted, undefined);
  assert.equal(JSON.stringify(map), before);
  assert.equal(editor.stageDesign(session, { unknown: 'Only an unknown key' }), 0);
});

test('an invalid recognized design entry rejects the entire batch without changing the draft', () => {
  const invalidEntries = [
    ['visit_cta', 'javascript:alert(1)'], ['photo_visit', 'data:image/svg+xml,<svg/>'],
    ['photo_visit', 'http://example.test/photo.jpg'], ['hero_vid_visit', 'javascript:alert(1)'],
    ['visit_hero_sub', { text: 'Not a string' }], ['visit_hero_accent_color', ['#FFFFFF']],
    ['media_style_photo_visit', 'x'.repeat(50001)]
  ];
  for (const [key, value] of invalidEntries) {
    const session = editor.createSession(visualPage, []);
    const before = JSON.stringify(session);
    assert.throws(() => editor.stageDesign(session, { visit_hero_heading: 'Should roll back', [key]: value }));
    assert.equal(JSON.stringify(session), before, key);
    assert.equal(editor.dirtyRows(session).length, 0);
  }
});

test('inline editing allows text, rich text and valid links but cannot modify media or auxiliary settings', () => {
  const session = editor.createSession(visualPage, []);
  assert.equal(editor.applyInlineEdit(session, 'visit_hero_heading', 'A new *heading*'), true);
  assert.equal(editor.applyInlineEdit(session, 'visit_hero_sub', ''), true);
  assert.equal(editor.applyInlineEdit(session, 'visit_cta', 'http://example.test/visit'), true);
  assert.equal(editor.applyInlineEdit(session, 'visit_cta', '#service-times'), true);
  const before = JSON.stringify(session);
  for (const [key, value] of [
    ['photo_visit', '/assets/new.webp'], ['visit_hero_heading_color', '#FFFFFF'],
    ['unknown', 'New'], ['constructor', 'New'], ['__proto__', 'New'],
    ['visit_cta', 'javascript:alert(1)'], ['visit_hero_heading', { text: 'New' }],
    ['visit_hero_sub', 'x'.repeat(50001)]
  ]) {
    assert.equal(editor.applyInlineEdit(session, key, value), false, key);
    assert.equal(JSON.stringify(session), before, key);
  }
  assert.equal(editor.applyInlineEdit(session, 'visit_hero_sub', 'x'.repeat(50000)), true);
  assert.equal(session.values.visit_hero_sub.length, 50000);
  const untyped = editor.createSession(page, []);
  assert.equal(editor.applyInlineEdit(untyped, 'body', 'Untyped content is plain text'), true);
  const restricted = editor.createSession({ id: 'settings', sections: [{ id: 'settings-fields', fields: [
    { key: 'visible', type: 'select', def: 'show' }, { key: 'start_date', type: 'date', def: '2026-11-14' }
  ] }] }, []);
  assert.equal(editor.applyInlineEdit(restricted, 'visible', 'hide'), false);
  assert.equal(editor.applyInlineEdit(restricted, 'start_date', '2027-01-01'), false);
});

test('an explicitly staged media source wins over the automatic source reset for a changed image', async () => {
  for (const source of ['video', 'background']) {
    const session = editor.createSession(visualPage, []);
    const style = JSON.stringify({ source, overlay: 'left', overlayOpacity: 40 });
    editor.stageDesign(session, {
      hero_bg_visit: '/assets/new-visit.jpg',
      hero_vid_visit: 'https://example.test/welcome.mp4',
      media_style_hero_bg_visit: style
    });
    assert.equal(JSON.parse(editor.contentForPreview(session).media_style_hero_bg_visit).source, source);
    const client = fakeClient();
    await editor.saveSession(session, client);
    assert.equal(JSON.parse(client.database.get('media_style_hero_bg_visit')).source, source);
    assert.equal(editor.dirtyRows(session).length, 0);
  }
});

test('saving a visual design writes only changed auxiliary rows and verifies their baselines', async () => {
  const session = editor.createSession(visualPage, [{ key: 'visit_hero_heading_color', value: '#112233' }]);
  const client = fakeClient({ initial: {
    visit_hero_heading: 'Updated elsewhere', visit_hero_heading_color: '#112233',
    media_style_hero_bg_other: '{"source":"background"}'
  } });
  assert.equal(editor.stageDesign(session, { visit_hero_heading_color: '#445566', hero_bg_visit_shadow: 'none' }), 2);
  const result = await editor.saveSession(session, client);
  assert.deepEqual(result.rows.map(row => row.key).sort(), ['hero_bg_visit_shadow', 'visit_hero_heading_color']);
  assert.equal(client.database.get('visit_hero_heading'), 'Updated elsewhere');
  assert.equal(client.database.get('media_style_hero_bg_other'), '{"source":"background"}');
  assert.equal(client.database.get('untouched'), 'Keep me');
  assert.equal(session.baseAuxValues.visit_hero_heading_color, '#445566');
  assert.equal(session.baseAuxValues.hero_bg_visit_shadow, 'none');
  assert.equal(editor.dirtyRows(session).length, 0);
  assert.deepEqual(client.calls[1].keys.sort(), ['hero_bg_visit_shadow', 'visit_hero_heading_color']);
});

test('failed visual-design saves preserve auxiliary drafts and verified baselines', async () => {
  for (const failure of [{ failWrite: true }, { failRead: true }, { mismatch: true }]) {
    const session = editor.createSession(visualPage, [{ key: 'visit_hero_heading_color', value: '#112233' }]);
    editor.stageDesign(session, { visit_hero_heading_color: '#445566' });
    await assert.rejects(editor.saveSession(session, fakeClient(failure)));
    assert.equal(session.auxValues.visit_hero_heading_color, '#445566');
    assert.equal(session.baseAuxValues.visit_hero_heading_color, '#112233');
    assert.deepEqual(editor.dirtyRows(session), [{ key: 'visit_hero_heading_color', value: '#445566' }]);
  }
});

test('auxiliary edits made during save remain dirty against the verified outgoing snapshot', async () => {
  const session = editor.createSession(visualPage, []);
  const firstStyle = '{"source":"image","fit":"contain"}';
  const nextStyle = '{"source":"image","fit":"cover"}';
  editor.stageDesign(session, { visit_hero_heading_color: '#112233', media_style_photo_visit: firstStyle });
  const client = fakeClient({ afterWrite() {
    editor.stageDesign(session, { visit_hero_heading_color: '#445566', media_style_photo_visit: nextStyle });
  } });
  await editor.saveSession(session, client);
  assert.equal(client.database.get('visit_hero_heading_color'), '#112233');
  assert.equal(client.database.get('media_style_photo_visit'), firstStyle);
  assert.equal(session.baseAuxValues.visit_hero_heading_color, '#112233');
  assert.equal(session.baseAuxValues.media_style_photo_visit, firstStyle);
  assert.equal(session.auxValues.visit_hero_heading_color, '#445566');
  assert.equal(session.auxValues.media_style_photo_visit, nextStyle);
  assert.deepEqual(new Map(editor.dirtyRows(session).map(row => [row.key, row.value])), new Map([
    ['visit_hero_heading_color', '#445566'], ['media_style_photo_visit', nextStyle]
  ]));
});

test('reverting staged auxiliary values is a no-op and manually injected unrelated settings are never saved', async () => {
  const session = editor.createSession(visualPage, [{ key: 'visit_hero_heading_color', value: '#112233' }]);
  editor.stageDesign(session, { visit_hero_heading_color: '#445566' });
  editor.stageDesign(session, { visit_hero_heading_color: '#112233' });
  session.auxValues.other_page_color = '#FFFFFF';
  session.auxValues.page_layout_other = '{}';
  const client = fakeClient();
  assert.equal(editor.dirtyRows(session).length, 0);
  assert.deepEqual(await editor.saveSession(session, client), { changed: false, rows: [] });
  assert.equal(client.calls.length, 0);
});
