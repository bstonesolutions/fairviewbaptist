/* Create a Square-hosted checkout page for mobile and recurring giving.
   This is the reliable path when a phone blocks Square's embedded iframe and
   when Square needs to securely save a card for an automatic monthly gift. */
const crypto = require('crypto');
const { resolveMonthlyPlanId } = require('./_square-monthly-plan');
const checkoutAttempts = new Map();

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const origin = String(req.headers.origin || '');
  if (origin && origin !== 'https://fairviewbaptisttemple.com' && origin !== 'https://www.fairviewbaptisttemple.com') {
    res.status(403).json({ error: 'Please begin your gift from fairviewbaptisttemple.com.' });
    return;
  }
  if (!allowAttempt(req)) { res.status(429).json({ error: 'Please wait a moment and try again.' }); return; }

  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) { res.status(503).json({ error: 'Secure checkout is not configured yet.' }); return; }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(await readRaw(req) || '{}'); } catch (e) { body = {}; }
  }

  const amount = parseInt(body.amount, 10);
  const locationId = String(body.locationId || '').trim().slice(0, 80);
  const buyerName = String(body.buyerName || '').trim().slice(0, 120);
  const buyerEmailRaw = String(body.buyerEmail || '').trim().slice(0, 254);
  const buyerEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmailRaw) ? buyerEmailRaw : '';
  const rawNote = String(body.note || 'Online gift').trim().slice(0, 180);
  const recurring = body.recurring === true || body.recurring === 'true';
  const preferredPlanId = String(body.planId || '').trim();

  if (!buyerName || buyerName.length < 2) { res.status(400).json({ error: 'Please enter your name.' }); return; }
  if (!buyerEmail) { res.status(400).json({ error: 'Please enter a valid receipt email.' }); return; }
  if (!amount || amount < 100) { res.status(400).json({ error: 'Please enter an amount of at least $1.' }); return; }
  if (amount > 5000000) { res.status(400).json({ error: 'That amount is too large for online giving.' }); return; }
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(locationId)) { res.status(400).json({ error: 'The Square location is unavailable.' }); return; }

  const fund = rawNote
    .replace(/^Monthly\s+/i, '')
    .replace(/^Gift\s+[—-]\s+/i, '')
    .replace(/^Online gift$/i, 'Where needed most')
    .replace(/[\r\n|]+/g, ' ')
    .trim() || 'Where needed most';
  const base = String(process.env.SQUARE_ENV || body.env || 'production').toLowerCase() === 'sandbox'
    ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';

  try {
    const planId = recurring ? await resolveMonthlyPlanId({ base: base, token: token, preferredPlanId: preferredPlanId }) : '';
    const checkoutOptions = {
      enable_coupon: false,
      enable_loyalty: false,
      redirect_url: 'https://fairviewbaptisttemple.com/give?gift=complete' + (recurring ? '&recurring=1' : ''),
    };
    if (planId) checkoutOptions.subscription_plan_id = planId;
    const payload = {
      idempotency_key: crypto.randomUUID(),
      description: recurring ? 'Fairview Baptist Temple monthly online giving' : 'Fairview Baptist Temple online giving',
      quick_pay: {
        name: ((recurring ? 'Monthly gift to Fairview Baptist Temple: ' : 'Gift to Fairview Baptist Temple: ') + fund).slice(0, 120),
        price_money: { amount: amount, currency: 'USD' },
        location_id: locationId,
      },
      checkout_options: checkoutOptions,
      pre_populated_data: { buyer_email: buyerEmail },
      payment_note: ((recurring ? 'Online monthly gift | ' : 'Online gift | ') + fund + ' | Donor: ' + buyerName).slice(0, 500),
    };
    const response = await fetch(base + '/v2/online-checkout/payment-links', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Square-Version': '2026-05-20',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.payment_link || !data.payment_link.url) {
      const detail = data && data.errors && data.errors[0] && (data.errors[0].detail || data.errors[0].code);
      res.status(response.status >= 400 && response.status < 500 ? 400 : 502).json({ error: detail || 'Square checkout could not open.' });
      return;
    }
    res.status(200).json({ ok: true, url: data.payment_link.url, recurring: recurring });
  } catch (e) {
    res.status(502).json({ error: e && e.isSquareError ? e.message : 'Square checkout could not open. Please try again.' });
  }
};

function readRaw(req) {
  return new Promise(function (resolve) {
    let data = '';
    req.on('data', function (chunk) { data += chunk; });
    req.on('end', function () { resolve(data); });
    req.on('error', function () { resolve(''); });
  });
}

function allowAttempt(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown');
  const ip = forwarded.split(',')[0].trim().slice(0, 80);
  const now = Date.now();
  const recent = (checkoutAttempts.get(ip) || []).filter(function (time) { return now - time < 300000; });
  if (recent.length >= 10) return false;
  recent.push(now);
  checkoutAttempts.set(ip, recent);
  if (checkoutAttempts.size > 500) {
    checkoutAttempts.forEach(function (times, key) {
      if (!times.some(function (time) { return now - time < 300000; })) checkoutAttempts.delete(key);
    });
  }
  return true;
}
