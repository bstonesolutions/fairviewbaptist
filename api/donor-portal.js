/* Private donor self-service for Fairview Baptist Temple.

   Access is proved by a short-lived link sent to the email already attached
   to a Square customer or completed payment. Square remains the source of
   truth. The browser receives receipt details and subscription controls only,
   never card credentials, fingerprints, or customer-directory notes. */

const crypto = require('crypto');
const { findMonthlyPlanId } = require('./_square-monthly-plan');
const {
  setPrivateJson, allowSameSite, readJson, rateLimit, cleanText, validEmail,
} = require('./_public-security');

// Fairview Baptist Temple's Square location. Set SQUARE_LOCATION_ID in the
// host env once the church's Square account is connected.
const LOCATION_ID = '';
const SQUARE_VERSION = '2026-05-20';
const TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_PAGES = 10;
const PAYMENT_HISTORY_START = '2018-01-01T00:00:00Z';

module.exports = async function handler(req, res) {
  setPrivateJson(res);
  if (!allowSameSite(req, res, ['POST'])) return;
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) { res.status(503).json({ error: 'Giving records are temporarily unavailable.' }); return; }
  const square = squareContext(token);

  try {
    const body = await readJson(req, 24576);
    const action = cleanText(body.action, 40).toLowerCase();
    if (action === 'view') {
      const limited = rateLimit(req, 'donor-view', 45, 10 * 60 * 1000);
      if (!limited.allowed) {
        res.setHeader('Retry-After', String(limited.retryAfter));
        res.status(429).json({ error: 'Too many requests. Wait a few minutes and try again.' });
        return;
      }
      const access = openAccess(body.access, token);
      const profile = await loadDonor(square, access.email);
      res.status(200).json(publicProfile(profile, access.expiresAt));
      return;
    }
    if (action === 'request') {
      if (!String(process.env.RESEND_API_KEY || '').trim()) {
        res.status(503).json({ error: 'Private giving links are temporarily unavailable. Please try again later or contact Fairview Baptist Temple.' });
        return;
      }
      const email = validEmail(body.email);
      if (!email) { res.status(400).json({ error: 'Enter a valid email address.' }); return; }
      if (cleanText(body.website, 120)) {
        res.status(200).json(genericAccessResponse());
        return;
      }
      const byIp = rateLimit(req, 'donor-request', 5, 20 * 60 * 1000);
      const byEmail = rateLimit(req, 'donor-email', 3, 30 * 60 * 1000, email);
      if (!byIp.allowed || !byEmail.allowed) {
        const retryAfter = Math.max(byIp.retryAfter, byEmail.retryAfter);
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({ error: 'Too many link requests. Wait a little while and try again.' });
        return;
      }
      const profile = await loadDonor(square, email);
      if (profile.payments.length || profile.subscriptions.length) {
        const sealed = sealAccess(email, token);
        const sent = await sendAccessEmail(email, profile.name, sealed.token, sealed.expiresAt);
        if (!sent) logOperationalError('access-email-delivery');
      }
      res.status(200).json(genericAccessResponse());
      return;
    }

    const managed = rateLimit(req, 'donor-manage', 20, 10 * 60 * 1000);
    if (!managed.allowed) {
      res.setHeader('Retry-After', String(managed.retryAfter));
      res.status(429).json({ error: 'Too many changes were requested. Wait a few minutes and try again.' });
      return;
    }
    const access = openAccess(body.access, token);
    const profile = await loadDonor(square, access.email);
    await manageSubscription(square, profile, body, action);
    const refreshed = await loadDonor(square, access.email);
    res.status(200).json(publicProfile(refreshed, access.expiresAt));
  } catch (error) {
    if (error && error.statusCode) {
      res.status(error.statusCode).json({ error: error.publicMessage || 'That request could not be completed.' });
      return;
    }
    if (error && error.publicMessage) {
      const status = error.squareStatus >= 400 && error.squareStatus < 500 ? 400 : 502;
      res.status(status).json({ error: error.publicMessage });
      return;
    }
    logOperationalError('unexpected-portal-error', error);
    res.status(502).json({ error: 'Giving records are temporarily unavailable. Please try again in a few minutes.' });
  }
};

function squareContext(token) {
  const base = String(process.env.SQUARE_ENV || 'production').toLowerCase() === 'sandbox'
    ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  return {
    token: token,
    base: base,
    locationId: String(process.env.SQUARE_LOCATION_ID || LOCATION_ID),
    headers: {
      Authorization: 'Bearer ' + token,
      'Square-Version': SQUARE_VERSION,
      'Content-Type': 'application/json',
    },
  };
}

