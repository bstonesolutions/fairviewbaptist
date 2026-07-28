/* ============================================================
   Fairview Baptist Temple — blog renderer.
   On blog.html it builds the grid of post cards. On post.html it
   reads ?slug= , fills the header, and shows the article body.
   Posts come from Supabase (live edits from the studio); the static
   window.FBT_POSTS (assets/posts.js) is the fallback, and bodies
   fall back to posts/<slug>.html when not stored in the database.
   ============================================================ */
(function () {
  var POSTS = (window.FBT_POSTS || []).slice();
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmtDate(d) {
    if (!d) return '';
    var p = String(d).split('-'); var dt = new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
    return isNaN(dt) ? '' : dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  function setText(sel, txt) { var el = document.querySelector(sel); if (el) el.textContent = txt; }

  function renderIndex() {
    var grid = document.querySelector('[data-blog-grid]');
    if (!grid) return;
    if (!POSTS.length) {
      var emp = document.querySelector('[data-blog-empty]'); if (emp) emp.hidden = false;
      return;
    }
    grid.innerHTML = POSTS.map(function (p) {
      var cover = p.cover ? '<img class="thumb-img" loading="lazy" alt="" src="' + esc(p.cover) + '">' : '';
      var tag = (p.tags && p.tags[0]) ? '<span class="s">' + esc(p.tags[0]) + '</span>' : '';
      return '<a class="post-card" href="/post?slug=' + encodeURIComponent(p.slug) + '">' +
        '<div class="pc-cover">' + cover + tag + '</div>' +
        '<div class="pc-body"><div class="pc-date">' + esc(fmtDate(p.date)) + '</div>' +
        '<h3>' + esc(p.title) + '</h3>' +
        '<p>' + esc(p.excerpt || '') + '</p>' +
        '<span class="pc-more">Read more &rarr;</span></div></a>';
    }).join('');
    var cnt = document.querySelector('[data-blog-count]');
    if (cnt) { cnt.hidden = false; cnt.textContent = POSTS.length + (POSTS.length === 1 ? ' post' : ' posts'); }
  }

  function renderPost() {
    var bodyEl = document.querySelector('[data-post-body]');
    if (!bodyEl) return;
    var slug = new URLSearchParams(location.search).get('slug');
    var post = POSTS.filter(function (p) { return p.slug === slug; })[0];
    if (!post) {
      setText('[data-post-title]', 'Post not found');
      bodyEl.innerHTML = '<p class="lead">We could not find that post.</p><p>It may have moved. Head back to the blog to see what is new.</p>';
      return;
    }
    document.title = post.title + ' | Fairview Baptist Temple';
    if (window.FBTSeo) {
      var pUrl = window.FBTSeo.DOMAIN + '/post?slug=' + encodeURIComponent(post.slug || '');
      var pImg = (post.cover && /^https?:/.test(post.cover)) ? post.cover : (window.FBTSeo.DOMAIN + '/assets/og-image.jpg');
      var pDesc = post.excerpt || (post.title + ', from Fairview Baptist Temple in Clay, WV.');
      var pLd = {
        '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title,
        image: pImg, description: pDesc, url: pUrl,
        author: { '@type': post.author ? 'Person' : 'Organization', name: post.author || 'Fairview Baptist Temple' },
        publisher: { '@type': 'Organization', name: 'Fairview Baptist Temple', logo: { '@type': 'ImageObject', url: window.FBTSeo.DOMAIN + '/assets/logo-full-color.png' } }
      };
      if (post.date) pLd.datePublished = post.date;
      if (post.updatedAt || post.date) pLd.dateModified = post.updatedAt || post.date;
      window.FBTSeo.setItem({ title: post.title + ' | Fairview Baptist Temple', description: pDesc, image: pImg, url: pUrl, type: 'article', jsonld: pLd });
    }
    setText('[data-post-title]', post.title);
    var meta = document.querySelector('[data-post-meta]');
    if (meta) meta.textContent = [fmtDate(post.date), post.author].filter(Boolean).join('  ·  ');
    if (post.tags && post.tags[0]) setText('[data-post-tag]', post.tags[0]);
    if (post.cover) {
      var cov = document.querySelector('[data-post-cover]');
      if (cov) {
        cov.style.backgroundImage = 'linear-gradient(165deg,rgba(10,38,46,.55),rgba(10,38,46,.86)),url("' + post.cover + '")';
        cov.style.backgroundSize = 'cover'; cov.style.backgroundPosition = 'center';
      }
    }
    // if this post matches a sermon video, offer to watch it in-page
    var watchEl = document.querySelector('[data-post-watch]');
    if (watchEl && post.video) {
      var yt = 'https://www.youtube.com/watch?v=' + encodeURIComponent(post.video);
      watchEl.innerHTML = '<a class="btn btn-b post-watch" href="' + yt + '" target="_blank" rel="noopener">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Watch the message</a>';
      watchEl.querySelector('.post-watch').addEventListener('click', function (e) {
        if (window.FBTPlayer) { e.preventDefault(); window.FBTPlayer.open(post.video, post.title); }
      });
    }
    if (post.body != null && String(post.body).trim()) { bodyEl.innerHTML = post.body; }
    else {
      fetch('posts/' + encodeURIComponent(post.slug) + '.html')
        .then(function (r) { return r.ok ? r.text() : Promise.reject(); })
        .then(function (html) { bodyEl.innerHTML = html; })
        .catch(function () { bodyEl.innerHTML = '<p>This post could not be loaded right now. Please try again later.</p>'; });
    }
  }

  // ---------- load: Supabase first (live edits), static posts.js as fallback ----------
  function fromDb(r) {
    return { slug: r.slug, title: r.title, date: r.date, author: r.author, tags: r.tags || [], cover: r.cover, excerpt: r.excerpt, body: r.body, video: r.video, status: r.status, updatedAt: r.updated_at };
  }
  function loadPosts(cb) {
    var B = window.FBT;
    if (!B || !B.SUPABASE_URL || !window.supabase) { cb(); return; }
    var done = false, fin = function () { if (!done) { done = true; cb(); } };
    try {
      var sb = B.getPublicClient ? B.getPublicClient() : window.supabase.createClient(B.SUPABASE_URL, B.SUPABASE_ANON_KEY);
      if (!sb) { fin(); return; }
      sb.from('posts').select('*').order('date', { ascending: false }).then(function (res) {
        if (res && !res.error && res.data && res.data.length) {
          POSTS = res.data.filter(function (r) { return r.status !== 'draft'; }).map(fromDb);
        }
        fin();
      }, fin);
      setTimeout(fin, 4000);
    } catch (e) { fin(); }
  }
  function render() { try { renderIndex(); } catch (e) {} try { renderPost(); } catch (e) {} }
  function run() { loadPosts(render); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
