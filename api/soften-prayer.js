// ------------------------------------------------------------------
// /api/soften-prayer  —  reword a prayer request to protect privacy.
//
// The Studio calls this when the owner is preparing a request for the public
// prayer wall. It asks Claude to rewrite the text so names and sensitive
// specifics are generalized ("my brother John's cancer" -> "a loved one
// facing a serious illness") while keeping the heart of the need. The owner
// reviews and edits the result before it ever goes public.
//
// Needs ANTHROPIC_API_KEY in the host env (get one at console.anthropic.com).
// Until it's set, this returns a clean "AI isn't connected yet" message and
// the owner can still reword by hand. Optional ANTHROPIC_MODEL overrides the
// default model. Always responds 200.
// ------------------------------------------------------------------

const SYSTEM = [
  'You help a church reword prayer requests before they are posted publicly on a prayer wall.',
  'Rewrite the request the person sends so it protects their privacy: remove or generalize the',
  'names of people, places, and employers, and soften identifying or sensitive specifics (medical',
  'conditions, legal issues, relationship or family details, finances). Keep the heart of the need',
  'so the church can still pray meaningfully, and keep a warm, respectful, hopeful tone. Prefer',
  'gentle general phrasing like "a loved one," "a family going through a hard season," "a health',
  'concern," or "a difficult situation at work." Do not add anything that was not implied.',
  'Output ONLY the reworded request as one or two short sentences: no preamble, no quotation',
  'marks, no explanation, no leading label.',
].join(' ');

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); } }
  return new Promise(function (resolve) {
    var data = '';
    req.on('data', function (c) { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', function () { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') { res.statusCode = 200; return res.end(JSON.stringify({ ok: false, reason: 'POST only' })); }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: false, reason: 'AI isn’t connected yet. Add an Anthropic API key.' }));
  }

  try {
    const body = await readBody(req);
    const text = String((body && body.text) || '').trim().slice(0, 2000);
    if (!text) { res.statusCode = 200; return res.end(JSON.stringify({ ok: false, reason: 'Nothing to reword.' })); }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: 'user', content: text }],
      }),
    });
    const data = await r.json().catch(function () { return {}; });
    if (data && data.error) { res.statusCode = 200; return res.end(JSON.stringify({ ok: false, reason: (data.error.message || 'AI error') })); }
    const out = ((data && data.content) || []).filter(function (b) { return b && b.type === 'text'; }).map(function (b) { return b.text; }).join('').trim();
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: !!out, text: out }));
  } catch (e) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: false, reason: String(e && e.message || e) }));
  }
};