async function loadDonor(square, email) {
  const customers = await searchCustomers(square, email);
  const customerIds = customers.map(function (customer) { return cleanId(customer.id); }).filter(Boolean);
  const pair = await Promise.all([
    listPayments(square),
    searchSubscriptions(square, customerIds),
  ]);
  const payments = pair[0].filter(function (payment) {
    const buyer = validEmail(payment.buyer_email_address);
    return (buyer && buyer === email) || customerIds.indexOf(cleanId(payment.customer_id)) >= 0;
  }).filter(function (payment) { return payment.status === 'COMPLETED'; });
  const subscriptions = pair[1].filter(function (subscription) {
    return customerIds.indexOf(cleanId(subscription.customer_id)) >= 0;
  });
  await hydrateSubscriptionAmounts(square, subscriptions);
  const customerById = {};
  customers.forEach(function (customer) { customerById[customer.id] = customer; });
  const name = customers.map(customerName).find(Boolean) || paymentName(payments[0]) || '';
  return {
    email: email,
    name: name,
    customerIds: customerIds,
    receiptHistoryLimited: pair[0].limited === true,
    payments: payments.map(cleanPayment).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); }),
    subscriptions: subscriptions.map(function (subscription) {
      return cleanSubscription(subscription, customerById[subscription.customer_id]);
    }).sort(subscriptionSort),
  };
}

async function searchCustomers(square, email) {
  const customers = [];
  let cursor = '';
  let page = 0;
  do {
    const body = {
      limit: 100,
      query: { filter: { email_address: { exact: email } } },
    };
    if (cursor) body.cursor = cursor;
    const response = await fetch(square.base + '/v2/customers/search', {
      method: 'POST', headers: square.headers, body: JSON.stringify(body),
    });
    const data = await jsonResponse(response);
    if (!response.ok) throw squareError(response, data, 'Square could not verify that email address.');
    (Array.isArray(data.customers) ? data.customers : []).forEach(function (customer) {
      if (validEmail(customer && customer.email_address) === email) customers.push(customer);
    });
    cursor = String(data.cursor || '');
    page += 1;
  } while (cursor && page < MAX_PAGES);
  return customers;
}

async function listPayments(square) {
  const payments = [];
  let cursor = '';
  let page = 0;
  do {
    const params = new URLSearchParams({
      begin_time: PAYMENT_HISTORY_START,
      end_time: new Date().toISOString(),
      sort_order: 'DESC',
      sort_field: 'CREATED_AT',
      location_id: square.locationId,
      limit: '100',
    });
    if (cursor) params.set('cursor', cursor);
    const response = await fetch(square.base + '/v2/payments?' + params.toString(), { headers: square.headers });
    const data = await jsonResponse(response);
    if (!response.ok) throw squareError(response, data, 'Square could not load giving receipts.');
    if (Array.isArray(data.payments)) payments.push.apply(payments, data.payments);
    cursor = String(data.cursor || '');
    page += 1;
  } while (cursor && page < MAX_PAGES);
  payments.limited = !!cursor;
  return payments;
}

async function searchSubscriptions(square, customerIds) {
  const subscriptions = [];
  const ids = Array.from(new Set((Array.isArray(customerIds) ? customerIds : []).map(cleanId).filter(Boolean)));
  if (!ids.length) return subscriptions;
  const planId = await findMonthlyPlanId({ base: square.base, token: square.token });
  if (!planId) return subscriptions;
  for (let offset = 0; offset < ids.length; offset += 100) {
    let cursor = '';
    let page = 0;
    do {
      const body = {
        limit: 100,
        include: ['actions'],
        query: { filter: { location_ids: [square.locationId], customer_ids: ids.slice(offset, offset + 100) } },
      };
      if (cursor) body.cursor = cursor;
      const response = await fetch(square.base + '/v2/subscriptions/search', {
        method: 'POST', headers: square.headers, body: JSON.stringify(body),
      });
      const data = await jsonResponse(response);
      if (!response.ok) throw squareError(response, data, 'Square could not load monthly gifts.');
      (Array.isArray(data.subscriptions) ? data.subscriptions : []).forEach(function (subscription) {
        if (subscription && subscription.plan_variation_id === planId) subscriptions.push(subscription);
      });
      cursor = String(data.cursor || '');
      page += 1;
      if (cursor && page >= MAX_PAGES) subscriptions.limited = true;
    } while (cursor && page < MAX_PAGES);
  }
  return subscriptions;
}

