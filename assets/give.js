/* ============================================================
   Fairview Baptist Temple — in-browser giving hub.
   Pick an amount + fund, then give by CARD (Square Web Payments SDK,
   charged via /api/square-pay) or by VENMO (deep link + QR). Config
   comes from Settings → Giving (site_content): venmo_handle,
   square_app_id, square_location_id, square_env. Each method degrades
   to a clear unavailable state until its details are filled in.
   ============================================================ */
(function () {
  var hub = document.getElementById('give-now'); if (!hub) return;
  var $ = function (id) { return document.getElementById(id); };
  function handleCheckoutReturn() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return false; }
    if (params.get('gift') !== 'complete') return false;
    var recurring = params.get('recurring') === '1';
    var orderId = params.get('orderId') || '';
    var transactionId = params.get('transactionId') || '';
    var body = hub.querySelector('.give-hub-body');
    if (!body) return false;
    body.innerHTML = '<div class="give-thanks"><div class="give-check">&#10003;</div><h3>Thank you!</h3><p id="give-return-status">' + (recurring ? 'Your monthly gift is set up. We are sending your receipt now.' : 'Square confirmed your gift. We are sending your receipt now.') + '</p></div>';
    var status = $('give-return-status');
    if (!orderId) {
      status.innerHTML = 'Your gift was received. Your Square receipt is on its way, and the Fairview Baptist Temple receipt may take a few minutes.';
      return true;
    }
    function confirmReceipt(attempt) {
      fetch('/api/square-checkout-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: orderId, transactionId: transactionId }),
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, status: r.status, data: data }; });
      }).then(function (result) {
        if (result.ok && result.data.receiptSent) {
          status.textContent = 'Your gift was received. Your receipt is on its way to the email you provided.';
          try { window.history.replaceState({}, '', '/give?gift=thank-you'); } catch (e) {}
          return;
        }
        if (result.ok && result.data.receiptPending) {
          status.textContent = 'Your gift was received. Your receipt is being sent to the email you provided.';
          try { window.history.replaceState({}, '', '/give?gift=thank-you'); } catch (e) {}
          return;
        }
        if (attempt < 4 && (result.status === 409 || result.status === 502)) {
          setTimeout(function () { confirmReceipt(attempt + 1); }, 1200);
          return;
        }
        throw new Error(result.data.error || 'Receipt delivery could not be confirmed.');
      }).catch(function () {
        status.innerHTML = 'Your gift was received. Your receipts are being sent and may take a few minutes. If they do not arrive, <a href="/contact">contact us</a>.';
      });
    }
    confirmReceipt(1);
    return true;
  }
  if (handleCheckoutReturn()) return;
  var amount = 50;            // dollars
  var frequency = 'once';     // 'once' | 'monthly'
  var squareCard = null, squareCfg = null, venmoHandle = '', squarePlanId = '', fallbackGiveLink = '';
  var paymentsObj = null, applePay = null, googlePay = null, walletTimer = null, walletBuildId = 0;
  var squareScriptPromise = null, cardBuildId = 0, squareStarting = false, pendingSquareCfg = null;

  // These are public Square identifiers, not the server-side access token.
  // Studio values override them when Supabase responds; keeping a local copy
  // prevents a temporary settings outage from disabling giving on mobile.
  var GIVE_DEFAULTS = {
    venmo_handle: '',
    // Paste Fairview's own Square Application ID (sq0idp-...) and Location ID
    // here or set them in Studio > Settings > Giving. Blank keeps the page in
    // its friendly setup state so gifts can never route to the wrong account.
    square_app_id: '',
    square_location_id: '',
    square_env: 'production',
    square_plan_id: '',
    give_link: 'https://secure.anedot.com/fairview-baptist-temple/give',
  };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nn(v) { return v != null && String(v).trim() !== ''; }
  function dollars() { return amount; }
  function cents() { return Math.round(amount * 100); }
  function note() { var f = $('give-fund'); var fund = f ? f.value : ''; var base = (fund && fund.indexOf('needed') < 0) ? ('Gift: ' + fund) : 'Online gift'; return (frequency === 'monthly' ? 'Monthly ' : '') + base; }
  function refreshAmts() {
    var d = '$' + (Math.round(amount * 100) / 100).toLocaleString('en-US');
    if ($('give-card-amt')) $('give-card-amt').textContent = d;
    if ($('give-checkout-amt')) $('give-checkout-amt').textContent = d;
    if ($('give-venmo-amt')) $('give-venmo-amt').textContent = d;
    var per = frequency === 'monthly' ? ' / month' : '';
    if ($('give-card-per')) $('give-card-per').textContent = per;
    if ($('give-checkout-per')) $('give-checkout-per').textContent = per;
    if ($('give-venmo-per')) $('give-venmo-per').textContent = per;
    updateVenmo();
    scheduleWalletRefresh();
  }
  function syncMonthlyNotes() {
    var mo = frequency === 'monthly';
    if ($('give-venmo-monthly')) $('give-venmo-monthly').hidden = !mo;
    var cm = $('give-card-monthly');
    if (cm) {
      if (mo) { cm.hidden = false; cm.textContent = 'Square will securely charge this amount each month. You can cancel anytime by contacting us.'; }
      else { cm.hidden = true; }
    }
  }

  // ---- frequency (one-time / monthly) ----
  var freqWrap = $('give-freq');
  if (freqWrap) Array.prototype.forEach.call(freqWrap.querySelectorAll('.give-freq-opt'), function (b) {
    b.addEventListener('click', function () {
      frequency = b.getAttribute('data-freq') || 'once';
      Array.prototype.forEach.call(freqWrap.querySelectorAll('.give-freq-opt'), function (x) {
        var on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      syncMonthlyNotes();
      refreshAmts();
      syncCheckoutSurface();
      if (frequency === 'once' && !useHostedCheckout() && squareCfg && !squareCard && !squareStarting) startSquare(squareCfg);
    });
  });

  function populateFunds(raw) {
    var sel = $('give-fund'); if (!sel || !nn(raw)) return;
    var funds = String(raw).split('\n').map(function (s) {
      s = s.trim();
      return /^missions\s*-\s*/i.test(s) ? s.replace(/^missions\s*-\s*/i, 'Missions: ') : s;
    }).filter(Boolean);
    if (!funds.length) return;
    sel.innerHTML = funds.map(function (f) { return '<option>' + esc(f) + '</option>'; }).join('');
  }
  function configureOtherGiving(raw) {
    var label = $('give-other-label'), title = $('give-other-title'), copy = $('give-other-copy'), contact = $('give-other-contact');
    if (nn(raw)) {
      if (label) label.textContent = 'By text';
      if (title) title.textContent = 'Text to give';
      if (copy) copy.textContent = String(raw).trim();
      if (contact) contact.hidden = true;
    }
    var fallback = $('give-fallback-link');
    if (fallback && fallbackGiveLink) { fallback.href = fallbackGiveLink; fallback.hidden = false; }
  }

  // ---- amount selector ----
  Array.prototype.forEach.call($('give-amounts').querySelectorAll('.give-amt'), function (b) {
    b.addEventListener('click', function () {
      amount = parseFloat(b.getAttribute('data-amt')) || 0;
      $('give-custom-amt').value = '';
      Array.prototype.forEach.call($('give-amounts').querySelectorAll('.give-amt'), function (x) {
        var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      refreshAmts();
    });
  });
  $('give-custom-amt').addEventListener('input', function () {
    var v = parseFloat(this.value); if (!isNaN(v) && v > 0) { amount = v; Array.prototype.forEach.call($('give-amounts').querySelectorAll('.give-amt'), function (x) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }); refreshAmts(); }
  });
  var fundSel = $('give-fund'); if (fundSel) fundSel.addEventListener('change', refreshAmts);

  // ---- method tabs ----
  Array.prototype.forEach.call($('give-methods').querySelectorAll('.give-method'), function (b) {
    b.addEventListener('click', function () {
      var m = b.getAttribute('data-method');
      Array.prototype.forEach.call($('give-methods').querySelectorAll('.give-method'), function (x) {
        var on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      $('give-card-panel').hidden = (m !== 'card');
      $('give-venmo-panel').hidden = (m !== 'venmo');
    });
  });

  // ---- Venmo ----
  function updateVenmo() {
    if (!venmoHandle) return;
    var amt = (Math.round(amount * 100) / 100);
    var url = 'https://venmo.com/' + encodeURIComponent(venmoHandle) + '?txn=pay&amount=' + amt + '&note=' + encodeURIComponent(note());
    var btn = $('give-venmo-btn'); if (btn) btn.href = url;
    renderVenmoQR(url);
  }
  function renderVenmoQR(url) {
    var host = $('give-venmo-qr'); if (!host || !window.QRCode) return;
    host.innerHTML = ''; try { new QRCode(host, { text: url, width: 150, height: 150, colorDark: '#0D2733', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); } catch (e) { }
  }

  // ---- Square card ----
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function useHostedCheckout() { return window.matchMedia && window.matchMedia('(max-width: 760px)').matches; }
  function syncCheckoutSurface() {
    var hosted = $('give-hosted-checkout'), embedded = $('give-embedded-checkout');
    var hostedMode = useHostedCheckout() || frequency === 'monthly';
    if (hosted) hosted.hidden = !hostedMode;
    if (embedded) embedded.hidden = hostedMode;
  }
  function loadScriptOnce(src) {
    if (window.Square) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var settled = false;
      var s = document.createElement('script'); s.src = src; s.async = true;
      var timer = setTimeout(function () {
        if (settled) return; settled = true; s.onload = s.onerror = null; s.remove(); reject(new Error('Square took too long to load.'));
      }, 10000);
      s.onload = function () {
        if (settled) return; settled = true; clearTimeout(timer);
        if (window.Square) resolve(); else reject(new Error('Square did not initialize.'));
      };
      s.onerror = function () {
        if (settled) return; settled = true; clearTimeout(timer); s.remove(); reject(new Error('Square could not load.'));
      };
      document.head.appendChild(s);
    });
  }
  function ensureSquareScript(src) {
    if (window.Square) return Promise.resolve();
    if (squareScriptPromise) return squareScriptPromise;
    function attempt(n) {
      return loadScriptOnce(src).catch(function (err) {
        if (n >= 3) throw err;
        return wait(500 * n).then(function () { return attempt(n + 1); });
      });
    }
    squareScriptPromise = attempt(1).catch(function (err) { squareScriptPromise = null; throw err; });
    return squareScriptPromise;
  }
  function setCardLoading() {
    var setup = $('give-card-setup'), field = $('square-card'), button = $('give-card-btn'), retry = $('give-card-retry');
    if (setup) setup.hidden = true;
    if (field) { field.hidden = false; field.classList.add('is-loading'); }
    if (button) { button.hidden = false; button.disabled = true; }
    if (retry) { retry.disabled = true; retry.textContent = 'Connecting...'; }
  }
  function showCardSetup(message) {
    hideWallets();
    var setup = $('give-card-setup'), copy = $('give-card-setup-copy'), field = $('square-card'), button = $('give-card-btn'), retry = $('give-card-retry');
    if (copy && message) copy.textContent = message;
    if (setup) setup.hidden = false;
    if (field) { field.hidden = true; field.classList.remove('is-loading'); }
    if (button) button.hidden = true;
    if (retry) { retry.disabled = false; retry.textContent = 'Try card again'; }
    // Without Square configured there is nothing to retry or check out with;
    // the hosted giving page link is the one real action.
    var noSquare = !squareCfg || !nn(squareCfg.square_app_id) || !nn(squareCfg.square_location_id);
    var checkout = $('give-card-checkout'), title = $('give-card-setup-title');
    if (noSquare) {
      if (checkout) checkout.hidden = true;
      if (retry) retry.hidden = true;
      if (title) title.textContent = 'Give online in a few taps.';
      var secure = document.querySelector('.give-secure');
      if (secure) secure.hidden = true;
    }
  }
  function disposeCard(card) {
    if (!card || !card.destroy) return Promise.resolve();
    try { return card.destroy().catch(function () { return false; }); } catch (e) { return Promise.resolve(); }
  }
  function attachCard(payments, buildId, attemptNo) {
    var candidate = null;
    if (buildId !== cardBuildId) return Promise.reject(new Error('stale'));
    return payments.card().then(function (card) {
      candidate = card;
      if (buildId !== cardBuildId) throw new Error('stale');
      var host = $('square-card'); if (host) host.innerHTML = '';
      return card.attach('#square-card').then(function () { return card; });
    }).catch(function (err) {
      return disposeCard(candidate).then(function () {
        if (buildId !== cardBuildId) throw new Error('stale');
        if (attemptNo >= 3) throw err;
        return wait(450 * attemptNo).then(function () { return attachCard(payments, buildId, attemptNo + 1); });
      });
    });
  }
  function initSquare(cfg) {
    if (!nn(cfg.square_app_id) || !nn(cfg.square_location_id) || !window.Square) return Promise.reject(new Error('Square configuration is unavailable.'));
    squareCfg = cfg;
    var buildId = ++cardBuildId;
    var oldCard = squareCard; squareCard = null;
    setCardLoading();
    return disposeCard(oldCard).then(function () {
      if (buildId !== cardBuildId) throw new Error('stale');
      paymentsObj = window.Square.payments(cfg.square_app_id, cfg.square_location_id);
      return attachCard(paymentsObj, buildId, 1);
    }).then(function (card) {
      if (buildId !== cardBuildId) { disposeCard(card); return; }
      squareCard = card;
      var field = $('square-card'), setup = $('give-card-setup'), button = $('give-card-btn');
      if (field) { field.hidden = false; field.classList.remove('is-loading'); }
      if (setup) setup.hidden = true;
      if (button) { button.hidden = false; button.disabled = false; }
      buildWallets(); // Card first; optional wallets come afterward.
    });
  }
  function startSquare(cfg) {
    if (useHostedCheckout() || frequency === 'monthly') { squareCfg = cfg || squareCfg || GIVE_DEFAULTS; return; }
    if (squareStarting) { if (cfg) pendingSquareCfg = cfg; return; }
    squareCfg = cfg || squareCfg || GIVE_DEFAULTS;
    if (!nn(squareCfg.square_app_id) || !nn(squareCfg.square_location_id)) { showCardSetup('Card giving on this page is coming soon. Use the Give online button below and your gift goes through our secure giving page.'); return; }
    squareStarting = true; setCardLoading();
    var sandbox = String(squareCfg.square_env || '').toLowerCase() === 'sandbox';
    var src = sandbox ? 'https://sandbox.web.squarecdn.com/v1/square.js' : 'https://web.squarecdn.com/v1/square.js';
    function finishStart() {
      squareStarting = false;
      if (pendingSquareCfg) {
        var pending = pendingSquareCfg; pendingSquareCfg = null;
        var changed = !squareCfg || squareCfg.square_app_id !== pending.square_app_id || squareCfg.square_location_id !== pending.square_location_id || squareCfg.square_env !== pending.square_env;
        if (changed || !squareCard) startSquare(pending);
      }
    }
    ensureSquareScript(src).then(function () { return initSquare(squareCfg); }).then(function () {
      finishStart();
    }).catch(function () {
      showCardSetup('The secure card form could not connect. Check your signal and try again, or use the Give online button below.');
      finishStart();
    });
  }

  // ---- Apple Pay / Google Pay (Square digital wallets) ----
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  function currentName() { var el = $('give-name'); return el ? String(el.value || '').trim() : ''; }
  function currentEmail() { var el = $('give-email'); return el ? String(el.value || '').trim() : ''; }
  function requireContact() {
    var nameEl = $('give-name'), emailEl = $('give-email');
    var name = currentName(), email = currentEmail();
    if (nameEl) nameEl.classList.toggle('invalid', name.length < 2);
    if (emailEl) emailEl.classList.toggle('invalid', !validEmail(email));
    if (name.length < 2) { cardMsg('Please enter your name before continuing.', true); if (nameEl) nameEl.focus(); return null; }
    if (!validEmail(email)) { cardMsg('Please enter a valid email so we can send your receipt.', true); if (emailEl) emailEl.focus(); return null; }
    return { name: name, email: email };
  }
  ['give-name', 'give-email'].forEach(function (id) {
    var el = $(id); if (el) el.addEventListener('input', function () { this.classList.remove('invalid'); });
  });
  function openHostedCheckout(button) {
    if (cents() < 100) { cardMsg('Please choose an amount of at least $1.', true); return; }
    if (!requireContact()) return;
    var cfg = squareCfg || GIVE_DEFAULTS;
    var original = button ? button.innerHTML : '';
    if (button) { button.disabled = true; button.textContent = 'Opening secure checkout...'; }
    cardMsg('Connecting you to Square secure checkout...', false);
    fetch('/api/square-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: cents(),
        note: note(),
        locationId: cfg.square_location_id,
        env: cfg.square_env,
        buyerEmail: currentEmail(),
        buyerName: currentName(),
        recurring: frequency === 'monthly',
        planId: squarePlanId,
      }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, data: data }; });
    }).then(function (result) {
      if (!result.ok || !result.data.url) throw new Error(result.data.error || 'Square checkout could not open.');
      window.location.assign(result.data.url);
    }).catch(function (err) {
      cardMsg((err && err.message) || 'Square checkout could not open. Please try again.', true);
      if (button) { button.disabled = false; button.innerHTML = original; }
    });
  }
  var checkoutButton = $('give-checkout-btn');
  if (checkoutButton) checkoutButton.addEventListener('click', function () { openHostedCheckout(this); });
  var checkoutFallback = $('give-card-checkout');
  if (checkoutFallback) checkoutFallback.addEventListener('click', function () { openHostedCheckout(this); });
  function scheduleWalletRefresh() {
    if (!paymentsObj || !squareCard) return;
    walletBuildId++; hideWallets();
    if (walletTimer) clearTimeout(walletTimer);
    walletTimer = setTimeout(buildWallets, 350);
  }
  function walletRequest() {
    return paymentsObj.paymentRequest({ countryCode: 'US', currencyCode: 'USD', total: { amount: (Math.max(amount, 0)).toFixed(2), label: 'Fairview Baptist Temple' } });
  }
  // Wallets carry a single-use token, so they cover one-time gifts only. On
  // "Monthly" we hide them and keep the (recurring-capable) card form.
  function hideWallets() {
    var wrap = $('give-wallets'), gEl = $('google-pay-button'), aEl = $('apple-pay-button');
    if (wrap) wrap.hidden = true;
    if (gEl) gEl.style.display = 'none';
    if (aEl) aEl.hidden = true;
  }
  function syncWalletVisibility(buildId) {
    if (buildId !== walletBuildId) return;
    var wrap = $('give-wallets'), gEl = $('google-pay-button'), aEl = $('apple-pay-button');
    if (!wrap) return;
    var googleVisible = !!(gEl && gEl.style.display !== 'none' && gEl.childNodes.length);
    var appleVisible = !!(aEl && !aEl.hidden);
    wrap.hidden = !(googleVisible || appleVisible);
  }
  function buildWallets() {
    var wrap = $('give-wallets'); if (!wrap || !paymentsObj) return;
    var buildId = ++walletBuildId;
    hideWallets();
    if (frequency === 'monthly' || cents() < 100) return;
    var req; try { req = walletRequest(); } catch (e) { return; }

    // Google Pay. Destroy the previous generated button before attaching a
    // fresh one so an amount change cannot leave a wallet tied to old details.
    var gEl = $('google-pay-button');
    if (gEl) {
      var oldGoogle = googlePay; googlePay = null;
      var googleReset = oldGoogle && oldGoogle.destroy
        ? oldGoogle.destroy().catch(function () { return false; })
        : Promise.resolve();
      googleReset.then(function () {
        if (buildId !== walletBuildId) return null;
        return paymentsObj.googlePay(req);
      }).then(function (gp) {
        if (!gp) return null;
        if (buildId !== walletBuildId) { if (gp.destroy) gp.destroy().catch(function () {}); return null; }
        googlePay = gp; gEl.innerHTML = '';
        return gp.attach('#google-pay-button', { buttonColor: 'black', buttonType: 'donate', buttonSizeMode: 'fill', buttonRadius: 13, buttonBorderType: 'no_border' }).then(function () { return gp; });
      }).then(function (gp) {
        if (!gp || buildId !== walletBuildId) return;
        gEl.style.display = ''; syncWalletVisibility(buildId);
        if (!gEl._bound) { gEl._bound = true; gEl.addEventListener('click', function () { walletPay(googlePay); }); }
      }).catch(function () { if (buildId === walletBuildId) { gEl.style.display = 'none'; syncWalletVisibility(buildId); } });
    }

    // Apple Pay appears only when Square confirms the current Apple device,
    // browser, wallet, and registered domain are eligible.
    var aEl = $('apple-pay-button');
    if (aEl) {
      applePay = null;
      paymentsObj.applePay(req).then(function (ap) {
        if (buildId !== walletBuildId) return;
        applePay = ap; aEl.hidden = false; syncWalletVisibility(buildId);
        if (!aEl._bound) { aEl._bound = true; aEl.addEventListener('click', function () { walletPay(applePay); }); }
      }).catch(function () { if (buildId === walletBuildId) { aEl.hidden = true; syncWalletVisibility(buildId); } });
    }
  }
  function walletPay(wallet) {
    if (!wallet) return;
    if (cents() < 100) { cardMsg('Please choose an amount of at least $1.', true); return; }
    if (!requireContact()) return;
    wallet.tokenize().then(function (result) {
      if (result.status !== 'OK') { if (result.status === 'Cancel') return; throw new Error('That payment was not completed.'); }
      return chargeAndThank(result.token, false);
    }).catch(function (err) { cardMsg((err && err.message) || 'That payment did not go through.', true); });
  }
  // Shared charge + thank-you, used by the card button and the wallet buttons.
  function chargeAndThank(token, monthly) {
    var email = currentEmail();
    var giverName = currentName();
    var payload = { sourceId: token, amount: cents(), note: note(), locationId: squareCfg.square_location_id, env: squareCfg.square_env, buyerEmail: email, buyerName: giverName };
    if (monthly) { payload.recurring = true; payload.planId = squarePlanId; }
    return fetch('/api/square-pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Your gift could not be processed.');
        var amt = '$' + (Math.round(amount * 100) / 100).toLocaleString('en-US');
        var receiptLink = res.d && res.d.receiptUrl ? '<a href="' + esc(res.d.receiptUrl) + '" target="_blank" rel="noopener">View your Square receipt</a>.' : '';
        var toEmail = res.d && res.d.receiptSent
          ? ' A receipt is on its way to ' + esc(email) + '.'
          : (res.d && res.d.receiptPending
            ? ' Your receipt is being sent to ' + esc(email) + '.'
            : ' Your Square receipt is available, and the Fairview Baptist Temple receipt may take a few minutes. ' + (receiptLink || ''));
        var msg = monthly
          ? 'Your monthly gift of ' + amt + ' is set up. We\'re grateful for your ongoing generosity.' + toEmail
          : 'Your gift of ' + amt + ' was received. We\'re grateful for your generosity.' + toEmail;
        $('give-card-panel').innerHTML = '<div class="give-thanks"><div class="give-check">&#10003;</div><h3>Thank you!</h3><p>' + msg + '</p></div>';
      });
  }
  function cardMsg(t, err) { var m = $('give-card-msg'); m.hidden = false; m.className = 'give-msg' + (err ? ' err' : ''); m.textContent = t; }
  $('give-card-btn').addEventListener('click', function () {
    if (!squareCard) return;
    if (cents() < 100) { cardMsg('Please choose an amount of at least $1.', true); return; }
    var monthly = frequency === 'monthly';
    // Name and email are required before tokenization so every successful gift
    // has the details needed for its receipt.
    if (!requireContact()) return;
    var btn = this; btn.disabled = true; var label = btn.innerHTML; btn.textContent = 'Processing…';
    squareCard.tokenize().then(function (result) {
      if (result.status !== 'OK') throw new Error('Please check your card details.');
      return chargeAndThank(result.token, monthly);
    }).catch(function (e) { cardMsg(e.message || 'Something went wrong. Please try again.', true); btn.disabled = false; btn.innerHTML = label; });
  });

  // ---- load config + boot ----
  function boot(cfg) {
    cfg = cfg || GIVE_DEFAULTS;
    syncCheckoutSurface();
    venmoHandle = nn(cfg.venmo_handle) ? String(cfg.venmo_handle).replace(/^@/, '').trim() : '';
    squarePlanId = nn(cfg.square_plan_id) ? String(cfg.square_plan_id).trim() : '';
    fallbackGiveLink = nn(cfg.give_link) ? String(cfg.give_link).trim() : '';
    populateFunds(cfg.give_funds);
    configureOtherGiving(cfg.give_text);
    if (!venmoHandle) { $('give-venmo-setup').hidden = false; var vb = $('give-venmo-btn'); if (vb) vb.style.display = 'none'; }
    syncMonthlyNotes();
    refreshAmts();
    if (useHostedCheckout() || frequency === 'monthly') { squareCfg = cfg; return; }
    var squareChanged = !squareCfg || squareCfg.square_app_id !== cfg.square_app_id || squareCfg.square_location_id !== cfg.square_location_id || squareCfg.square_env !== cfg.square_env;
    if (squareChanged || (!squareCard && !squareStarting)) startSquare(cfg);
  }
  function mergedConfig(rows) {
    var cfg = {};
    Object.keys(GIVE_DEFAULTS).forEach(function (key) { cfg[key] = GIVE_DEFAULTS[key]; });
    (rows || []).forEach(function (row) {
      if (!row || !row.key) return;
      var core = row.key === 'square_app_id' || row.key === 'square_location_id' || row.key === 'square_env' || row.key === 'venmo_handle' || row.key === 'give_link';
      if (!core || nn(row.value)) cfg[row.key] = row.value;
    });
    return cfg;
  }

  var retryButton = $('give-card-retry');
  if (retryButton) retryButton.addEventListener('click', function () { startSquare(squareCfg || GIVE_DEFAULTS); });
  window.addEventListener('resize', syncCheckoutSurface);
  window.addEventListener('online', function () { if (!useHostedCheckout() && frequency === 'once' && squareCfg && !squareCard) startSquare(squareCfg); });
  window.addEventListener('pageshow', function () {
    if (useHostedCheckout() || frequency === 'monthly') return;
    if (squareCard && squareCard.recalculateSize) { try { squareCard.recalculateSize(); } catch (e) {} }
    else if (squareCfg && !squareStarting) startSquare(squareCfg);
  });

  // Start from the baked public identifiers immediately. Supabase remains the
  // editable source of truth, but its availability no longer gates payments.
  boot(mergedConfig([]));
  var B = window.FBT;
  if (B && B.SUPABASE_URL && window.supabase) {
    try {
      var sb = B.getPublicClient ? B.getPublicClient() : window.supabase.createClient(B.SUPABASE_URL, B.SUPABASE_ANON_KEY);
      if (!sb) return;
      sb.from('site_content').select('key,value').in('key', ['venmo_handle', 'square_app_id', 'square_location_id', 'square_env', 'square_plan_id', 'give_funds', 'give_text', 'give_link']).then(function (r) {
        if (r && !r.error && r.data) boot(mergedConfig(r.data));
      }, function () {});
    } catch (e) {}
  }
})();
