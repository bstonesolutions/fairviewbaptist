const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const portal = require('../api/donor-portal');
const { findMonthlyPlanId } = require('../api/_square-monthly-plan');

test('donor access tokens are private, authenticated, and short lived', function () {
  const realNow = Date.now;
  const issuedAt = Date.parse('2026-07-19T16:00:00Z');
  Date.now = function () { return issuedAt; };
  try {
    const sealed = portal.sealAccess('Giver@Example.com', 'square_test_secret');
    assert.match(sealed.token, /^v1\./);
    assert.equal(sealed.token.includes('giver@example.com'), false);
    assert.deepEqual(portal.openAccess(sealed.token, 'square_test_secret'), {
      email: 'giver@example.com', expiresAt: issuedAt + (30 * 60 * 1000),
    });

    const parts = sealed.token.split('.');
    parts[2] = (parts[2].charAt(0) === 'a' ? 'b' : 'a') + parts[2].slice(1);
    assert.throws(function () { portal.openAccess(parts.join('.'), 'square_test_secret'); }, /expired or is no longer valid/i);

    Date.now = function () { return issuedAt + (31 * 60 * 1000); };
    assert.throws(function () { portal.openAccess(sealed.token, 'square_test_secret'); }, /expired or is no longer valid/i);
  } finally {
    Date.now = realNow;
  }
});

test('public donor receipts expose useful details without Square card secrets', function () {
  const result = portal.cleanPayment({
    id: 'payment_12345',
    created_at: '2026-07-19T16:00:00Z',
    note: 'Online monthly gift | Missions: Faith Promise | Donor: Test Giver',
    total_money: { amount: 12500, currency: 'USD' },
    refunded_money: { amount: 2500, currency: 'USD' },
    receipt_number: 'RCP-123',
    receipt_url: 'https://squareup.com/receipt/preview/payment_12345',
    source_type: 'CARD',
    card_details: {
      entry_method: 'ON_FILE',
      card: {
        card_brand: 'VISA', last_4: '4242',
        fingerprint: 'must_never_leave_server', exp_month: 10, exp_year: 2030,
      },
    },
  });

  assert.equal(result.amountCents, 12500);
  assert.equal(result.refundedCents, 2500);
  assert.equal(result.fund, 'Missions: Faith Promise');
  assert.equal(result.method, 'Visa ending 4242');
  assert.equal(result.recurring, true);
  assert.equal(JSON.stringify(result).includes('must_never_leave_server'), false);
  assert.equal(JSON.stringify(result).includes('exp_month'), false);
});

test('receipt links are restricted to Square domains', function () {
  const clean = portal.cleanPayment({
    id: 'payment_12345', created_at: '2026-07-19T16:00:00Z',
    amount_money: { amount: 1000, currency: 'USD' },
    receipt_url: 'https://evil.example/pretend-receipt', source_type: 'CARD',
  });
  assert.equal(clean.receiptUrl, '');
});

test('an optional portal secret cannot replace the Square key material', function () {
  const previous = process.env.DONOR_PORTAL_SECRET;
  process.env.DONOR_PORTAL_SECRET = 'accidentally-weak-value';
  try {
    const sealed = portal.sealAccess('giver@example.com', 'square_key_one');
    assert.throws(function () { portal.openAccess(sealed.token, 'square_key_two'); }, /expired or is no longer valid/i);
  } finally {
    restoreEnv('DONOR_PORTAL_SECRET', previous);
  }
});

test('Google Pay receipts retain the wallet label', function () {
  const clean = portal.cleanPayment({
    id: 'payment_12345', created_at: '2026-07-19T16:00:00Z',
    amount_money: { amount: 1000, currency: 'USD' }, source_type: 'CARD',
    card_details: { wallet_type: 'GOOGLE_PAY', card: { card_brand: 'VISA', last_4: '4242' } },
  });
  assert.equal(clean.method, 'Google Pay');
});

