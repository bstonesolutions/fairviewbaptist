/* Owner-only monthly giving management for Studio.

   Square remains the source of truth. Studio receives only the donor details,
   amount, status, billing dates, and scheduled actions needed to manage the
   Fairview Baptist Temple monthly giving plan. Card details never pass through
   this endpoint. */

const { requireStudioOwner } = require('./_studio-auth');
const { resolveMonthlyPlanId } = require('./_square-monthly-plan');

// Fairview Baptist Temple's Square location. Set SQUARE_LOCATION_ID in the
// host env once the church's Square account is connected.
const LOCATION_ID = '';
const SQUARE_VERSION = '2026-05-20';
const MAX_PAGES = 10;

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
    const planId = await resolveMonthlyPlanId({ base: base, token: token });
    if (req.method === 'GET') {
      const subscriptions = await searchSubscriptions(base, headers, locationId, planId);
      await hydrateSubscriptionAmounts(base, headers, locationId, subscriptions);
      const customers = await loadCustomers(base, headers, subscriptions);
      const clean = subscriptions.map(function (subscription) {
        return cleanSubscription(subscription, customers[subscription.customer_id]);
      }).sort(subscriptionSort);
      res.status(200).json({
        ok: true,
        subscriptions: clean,
        limited: subscriptions.limited === true,
        refreshedAt: new Date().toISOString(),
      });
      return;
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch (error) { body = {}; }
    } else if (!body || typeof body !== 'object') {
      try { body = JSON.parse(await readRaw(req) || '{}'); } catch (error) { body = {}; }
    }
    const subscriptionId = cleanId(body.subscriptionId);
    const action = String(body.action || '').trim().toLowerCase();
    const actionId = cleanId(body.actionId);
    if (!subscriptionId) { res.status(400).json({ error: 'The monthly gift reference is missing.' }); return; }
    if (['pause', 'resume', 'cancel', 'undo'].indexOf(action) < 0) {
      res.status(400).json({ error: 'That monthly giving action is not supported.' });
      return;
    }

    const subscription = await retrieveSubscription(base, headers, subscriptionId);
    if (subscription.location_id !== locationId || subscription.plan_variation_id !== planId) {
      res.status(403).json({ error: 'That subscription does not belong to the Fairview Baptist Temple monthly giving plan.' });
      return;
    }
    const pending = Array.isArray(subscription.actions) ? subscription.actions : [];
    const hasPendingChange = pending.some(function (item) {
      return ['PAUSE', 'RESUME', 'CANCEL'].indexOf(item.type) >= 0;
    });
    if (action === 'pause') {
      if (subscription.status !== 'ACTIVE' || hasPendingChange) {
        res.status(409).json({ error: 'This monthly gift cannot be paused in its current state.' });
        return;
      }
      await squareAction(base, headers, subscriptionId, 'pause', {
        pause_reason: 'Donor requested pause through the Fairview Baptist Temple Studio',
      });
    } else if (action === 'resume') {
      if ((subscription.status !== 'PAUSED' && subscription.status !== 'DEACTIVATED') || hasPendingChange) {
        res.status(409).json({ error: 'Only a paused monthly gift can be resumed.' });
        return;
      }
      await squareAction(base, headers, subscriptionId, 'resume');
    } else if (action === 'cancel') {
      if (['ACTIVE', 'PAUSED', 'DEACTIVATED'].indexOf(subscription.status) < 0 || hasPendingChange) {
        res.status(409).json({ error: 'This monthly gift cannot be canceled in its current state.' });
        return;
      }
      await squareAction(base, headers, subscriptionId, 'cancel');
    } else {
      const scheduled = pending.find(function (item) { return item.id === actionId; });
      if (!scheduled || ['PAUSE', 'RESUME', 'CANCEL'].indexOf(scheduled.type) < 0) {
        res.status(409).json({ error: 'That scheduled change is no longer available to undo.' });
        return;
      }
      await deleteAction(base, headers, subscriptionId, actionId);
    }

    res.status(200).json({ ok: true, action: action });
  } catch (error) {
    const status = error && error.squareStatus >= 400 && error.squareStatus < 500 ? 400 : 502;
    res.status(status).json({ error: error && error.message ? error.message : 'Square could not manage this monthly gift.' });
  }
};