async function hydrateSubscriptionAmounts(square, subscriptions) {
  const missing = subscriptions.filter(function (subscription) {
    return !positiveCents(subscription && subscription.price_override_money && subscription.price_override_money.amount);
  });
  for (let offset = 0; offset < missing.length; offset += 5) {
    await Promise.all(missing.slice(offset, offset + 5).map(async function (subscription) {
      const ids = (Array.isArray(subscription.invoice_ids) ? subscription.invoice_ids : []).slice(0, 3);
      for (const invoiceId of ids) {
        const response = await fetch(square.base + '/v2/invoices/' + encodeURIComponent(invoiceId), { headers: square.headers });
        const data = await jsonResponse(response);
        if (!response.ok || !data.invoice || (data.invoice.location_id && data.invoice.location_id !== square.locationId)) continue;
        const requests = Array.isArray(data.invoice.payment_requests) ? data.invoice.payment_requests : [];
        const amount = requests.reduce(function (sum, request) {
          return sum + positiveCents(request && request.computed_amount_money && request.computed_amount_money.amount);
        }, 0);
        if (amount) {
          subscription.resolved_price_money = { amount: amount, currency: 'USD' };
          return;
        }
      }
    }));
  }
}

async function manageSubscription(square, profile, body, action) {
  if (['pause', 'resume', 'cancel', 'undo', 'amount'].indexOf(action) < 0) {
    throw publicError(400, 'That monthly giving action is not supported.');
  }
  const subscriptionId = cleanId(body.subscriptionId);
  if (!subscriptionId) throw publicError(400, 'The monthly gift reference is missing.');
  const subscription = await retrieveSubscription(square, subscriptionId);
  const planId = await findMonthlyPlanId({ base: square.base, token: square.token });
  if (!planId) throw publicError(503, 'Monthly giving controls are temporarily unavailable. Please contact Fairview Baptist Temple for help.');
  if (subscription.location_id !== square.locationId || subscription.plan_variation_id !== planId ||
      profile.customerIds.indexOf(cleanId(subscription.customer_id)) < 0) {
    throw publicError(403, 'That monthly gift is not available through this private link.');
  }
  const pending = Array.isArray(subscription.actions) ? subscription.actions : [];
  const hasPendingChange = pending.some(function (item) {
    return ['PAUSE', 'RESUME', 'CANCEL'].indexOf(String(item.type || '').toUpperCase()) >= 0;
  });

  if (action === 'pause') {
    if (subscription.status !== 'ACTIVE' || hasPendingChange) throw publicError(409, 'This monthly gift cannot be paused in its current state.');
    await squareAction(square, subscriptionId, 'pause', { pause_reason: 'Donor requested pause through the Fairview Baptist Temple website' });
    return;
  }
  if (action === 'resume') {
    if (['PAUSED', 'DEACTIVATED'].indexOf(subscription.status) < 0 || hasPendingChange) {
      throw publicError(409, 'Only a paused monthly gift can be resumed.');
    }
    await squareAction(square, subscriptionId, 'resume');
    return;
  }
  if (action === 'cancel') {
    if (cleanText(body.confirmation, 20).toUpperCase() !== 'CANCEL') {
      throw publicError(400, 'Type CANCEL exactly to confirm this change.');
    }
    if (['ACTIVE', 'PAUSED', 'DEACTIVATED'].indexOf(subscription.status) < 0 || hasPendingChange) {
      throw publicError(409, 'This monthly gift cannot be canceled in its current state.');
    }
    await squareAction(square, subscriptionId, 'cancel');
    return;
  }
  if (action === 'undo') {
    const actionId = cleanId(body.actionId);
    const scheduled = pending.find(function (item) { return cleanId(item.id) === actionId; });
    if (!scheduled || ['PAUSE', 'RESUME', 'CANCEL'].indexOf(String(scheduled.type || '').toUpperCase()) < 0) {
      throw publicError(409, 'That scheduled change is no longer available to undo.');
    }
    const response = await fetch(square.base + '/v2/subscriptions/' + encodeURIComponent(subscriptionId) +
      '/actions/' + encodeURIComponent(actionId), { method: 'DELETE', headers: square.headers });
    const data = await jsonResponse(response);
    if (!response.ok) throw squareError(response, data, 'Square could not undo that scheduled change.');
    return;
  }

  const amountCents = strictCents(body.amountCents);
  if (cleanText(body.confirmation, 20).toUpperCase() !== 'CHANGE') {
    throw publicError(400, 'Type CHANGE exactly to confirm the new monthly amount.');
  }
  if (!amountCents || amountCents < 100 || amountCents > 5000000) {
    throw publicError(400, 'Enter a monthly amount between $1 and $50,000.');
  }
  if (['ACTIVE', 'PAUSED', 'DEACTIVATED'].indexOf(subscription.status) < 0 ||
      pending.some(function (item) { return String(item.type || '').toUpperCase() === 'CANCEL'; })) {
    throw publicError(409, 'This monthly amount cannot be changed in its current state.');
  }
  const response = await fetch(square.base + '/v2/subscriptions/' + encodeURIComponent(subscriptionId), {
    method: 'PUT',
    headers: square.headers,
    body: JSON.stringify({
      subscription: {
        version: subscription.version,
        price_override_money: { amount: amountCents, currency: 'USD' },
      },
    }),
  });
  const data = await jsonResponse(response);
  if (!response.ok) throw squareError(response, data, 'Square could not update the monthly amount.');
}

