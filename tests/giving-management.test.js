const test = require('node:test');
const assert = require('node:assert/strict');

test('giving history calculates Square fees and actual net', function () {
  const history = require('../api/giving-history');
  const gift = history.cleanPayment({
    id: 'payment_12345',
    status: 'COMPLETED',
    created_at: new Date().toISOString(),
    location_id: 'fbt_location',
    note: 'Online gift | Missions | Donor: Test Donor',
    amount_money: { amount: 10000, currency: 'USD' },
    refunded_money: { amount: 2000, currency: 'USD' },
    processing_fee: [
      { amount_money: { amount: 320, currency: 'USD' } },
      { amount_money: { amount: -50, currency: 'USD' } },
    ],
    source_type: 'CARD',
    card_details: { card: { card_brand: 'VISA', last_4: '1234' } },
  }, {});

  assert.equal(gift.amountCents, 10000);
  assert.equal(gift.refundedCents, 2000);
  assert.equal(gift.feeCents, 270);
  assert.equal(gift.netCents, 7730);
  assert.equal(gift.fund, 'Missions');
  assert.equal(gift.name, 'Test Donor');
  assert.equal(gift.method, 'Visa ending 1234');
  assert.equal(JSON.stringify(gift).includes('fingerprint'), false);
});

test('refund validation requires safeguards and remaining balance', function () {
  const management = require('../api/giving-payment');
  const payment = {
    status: 'COMPLETED',
    created_at: new Date().toISOString(),
    amount_money: { amount: 10000, currency: 'USD' },
    refunded_money: { amount: 2000, currency: 'USD' },
  };

  assert.equal(management.validateRefund(payment, {
    confirmation: 'refund', amountCents: 1000, reason: 'Donor request',
  }).message, 'Type REFUND exactly to confirm this action.');
  assert.equal(management.validateRefund(payment, {
    confirmation: 'REFUND', amountCents: 9000, reason: 'Donor request',
  }).message, 'The refund is larger than the remaining refundable amount.');
  assert.equal(management.validateRefund(payment, {
    confirmation: 'REFUND', amountCents: '3000junk', reason: 'Donor request',
  }).message, 'Enter a valid refund amount.');
  assert.equal(management.validateRefund(payment, {
    confirmation: 'REFUND', amountCents: 3000, reason: 'Donor request',
  }), null);
});

test('refund endpoint verifies location and sends guarded Square request', async function () {
  const authPath = require.resolve('../api/_studio-auth');
  const endpointPath = require.resolve('../api/giving-payment');
  const originalAuth = require.cache[authPath];
  const originalFetch = global.fetch;
  const originalToken = process.env.SQUARE_ACCESS_TOKEN;
  const originalLocation = process.env.SQUARE_LOCATION_ID;
  const calls = [];
  const payment = {
    id: 'payment_12345',
    status: 'COMPLETED',
    version_token: 'version_1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    location_id: 'fbt_location',
    note: 'Online gift | General | Donor: Test Donor',
    amount_money: { amount: 10000, currency: 'USD' },
    total_money: { amount: 10000, currency: 'USD' },
    refunded_money: { amount: 2000, currency: 'USD' },
    processing_fee: [{ amount_money: { amount: 320, currency: 'USD' } }],
    source_type: 'CARD',
    buyer_email_address: 'giver@example.com',
  };

  require.cache[authPath] = {
    id: authPath, filename: authPath, loaded: true,
    exports: { requireStudioOwner: async function () { return { email: 'owner@example.com' }; } },
  };
  delete require.cache[endpointPath];
  process.env.SQUARE_ACCESS_TOKEN = 'test_token';
  process.env.SQUARE_LOCATION_ID = 'fbt_location';
  global.fetch = async function (url, options) {
    calls.push({ url: String(url), options: options || {} });
    if (/\/v2\/payments\/payment_12345$/.test(url)) return response(200, { payment: payment });
    if (/\/v2\/refunds$/.test(url)) return response(200, { refund: {
      id: 'refund_12345', status: 'PENDING', amount_money: { amount: 3000, currency: 'USD' },
      reason: 'Donor request', created_at: new Date().toISOString(),
    } });
    throw new Error('Unexpected fetch: ' + url);
  };

  try {
    const endpoint = require('../api/giving-payment');
    const result = await invoke(endpoint, {
      method: 'POST', headers: {},
      body: {
        action: 'refund', paymentId: 'payment_12345', amountCents: 3000,
        reason: 'Donor request', confirmation: 'REFUND',
        requestId: '12345678-1234-4123-8123-123456789012',
      },
    });
    assert.equal(result.status, 200);
    const refundCall = calls.find(function (call) { return /\/v2\/refunds$/.test(call.url); });
    const body = JSON.parse(refundCall.options.body);
    assert.equal(body.payment_id, 'payment_12345');
    assert.equal(body.amount_money.amount, 3000);
    assert.equal(body.reason, 'Donor request');
    assert.equal(body.payment_version_token, 'version_1');
    assert.equal(body.idempotency_key, '12345678-1234-4123-8123-123456789012');
  } finally {
    global.fetch = originalFetch;
    if (originalAuth) require.cache[authPath] = originalAuth;
    else delete require.cache[authPath];
    delete require.cache[endpointPath];
    if (originalToken === undefined) delete process.env.SQUARE_ACCESS_TOKEN;
    else process.env.SQUARE_ACCESS_TOKEN = originalToken;
    if (originalLocation === undefined) delete process.env.SQUARE_LOCATION_ID;
    else process.env.SQUARE_LOCATION_ID = originalLocation;
  }
});

function response(status, data) {
  return { ok: status >= 200 && status < 300, status: status, json: async function () { return data; } };
}

function invoke(handler, req) {
  return new Promise(function (resolve, reject) {
    const result = { status: 200, body: null };
    const res = {
      setHeader: function () {},
      status: function (status) { result.status = status; return res; },
      json: function (body) { result.body = body; resolve(result); },
      end: function () { resolve(result); },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
