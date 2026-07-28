/* ============================================================
   Fairview Baptist Temple — Square giving (one-time card gift OR monthly recurring).
   The browser tokenizes the card with the Square Web Payments SDK
   (the card number never touches our server), then posts the token +
   amount here. We charge it with the Square Payments API using the
   SECRET access token from the Vercel env (SQUARE_ACCESS_TOKEN) — that
   token is never exposed to the browser.

     • One-time  → POST /v2/payments
     • Monthly   → body.recurring + body.planId: create a customer, save
                   the card, and start a subscription on that Square plan
                   variation, overriding the price to the donor's amount.

   Env (set in Vercel):
     SQUARE_ACCESS_TOKEN  — required to actually charge (Square > Credentials)
     SQUARE_ENV           — "production" (default) or "sandbox"
   Until SQUARE_ACCESS_TOKEN is set, this returns a clean 503 and the
   give page shows "card giving is being set up". The current giving page
   sends monthly gifts through Square's hosted subscription checkout.
   ============================================================ */
const crypto = require('crypto');
const { sendGivingReceipt } = require('./_giving-receipt');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) { res.status(503).json({ error: 'Card giving is not set up yet.' }); return; }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(await readRaw(req) || '{}'); } catch (e) { body = {}; }
  }
  const sourceId = body.sourceId;
  const amount = parseInt(body.amount, 10); // cents
  const note = String(body.note || 'Online gift').slice(0, 200);
  const locationId = body.locationId;
  const recurring = body.recurring === true || body.recurring === 'true';
  const planId = body.planId;
  // Contact details are required for the branded receipt below. Name is split
  // into given/family for the saved customer on monthly gifts.
  const buyerEmailRaw = String(body.buyerEmail || '').trim().slice(0, 254);
  const buyerEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmailRaw) ? buyerEmailRaw : '';
  const buyerName = String(body.buyerName || '').trim().slice(0, 120);
  const nameParts = buyerName ? buyerName.split(/\s+/) : [];
  const givenName = nameParts.length ? nameParts[0] : '';
  const familyName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
  if (!buyerName || buyerName.length < 2) { res.status(400).json({ error: 'Please enter your name.' }); return; }
  if (!buyerEmail) { res.status(400).json({ error: 'Please enter a valid receipt email.' }); return; }
  if (!sourceId) { res.status(400).json({ error: 'Missing card token.' }); return; }
  if (!amount || amount < 100) { res.status(400).json({ error: 'Please enter an amount of at least $1.' }); return; }
  if (amount > 5000000) { res.status(400).json({ error: 'That amount is too large for online giving.' }); return; }

  const base = String(process.env.SQUARE_ENV || body.env || 'production').toLowerCase() === 'sandbox'
    ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  const H = { 'Authorization': 'Bearer ' + token, 'Square-Version': '2026-05-20', 'Content-Type': 'application/json' };
  const failFrom = function (data, fallback) {
    const detail = (data && data.errors && data.errors[0] && (data.errors[0].detail || data.errors[0].code)) || fallback;
    res.status(400).json({ error: detail });
  };

  try {
    if (recurring) {
      if (!planId) { res.status(503).json({ error: 'Automatic monthly card giving is not set up yet.' }); return; }
      if (!locationId) { res.status(400).json({ error: 'Missing location.' }); return; }

      // 1. customer (email + name keep the Square customer record complete)
      const customerBody = { idempotency_key: crypto.randomUUID(), note: 'Online giving - monthly' };
      if (buyerEmail) customerBody.email_address = buyerEmail;
      if (givenName) customerBody.given_name = givenName;
      if (familyName) customerBody.family_name = familyName;
      const cr = await fetch(base + '/v2/customers', { method: 'POST', headers: H, body: JSON.stringify(customerBody) });
      const cd = await cr.json();
      if (!cr.ok) { failFrom(cd, 'Could not start your monthly gift.'); return; }
      const customerId = cd.customer && cd.customer.id;

      // 2. save the card on file
      const kr = await fetch(base + '/v2/cards', { method: 'POST', headers: H, body: JSON.stringify({ idempotency_key: crypto.randomUUID(), source_id: sourceId, card: { customer_id: customerId } }) });
      const kd = await kr.json();
      if (!kr.ok) { failFrom(kd, 'Your card could not be saved.'); return; }
      const cardId = kd.card && kd.card.id;

      // 3. subscription on the plan variation, amount overridden per donor
      const sr = await fetch(base + '/v2/subscriptions', { method: 'POST', headers: H, body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        location_id: locationId,
        plan_variation_id: planId,
        customer_id: customerId,
        card_id: cardId,
        price_override_money: { amount: amount, currency: 'USD' }
      }) });
      const sd = await sr.json();
      if (!sr.ok) { failFrom(sd, 'Your monthly gift could not be set up.'); return; }
      const receipt = await sendGivingReceipt({ email: buyerEmail, name: buyerName, amountCents: amount, note: note, recurring: true, id: sd.subscription && sd.subscription.id });
      res.status(200).json({ ok: true, recurring: true, id: sd.subscription && sd.subscription.id, receiptSent: receipt.sent, receiptPending: receipt.pending === true });
      return;
    }

    // one-time
    const r = await fetch(base + '/v2/payments', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        source_id: sourceId,
        idempotency_key: crypto.randomUUID(),
        amount_money: { amount: amount, currency: 'USD' },
        // Keep the fund and donor together in Square so the owner-only Studio
        // history can identify future website gifts without a second ledger.
        note: squareGiftNote(note, buyerName),
        location_id: locationId || undefined,
        buyer_email_address: buyerEmail || undefined
      })
    });
    const data = await r.json();
    if (!r.ok) { failFrom(data, 'Your card could not be processed.'); return; }
    const receipt = await sendGivingReceipt({ email: buyerEmail, name: buyerName, amountCents: amount, note: note, recurring: false, id: data.payment && data.payment.id });
    res.status(200).json({
      ok: true,
      id: data.payment && data.payment.id,
      receiptSent: receipt.sent,
      receiptPending: receipt.pending === true,
      receiptUrl: data.payment && data.payment.receipt_url,
    });
  } catch (e) {
    res.status(502).json({ error: 'Could not reach the payment processor. Please try again.' });
  }
};

function readRaw(req) {
  return new Promise(function (resolve) {
    let d = ''; req.on('data', function (c) { d += c; }); req.on('end', function () { resolve(d); }); req.on('error', function () { resolve(''); });
  });
}

function squareGiftNote(note, buyerName) {
  const fund = String(note || '')
    .replace(/^Monthly\s+/i, '')
    .replace(/^Gift\s+[—-]\s+/i, '')
    .replace(/^Online gift$/i, 'Where needed most')
    .replace(/[\r\n|]+/g, ' ')
    .trim() || 'Where needed most';
  return ('Online gift | ' + fund + ' | Donor: ' + buyerName).slice(0, 500);
}
