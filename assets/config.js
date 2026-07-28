/* ============================================================
   Fairview Baptist Temple — Supabase connection config.
   Paste your project's values below (see CMS-SETUP.md). These are
   PUBLIC values and safe to ship in the page: the anon key only
   grants what your database security rules (RLS) allow, which is
   read-everything / write-nothing for visitors. Only you, signed in
   with an allow-listed email, can make changes.

   Until you fill these in, the site simply shows its built-in
   content (nothing breaks).
   ============================================================ */
window.FBT = {
  // From Supabase: Project Settings > API
  SUPABASE_URL: 'https://qlbylvhmkbopszmzmipm.supabase.co',          // e.g. 'https://abcd1234.supabase.co'
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsYnlsdmhta2JvcHN6bXptaXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyODE1MDYsImV4cCI6MjEwMDg1NzUwNn0.muLRBIvNtki4lYOBIf6S80R2rYdBPoQvDzvzmEIn2A4',     // the "anon / public" key (a long JWT)

  // The email address(es) allowed to log in to /studio and make edits.
  // Must match the allow-list in your database rules (see schema.sql).
  // Add Pastor Wiley's email here (and in schema.sql) when ready.
  OWNER_EMAILS: ['brandonstone8567@gmail.com'],

  // Storage bucket name (matches schema.sql). No need to change.
  MEDIA_BUCKET: 'fbt-media',
};

// Public pages share one lightweight Supabase client. Keeping this separate
// from Studio's signed-in client prevents competing auth sessions when several
// page features read Supabase at the same time.
window.FBT.getPublicClient = function () {
  if (window.FBT._publicClient) return window.FBT._publicClient;
  if (!window.supabase || !window.supabase.createClient) return null;
  if (!window.FBT.SUPABASE_URL || !window.FBT.SUPABASE_ANON_KEY) return null;
  window.FBT._publicClient = window.supabase.createClient(
    window.FBT.SUPABASE_URL,
    window.FBT.SUPABASE_ANON_KEY,
    {
      auth: {
        storageKey: 'fbt-public-auth',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
  return window.FBT._publicClient;
};
