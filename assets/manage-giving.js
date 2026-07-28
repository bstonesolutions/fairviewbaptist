(function () {
  'use strict';

  var API = '/api/donor-portal';
  var TOKEN_KEY = 'fbtGivingAccess';
  var token = '';
  var profile = null;
  var currentAction = null;
  var saving = false;
  var expiresTimer = null;
  var states = ['request-view', 'sent-view', 'loading-view', 'expired-view', 'unavailable-view', 'portal-view'];
  var dialog = document.getElementById('manage-dialog');
  var manageForm = document.getElementById('manage-form');

  function show(id) {
    states.forEach(function (state) {
      var node = document.getElementById(state);
      if (node) node.hidden = state !== id;
    });
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function api(method, body) {
    var options = { method: method, headers: { 'Content-Type': 'application/json' }, cache: 'no-store', credentials: 'same-origin' };
    if (body) options.body = JSON.stringify(body);
    return fetch(API, options).then(async function (response) {
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        var error = new Error(data.error || 'Giving records could not be loaded.');
        error.status = response.status;
        throw error;
      }
      return data;
    });
  }

  function begin() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    var incoming = params.get('access') || '';
    try {
      if (incoming) sessionStorage.setItem(TOKEN_KEY, incoming);
      token = incoming || sessionStorage.getItem(TOKEN_KEY) || '';
    } catch (error) { token = incoming; }
    var cleanUrl = new URL(window.location.href);
    var hadQueryAccess = cleanUrl.searchParams.has('access');
    cleanUrl.hash = '';
    cleanUrl.searchParams.delete('access');
    if (window.location.hash || hadQueryAccess) history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search);
    if (token) loadProfile(); else show('request-view');
  }

  function loadProfile() {
    show('loading-view');
    api('POST', { action: 'view', access: token }).then(function (data) {
      profile = data;
      renderProfile();
      show('portal-view');
    }).catch(function (error) {
      if (error.status === 401) {
        clearAccess();
        document.getElementById('expired-copy').textContent = error.message;
        show('expired-view');
        return;
      }
      document.getElementById('unavailable-copy').textContent = transientCopy(error);
      show('unavailable-view');
    });
  }

  function clearAccess() {
    token = '';
    profile = null;
    clearInterval(expiresTimer);
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (error) {}
  }

  function renderProfile() {
    var name = String(profile.name || '').trim();
    document.getElementById('welcome-title').textContent = name ? 'Welcome back, ' + name.split(/\s+/)[0] : 'Your giving overview';
    document.getElementById('account-email').textContent = profile.email || 'Private Square giving record';
    document.getElementById('summary-given').textContent = money(profile.summary.givenLast12MonthsCents);
    document.getElementById('summary-receipts').textContent = String(profile.summary.receiptCount || 0);
    document.getElementById('summary-monthly').textContent = String(profile.summary.activeMonthlyCount || 0);
    renderMonthly(profile.subscriptions || []);
    renderReceipts(profile.receipts || []);
    document.getElementById('history-notice').hidden = profile.receiptHistoryLimited !== true;
    startExpiry(profile.accessExpiresAt);
  }

  function renderMonthly(items) {
    var list = document.getElementById('monthly-list');
    list.textContent = '';
    document.getElementById('monthly-count').textContent = countLabel(items.length, 'gift');
    if (!items.length) {
      list.appendChild(emptyState('calendar', 'No monthly gifts found', 'Only recurring gifts processed through this website appear here.'));
      return;
    }
    items.forEach(function (item) { list.appendChild(monthlyCard(item)); });
  }

  function monthlyCard(item) {
    var card = el('article', 'monthly-card');
    var main = el('div', 'monthly-main');
    var title = el('div', 'monthly-title');
    var symbol = el('div', 'monthly-symbol');
    symbol.appendChild(svg('<path d="M20 7h-7V0"/><path d="M20 0v7h-7M4 17h7v7M4 24v-7h7"/><path d="M5.1 9A8 8 0 0 1 18 4.2L20 7M4 17l2 2.8A8 8 0 0 0 18.9 15"/>', '0 0 24 24'));
    var titleText = el('div');
    titleText.appendChild(textEl('strong', statusTitle(item.status) + ' monthly gift'));
    titleText.appendChild(textEl('small', item.startDate ? 'Started ' + dateOnly(item.startDate) : 'Managed securely by Square'));
    title.appendChild(symbol); title.appendChild(titleText);
    var amount = el('div', 'monthly-amount');
    amount.appendChild(textEl('strong', item.amountCents ? money(item.amountCents) : 'Amount unavailable'));
    if (item.amountCents) amount.appendChild(textEl('span', 'per month'));
    var dates = el('div', 'monthly-dates');
    var pill = textEl('span', item.status || 'Unknown', 'status-pill ' + String(item.status || '').toLowerCase());
    dates.appendChild(pill);
    dates.appendChild(textEl('small', monthlyDateCopy(item)));
    main.appendChild(title); main.appendChild(amount); main.appendChild(dates); card.appendChild(main);

    var pending = (item.actions || []).filter(function (action) { return ['PAUSE', 'RESUME', 'CANCEL'].indexOf(action.type) >= 0; })[0];
    if (pending) {
      var pendingRow = el('div', 'pending-change');
      pendingRow.appendChild(textEl('span', scheduledCopy(pending)));
      var undo = textEl('button', 'Undo change');
      undo.type = 'button';
      undo.addEventListener('click', function () { openAction('undo', item, pending); });
      pendingRow.appendChild(undo); card.appendChild(pendingRow);
    }

    if (['ACTIVE', 'PAUSED', 'DEACTIVATED'].indexOf(item.status) >= 0 && !pending) {
      var actions = el('div', 'monthly-actions');
      if (item.status === 'ACTIVE') actions.appendChild(actionButton('Pause', function () { openAction('pause', item); }));
      if (item.status === 'PAUSED' || item.status === 'DEACTIVATED') actions.appendChild(actionButton('Resume', function () { openAction('resume', item); }));
      actions.appendChild(actionButton('Change amount', function () { openAction('amount', item); }));
      actions.appendChild(actionButton('Cancel monthly gift', function () { openAction('cancel', item); }, 'danger'));
      card.appendChild(actions);
    }
    return card;
  }

  function renderReceipts(items) {
    var list = document.getElementById('receipt-list');
    list.textContent = '';
    document.getElementById('receipt-count').textContent = countLabel(items.length, 'receipt');
    if (!items.length) {
      list.appendChild(emptyState('receipt', 'No receipts found', 'Completed Square receipts connected to this email will appear here.'));
      return;
    }
    items.forEach(function (item) {
      var row = el('article', 'receipt-row');
      var date = el('div', 'receipt-date');
      date.appendChild(textEl('strong', dateTime(item.createdAt)));
      date.appendChild(textEl('small', item.receiptNumber ? 'Receipt ' + item.receiptNumber : (item.recurring ? 'Monthly gift' : 'Online gift')));
      var fund = textEl('div', item.fund || 'Where needed most', 'receipt-fund');
      var method = el('div', 'receipt-method');
      method.appendChild(textEl('strong', item.method || 'Square payment'));
      method.appendChild(textEl('small', item.recurring ? 'Automatic gift' : 'One-time gift'));
      var total = el('div', 'receipt-total');
      total.appendChild(textEl('strong', money(item.amountCents)));
      if (item.refundedCents) total.appendChild(textEl('span', item.refundedCents >= item.amountCents ? 'Refunded' : money(item.refundedCents) + ' refunded', 'refund'));
      if (item.receiptUrl) {
        var link = el('a', 'receipt-link');
        link.href = item.receiptUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.appendChild(document.createTextNode('View receipt'));
        link.appendChild(svg('<path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>'));
        total.appendChild(link);
      }
      row.appendChild(date); row.appendChild(fund); row.appendChild(method); row.appendChild(total); list.appendChild(row);
    });
  }

  function emptyState(type, title, copy) {
    var box = el('div', 'empty-state');
    box.appendChild(svg(type === 'calendar' ? '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>' : '<path d="M6 2h9l3 3v17H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>'));
    box.appendChild(textEl('strong', title)); box.appendChild(textEl('p', copy)); return box;
  }

  function openAction(action, subscription, scheduled) {
    if (saving) return;
    currentAction = { action: action, subscription: subscription, scheduled: scheduled || null };
    var fields = document.getElementById('dialog-fields');
    fields.textContent = '';
    document.getElementById('dialog-error').hidden = true;
    var config = actionConfig(action, subscription, scheduled);
    document.getElementById('dialog-kick').textContent = config.kick;
    document.getElementById('dialog-title').textContent = config.title;
    document.getElementById('dialog-copy').textContent = config.copy;
    document.getElementById('dialog-confirm').textContent = config.confirm;
    document.getElementById('dialog-confirm').classList.toggle('danger-confirm', action === 'cancel');
    if (action === 'amount') {
      fields.appendChild(dialogField('New monthly amount', 'dialog-amount', 'number', subscription.amountCents ? (subscription.amountCents / 100).toFixed(2) : '', 'Enter an amount between $1 and $50,000.', true));
      fields.appendChild(dialogField('Type CHANGE to confirm', 'dialog-phrase', 'text', '', 'This extra step helps prevent accidental changes.'));
    } else if (action === 'cancel') {
      fields.appendChild(dialogField('Type CANCEL to confirm', 'dialog-phrase', 'text', '', 'Your current paid period is not refunded automatically.'));
    }
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  function actionConfig(action, subscription, scheduled) {
    var amount = subscription.amountCents ? money(subscription.amountCents) + ' monthly gift' : 'monthly gift';
    if (action === 'pause') return { kick: 'Pause automatic giving', title: 'Pause this gift?', copy: 'Square will pause this ' + amount + '. You can return with a new private link and resume it later.', confirm: 'Pause monthly gift' };
    if (action === 'resume') return { kick: 'Resume automatic giving', title: 'Resume this gift?', copy: 'Square will resume this ' + amount + ' according to its billing schedule.', confirm: 'Resume monthly gift' };
    if (action === 'cancel') return { kick: 'Cancel automatic giving', title: 'Cancel this gift?', copy: 'Future automatic charges will stop. This does not refund gifts already completed.', confirm: 'Cancel monthly gift' };
    if (action === 'undo') return { kick: 'Undo scheduled change', title: 'Keep this gift as it was?', copy: 'Square will remove the scheduled ' + String(scheduled.type || 'change').toLowerCase() + (scheduled.effectiveDate ? ' for ' + dateOnly(scheduled.effectiveDate) : '') + '.', confirm: 'Undo scheduled change' };
    return { kick: 'Update automatic giving', title: 'Change the monthly amount', copy: 'Choose a new amount for this monthly gift. Square will apply it to the subscription.', confirm: 'Change monthly amount' };
  }

  function dialogField(label, id, type, value, help, amount) {
    var field = el('div', 'dialog-field');
    var labelNode = textEl('label', label); labelNode.htmlFor = id; field.appendChild(labelNode);
    var wrap = amount ? el('div', 'amount-input') : field;
    if (amount) wrap.appendChild(textEl('span', '$'));
    var input = document.createElement('input'); input.id = id; input.type = type; input.value = value; input.required = true;
    if (type === 'number') { input.min = '1'; input.max = '50000'; input.step = '.01'; input.inputMode = 'decimal'; }
    else { input.autocomplete = 'off'; input.autocapitalize = 'characters'; }
    wrap.appendChild(input); if (amount) field.appendChild(wrap);
    field.appendChild(textEl('small', help)); return field;
  }

  manageForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!currentAction || saving) return;
    var actionState = currentAction;
    var button = document.getElementById('dialog-confirm');
    var errorBox = document.getElementById('dialog-error');
    var body = { action: actionState.action, access: token, subscriptionId: actionState.subscription.id };
    if (actionState.action === 'undo') body.actionId = actionState.scheduled.id;
    if (actionState.action === 'cancel' || actionState.action === 'amount') body.confirmation = String(document.getElementById('dialog-phrase').value || '').trim();
    if (actionState.action === 'amount') {
      var amount = Number(document.getElementById('dialog-amount').value);
      if (!Number.isFinite(amount) || amount < 1 || amount > 50000) {
        errorBox.textContent = 'Enter a monthly amount between $1 and $50,000.'; errorBox.hidden = false; return;
      }
      body.amountCents = String(Math.round(amount * 100));
    }
    if (actionState.action === 'cancel' && body.confirmation.toUpperCase() !== 'CANCEL') {
      errorBox.textContent = 'Type CANCEL exactly to confirm.'; errorBox.hidden = false; return;
    }
    if (actionState.action === 'amount' && body.confirmation.toUpperCase() !== 'CHANGE') {
      errorBox.textContent = 'Type CHANGE exactly to confirm.'; errorBox.hidden = false; return;
    }
    errorBox.hidden = true;
    setSaving(true);
    button.textContent = 'Saving with Square...';
    api('POST', body).then(function (data) {
      setSaving(false);
      profile = data;
      renderProfile();
      closeDialog();
      toast(successCopy(actionState.action));
    }).catch(function (error) {
      setSaving(false);
      if (error.status === 401) { closeDialog(); clearAccess(); document.getElementById('expired-copy').textContent = error.message; show('expired-view'); return; }
      errorBox.textContent = error.message; errorBox.hidden = false;
      button.textContent = actionConfig(actionState.action, actionState.subscription, actionState.scheduled).confirm;
    });
  });

  function setSaving(value) {
    saving = value;
    manageForm.setAttribute('aria-busy', value ? 'true' : 'false');
    document.getElementById('dialog-confirm').disabled = value;
    document.getElementById('dialog-cancel').disabled = value;
    document.getElementById('dialog-x').disabled = value;
  }
  function closeDialog() {
    if (saving) return;
    if (dialog.open && typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    currentAction = null;
  }
  document.getElementById('dialog-cancel').addEventListener('click', closeDialog);
  document.getElementById('dialog-x').addEventListener('click', closeDialog);
  dialog.addEventListener('click', function (event) { if (event.target === dialog) closeDialog(); });
  dialog.addEventListener('cancel', function (event) { if (saving) event.preventDefault(); else currentAction = null; });

  document.getElementById('access-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var email = String(form.email.value || '').trim();
    var error = document.getElementById('access-error');
    if (!/^\S+@\S+\.\S+$/.test(email)) { error.textContent = 'Enter a valid email address.'; error.hidden = false; form.email.focus(); return; }
    error.hidden = true;
    var button = form.querySelector('button[type="submit"]'); button.disabled = true; button.querySelector('span').textContent = 'Sending securely...';
    api('POST', { action: 'request', email: email, website: form.website.value || '' }).then(function () { form.reset(); show('sent-view'); }).catch(function (requestError) {
      error.textContent = requestError.message; error.hidden = false;
    }).finally(function () { button.disabled = false; button.querySelector('span').textContent = 'Email my link'; });
  });

  document.getElementById('request-again').addEventListener('click', function () { show('request-view'); document.getElementById('access-email').focus(); });
  document.getElementById('new-link').addEventListener('click', function () { show('request-view'); document.getElementById('access-email').focus(); });
  document.getElementById('retry-access').addEventListener('click', function () { if (token) loadProfile(); else show('request-view'); });
  document.getElementById('fresh-link').addEventListener('click', function () { clearAccess(); show('request-view'); document.getElementById('access-email').focus(); });
  document.getElementById('sign-out').addEventListener('click', function () { clearAccess(); show('request-view'); toast('Your private giving records are closed on this device.'); });

  function startExpiry(value) {
    clearInterval(expiresTimer);
    var expires = new Date(value).getTime();
    function tick() {
      var remaining = expires - Date.now();
      if (remaining <= 0) { clearAccess(); document.getElementById('expired-copy').textContent = 'This private session has expired. Request a new link to continue.'; show('expired-view'); return; }
      var minutes = Math.max(1, Math.ceil(remaining / 60000));
      document.getElementById('session-time').textContent = 'Link expires in about ' + minutes + (minutes === 1 ? ' minute' : ' minutes');
    }
    tick(); expiresTimer = setInterval(tick, 30000);
  }

  function toast(message) {
    var node = document.getElementById('portal-toast'); node.querySelector('span').textContent = message; node.hidden = false;
    clearTimeout(node.timer); node.timer = setTimeout(function () { node.hidden = true; }, 5000);
  }
  function successCopy(action) { return action === 'amount' ? 'Your monthly amount was updated with Square.' : action === 'undo' ? 'The scheduled change was removed.' : 'Your monthly gift was updated with Square.'; }
  function transientCopy(error) {
    if (error && error.status === 429) return 'The giving portal is receiving several requests right now. Wait a moment, then use the same private link to try again.';
    return 'Giving records could not be loaded right now. Your private link has not been cleared, so you can safely try again.';
  }
  function statusTitle(status) { return status === 'ACTIVE' ? 'Active' : status === 'PAUSED' || status === 'DEACTIVATED' ? 'Paused' : status === 'CANCELED' ? 'Canceled' : status === 'PENDING' ? 'Scheduled' : 'Past'; }
  function monthlyDateCopy(item) {
    if (item.canceledDate) return 'Canceled ' + dateOnly(item.canceledDate);
    if (item.paidUntilDate) return 'Paid through ' + dateOnly(item.paidUntilDate);
    if (item.chargedThroughDate) return 'Current period through ' + dateOnly(item.chargedThroughDate);
    return 'Square manages the billing schedule';
  }
  function scheduledCopy(action) { return String(action.type || 'Change').charAt(0) + String(action.type || 'change').slice(1).toLowerCase() + (action.effectiveDate ? ' scheduled for ' + dateOnly(action.effectiveDate) : ' scheduled with Square'); }
  function countLabel(count, word) { return count + ' ' + (count === 1 ? word : word + 's'); }
  function money(cents) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100); }
  function dateOnly(value) { var parts = String(value || '').split('-'); if (parts.length !== 3) return 'date unavailable'; return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function dateTime(value) { var date = new Date(value); if (isNaN(date.getTime())) return 'Date unavailable'; return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function actionButton(label, click, extra) { var button = textEl('button', label, 'action-btn' + (extra ? ' ' + extra : '')); button.type = 'button'; button.addEventListener('click', click); return button; }
  function el(tag, className) { var node = document.createElement(tag); if (className) node.className = className; return node; }
  function textEl(tag, text, className) { var node = el(tag, className); node.textContent = text; return node; }
  function svg(paths, viewBox) { var node = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); node.setAttribute('viewBox', viewBox || '0 0 24 24'); node.setAttribute('aria-hidden', 'true'); node.innerHTML = paths; return node; }

  begin();
}());
