const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function videoLibrary(items, options = {}) {
  const window = {
    FBT_FEEDS: { videosApi: '/api/videos', catalog: '/assets/catalog.json' },
    FBT_SERMON_TAGS: options.tags || {},
  };
  if (options.studioRows) {
    window.FBT = {
      SUPABASE_URL: 'https://example.test',
      getPublicClient: () => ({
        from(table) {
          assert.equal(table, 'sermon_tags');
          return { select: async () => ({ data: options.studioRows, error: null }) };
        },
      }),
    };
    window.supabase = {};
  }
  const context = vm.createContext({
    window,
    document: { querySelector: () => null, readyState: 'loading', addEventListener() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch: async (url) => ({ json: async () => ({ items: url === '/api/videos' ? items : [] }) }),
  });
  vm.runInContext(fs.readFileSync(require.resolve('../assets/videos.js'), 'utf8'), context);
  return window.FBTVideos;
}

// Source: Fairview's public /api/videos YouTube RSS metadata, checked 2026-10-25.
test('real sermon descriptions use their stated October dates instead of Bible verse ranges', async () => {
  const rows = await videoLibrary([
    {
      id: 'LNqaIgeXtpM',
      title: 'The Cost of Discipleship - Bible Preaching By Michael Spurlock at Fairview Baptist Temple Church',
      published: '2026-10-15T02:00:27+00:00',
      description: 'Luke 14:25-35\nLuke 15:1-13, 25-31\nThis sermon was preached by Pastor Spurlock. October 14, 2026.',
    },
    {
      id: 'NBGauuiezkU',
      title: 'Theology Of Failure - Bible Preaching By Michael Spurlock at Fairview Baptist Temple Church',
      published: '2026-10-05T01:00:08+00:00',
      description: 'Jonah 1:1-4\nThis sermon was preached by Pastor Spurlock. October 4, 2026.',
    },
  ]).load();
  assert.equal(rows[0].date.slice(0, 10), '2026-10-14');
  assert.equal(rows[1].date.slice(0, 10), '2026-10-04');
  rows.forEach((row) => assert.equal(row.dateKind, 'service'));
});

test('other real verse ranges cannot replace the explicitly stated service date', async () => {
  const fixtures = [
    ['AUvVwNJD5jA', 'Luke 16:1-13\nLuke 16:14-31', 'October 21, 2026', '2026-10-21', '2026-10-22'],
    ['XHe03NLQTNs', 'Philippians 3:7-14', 'October 4, 2026', '2026-10-04', '2026-10-05'],
    ['tovtoj1fmNU', 'Joshua 1:6-9', 'September 27, 2026', '2026-09-27', '2026-09-28'],
  ];
  const rows = await videoLibrary(fixtures.map(([id, scripture, date, , published]) => ({
    id, title: 'Bible Preaching By Michael Spurlock', published,
    description: scripture + '\nThis sermon was preached by Pastor Spurlock. ' + date + '.',
  }))).load();
  rows.forEach((row, index) => assert.equal(row.date.slice(0, 10), fixtures[index][3]));
});

test('scripture without a service date falls back to the real publication timestamp', async () => {
  const published = '2026-10-01T02:00:33+00:00';
  const library = videoLibrary([{
    id: '2vaMyvLF2fY', title: 'Jesus Heals a Crippled Woman - Bible Preaching By Michael Spurlock',
    published,
    description: 'Luke 13:10-21\nJohn 10:22-42\nThis sermon was preached by Pastor Spurlock. [Date]',
  }]);
  const [row] = await library.load();
  assert.equal(row.date, published);
  assert.equal(row.dateKind, 'published');
  assert.match(library.card(row, '', true), /Published /);
});

test('real full numeric, ISO, and written dates remain supported', async () => {
  const dates = ['10/14/2026', '10.14.26', '10-14-2026', '2026-10-14', 'October 14, 2026'];
  const rows = await videoLibrary(dates.map((date, index) => ({
    id: 'valid-date-' + index,
    title: 'Grace | ' + date + ' | Pastor Michael Spurlock',
    published: '2026-10-15T02:00:00Z',
  }))).load();
  rows.forEach((row) => {
    assert.equal(row.date.slice(0, 10), '2026-10-14');
    assert.equal(row.dateKind, 'service');
  });
});

test('chapter ranges, multiple verse ranges, URLs, and phone numbers do not become dates', async () => {
  const published = '2026-10-15T02:00:00Z';
  const descriptions = ['Jonah 1-4', 'John 3:1-4, 6-9; 7:1-5', 'Jhn 3:1-4', 'https://example.test/1-13 Call 304-587-4709'];
  const rows = await videoLibrary(descriptions.map((description, index) => ({
    id: 'not-a-date-' + index, title: 'Bible preaching', published, description,
  }))).load();
  rows.forEach((row) => {
    assert.equal(row.date, published);
    assert.equal(row.dateKind, 'published');
  });
});

test('Studio preached_on overrides both source metadata and the baseline override', async () => {
  const id = 'LNqaIgeXtpM';
  const [row] = await videoLibrary([{
    id, title: 'The Cost of Discipleship | October 14, 2026 | Pastor Michael Spurlock',
    published: '2026-10-15T02:00:27Z',
  }], {
    tags: { [id]: { date: '2026-09-29' } },
    studioRows: [{ video_id: id, preached_on: '2026-09-30' }],
  }).load();
  assert.equal(row.date.slice(0, 10), '2026-09-30');
  assert.equal(row.dateKind, 'service');
});

test('a yearless date cannot infer a service after the video was published', async () => {
  const rows = await videoLibrary([
    { id: 'yearless-jan', title: 'Grace | January 13 | Pastor Michael Spurlock', published: '2026-10-15T02:00:00Z' },
    { id: 'yearless-dec', title: 'Grace | December 31 | Pastor Michael Spurlock', published: '2026-01-02T02:00:00Z' },
  ]).load();
  rows.forEach((row) => assert.ok(row.date.slice(0, 10) <= row.published.slice(0, 10), row.date));
  assert.equal(rows[1].date.slice(0, 10), '2025-12-31');
});

test('a date-only service value renders the same calendar day in New York', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    assert.equal(videoLibrary([]).fmtDate('2026-10-14'), 'October 14, 2026');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
