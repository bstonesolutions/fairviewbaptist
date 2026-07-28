/* Owner-only giving history for Studio.

   Square remains the source of truth. Reading completed payments directly
   avoids a second ledger that could miss a payment if a database write fails.
   Only non-confidential payment details are returned to the browser. */

const { requireStudioOwner } = require('./_studio-auth');

// Fairview Baptist Temple's Square location. Set SQUARE_LOCATION_ID in the
// host env once the church's Square account is connected.
const LOCATION_ID = '';
const SQUARE_VERSION = '2026-05-20';
const MAX_PAGES = 10;

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }

  const owner = await requireStudioOwner(req, res);
  if (!owner) return;

  const currentYear = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric',
  }).format(new Date()), 10);
  const requestedYear = parseInt(req.query && req.query.year, 10);
  const year = Number.isInteger(requestedYear) && requestedYear >= 2013 && requestedYear <= currentYear
    ? requestedYear : currentYear;
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) { res.status(503).json({ error: 'Square is not configured.' }); return; }

  const base = String(process.env.SQUARE_ENV || 'production').toLowerCase() === 'sandbox'
    ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  const headers = {
    Authorization: 'Bearer ' + token,
    'Square-Version': SQUARE_VERSION,
    'Content-Type': 'application/json',
  };
  const locationId = String(process.env.SQUARE_LOCATION_ID || LOCATION_ID);
  const beginTime = year + '-01-01T05:00:00Z';
  const endTime = year === currentYear ? new Date().toISOString() : (year + 1) + '-01-01T05:00:00Z';

  try {
    const payments = [];
    let cursor = '';
    let page = 0;
    do {
      const params = new URLSearchParams({
        begin_time: beginTime,
        end_time: endTime,
        sort_order: 'DESC',
        sort_field: 'CREATED_AT',
        location_id: locationId,
        limit: '100',
      });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(base + '/v2/payments?' + params.toString(), { headers: headers });
      const data = await response.json();
      if (!response.ok) {
        const detail = data && data.errors && data.errors[0] && (data.errors[0].detail || data.errors[0].code);
        res.status(502).json({ error: detail || 'Square could not load giving history.' });
        return;
      }
      if (Array.isArray(data.payments)) payments.push.apply(payments, data.payments);
      cursor = String(data.cursor || '');
      page += 1;
    } while (cursor && page < MAX_PAGES);

    const completed = payments.filter(function (payment) { return payment && payment.status === 'COMPLETED'; });
    const customers = await loadCustomers(base, headers, completed);
    const gifts = completed.map(function (payment) { return cleanPayment(payment, customers); });

    res.status(200).json({
      ok: true,
      year: year,
      gifts: gifts,
      limited: !!cursor,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(502).json({ error: 'Square could not load giving history. Try again.' });
  }
};

async function loadCustomers(base, headers, payments) {
  const ids = [];
  payments.forEach(function (payment) {
    const id = String(payment.customer_id || '');
    if (id && ids.indexOf(id) < 0) ids.push(id);
  });
  if (!ids.length) return {};
  const customers = {};
  try {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const response = await fetch(base + '/v2/customers/bulk-retrieve', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ customer_ids: ids.slice(offset, offset + 100) }),
      });
      const data = await response.json();
      if (!response.ok || !data.responses) continue;
      Object.keys(data.responses).forEach(function (id) {
        const customer = data.responses[id] && data.responses[id].customer;
        if (customer) customers[id] = customer;
      });
    }
    return customers;
  } catch (error) {
    return customers;
  }
}

function cleanPayment(payment, customers) {
  const parsed = parseGiftNote(payment.note);
  const customer = customers[payment.customer_id] || {};
  const card = payment.card_details && payment.card_details.card || {};
  const customerName = [customer.given_name, customer.family_name].filter(Boolean).join(' ');
  const name = parsed.name || customerName || card.cardholder_name || '';
  const email = String(payment.buyer_email_address || customer.email_address || '').trim();
  const amount = moneyAmount(payment.total_money || payment.amount_money);
  const refunded = moneyAmount(payment.refunded_money);
  const fee = processingFeeAmount(payment);
  const remaining = Math.max(0, amount - refunded);

  return {
    id: String(payment.id || ''),
    createdAt: payment.created_at || '',
    name: String(name).trim().slice(0, 120),
    email: email.slice(0, 254),
    fund: parsed.fund,
    amountCents: amount,
    refundedCents: refunded,
    feeCents: fee,
    netCents: amount - refunded - fee,
    currency: String(payment.amount_money && payment.amount_money.currency || 'USD'),
    status: String(payment.status || ''),
    method: paymentMethod(payment),
    source: parsed.website ? 'Website' : 'Square',
    recurring: parsed.recurring || !!(payment.card_details && payment.card_details.entry_method === 'ON_FILE'),
    cardOnFile: !!(payment.card_details && payment.card_details.entry_method === 'ON_FILE'),
    receiptNumber: String(payment.receipt_number || ''),
    receiptUrl: safeReceiptUrl(payment.receipt_url),
    refundCount: Array.isArray(payment.refund_ids) ? payment.refund_ids.length : 0,
    refundableCents: remaining,
    refundable: remaining > 0 && paymentIsWithinRefundWindow(payment.created_at),
  };
}

function parseGiftNote(note) {
  note = String(note || '').trim();
  const structured = /^Online (monthly )?gift\s*\|\s*(.*?)\s*\|\s*Donor:\s*(.+)$/i.exec(note);
  if (structured) {
    return {
      website: true,
      recurring: !!structured[1],
      fund: cleanFund(structured[2]),
      name: String(structured[3] || '').trim().slice(0, 120),
    };
  }
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
  if (source === 'WALLET') {
    const brand = payment.wallet_details && payment.wallet_details.brand;
    return titleCase(brand || 'Digital wallet');
  }
  return titleCase(source || 'Square');
}

function titleCase(value) {
  return String(value || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
}

function moneyAmount(money) {
  const amount = parseInt(money && money.amount, 10);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function signedMoneyAmount(money) {
  const amount = parseInt(money && money.amount, 10);
  return Number.isFinite(amount) ? amount : 0;
}

function processingFeeAmount(payment) {
  return (Array.isArray(payment.processing_fee) ? payment.processing_fee : []).reduce(function (total, fee) {
    return total + signedMoneyAmount(fee && fee.amount_money);
  }, 0);
}

function paymentIsWithinRefundWindow(value) {
  const created = new Date(value);
  if (isNaN(created)) return false;
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  return created >= cutoff;
}

function safeReceiptUrl(value) {
  value = String(value || '');
  return /^https:\/\/(?:squareup\.com|square\.site)\//i.test(value) ? value : '';
}

module.exports.cleanPayment = cleanPayment;
module.exports.processingFeeAmount = processingFeeAmount;