async function retrieveSubscription(square, id) {
  const response = await fetch(square.base + '/v2/subscriptions/' + encodeURIComponent(id) + '?include=actions', { headers: square.headers });
  const data = await jsonResponse(response);
  if (!response.ok || !data.subscription) throw squareError(response, data, 'Square could not find that monthly gift.');
  if (Array.isArray(data.actions) && !data.subscription.actions) data.subscription.actions = data.actions;
  return data.subscription;
}

async function squareAction(square, subscriptionId, action, body) {
  const options = { method: 'POST', headers: square.headers };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(square.base + '/v2/subscriptions/' + encodeURIComponent(subscriptionId) + '/' + action, options);
  const data = await jsonResponse(response);
  if (!response.ok) throw squareError(response, data, 'Square could not ' + action + ' this monthly gift.');
}

function publicProfile(profile, expiresAt) {
  const now = Date.now();
  const yearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const recent = profile.payments.filter(function (payment) { return new Date(payment.createdAt).getTime() >= yearAgo; });
  return {
    ok: true,
    name: profile.name,
    email: maskEmail(profile.email),
    accessExpiresAt: new Date(expiresAt).toISOString(),
    summary: {
      givenLast12MonthsCents: recent.reduce(function (sum, payment) { return sum + Math.max(0, payment.amountCents - payment.refundedCents); }, 0),
      receiptCount: profile.payments.length,
      activeMonthlyCount: profile.subscriptions.filter(function (subscription) {
        return ['ACTIVE', 'PAUSED', 'DEACTIVATED', 'PENDING'].indexOf(subscription.status) >= 0;
      }).length,
    },
    receiptHistoryLimited: profile.receiptHistoryLimited === true,
    subscriptions: profile.subscriptions,
    receipts: profile.payments,
  };
}

function cleanPayment(payment) {
  const amount = moneyAmount(payment.total_money || payment.amount_money);
  const refunded = moneyAmount(payment.refunded_money);
  const parsed = parseGiftNote(payment.note);
  return {
    id: cleanId(payment.id),
    createdAt: String(payment.created_at || ''),
    amountCents: amount,
    refundedCents: refunded,
    currency: String(payment.amount_money && payment.amount_money.currency || 'USD'),
    fund: parsed.fund,
    method: paymentMethod(payment),
    receiptNumber: cleanText(payment.receipt_number, 60),
    receiptUrl: safeReceiptUrl(payment.receipt_url),
    recurring: parsed.recurring || String(payment.card_details && payment.card_details.entry_method || '').toUpperCase() === 'ON_FILE',
  };
}

function cleanSubscription(subscription, customer) {
  const rawMoney = positiveCents(subscription.price_override_money && subscription.price_override_money.amount)
    ? subscription.price_override_money : (subscription.resolved_price_money || {});
  return {
    id: cleanId(subscription.id),
    name: customerName(customer),
    status: String(subscription.status || '').toUpperCase(),
    amountCents: positiveCents(rawMoney.amount),
    currency: String(rawMoney.currency || 'USD'),
    startDate: cleanDate(subscription.start_date),
    chargedThroughDate: cleanDate(subscription.charged_through_date),
    paidUntilDate: cleanDate(subscription.paid_until_date),
    canceledDate: cleanDate(subscription.canceled_date),
    actions: (Array.isArray(subscription.actions) ? subscription.actions : []).map(function (item) {
      return { id: cleanId(item.id), type: String(item.type || '').toUpperCase(), effectiveDate: cleanDate(item.effective_date) };
    }).filter(function (item) { return item.id && item.type; }),
  };
}

