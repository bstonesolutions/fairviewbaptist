const crypto = require('crypto');

const buckets = new Map();
const MAX_BUCKETS = 2048;

function setPrivateJson(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function allowSameSite(req, res, methods) {
  const origin = String(req.headers && req.headers.origin || '').trim();
  const allowed = !origin || isAllowedOrigin(origin);
  if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', (methods || ['POST']).concat('OPTIONS').join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (!allowed) {
    res.status(403).json({ error: 'This request must come from the Fairview Baptist Temple website.' });
    return false;
  }
  return true;
}

function isAllowedOrigin(origin) {
  if (origin === 'https://fairviewbaptisttemple.com' || origin === 'https://www.fairviewbaptisttemple.com') return true;
  // Vercel preview deployments. Adjust if the Vercel project uses a different slug.
  if (/^https:\/\/fairview-?baptist-?temple(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin)) return true;
  return /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin);
}

async function readJson(req, maxBytes) {
  const limit = Number.isFinite(maxBytes) ? maxBytes : 32768;
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    const encoded = JSON.stringify(req.body);
    if (Buffer.byteLength(encoded, 'utf8') > limit) throw bodyError(413, 'That request is too large.');
    return req.body;
  }
  const existing = typeof req.body === 'string' ? req.body : '';
  const raw = existing || await new Promise(function (resolve, reject) {
    let data = '';
    let size = 0;
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > limit) {
        reject(bodyError(413, 'That request is too large.'));
        if (typeof req.destroy === 'function') req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', function () { resolve(data); });
    req.on('error', reject);
  });
  if (!raw) return {};
  if (Buffer.byteLength(raw, 'utf8') > limit) throw bodyError(413, 'That request is too large.');
  try { return JSON.parse(raw); } catch (error) { throw bodyError(400, 'The request could not be read.'); }
}

function bodyError(status, message) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

function rateLimit(req, scope, limit, windowMs, extra) {
  const now = Date.now();
  const raw = [clientIp(req), String(scope || 'public'), String(extra || '')].join('|');
  const key = crypto.createHash('sha256').update(raw).digest('hex');
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > MAX_BUCKETS) trimBuckets(now);
  return {
    allowed: bucket.count <= limit,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function clientIp(req) {
  const headers = req.headers || {};
  return String(headers['x-forwarded-for'] || headers['x-real-ip'] || req.socket && req.socket.remoteAddress || 'unknown')
    .split(',')[0].trim().slice(0, 80);
}

function cleanup(now) {
  buckets.forEach(function (bucket, key) { if (bucket.resetAt <= now) buckets.delete(key); });
}

function trimBuckets(now) {
  cleanup(now);
  while (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next();
    if (oldest.done) break;
    buckets.delete(oldest.value);
  }
}

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max || 500);
}

function validEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

module.exports = {
  setPrivateJson,
  allowSameSite,
  readJson,
  rateLimit,
  cleanText,
  validEmail,
};