test('the read-only monthly plan resolver never creates catalog objects', async function () {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async function (url, options) {
    calls.push({ url: String(url), method: String(options && options.method || 'GET') });
    return fakeResponse(200, { objects: [] });
  };
  try {
    const planId = await findMonthlyPlanId({ base: 'https://square.test', token: 'square_token' });
    assert.equal(planId, '');
    assert.deepEqual(calls, [{ url: 'https://square.test/v2/catalog/list?types=SUBSCRIPTION_PLAN', method: 'GET' }]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('donor API is POST only and never accepts access tokens in a query string', async function () {
  const res = responseRecorder();
  await portal({ method: 'GET', headers: {}, query: { access: 'must_not_be_read' }, socket: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST, OPTIONS');
  assert.match(res.payload.error, /POST only/);
});

test('link requests fail uniformly before lookup when Resend is not configured', async function () {
  const previousSquare = process.env.SQUARE_ACCESS_TOKEN;
  const previousResend = process.env.RESEND_API_KEY;
  const originalFetch = global.fetch;
  process.env.SQUARE_ACCESS_TOKEN = 'square_unit_token';
  delete process.env.RESEND_API_KEY;
  global.fetch = async function () { throw new Error('Square must not be called'); };
  try {
    const res = responseRecorder();
    await portal(request('POST', { action: 'request', email: 'giver@example.com' }), res);
    assert.equal(res.statusCode, 503);
    assert.match(res.payload.error, /temporarily unavailable/i);
  } finally {
    global.fetch = originalFetch;
    restoreEnv('SQUARE_ACCESS_TOKEN', previousSquare);
    restoreEnv('RESEND_API_KEY', previousResend);
  }
});

test('donor lookup uses exact customer email, customer-scoped subscriptions, and marks partial payment history', async function () {
  const previousSquare = process.env.SQUARE_ACCESS_TOKEN;
  const previousSecret = process.env.DONOR_PORTAL_SECRET;
  const originalFetch = global.fetch;
  process.env.SQUARE_ACCESS_TOKEN = 'square_unit_token';
  delete process.env.DONOR_PORTAL_SECRET;
  const calls = [];
  let paymentPage = 0;
  global.fetch = async function (url, options) {
    url = String(url);
    options = options || {};
    calls.push({ url: url, method: String(options.method || 'GET'), body: options.body || '' });
    if (url.endsWith('/v2/customers/search')) {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.query.filter.email_address, { exact: 'giver@example.com' });
      return fakeResponse(200, { customers: [{ id: 'customer_12345', email_address: 'giver@example.com', given_name: 'Test', family_name: 'Giver' }] });
    }
    if (url.includes('/v2/catalog/list')) return fakeResponse(200, { objects: [monthlyPlan()] });
    if (url.endsWith('/v2/subscriptions/search')) {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.query.filter.customer_ids, ['customer_12345']);
      return fakeResponse(200, { subscriptions: [{
        id: 'subscription_12345', customer_id: 'customer_12345', location_id: 'fbt_location_1',
        plan_variation_id: 'variation_12345', status: 'ACTIVE', start_date: '2026-07-19',
        price_override_money: { amount: 2500, currency: 'USD' }, actions: [],
      }] });
    }
    if (url.includes('/v2/payments?')) {
      paymentPage += 1;
      return fakeResponse(200, {
        payments: [{
          id: 'payment_' + String(paymentPage).padStart(5, '0'), status: 'COMPLETED',
          created_at: '2026-07-' + String(Math.min(paymentPage, 28)).padStart(2, '0') + 'T16:00:00Z',
          buyer_email_address: 'giver@example.com', amount_money: { amount: 1000, currency: 'USD' }, source_type: 'CARD',
        }],
        cursor: 'more-payments',
      });
    }
    throw new Error('Unexpected Square request: ' + url);
  };
  try {
    const access = portal.sealAccess('giver@example.com', process.env.SQUARE_ACCESS_TOKEN).token;
    const res = responseRecorder();
    await portal(request('POST', { action: 'view', access: access }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.receiptHistoryLimited, true);
    assert.equal(res.payload.receipts.length, 10);
    assert.equal(res.payload.subscriptions.length, 1);
    assert.equal(calls.some(function (call) { return call.url.includes('/v2/catalog/object'); }), false);
  } finally {
    global.fetch = originalFetch;
    restoreEnv('SQUARE_ACCESS_TOKEN', previousSquare);
    restoreEnv('DONOR_PORTAL_SECRET', previousSecret);
  }
});

test('a per-address Resend failure keeps the non-enumerating public response', async function () {
  const previousSquare = process.env.SQUARE_ACCESS_TOKEN;
  const previousResend = process.env.RESEND_API_KEY;
  const originalFetch = global.fetch;
  const originalError = console.error;
  process.env.SQUARE_ACCESS_TOKEN = 'square_unit_token';
  process.env.RESEND_API_KEY = 'resend_unit_token';
  let resendCalled = false;
  let logged = false;
  console.error = function () { logged = true; };
  global.fetch = async function (url, options) {
    url = String(url);
    options = options || {};
    if (url.endsWith('/v2/customers/search')) {
      return fakeResponse(200, { customers: [{ id: 'customer_12345', email_address: 'giver@example.com' }] });
    }
    if (url.includes('/v2/payments?')) {
      return fakeResponse(200, { payments: [{ id: 'payment_12345', status: 'COMPLETED', created_at: '2026-07-19T16:00:00Z', buyer_email_address: 'giver@example.com', amount_money: { amount: 1000, currency: 'USD' } }] });
    }
    if (url.endsWith('/v2/subscriptions/search')) return fakeResponse(200, { subscriptions: [] });
    if (url === 'https://api.resend.com/emails') { resendCalled = true; return fakeResponse(503, { error: 'unavailable' }); }
    throw new Error('Unexpected request: ' + url);
  };
  try {
    const res = responseRecorder();
    await portal(request('POST', { action: 'request', email: 'giver@example.com' }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { ok: true, message: 'If that email matches a giving record, a private link is on its way.' });
    assert.equal(resendCalled, true);
    assert.equal(logged, true);
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
    restoreEnv('SQUARE_ACCESS_TOKEN', previousSquare);
    restoreEnv('RESEND_API_KEY', previousResend);
  }
});

test('private page regression guards keep close controls safe and receipt history uncapped', function () {
  const html = fs.readFileSync(require.resolve('../manage-giving.html'), 'utf8');
  const script = fs.readFileSync(require.resolve('../assets/manage-giving.js'), 'utf8');
  assert.match(html, /id="dialog-x" type="button"/);
  assert.doesNotMatch(html, /href="mailto:/);
  assert.match(html, /id="unavailable-view"/);
  assert.doesNotMatch(script, /legacyParams|get\(['"]access['"]\)\s*\|\|\s*legacy/);
  assert.doesNotMatch(script, /items\.slice\(0,\s*100\)/);
  assert.match(script, /if \(saving\) event\.preventDefault\(\)/);
});

function request(method, body) {
  return {
    method: method,
    body: body,
    headers: { origin: 'https://fairviewbaptisttemple.com', 'x-forwarded-for': '203.0.113.40' },
    socket: { remoteAddress: '203.0.113.40' },
  };
}

function responseRecorder() {
  return {
    headers: {}, statusCode: 200, payload: null, ended: false,
    setHeader: function (key, value) { this.headers[key] = value; },
    status: function (code) { this.statusCode = code; return this; },
    json: function (value) { this.payload = value; this.ended = true; return this; },
    end: function () { this.ended = true; return this; },
  };
}

function fakeResponse(status, data) {
  return { ok: status >= 200 && status < 300, status: status, json: async function () { return data; } };
}

function monthlyPlan() {
  return {
    type: 'SUBSCRIPTION_PLAN', id: 'plan_12345', present_at_all_locations: true,
    subscription_plan_data: {
      name: 'Fairview Baptist Temple Monthly Giving',
      subscription_plan_variations: [{
        type: 'SUBSCRIPTION_PLAN_VARIATION', id: 'variation_12345', present_at_all_locations: true,
        subscription_plan_variation_data: { name: 'Monthly Gift', phases: [{ cadence: 'MONTHLY' }] },
      }],
    },
  };
}

function restoreEnv(name, previous) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}
