const crypto = require('crypto');

async function sendGivingReceipt(o) {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key || !o || !o.email) return { sent: false, pending: false };
    const from = process.env.RESEND_FROM || 'Fairview Baptist Temple <onboarding@resend.dev>';
    const church = process.env.NOTIFY_TO || 'brandonstone8567@gmail.com';
    const esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    const amount = '$' + (o.amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const when = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
    const kind = o.recurring ? 'Recurring monthly gift' : 'One-time gift';
    const fund = (o.note && !/^online gift$/i.test(o.note)) ? String(o.note).replace(/^Monthly\s+/i, '').replace(/^Gift\s+[—-]\s+/i, '') : '';
    const hi = o.name ? ('Hi ' + esc(String(o.name).split(/\s+/)[0]) + ',') : 'Hi,';
    const row = function (label, value) { return '<tr><td style="padding:8px 0;color:#5D6759;font-size:14px;">' + label + '</td><td style="padding:8px 0;text-align:right;color:#14424A;font-weight:600;font-size:14px;">' + esc(value) + '</td></tr>'; };
    const html =
      '<div style="max-width:520px;margin:0 auto;font-family:\'Source Sans 3\',Arial,Helvetica,sans-serif;color:#1F3238;">' +
        '<div style="text-align:center;padding:8px 0 20px;"><img src="https://fairviewbaptisttemple.com/assets/logo-full-color.png" alt="Fairview Baptist Temple" style="height:44px;width:auto;"></div>' +
        '<div style="background:#FAF6ED;border:1px solid #E4DCC9;border-radius:14px;padding:28px 26px;">' +
          '<h1 style="margin:0 0 6px;font-family:Montserrat,Arial,sans-serif;font-weight:600;font-size:20px;color:#14424A;">Thank you for your gift</h1>' +
          '<p style="margin:0 0 18px;color:#4C5B4F;font-size:15px;line-height:1.5;">' + hi + ' we received your gift to Fairview Baptist Temple. Your generosity helps carry the gospel here in Clay, West Virginia and around the world. Please keep this email as your receipt.</p>' +
          '<table style="width:100%;border-collapse:collapse;border-top:1px solid #E4DCC9;">' +
            row('Amount', amount) +
            row('Date', when) +
            row('Type', kind) +
            (fund ? row('Toward', fund) : '') +
          '</table>' +
        '</div>' +
        '<p style="text-align:center;color:#7C8578;font-size:12px;line-height:1.6;margin:20px 0 0;">Fairview Baptist Temple<br>2294 Main Street, Clay, WV 25043<br><a href="https://fairviewbaptisttemple.com" style="color:#0F6663;">fairviewbaptisttemple.com</a></p>' +
      '</div>';
    const text = (o.name ? ('Hi ' + String(o.name).split(/\s+/)[0] + ',\n\n') : 'Hi,\n\n') +
      'Thank you for your gift to Fairview Baptist Temple. Please keep this as your receipt.\n\n' +
      'Amount: ' + amount + '\nDate: ' + when + '\nType: ' + kind + (fund ? ('\nToward: ' + fund) : '') + '\n\n' +
      'Fairview Baptist Temple\n2294 Main Street, Clay, WV 25043\nfairviewbaptisttemple.com';
    const payload = JSON.stringify({ from: from, to: [o.email], bcc: [church], subject: 'Your giving receipt - Fairview Baptist Temple', html: html, text: text });
    const receiptId = String(o.id || crypto.randomUUID()).replace(/[^A-Za-z0-9._/-]/g, '').slice(0, 160);
    const manualToken = String(o.resendToken || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 60);
    const receiptKey = ('giving-receipt/' + receiptId + (manualToken ? ('/manual-' + manualToken) : '')).slice(0, 240);
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 5000);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Idempotency-Key': receiptKey },
        body: payload,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.ok) return { sent: true, pending: false };
      const errorData = await response.json().catch(function () { return {}; });
      const errorCode = errorData && (errorData.name || errorData.code);
      if (response.status === 409 && errorCode === 'concurrent_idempotent_requests') return { sent: false, pending: true };
      if (response.status >= 500 || response.status === 429) return { sent: false, pending: true };
      return {
        sent: false,
        pending: false,
        errorCode: errorCode || ('resend_http_' + response.status),
        errorMessage: errorData && errorData.message ? String(errorData.message).slice(0, 240) : '',
      };
    } catch (e) {
      clearTimeout(timer);
      return { sent: false, pending: true };
    }
  } catch (e) {
    return { sent: false, pending: true };
  }
}

module.exports = { sendGivingReceipt };
