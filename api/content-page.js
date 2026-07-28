/* Server-rendered shell for Studio-managed blog posts and events.
   The browser still hydrates from Supabase, but crawlers and link-preview bots
   receive the correct item metadata and visible content in the first response. */
const fs = require('fs');
const path = require('path');

const DOMAIN = 'https://fairviewbaptisttemple.com';
// Set during CMS-SETUP: the Fairview Baptist Temple Supabase project URL and
// anon key (see CMS-SETUP.md). Until then this page serves its template shell.
const SUPABASE_URL = 'https://qlbylvhmkbopszmzmipm.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsYnlsdmhta2JvcHN6bXptaXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyODE1MDYsImV4cCI6MjEwMDg1NzUwNn0.muLRBIvNtki4lYOBIf6S80R2rYdBPoQvDzvzmEIn2A4';

function one(v) { return Array.isArray(v) ? v[0] : v; }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function cleanText(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function description(primary, fallback) {
  const text = cleanText(primary) || fallback;
  return text.length > 160 ? text.slice(0, 157).replace(/\s+\S*$/, '') + '...' : text;
}
function absoluteUrl(value, fallback) {
  const v = String(value || '').trim();
  if (!v) return fallback;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^\/\//.test(v)) return 'https:' + v;
  return DOMAIN + '/' + v.replace(/^\//, '');
}
function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
function readProjectFile(file) {
  const roots = [process.cwd(), path.join(__dirname, '..')];
  for (const root of roots) {
    try { return fs.readFileSync(path.join(root, file), 'utf8'); } catch (e) { /* try next root */ }
  }
  throw new Error('Missing page template: ' + file);
}
function fragment(kind, slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) return '';
  try { return readProjectFile((kind === 'post' ? 'posts/' : 'events/') + slug + '.html'); }
  catch (e) { return ''; }
}
function replaceMeta(html, selector, value) {
  const attr = selector[0], key = selector.slice(1);
  const re = new RegExp('<meta\\s+' + (attr === 'p' ? 'property' : 'name') + '="' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s+content="[^"]*"\\s*\/?>', 'i');
  const tag = '<meta ' + (attr === 'p' ? 'property' : 'name') + '="' + key + '" content="' + esc(value) + '">';
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', tag + '\n</head>');
}
function applyHead(html, item) {
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + esc(item.title) + '</title>');
  // A Studio cover can have any dimensions, so do not advertise the default
  // social image's 1200x630 dimensions for item-specific artwork.
  html = html.replace(/<meta\s+property="og:image:(?:width|height)"[^>]*>\s*/gi, '');
  html = replaceMeta(html, 'ndescription', item.description);
  html = replaceMeta(html, 'pog:type', item.ogType);
  html = replaceMeta(html, 'pog:title', item.title);
  html = replaceMeta(html, 'pog:description', item.description);
  html = replaceMeta(html, 'pog:image', item.image);
  html = replaceMeta(html, 'pog:image:alt', item.imageAlt);
  html = replaceMeta(html, 'ntwitter:title', item.title);
  html = replaceMeta(html, 'ntwitter:description', item.description);
  html = replaceMeta(html, 'ntwitter:image', item.image);
  html = replaceMeta(html, 'ntwitter:image:alt', item.imageAlt);
  html = html.replace('</head>', '<link rel="canonical" href="' + esc(item.url) + '">\n' +
    '<meta property="og:url" content="' + esc(item.url) + '">\n' +
    '<script type="application/ld+json" data-server-item="1">' + safeJson(item.schema) + '</script>\n</head>');
  return html;
}
function fmtDate(value) {
  if (!value) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T12:00:00Z' : value);
  return isNaN(d) ? '' : new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York'
  }).format(d);
}
function fmtEventDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  const hasTime = /T\d{2}:\d{2}/.test(String(value));
  const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' };
  if (hasTime) { options.hour = 'numeric'; options.minute = '2-digit'; }
  return new Intl.DateTimeFormat('en-US', options).format(d);
}
function churchAddress(value, locationName) {
  if (!value) {
    if (!locationName || /(?:Fairview|church)/i.test(locationName)) {
      return { '@type': 'PostalAddress', streetAddress: '2294 Main Street', addressLocality: 'Clay', addressRegion: 'WV', postalCode: '25043', addressCountry: 'US' };
    }
    return undefined;
  }
  const match = String(value).match(/^\s*(.+?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i);
  if (match) {
    return { '@type': 'PostalAddress', streetAddress: match[1], addressLocality: match[2], addressRegion: match[3].toUpperCase(), postalCode: match[4], addressCountry: 'US' };
  }
  return { '@type': 'PostalAddress', streetAddress: String(value), addressCountry: 'US' };
}
async function rowFor(kind, slug) {
  const table = kind === 'post' ? 'posts' : 'events';
  const fields = kind === 'post'
    ? 'slug,title,date,author,tags,cover,excerpt,body,video,status,updated_at'
    : 'slug,title,start_at,end_at,recurring,location,address,category,cover,hero,summary,body,register,links,videos,featured,status,updated_at';
  const url = new URL(SUPABASE_URL + '/rest/v1/' + table);
  url.searchParams.set('select', fields);
  url.searchParams.set('slug', 'eq.' + slug);
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { headers: { apikey: ANON, authorization: 'Bearer ' + ANON, accept: 'application/json' } });
  if (!response.ok) throw new Error('Content lookup failed: ' + response.status);
  const rows = await response.json();
  return rows && rows[0] && rows[0].status !== 'draft' ? rows[0] : null;
}
function postPage(html, row) {
  const url = DOMAIN + '/post?slug=' + encodeURIComponent(row.slug);
  const title = row.title + ' | Fairview Baptist Temple, Clay WV';
  const desc = description(row.excerpt || row.body, row.title + ' from Fairview Baptist Temple in Clay, West Virginia.');
  const image = absoluteUrl(row.cover, DOMAIN + '/assets/og-image.jpg');
  const published = row.date || row.updated_at;
  const schema = {
    '@context': 'https://schema.org', '@graph': [
      {
        '@type': 'BlogPosting', '@id': url + '#article', headline: row.title,
        description: desc, image: [image], url: url, mainEntityOfPage: url,
        datePublished: published, dateModified: row.updated_at || published,
        author: { '@type': row.author ? 'Person' : 'Organization', name: row.author || 'Fairview Baptist Temple' },
        publisher: {
          '@type': 'Organization', '@id': DOMAIN + '/#church',
          name: 'Fairview Baptist Temple',
          logo: { '@type': 'ImageObject', url: DOMAIN + '/assets/logo-full-color.png' }
        }
      },
      {
        '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: DOMAIN + '/' },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: DOMAIN + '/blog' },
          { '@type': 'ListItem', position: 3, name: row.title, item: url }
        ]
      }
    ]
  };
  html = applyHead(html, { title: title, description: desc, image: image, imageAlt: row.title, url: url, ogType: 'article', schema: schema });
  const tags = Array.isArray(row.tags) ? row.tags : [];
  html = html.replace('<span class="post-tag" data-post-tag></span>', '<span class="post-tag" data-post-tag>' + esc(tags[0] || '') + '</span>');
  html = html.replace('<h1 data-post-title>&nbsp;</h1>', '<h1 data-post-title>' + esc(row.title) + '</h1>');
  html = html.replace('<div class="post-meta" data-post-meta></div>', '<div class="post-meta" data-post-meta>' + esc([fmtDate(row.date), row.author].filter(Boolean).join('  ·  ')) + '</div>');
  const body = String(row.body || '').trim() || fragment('post', row.slug) || '<p>' + esc(desc) + '</p>';
  return html.replace('<article class="prose post-body rv" data-post-body></article>', '<article class="prose post-body rv" data-post-body>' + body + '</article>');
}
function eventPage(html, row) {
  const url = DOMAIN + '/event?e=' + encodeURIComponent(row.slug);
  const title = row.title + ' | Fairview Baptist Temple, Clay WV';
  const desc = description(row.summary || row.body, 'Join us for ' + row.title + ' at Fairview Baptist Temple in Clay, West Virginia.');
  const image = absoluteUrl(row.cover || row.hero, DOMAIN + '/assets/og-image.jpg');
  const placeName = row.location || 'Fairview Baptist Temple';
  const schema = {
    '@context': 'https://schema.org', '@graph': [
      {
        '@type': 'Event', '@id': url + '#event', name: row.title, description: desc,
        startDate: row.start_at || undefined, endDate: row.end_at || undefined,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@type': 'Place', name: placeName, address: churchAddress(row.address, placeName) },
        image: [image], url: url,
        organizer: { '@type': 'Organization', '@id': DOMAIN + '/#church', name: 'Fairview Baptist Temple', url: DOMAIN + '/' }
      },
      {
        '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: DOMAIN + '/' },
          { '@type': 'ListItem', position: 2, name: 'Events', item: DOMAIN + '/events' },
          { '@type': 'ListItem', position: 3, name: row.title, item: url }
        ]
      }
    ]
  };
  html = applyHead(html, { title: title, description: desc, image: image, imageAlt: row.title, url: url, ogType: 'website', schema: schema });
  html = html.replace('<span class="post-tag" data-event-cat></span>', '<span class="post-tag" data-event-cat>' + esc(row.category || '') + '</span>');
  html = html.replace('<h1 data-event-title>&nbsp;</h1>', '<h1 data-event-title>' + esc(row.title) + '</h1>');
  html = html.replace('<div class="ev-when-hero" data-event-when></div>', '<div class="ev-when-hero" data-event-when>' + esc(row.recurring || fmtEventDate(row.start_at)) + '</div>');
  html = html.replace('<div class="ev-where-hero" data-event-where></div>', '<div class="ev-where-hero" data-event-where>' + esc(row.address || row.location || '') + '</div>');
  const body = String(row.body || '').trim() || fragment('event', row.slug) || '<p>' + esc(desc) + '</p>';
  return html.replace('<article class="prose post-body rv" data-event-body></article>', '<article class="prose post-body rv" data-event-body>' + body + '</article>');
}
function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.end(html);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendHtml(res, 405, 'Method not allowed');
  }
  const kind = one(req.query && req.query.kind);
  if (kind !== 'post' && kind !== 'event') return sendHtml(res, 404, readProjectFile('404.html'));
  const slug = String(one(req.query && req.query[kind === 'post' ? 'slug' : 'e']) || '').toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) return sendHtml(res, 404, readProjectFile('404.html'));
  const template = readProjectFile('templates/' + kind + '.tpl');
  try {
    const row = await rowFor(kind, slug);
    if (!row) return sendHtml(res, 404, readProjectFile('404.html'));
    return sendHtml(res, 200, kind === 'post' ? postPage(template, row) : eventPage(template, row));
  } catch (e) {
    // Keep the public page available during a temporary database outage. Its
    // existing browser loader can still use the checked-in fallback content.
    return sendHtml(res, 200, template);
  }
};
