/* Owner-only Square payment details and management for Studio.

   Square remains the source of truth. Every action retrieves the payment
   again, verifies the Fairview Baptist Temple location, and returns only the
   donor and payment details needed by Studio. Card data never passes through
   this endpoint. */

const crypto = require('crypto');
const { requireStudioOwner } = require('./_studio-auth');
const { sendGivingReceipt } = require('./_giving-receipt');

// Fairview Baptist Temple's Square location. Set SQUARE_LOCATION_ID in the
// host env once the church's Square account is connected.
const LOCATION_ID = '';
const SQUARE_VERSION = '2026-05-20';

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'GET or POST only' });
    return;
  }

  const owner = await requireStudioOwner(req, res);
  if (!owner) return;

  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) { res.status(503).json({ error: 'Square is not configured.' }); return; }
  const base = String(process.env.SQUARE_ENV || 'production').toLowerCase() === 'sandbox'
    ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  const headers = squareHeaders(token);
  const locationId = String(process.env.SQUARE_LOCATION_ID || LOCATION_ID);

  try {
    let body = {};
    if (req.method === 'POST') body = await requestBody(req);
    const paymentId = cleanId(req.method === 'GET' ? (req.query && req.query.paymentId) : body.paymentId);
    if (!paymentId) { res.status(400).json({ error: 'The payment reference is missing.' }); return; }

    let payment = await retrievePayment(base, headers, paymentId);
    if (String(payment.location_id || '') !== locationId) {
      res.status(403).json({ error: 'That payment does not belong to the Fairview Baptist Temple Square location.' });
      return;
    }

    if (req.method === 'POST') {
      const action = String(body.action || '').trim().toLowerCase();
      if (action === 'refund') {
        const existingRefunds = await retrieveRefunds(base, headers, payment.refund_ids);
        if (existingRefunds.some(function (refund) { return refund.status === 'PENDING'; })) {
          res.status(409).json({ error: 'A refund for this payment is still pending in Square. Wait for it to finish before issuing another.' });
          return;
        }
        const error = validateRefund(payment, body);
        if (error) { res.status(error.status).json({ error: error.message }); return; }
        const amount = positiveCents(body.amountCents);
        const reason = cleanReason(body.reason);
        const idempotencyKey = cleanRequestId(body.requestId) || crypto.randomUUID();
        const refundBody = {
          idempotency_key: idempotencyKey,
          payment_id: payment.id,
          amount_money: {
            amount: amount,
            currency: String(payment.amount_money && payment.amount_money.currency || 'USD'),
          },
          reason: reason,
        };
        if (payment.version_token) refundBody.payment_version_token = payment.version_token;
        const response = await fetch(base + '/v2/refunds', {
          method: 'POST', headers: headers, body: JSON.stringify(refundBody),
        });
        const data = await jsonResponse(response);
        if (!response.ok || !data.refund) throw squareError(response, data, 'Square could not issue this refund.');
        payment = await retrievePayment(base, headers, paymentId);
        const detail = await paymentDetail(base, headers, payment);
        const createdRefund = cleanRefund(data.refund);
        if (!detail.refunds.some(function (refund) { return refund.id === createdRefund.id; })) detail.refunds.unshift(createdRefund);
        if (createdRefund.status === 'PENDING') {
          detail.pendingRefund = true;
          detail.refundable = false;
        }
        res.status(200).json({ ok: true, action: action, refund: createdRefund, payment: detail });
        return;
      }

      if (action === 'resend_receipt') {
        const customer = await retrieveCustomer(base, headers, payment.customer_id);
        const parsed = parseGiftNote(payment.note);
        const name = parsed.name || customerName(customer) || cardholderName(payment);
        const email = validEmail(payment.buyer_email_address) ? String(payment.buyer_email_address).trim()
          : (validEmail(customer.email_address) ? String(customer.email_address).trim() : '');
        if (!email) { res.status(409).json({ error: 'This payment does not have a valid receipt email.' }); return; }
        const receipt = await sendGivingReceipt({
          email: email,
          name: name,
          amountCents: moneyAmount(payment.total_money || payment.amount_money),
          note: parsed.fund ? ('Gift - ' + parsed.fund) : 'Online gift',
          recurring: parsed.recurring || !!(payment.card_details && payment.card_details.entry_method === 'ON_FILE'),
          id: payment.id,
          resendToken: crypto.randomUUID(),
        });
        if (!receipt.sent && !receipt.pending) {
          res.status(502).json({ error: receipt.errorMessage || 'The Fairview Baptist Temple receipt could not be sent.' });
          return;
        }
        res.status(200).json({ ok: true, action: action, sent: receipt.sent, pending: receipt.pending === true, email: email });
        return;
      }

      res.status(400).json({ error: 'That payment action is not supported.' });
      return;
    }

    res.status(200).json({ ok: true, payment: await paymentDetail(base, headers, payment) });
  } catch (error) {
    const status = error && error.squareStatus >= 400 && error.squareStatus < 500 ? 400 : 502;
    res.status(status).json({ error: error && error.message ? error.message : 'Square could not manage this payment.' });
  }
};

