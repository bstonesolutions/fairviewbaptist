/* Verify that an API request came from a signed-in Studio owner.
   The Supabase URL and anon key are public project identifiers, not secrets.
   Vercel env values take priority so the project can be moved without a code
   change. Supabase validates the bearer token before we trust its email. */

// Set during CMS-SETUP: the Fairview Baptist Temple Supabase project URL and
// anon key (or set SUPABASE_URL / SUPABASE_ANON_KEY in the host env).
const DEFAULT_SUPABASE_URL = '';
const DEFAULT_SUPABASE_ANON_KEY = '';
const DEFAULT_OWNERS = [
  'brandonstone8567@gmail.com',
  // Add Pastor J. Bret Wiley's email here when known, e.g.:
  // 'pastor@example.com',
];

async function requireStudioOwner(req, res) {
  const authorization = String(req.headers.authorization || '');
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) {
    res.status(401).json({ error: 'Sign in to Studio to manage giving.' });
    return null;
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const configuredOwners = String(process.env.STUDIO_OWNER_EMAILS || '')
    .split(',')
    .map(function (email) { return email.trim().toLowerCase(); })
    .filter(Boolean);
  const owners = configuredOwners.length ? configuredOwners : DEFAULT_OWNERS;
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 5000);

  try {
    const response = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + match[1],
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      res.status(401).json({ error: 'Your Studio session expired. Sign in again.' });
      return null;
    }
    const user = await response.json();
    const email = String(user && user.email || '').trim().toLowerCase();
    if (!email || owners.indexOf(email) < 0) {
      res.status(403).json({ error: 'This Studio account cannot manage giving.' });
      return null;
    }
    return user;
  } catch (error) {
    clearTimeout(timer);
    res.status(503).json({ error: 'Studio could not verify your session. Try again.' });
    return null;
  }
}

module.exports = { requireStudioOwner };
