const SQUARE_VERSION = '2026-05-20';
const PLAN_NAME = 'Fairview Baptist Temple Monthly Giving';
const VARIATION_NAME = 'Monthly Gift';

let cachedVariationId = '';
let resolvingPlan = null;

async function resolveMonthlyPlanId(options) {
  const preferred = cleanId(options && options.preferredPlanId);
  if (preferred) return preferred;
  if (cachedVariationId) return cachedVariationId;
  if (resolvingPlan) return resolvingPlan;

  resolvingPlan = findOrCreatePlan(options).then(function (variationId) {
    cachedVariationId = variationId;
    return variationId;
  }).finally(function () {
    resolvingPlan = null;
  });
  return resolvingPlan;
}

// Public donor-facing reads must never create or modify Square catalog data.
// This resolver performs only the catalog list request and returns an empty
// string when the church's plan or its monthly variation has not been configured.
async function findMonthlyPlanId(options) {
  const preferred = cleanId(options && options.preferredPlanId);
  if (preferred) return preferred;
  if (cachedVariationId) return cachedVariationId;
  const context = await findPlan(options);
  if (context.variationId) cachedVariationId = context.variationId;
  return context.variationId;
}

async function findOrCreatePlan(options) {
  const base = options.base;
  const headers = squareHeaders(options.token);
  const context = await findPlan(options);
  let plan = context.plan;
  let variationId = context.variationId;
  if (variationId) return variationId;

  if (!plan) plan = await createPlan(base, headers);
  variationId = activeMonthlyVariation(plan);
  if (variationId) return variationId;
  return createVariation(base, headers, plan.id);
}

async function findPlan(options) {
  const base = options.base;
  const headers = squareHeaders(options.token);
  const listResponse = await fetch(base + '/v2/catalog/list?types=SUBSCRIPTION_PLAN', { headers: headers });
  const listData = await jsonResponse(listResponse);
  if (!listResponse.ok) throw squareError(listData, 'Square could not check the monthly giving plan.');

  const plans = Array.isArray(listData.objects) ? listData.objects : [];
  const plan = plans.find(function (object) {
    return object && object.type === 'SUBSCRIPTION_PLAN' && object.subscription_plan_data &&
      object.subscription_plan_data.name === PLAN_NAME && object.present_at_all_locations !== false;
  });
  return { plan: plan || null, variationId: activeMonthlyVariation(plan) };
}

async function createPlan(base, headers) {
  const response = await fetch(base + '/v2/catalog/object', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      idempotency_key: 'fbt-monthly-giving-plan-v1',
      object: {
        type: 'SUBSCRIPTION_PLAN',
        id: '#fbt-monthly-giving-plan',
        present_at_all_locations: true,
        subscription_plan_data: {
          name: PLAN_NAME,
          all_items: true,
        },
      },
    }),
  });
  const data = await jsonResponse(response);
  if (!response.ok || !data.catalog_object || !data.catalog_object.id) {
    throw squareError(data, 'Square could not create the monthly giving plan.');
  }
  return data.catalog_object;
}

async function createVariation(base, headers, planId) {
  const response = await fetch(base + '/v2/catalog/object', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      idempotency_key: 'fbt-monthly-giving-variation-v1',
      object: {
        type: 'SUBSCRIPTION_PLAN_VARIATION',
        id: '#fbt-monthly-giving-variation',
        present_at_all_locations: true,
        subscription_plan_variation_data: {
          name: VARIATION_NAME,
          phases: [{
            cadence: 'MONTHLY',
            ordinal: 0,
            pricing: {
              type: 'STATIC',
              price: { amount: 100, currency: 'USD' },
            },
          }],
          subscription_plan_id: planId,
        },
      },
    }),
  });
  const data = await jsonResponse(response);
  if (!response.ok || !data.catalog_object || !data.catalog_object.id) {
    throw squareError(data, 'Square could not create the monthly giving option.');
  }
  return data.catalog_object.id;
}

function activeMonthlyVariation(plan) {
  const variations = plan && plan.subscription_plan_data && plan.subscription_plan_data.subscription_plan_variations;
  if (!Array.isArray(variations)) return '';
  const variation = variations.find(function (object) {
    const data = object && object.subscription_plan_variation_data;
    const phases = data && Array.isArray(data.phases) ? data.phases : [];
    return object.present_at_all_locations !== false && data && data.name === VARIATION_NAME &&
      phases.some(function (phase) { return phase && phase.cadence === 'MONTHLY'; });
  });
  return cleanId(variation && variation.id);
}

function squareHeaders(token) {
  return {
    Authorization: 'Bearer ' + token,
    'Square-Version': SQUARE_VERSION,
    'Content-Type': 'application/json',
  };
}

function cleanId(value) {
  value = String(value || '').trim();
  return /^[A-Za-z0-9_-]{5,192}$/.test(value) ? value : '';
}

function squareError(data, fallback) {
  const detail = data && data.errors && data.errors[0] && (data.errors[0].detail || data.errors[0].code);
  const error = new Error(detail ? (fallback + ' ' + detail) : fallback);
  error.isSquareError = true;
  return error;
}

async function jsonResponse(response) {
  try { return await response.json(); } catch (error) { return {}; }
}

module.exports = { resolveMonthlyPlanId, findMonthlyPlanId };