async function paymentDetail(base, headers, payment) {
  const customer = await retrieveCustomer(base, headers, payment.customer_id);
  const refunds = await retrieveRefunds(base, headers, payment.refund_ids);
  const parsed = parseGiftNote(payment.note);
  const amount = moneyAmount(payment.total_money || payment.amount_money);
  const refunded = moneyAmount(payment.refunded_money);
  const fee = processingFeeAmount(payment);
  const email = validEmail(payment.buyer_email_address) ? String(payment.buyer_email_address).trim()
    : (validEmail(customer.email_address) ? String(customer.email_address).trim() : '');
  const remaining = Math.max(0, amount - refunded);
  const pendingRefund = refunds.some(function (refund) { return refund && refund.status === 'PENDING'; });
  return {
    id: cleanId(payment.id),
    createdAt: String(payment.created_at || ''),
    updatedAt: String(payment.updated_at || ''),
    status: String(payment.status || ''),
    name: String(parsed.name || customerName(customer) || cardholderName(payment) || '').trim().slice(0, 120),
    email: email.slice(0, 254),
    fund: parsed.fund,
    amountCents: amount,
    refundedCents: refunded,
    feeCents: fee,
    netCents: amount - refunded - fee,
    refundableCents: remaining,
    refundable: payment.status === 'COMPLETED' && remaining > 0 && withinRefundWindow(payment.created_at) && !pendingRefund,
    pendingRefund: pendingRefund,
    refundWindowEndsAt: refundWindowEnds(payment.created_at),
    currency: String(payment.amount_money && payment.amount_money.currency || 'USD'),
    method: paymentMethod(payment),
    source: parsed.website ? 'Website' : 'Square',
    recurring: parsed.recurring || !!(payment.card_details && payment.card_details.entry_method === 'ON_FILE'),
    cardOnFile: !!(payment.card_details && payment.card_details.entry_method === 'ON_FILE'),
    receiptNumber: String(payment.receipt_number || ''),
    receiptUrl: safeReceiptUrl(payment.receipt_url),
    refunds: refunds.map(cleanRefund),
  };
}

function validateRefund(payment, body) {
  if (String(body.confirmation || '') !== 'REFUND') return validationError(400, 'Type REFUND exactly to confirm this action.');
  const reason = cleanReason(body.reason);
  if (reason.length < 3) return validationError(400, 'Enter a refund reason with at least 3 characters.');
  const amount = positiveCents(body.amountCents);
  if (!amount) return validationError(400, 'Enter a valid refund amount.');
  if (payment.status !== 'COMPLETED') return validationError(409, 'Only a completed payment can be refunded.');
  if (!withinRefundWindow(payment.created_at)) return validationError(409, 'Square only allows refunds for payments made within the last year.');
  const available = Math.max(0, moneyAmount(payment.total_money || payment.amount_money) - moneyAmount(payment.refunded_money));
  if (!available) return validationError(409, 'This payment has already been fully refunded.');
  if (amount > available) return validationError(400, 'The refund is larger than the remaining refundable amount.');
  return null;
}

function validationError(status, message) { return { status: status, message: message }; }

async function retrievePayment(base, headers, id) {
  const response = await fetch(base + '/v2/payments/' + encodeURIComponent(id), { headers: headers });
  const data = await jsonResponse(response);
  if (!response.ok || !data.payment) throw squareError(response, data, 'Square could not find that payment.');
  return data.payment;
}

async function retrieveCustomer(base, headers, id) {
  id = cleanId(id);
  if (!id) return {};
  const response = await fetch(base + '/v2/customers/' + encodeURIComponent(id), { headers: headers });
  const data = await jsonResponse(response);
  return response.ok && data.customer ? data.customer : {};
}

async function retrieveRefunds(base, headers, values) {
  const ids = (Array.isArray(values) ? values : []).map(cleanId).filter(Boolean).slice(0, 20);
  const refunds = [];
  for (let offset = 0; offset < ids.length; offset += 5) {
    const batch = await Promise.all(ids.slice(offset, offset + 5).map(async function (id) {
      const response = await fetch(base + '/v2/refunds/' + encodeURIComponent(id), { headers: headers });
      const data = await jsonResponse(response);
      return response.ok && data.refund ? data.refund : null;
    }));
    batch.forEach(function (refund) { if (refund) refunds.push(refund); });
  }
  return refunds.sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); });
}

