/* ============================================================
   Fairview Baptist Temple — homepage "Beyond the hills" teaser.
   Pulls the missionaries from Supabase and fills the avatar row +
   stats ("N missionaries · M countries · K continents"). If Supabase
   isn't set up or there are no missionaries, the band still shows its
   heading and "Explore the map" button — nothing breaks.
   ============================================================ */
(function () {
  var host = document.querySelector('[data-home-miss-avatars]'); if (!host) return;
  var B = window.FBT;
  if (!B || !B.SUPABASE_URL || !window.supabase) return;
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nn(v) { return v != null && String(v).trim() !== ''; }
  function initials(n) { return (String(n || '').match(/\b[A-Za-z]/g) || ['?']).slice(0, 2).join('').toUpperCase(); }
  try {
    var sb = B.getPublicClient ? B.getPublicClient() : window.supabase.createClient(B.SUPABASE_URL, B.SUPABASE_ANON_KEY);
    if (!sb) return;
    sb.from('missionaries').select('name,photo,location,region,status').order('sort', { ascending: true }).then(function (r) {
      if (!r || r.error || !r.data) return;
      var rows = r.data.filter(function (m) { return m.status !== 'draft'; });
      if (!rows.length) return;
      var shown = rows.slice(0, 8), extra = rows.length - shown.length;
      host.innerHTML = shown.map(function (m) {
        return nn(m.photo)
          ? '<span class="hm-av" style="background-image:url(\'' + String(m.photo).replace(/'/g, '%27') + '\')"></span>'
          : '<span class="hm-av empty">' + esc(initials(m.name)) + '</span>';
      }).join('') + (extra > 0 ? '<span class="hm-av more">+' + extra + '</span>' : '');
      var countries = {}, continents = {};
      rows.forEach(function (m) { var p = String(m.location || '').split(','); var c = (p[p.length - 1] || '').trim(); if (c) countries[c] = 1; if (nn(m.region)) continents[m.region] = 1; });
      var st = document.querySelector('[data-home-miss-stats]');
      if (st) {
        var nC = Object.keys(countries).length, nR = Object.keys(continents).length;
        st.hidden = false;
        st.innerHTML = '<b>' + rows.length + '</b> ' + (rows.length === 1 ? 'missionary' : 'missionaries') +
          (nC ? ' <span>&middot;</span> <b>' + nC + '</b> ' + (nC === 1 ? 'country' : 'countries') : '') +
          (nR ? ' <span>&middot;</span> <b>' + nR + '</b> ' + (nR === 1 ? 'continent' : 'continents') : '');
      }
    }, function () { });
  } catch (e) { }
})();
