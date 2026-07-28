// ------------------------------------------------------------------
// /api/notify: email the church when someone submits a public form.
//
// Supabase is the durable Studio inbox. This endpoint is the independent,
// best-effort email copy. Requests are same-site, size limited, validated,
// sanitized, and rate limited before anything reaches Resend.
// ------------------------------------------------------------------

const {
  setPrivateJson,
  allowSameSite,
  readJson,
  rateLimit,
  cleanText,
  validEmail,
} = require('./_public-security');

const ALLOWED_KINDS = new Set([
  'contact',
  'visit',
  'prayer',
  'newsletter',
  'rsvp',
  'next_step_follow_jesus',
  'next_step_baptism',
  'next_step_membership',
  'next_step_group',
  'next_step_serve',
  'next_step_pastor',
]);

const TITLES = {
  contact: 'New message',
  visit: 'New visit plan',
  prayer: 'New prayer request',
  newsletter: 'New newsletter signup',
  rsvp: 'New event registration',
  next_step_follow_jesus: 'Next step: Following Jesus',
  next_step_baptism: 'Next step: Baptism',
  next_step_membership: 'Next step: Membership',
  next_step_group: 'Next step: Joining a group',
  next_step_serve: 'Next step: Serving',
  next_step_pastor: 'Next step: Talk with a pastor',
};

function send(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function cap(value) {
  const text = String(value || '').replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function fmt(value) {
  if (Array.isArray(value)) return value.join(', ');
  return String(value == null ? '' : value);
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cleanLine(value, max) {
  // Keep one extra character so validation can reject an over-limit value
  // instead of silently truncating it into something that looks valid.
  return cleanText(value, (max || 500) + 1).replace(/\s+/g, ' ').trim();
}

function cleanDetail(value) {
  if (typeof value === 'string') return cleanText(value, 1000);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 12).map(function (item) {
      if (typeof item === 'boolean') return item;
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      return cleanText(item, 500);
    });
  }
  return cleanText(value, 1000);
}

function sanitizeDetails(value) {
  if (value == null) return {};
  if (!plainObject(value)) throw Object.assign(new Error('Details must be an object.'), { statusCode: 400 });
  const keys = Object.keys(value);
  if (keys.length > 24) throw Object.assign(new Error('That form has too many fields.'), { statusCode: 400 });
  const details = {};
  keys.forEach(function (key) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) {
      throw Object.assign(new Error('A form field could not be read.'), { statusCode: 400 });
    }
    details[key] = cleanDetail(value[key]);
  });
  if (Buffer.byteLength(JSON.stringify(details), 'utf8') > 12000) {
    throw Object.assign(new Error('Those form details are too long.'), { statusCode: 413 });
  }
  return details;
}

function validate(body) {
  if (!plainObject(body)) throw Object.assign(new Error('The request could not be read.'), { statusCode: 400 });
  const kind = cleanLine(body.kind || 'contact', 40).toLowerCase();
  if (!ALLOWED_KINDS.has(kind)) throw Object.assign(new Error('That form type is not supported.'), { statusCode: 400 });

  const name = cleanLine(body.name, 121);
  const rawEmail = cleanLine(body.email, 255);
  const email = rawEmail ? validEmail(rawEmail) : '';
  const phone = cleanLine(body.phone, 51);
  const message = cleanText(body.message, 5001);
  if (name.length > 120 || rawEmail.length > 254 || phone.length > 50 || message.length > 5000) {
    throw Object.assign(new Error('One or more form fields are too long.'), { statusCode: 413 });
  }
  if (rawEmail && !email) throw Object.assign(new Error('Enter a complete email address.'), { statusCode: 400 });
  if ((kind === 'contact' || kind === 'visit' || kind === 'rsvp' || kind.indexOf('next_step_') === 0) && (!name || !email)) {
    throw Object.assign(new Error('Name and email are required.'), { statusCode: 400 });
  }
  if (kind === 'newsletter' && !email) {
    throw Object.assign(new Error('Email is required.'), { statusCode: 400 });
  }
  if ((kind === 'contact' || kind === 'prayer') && !message) {
    throw Object.assign(new Error('A message is required.'), { statusCode: 400 });
  }
  if (!name && !email && !phone && !message) {
    throw Object.assign(new Error('Add your information before sending.'), { statusCode: 400 });
  }

  const details = sanitizeDetails(body.details);
  const honeypot = cleanLine(body.website || details.website, 120);
  delete details.website;
  return { kind: kind, name: name, email: email, phone: phone, message: message, details: details, honeypot: honeypot };
}

module.exports = async function handler(req, res) {
  setPrivateJson(res);
  if (!allowSameSite(req, res, ['POST'])) return;
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return send(res, 405, { error: 'POST only' });
  }
  if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers && req.headers['content-type'] || ''))) {
    return send(res, 415, { error: 'Send this form as JSON.' });
  }

  let row;
  try {
    row = validate(await readJson(req, 24576));
  } catch (error) {
    return send(res, error && error.statusCode || 400, { error: error && error.message || 'The request could not be read.' });
  }

  // A filled field that people never see is a bot signal. Return the normal
  // success shape without sending or storing anything, so the trap stays quiet.
  if (row.honeypot) return send(res, 200, { sent: true });

  const throttle = rateLimit(req, 'form-notify:' + row.kind, 12, 15 * 60 * 1000);
  if (!throttle.allowed) {
    res.setHeader('Retry-After', String(throttle.retryAfter));
    return send(res, 429, { sent: false, reason: 'Please wait a few minutes before sending another message.' });
  }

  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_TO || 'brandonstone8567@gmail.com';
  const from = process.env.RESEND_FROM || 'Fairview Baptist Temple Website <onboarding@resend.dev>';
  if (!key) return send(res, 200, { sent: false, reason: 'email not configured' });

  const subject = (TITLES[row.kind] || 'New form submission') + (row.name ? ': ' + row.name : '');
  const lines = [];
  if (row.name) lines.push('Name: ' + row.name);
  if (row.email) lines.push('Email: ' + row.email);
  if (row.phone) lines.push('Phone: ' + row.phone);
  Object.keys(row.details).forEach(function (field) {
    const value = row.details[field];
    if (value !== '' && value != null) lines.push(cap(field) + ': ' + fmt(value));
  });
  if (row.message) { lines.push(''); lines.push(row.message); }

  const label = cap(row.kind);
  const text = 'A new ' + label + ' submission came in from the website.\n\n' + lines.join('\n');
  const html = '<p>A new <b>' + esc(label) + '</b> submission came in from the website.</p><p>' +
    lines.map(function (line) { return esc(line); }).join('<br>') + '</p>';

  try {
    const payload = { from: from, to: [to], subject: subject, text: text, html: html };
    if (row.email) payload.reply_to = row.email;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return send(res, 200, response.ok
      ? { sent: true }
      : { sent: false, reason: 'The email service did not accept the message.' });
  } catch (error) {
    return send(res, 200, { sent: false, reason: 'The email service could not be reached.' });
  }
};

module.exports.validate = validate;