async function searchSubscriptions(base, headers, locationId, planId) {
  const subscriptions = [];
  let cursor = '';
  let page = 0;
  do {
    const body = {
      limit: 100,
      include: ['actions'],
      query: { filter: { location_ids: [locationId] } },
    };
    if (cursor) body.cursor = cursor;
    const response = await fetch(base + '/v2/subscriptions/search', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
    const data = await jsonResponse(response);
    if (!response.ok) throw squareError(response, data, 'Square could not load monthly gifts.');
    if (Array.isArray(data.subscriptions)) {
      data.subscriptions.forEach(function (subscription) {
        if (subscription && subscription.plan_variation_id === planId) subscriptions.push(subscription);
      });
    }
    cursor = String(data.cursor || '');
    page += 1;
  } while (cursor && page < MAX_PAGES);
  subscriptions.limited = !!cursor;
  return subscriptions;
}

async function retrieveSubscription(base, headers, subscriptionId) {
  const response = await fetch(base + '/v2/subscriptions/' + encodeURIComponent(subscriptionId) + '?include=actions', { headers: headers });
  const data = await jsonResponse(response);
  if (!response.ok || !data.subscription) throw squareError(response, data, 'Square could not find that monthly gift.');
  return data.subscription;
}

async function hydrateSubscriptionAmounts(base, headers, locationId, subscriptions) {
  const missing = subscriptions.filter(function (subscription) {
    return !positiveMoney(subscription && subscription.price_override_money && subscription.price_override_money.amount);
  });
  for (let offset = 0; offset < missing.length; offset += 5) {
    await Promise.all(missing.slice(offset, offset + 5).map(async function (subscription) {
      let invoiceIds = validInvoiceIds(subscription.invoice_ids);
      if (!invoiceIds.length) {
        try {
          const complete = await retrieveSubscription(base, headers, subscription.id);
          if (complete.price_override_money) subscription.price_override_money = complete.price_override_money;
          if (Array.isArray(complete.invoice_ids)) subscription.invoice_ids = complete.invoice_ids;
          invoiceIds = validInvoiceIds(subscription.invoice_ids);
        } catch (error) {
          return;
        }
      }
      if (positiveMoney(subscription.price_override_money && subscription.price_override_money.amount)) return;
      for (const invoiceId of invoiceIds.slice(0, 3)) {
        try {
          const money = await retrieveInvoiceMoney(base, headers, locationId, invoiceId);
          if (money) {
            subscription.resolved_price_money = money;
            return;
          }
        } catch (error) {
          // A newer invoice can be unavailable briefly while Square publishes it.
        }
      }
    }));
  }
}

async function retrieveInvoiceMoney(base, headers, locationId, invoiceId) {
  const response = await fetch(base + '/v2/invoices/' + encodeURIComponent(invoiceId), { headers: headers });
  const data = await jsonResponse(response);
  if (!response.ok || !data.invoice) throw squareError(response, data, 'Square could not read the monthly gift invoice.');
  if (data.invoice.location_id && data.invoice.location_id !== locationId) return null;
  return invoiceMoney(data.invoice);
}

function invoiceMoney(invoice) {
  const requests = Array.isArray(invoice.payment_requests) ? invoice.payment_requests : [];
  let total = 0;
  let currency = '';
  requests.forEach(function (request) {
    const money = request && request.computed_amount_money;
    const amount = positiveMoney(money && money.amount);
    if (amount) {
      total += amount;
      if (!currency) currency = String(money.currency || 'USD');
    }
  });
  if (total) return { amount: total, currency: currency || 'USD' };
  const next = invoice.next_payment_amount_money || {};
  if (positiveMoney(next.amount)) return { amount: positiveMoney(next.amount), currency: String(next.currency || 'USD') };
  total = 0;
  requests.forEach(function (request) {
    const money = request && request.total_completed_amount_money;
    const amount = positiveMoney(money && money.amount);
    if (amount) {
      total += amount;
      if (!currency) currency = String(money.currency || 'USD');
    }
  });
  return total ? { amount: total, currency: currency || 'USD' } : null;
}

function validInvoiceIds(values) {
  return (Array.isArray(values) ? values : []).map(cleanId).filter(Boolean);
}

async function squareAction(base, headers, subscriptionId, action, body) {
  const options = { method: 'POST', headers: headers };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(base + '/v2/subscriptions/' + encodeURIComponent(subscriptionId) + '/' + action, options);
  const data = await jsonResponse(response);
  if (!response.ok) throw squareError(response, data, 'Square could not ' + action + ' this monthly gift.');
}

async function deleteAction(base, headers, subscriptionId, actionId) {
  const response = await fetch(base + '/v2/subscriptions/' + encodeURIComponent(subscriptionId) + '/actions/' + encodeURIComponent(actionId), {
    method: 'DELETE',
    headers: headers,
  });
  const data = await jsonResponse(response);
  if (!response.ok) throw squareError(response, data, 'Square could not undo that scheduled change.');
}

async function loadCustomers(base, headers, subscriptions) {
  const ids = [];
  subscriptions.forEach(function (subscription) {
    const id = cleanId(subscription && subscription.customer_id);
    if (id && ids.indexOf(id) < 0) ids.push(id);
  });
  const customers = {};
  for (let offset = 0; offset < ids.length; offset += 100) {
    const response = await fetch(base + '/v2/customers/bulk-retrieve', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ customer_ids: ids.slice(offset, offset + 100) }),
    });
    const data = await jsonResponse(response);
    if (!response.ok) throw squareError(response, data, 'Square could not load monthly giver details.');
    Object.keys(data.responses || {}).forEach(function (id) {
      const customer = data.responses[id] && data.responses[id].customer;
      if (customer) customers[id] = customer;
    });
  }
  return customers;
}