function sealAccess(email, squareToken) {
  const now = Date.now();
  const expiresAt = now + TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ email: email, issuedAt: now, expiresAt: expiresAt, nonce: crypto.randomUUID() }));
  const key = accessKey(squareToken);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('fbt-donor-access-v1'));
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { token: ['v1', b64(iv), b64(encrypted), b64(tag)].join('.'), expiresAt: expiresAt };
}

function openAccess(value, squareToken) {
  try {
    const parts = String(value || '').split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('bad token');
    const decipher = crypto.createDecipheriv('aes-256-gcm', accessKey(squareToken), unb64(parts[1]));
    decipher.setAAD(Buffer.from('fbt-donor-access-v1'));
    decipher.setAuthTag(unb64(parts[3]));
    const payload = JSON.parse(Buffer.concat([decipher.update(unb64(parts[2])), decipher.final()]).toString('utf8'));
    const email = validEmail(payload.email);
    const expiresAt = Number(payload.expiresAt);
    if (!email || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + TOKEN_TTL_MS + 60000) {
      throw new Error('expired token');
    }
    return { email: email, expiresAt: expiresAt };
  } catch (error) {
    throw publicError(401, 'This private link has expired or is no longer valid. Request a new link.');
  }
}

function accessKey(squareToken) {
  const configured = String(process.env.DONOR_PORTAL_SECRET || '').trim();
  // The Square credential is already high entropy. Combining it with the
  // optional dedicated secret means a weakly configured extra value can never
  // replace and weaken the root key.
  const source = String(squareToken || '') + '\0' + configured;
  return crypto.createHash('sha256').update('fbt-donor-portal-v1\0' + source).digest();
}

