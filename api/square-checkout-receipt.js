/* Verify a completed Square-hosted checkout and send its Resend receipt.
   Square redirects the donor here with order/payment identifiers only after
   processing payment. Every detail used in the email is fetched from Square. */
const { sendGivingReceipt } = require('./_giving-receipt');

// Fairview Baptist Temple's Square location. Set SQUARE_LOCATION_ID in the
// host env once the church's Square account is connected.
const LOCATION_ID = String(process.env.SQUARE_LOCATION_ID || '').trim();
const attempts = new Map();

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const origin = String(req.headers.origin || '');
  if (origin && origin !== 'https://fairviewbaptisttemple.com' && origin !== 'https://www.fairviewbaptisttemple.com') {
    res.status(403).json({ error: 'Please return through Square checkout.' });
    return;
  }
  if (!allowAttempt(req)) { res.status(429).json({ error: 'Please wait a moment and try again.' }); return; }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(await readRaw(req) || '{}'); } catch (e) { body = {}; }
  }
  let orderId = cleanId(body.orderId);
  const transactionId = cleanId(body.transactionId);
  if (!orderId && !transactionId) { res.status(400).json({ error: 'The Square payment reference is missing.' }); return; }

  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) { res.status(503).json({ error: 'Square is not configured.' }); return; }
  const base = String(process.env.SQUARE_ENV || 'production').toLowerCase() === 'sandbox'
    ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  const headers = { 'Authorization': 'Bearer ' + token, 'Square-Version': '2026-05-20', 'Content-Type': 'application/json' };

  try {
    let payment = null;
    if (transactionId) {
      const directPaymentResponse = await fetch(base + '/v2/payments/' + encodeURIComponent(transactionId), { headers: headers });
      const directPaymentData = await directPaymentResponse.json();
      if (directPaymentResponse.ok && directPaymentData.payment) {
        payment = directPaymentData.payment;
        if (!orderId) orderId = cleanId(payment.order_id);
      }
    }
    if (!orderId) { res.status(409).json({ error: 'Square is still attaching the order reference.' }); return; }

    const orderResponse = await fetch(base + '/v2/orders/' + encodeURIComponent(orderId), { headers: headers });
    const orderData = await orderResponse.json();
    if (!orderResponse.ok || !orderData.order) { res.status(502).json({ error: 'The Square order could not be verified.' }); return; }
    const order = orderData.order;
    if (order.location_id !== LOCATION_ID) { res.status(403).json({ error: 'The Square order does not belong to this giving page.' }); return; }

    const tender = Array.isArray(order.tenders) && order.tenders.length ? order.tenders[0] : null;
    let paymentId = transactionId || cleanId(tender && (tender.payment_id || tender.id));
    if (!paymentId && !payment) {
      // Checkout orders can be visible a few seconds before their tender is
      // attached. Square's Payments list is eventually consistent, so match
      // the recent completed payment back to this verified order.
      const listUrl = base + '/v2/payments?location_id=' + encodeURIComponent(LOCATION_ID) + '&sort_order=DESC&limit=20';
      const listResponse = await fetch(listUrl, { headers: headers });
      const listData = await listResponse.json();
      if (listResponse.ok && Array.isArray(listData.payments)) {
        payment = listData.payments.find(function (candidate) {
          return candidate && candidate.order_id === orderId && candidate.status === 'COMPLETED';
        }) || null;
        if (payment) paymentId = cleanId(payment.id);
      }
    }
    if (!paymentId) { res.status(409).json({ error: 'Square is still finishing the payment. Please wait.' }); return; }

    if (!payment) {
      const paymentResponse = await fetch(base + '/v2/payments/' + encodeURIComponent(paymentId), { headers: headers });
      const paymentData = await paymentResponse.json();
      if (!paymentResponse.ok || !paymentData.payment) { res.status(409).json({ error: 'Square is still finishing the payment. Please wait.' }); return; }
      payment = paymentData.payment;
    }
    const hostedDetails = /^Online (monthly )?gift \| (.*?) \| Donor: (.+)$/i.exec(String(payment.note || ''));
    if (payment.status !== 'COMPLETED' || payment.order_id !== orderId) {
      res.status(409).json({ error: 'Square is still finishing the payment. Please wait.' });
      return;
    }
    if (payment.location_id !== LOCATION_ID || !hostedDetails) {
      res.status(403).json({ error: 'This payment is not a hosted giving checkout.' });
      return;
    }

    const recipient = findRecipient(order);
    const email = validEmail(payment.buyer_email_address)
      ? String(payment.buyer_email_address).trim()
      : (recipient && validEmail(recipient.email_address) ? String(recipient.email_address).trim() : '');
    if (!email) { res.status(409).json({ error: 'Square is still attaching the receipt email. Please wait.' }); return; }

    const recurring = !!hostedDetails[1];
    const name = String(hostedDetails[3] || recipientName(recipient) || '').trim().slice(0, 120);
    const fund = String(hostedDetails[2] || 'Where needed most').trim().slice(0, 180);
    const amount = payment.amount_money && parseInt(payment.amount_money.amount, 10);
    if (!amount || amount < 1) { res.status(502).json({ error: 'The payment amount is unavailable.' }); return; }

    const receipt = await sendGivingReceipt({
      email: email,
      name: name,
      amountCents: amount,
      note: fund === 'Where needed most' ? 'Online gift' : ('Gift - ' + fund),
      recurring: recurring,
      id: payment.id,
    });
    if (!receipt.sent && receipt.pending) {
      res.status(202).json({ ok: true, receiptSent: false, receiptPending: true, recurring: recurring });
      return;
    }
    if (!receipt.sent) {
      res.status(502).json({
        error: 'Your gift was received, but Resend rejected the branded receipt.',
        receiptError: receipt.errorCode || 'resend_rejected',
        receiptDetail: receipt.errorMessage || '',
      });
      return;
    }
    res.status(200).json({ ok: true, receiptSent: true, recurring: recurring });
  } catch (e) {
    res.status(502).json({ error: 'Your payment is safe, but receipt confirmation is still processing.' });
  }
};

function cleanId(value) {
  value = String(value || '').trim();
  return /^[A-Za-z0-9_-]{5,192}$/.test(value) ? value : '';
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function findRecipient(order) {
  const fulfillments = order && Array.isArray(order.fulfillments) ? order.fulfillments : [];
  for (const fulfillment of fulfillments) {
    const recipient =
      (fulfillment.shipment_details && fulfillment.shipment_details.recipient) ||
      (fulfillment.delivery_details && fulfillment.delivery_details.recipient) ||
      (fulfillment.pickup_details && fulfillment.pickup_details.recipient);
    if (recipient) return recipient;
  }
  return null;
}

function recipientName(recipient) {
  if (!recipient) return '';
  return recipient.display_name || [recipient.given_name, recipient.family_name].filter(Boolean).join(' ');
}

function allowAttempt(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown');
  const ip = forwarded.split(',')[0].trim().slice(0, 80);
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter(function (time) { return now - time < 300000; });
  if (recent.length >= 12) return false;
  recent.push(now);
  attempts.set(ip, recent);
  return true;
}

function readRaw(req) {
  return new Promise(function (resolve) {
    let data = '';
    req.on('data', function (chunk) { data += chunk; });
    req.on('end', function () { resolve(data); });
    req.on('error', function () { resolve(''); });
  });
}