function cleanSubscription(subscription, customer) {
  customer = customer || {};
  const name = [customer.given_name, customer.family_name].filter(Boolean).join(' ');
  const override = subscription.price_override_money || {};
  const money = positiveMoney(override.amount) ? override : (subscription.resolved_price_money || {});
  const actions = Array.isArray(subscription.actions) ? subscription.actions.map(function (action) {
    return {
      id: cleanId(action.id),
      type: String(action.type || '').toUpperCase(),
      effectiveDate: cleanDate(action.effective_date),
    };
  }).filter(function (action) { return action.id && action.type; }) : [];
  return {
    id: cleanId(subscription.id),
    name: String(name || customer.company_name || '').trim().slice(0, 120),
    email: validEmail(customer.email_address) ? String(customer.email_address).trim().slice(0, 254) : '',
    status: String(subscription.status || '').toUpperCase(),
    amountCents: positiveMoney(money.amount),
    currency: String(money.currency || 'USD'),
    startDate: cleanDate(subscription.start_date),
    chargedThroughDate: cleanDate(subscription.charged_through_date),
    paidUntilDate: cleanDate(subscription.paid_until_date),
    canceledDate: cleanDate(subscription.canceled_date),
    createdAt: String(subscription.created_at || ''),
    actions: actions,
  };
}

function subscriptionSort(a, b) {
  const rank = { ACTIVE: 0, PAUSED: 1, PENDING: 2, DEACTIVATED: 3, CANCELED: 4, COMPLETED: 5 };
  const aRank = Object.prototype.hasOwnProperty.call(rank, a.status) ? rank[a.status] : 9;
  const bRank = Object.prototype.hasOwnProperty.call(rank, b.status) ? rank[b.status] : 9;
  if (aRank !== bRank) return aRank - bRank;
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

function squareHeaders(token) {
  return {
    Authorization: 'Bearer ' + token,
    'Square-Version': SQUARE_VERSION,
    'Content-Type': 'application/json',
  };
}

function squareError(response, data, fallback) {
  const detail = data && data.errors && data.errors[0] && (data.errors[0].detail || data.errors[0].code);
  const error = new Error(detail || fallback);
  error.squareStatus = response && response.status;
  return error;
}

function cleanId(value) {
  value = String(value || '').trim();
  return /^[A-Za-z0-9:_-]{5,255}$/.test(value) ? value : '';
}

function cleanDate(value) {
  value = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function positiveMoney(value) {
  const amount = parseInt(value, 10);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

async function jsonResponse(response) {
  try { return await response.json(); } catch (error) { return {}; }
}

function readRaw(req) {
  return new Promise(function (resolve) {
    let data = '';
    req.on('data', function (chunk) { data += chunk; });
    req.on('end', function () { resolve(data); });
    req.on('error', function () { resolve(''); });
  });
}