function cleanRefund(refund) {
  return {
    id: cleanId(refund && refund.id),
    status: String(refund && refund.status || ''),
    amountCents: moneyAmount(refund && refund.amount_money),
    reason: String(refund && refund.reason || '').trim().slice(0, 192),
    createdAt: String(refund && refund.created_at || ''),
    updatedAt: String(refund && refund.updated_at || ''),
  };
}

function parseGiftNote(note) {
  note = String(note || '').trim();
  const structured = /^Online (monthly )?gift\s*\|\s*(.*?)\s*\|\s*Donor:\s*(.+)$/i.exec(note);
  if (structured) return { website: true, recurring: !!structured[1], fund: cleanFund(structured[2]), name: String(structured[3] || '').trim().slice(0, 120) };
  if (/^Online gift$/i.test(note)) return { website: true, recurring: false, fund: 'Where needed most', name: '' };
  const legacy = /^(?:Monthly\s+)?Gift\s+[—-]\s+(.+)$/i.exec(note);
  if (legacy) return { website: true, recurring: /^Monthly\s+/i.test(note), fund: cleanFund(legacy[1]), name: '' };
  return { website: false, recurring: false, fund: '', name: '' };
}

function cleanFund(value) {
  value = String(value || '').replace(/[\r\n|]+/g, ' ').trim();
  return (value || 'Where needed most').slice(0, 120);
}

function paymentMethod(payment) {
  const source = String(payment.source_type || '').toUpperCase();
  if (source === 'CARD') {
    const details = payment.card_details || {};
    const card = details.card || {};
    if (details.wallet_type === 'APPLE_PAY') return 'Apple Pay';
    const brand = titleCase(card.card_brand || 'Card');
    return card.last_4 ? (brand + ' ending ' + card.last_4) : brand;
  }
  if (source === 'WALLET') return titleCase(payment.wallet_details && payment.wallet_details.brand || 'Digital wallet');
  return titleCase(source || 'Square');
}

function customerName(customer) {
  customer = customer || {};
  return [customer.given_name, customer.family_name].filter(Boolean).join(' ') || customer.company_name || '';
}

function cardholderName(payment) {
  return payment.card_details && payment.card_details.card && payment.card_details.card.cardholder_name || '';
}

function moneyAmount(money) {
  const amount = parseInt(money && money.amount, 10);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function processingFeeAmount(payment) {
  return (Array.isArray(payment.processing_fee) ? payment.processing_fee : []).reduce(function (total, fee) {
    const amount = parseInt(fee && fee.amount_money && fee.amount_money.amount, 10);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

function withinRefundWindow(value) {
  const created = new Date(value);
  if (isNaN(created)) return false;
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  return created >= cutoff;
}

function refundWindowEnds(value) {
  const created = new Date(value);
  if (isNaN(created)) return '';
  created.setUTCFullYear(created.getUTCFullYear() + 1);
  return created.toISOString();
}

function cleanReason(value) { return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 192); }
function positiveCents(value) {
  const text = String(value == null ? '' : value).trim();
  if (!/^[1-9]\d{0,12}$/.test(text)) return 0;
  const amount = Number(text);
  return Number.isSafeInteger(amount) ? amount : 0;
}
function cleanId(value) { value = String(value || '').trim(); return /^[A-Za-z0-9:_-]{5,255}$/.test(value) ? value : ''; }
function cleanRequestId(value) { value = String(value || '').trim(); return /^[A-Za-z0-9_-]{16,45}$/.test(value) ? value : ''; }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }
function titleCase(value) { return String(value || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, function (letter) { return letter.toUpperCase(); }); }
function safeReceiptUrl(value) { value = String(value || ''); return /^https:\/\/(?:squareup\.com|square\.site)\//i.test(value) ? value : ''; }
function squareHeaders(token) { return { Authorization: 'Bearer ' + token, 'Square-Version': SQUARE_VERSION, 'Content-Type': 'application/json' }; }

function squareError(response, data, fallback) {
  const detail = data && data.errors && data.errors[0] && (data.errors[0].detail || data.errors[0].code);
  const error = new Error(detail || fallback);
  error.squareStatus = response && response.status;
  return error;
}

async function jsonResponse(response) { try { return await response.json(); } catch (error) { return {}; } }

async function requestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch (error) { return {}; } }
  try { return JSON.parse(await readRaw(req) || '{}'); } catch (error) { return {}; }
}

function readRaw(req) {
  return new Promise(function (resolve) {
    let data = '';
    req.on('data', function (chunk) { data += chunk; });
    req.on('end', function () { resolve(data); });
    req.on('error', function () { resolve(''); });
  });
}

module.exports.paymentDetail = paymentDetail;
module.exports.validateRefund = validateRefund;