async function sendAccessEmail(email, name, access, expiresAt) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.RESEND_FROM || 'Fairview Baptist Temple <onboarding@resend.dev>';
  // Keep the credential in the URL fragment. Browsers do not send fragments
  // to Vercel, so the private token is absent from request and access logs.
  const url = 'https://fairviewbaptisttemple.com/manage-giving#access=' + encodeURIComponent(access);
  const first = cleanText(name, 120).split(/\s+/)[0];
  const greeting = first ? ('Hi ' + esc(first) + ',') : 'Hi,';
  const html = '<div style="max-width:540px;margin:0 auto;font-family:\'Source Sans 3\',Arial,Helvetica,sans-serif;color:#1F3238;">' +
    '<div style="text-align:center;padding:8px 0 20px;"><img src="https://fairviewbaptisttemple.com/assets/logo-full-color.png" alt="Fairview Baptist Temple" style="height:44px;width:auto;"></div>' +
    '<div style="background:#FAF6ED;border:1px solid #E4DCC9;border-radius:14px;padding:30px 27px;">' +
    '<p style="margin:0 0 12px;color:#4C5B4F;font-size:15px;line-height:1.6;">' + greeting + '</p>' +
    '<h1 style="margin:0 0 10px;font-family:Fraunces,Georgia,serif;font-weight:600;font-size:23px;color:#14424A;">Your private giving link</h1>' +
    '<p style="margin:0 0 24px;color:#4C5B4F;font-size:15px;line-height:1.6;">Use this private link to view your Square receipts and manage a monthly gift to Fairview Baptist Temple. It expires in 30 minutes.</p>' +
    '<p style="margin:0;text-align:center;"><a href="' + esc(url) + '" style="display:inline-block;background:#177E79;color:#FCF8EE;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px;">Open my giving</a></p>' +
    '<p style="margin:22px 0 0;color:#7C8578;font-size:12px;line-height:1.5;">If you did not request this link, you can safely ignore this email. Do not forward it to anyone.</p>' +
    '</div><p style="text-align:center;color:#7C8578;font-size:12px;line-height:1.6;margin:20px 0 0;">Fairview Baptist Temple<br>2294 Main Street, Clay, WV 25043</p></div>';
  const text = (first ? ('Hi ' + first + ',\n\n') : 'Hi,\n\n') +
    'Use this private link to view your Square receipts and manage a monthly gift to Fairview Baptist Temple. It expires in 30 minutes.\n\n' +
    url + '\n\nIf you did not request this link, you can ignore this email. Do not forward it.\n\nFairview Baptist Temple, Clay, West Virginia';
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 7000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'donor-access/' + crypto.randomUUID(),
      },
      body: JSON.stringify({
        from: from,
        to: [email],
        subject: 'Your private giving link - Fairview Baptist Temple',
        html: html,
        text: text,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch (error) {
    clearTimeout(timer);
    return false;
  }
}

function genericAccessResponse() {
  return { ok: true, message: 'If that email matches a giving record, a private link is on its way.' };
}

function logOperationalError(code, error) {
  const detail = error && error.name ? String(error.name).slice(0, 80) : '';
  console.error('[donor-portal]', code, detail);
}

function accessError(status, message) { return publicError(status, message); }
function publicError(status, message) {
  const error = new Error(message);
  error.statusCode = status;
  error.publicMessage = message;
  return error;
}
function squareError(response, data, fallback) {
  const detail = data && data.errors && data.errors[0] && (data.errors[0].detail || data.errors[0].code);
  const error = new Error(detail || fallback);
  error.squareStatus = response && response.status;
  error.publicMessage = fallback;
  return error;
}
function jsonResponse(response) { return response.json().catch(function () { return {}; }); }
function cleanId(value) { value = String(value || '').trim(); return /^[A-Za-z0-9:_-]{5,255}$/.test(value) ? value : ''; }
function cleanDate(value) { value = String(value || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''; }
function positiveCents(value) { const n = parseInt(value, 10); return Number.isFinite(n) && n > 0 ? n : 0; }
function strictCents(value) { const raw = String(value == null ? '' : value).trim(); return /^\d+$/.test(raw) ? parseInt(raw, 10) : 0; }
function moneyAmount(money) { return positiveCents(money && money.amount); }
function titleCase(value) { return String(value || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, function (letter) { return letter.toUpperCase(); }); }
function paymentMethod(payment) {
  const details = payment && payment.card_details || {};
  const wallet = String(details.wallet_type || '').toUpperCase();
  if (wallet) return titleCase(wallet);
  const source = String(payment && payment.source_type || '').toUpperCase();
  if (source === 'WALLET') {
    return titleCase(payment && payment.wallet_details && payment.wallet_details.brand || 'Digital wallet');
  }
  const card = details.card || {};
  return card.card_brand ? titleCase(card.card_brand) + (card.last_4 ? ' ending ' + card.last_4 : '') : titleCase(source || 'Square');
}
function customerName(customer) { customer = customer || {}; return cleanText([customer.given_name, customer.family_name].filter(Boolean).join(' ') || customer.company_name || '', 120); }
function paymentName(payment) { const parsed = parseGiftNote(payment && payment.note); return parsed.name || cleanText(payment && payment.card_details && payment.card_details.card && payment.card_details.card.cardholder_name, 120); }
function parseGiftNote(note) {
  note = String(note || '').trim();
  const structured = /^Online (monthly )?gift\s*\|\s*(.*?)\s*\|\s*Donor:\s*(.+)$/i.exec(note);
  if (structured) return { recurring: !!structured[1], fund: cleanText(structured[2], 120) || 'Where needed most', name: cleanText(structured[3], 120) };
  const legacy = /^(?:Monthly\s+)?Gift\s+[—-]\s+(.+)$/i.exec(note);
  return { recurring: /^Monthly\s+/i.test(note), fund: legacy ? cleanText(legacy[1], 120) : 'Where needed most', name: '' };
}
function safeReceiptUrl(value) { value = String(value || ''); return /^https:\/\/(?:squareup\.com|square\.site)\//i.test(value) ? value : ''; }
function maskEmail(email) { const parts = String(email || '').split('@'); if (parts.length !== 2) return ''; return parts[0].slice(0, 2) + '***@' + parts[1]; }
function subscriptionSort(a, b) {
  const rank = { ACTIVE: 0, PAUSED: 1, DEACTIVATED: 2, PENDING: 3, CANCELED: 4, COMPLETED: 5 };
  return (rank[a.status] == null ? 9 : rank[a.status]) - (rank[b.status] == null ? 9 : rank[b.status]);
}
function b64(buffer) { return buffer.toString('base64url'); }
function unb64(value) { return Buffer.from(value, 'base64url'); }
function esc(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

module.exports.sealAccess = sealAccess;
module.exports.openAccess = openAccess;
module.exports.cleanPayment = cleanPayment;
module.exports.accessError = accessError;
