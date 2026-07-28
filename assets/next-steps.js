/* ============================================================
   Fairview Baptist Temple, Next Steps
   Selects an intent, validates the conversation form, and sends
   each request through the existing Studio inbox and email flow.
   ============================================================ */
(function () {
  'use strict';

  var form = document.getElementById('next-steps-form');
  if (!form) return;

  var formCard = document.querySelector('.ns-form-card');
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-next-step]'));
  var choices = Array.prototype.slice.call(form.querySelectorAll('input[name="next_step"]'));
  var errorSummary = document.getElementById('ns-error-summary');
  var status = document.getElementById('ns-form-status');
  var submitButton = form.querySelector('button[type="submit"]');
  var initialButtonLabel = submitButton ? submitButton.textContent : 'Send my next step';

  var steps = {
    follow_jesus: {
      label: 'Following Jesus',
      kind: 'next_step_follow_jesus',
      prompt: 'What questions can we help you work through?'
    },
    baptism: {
      label: 'Baptism',
      kind: 'next_step_baptism',
      prompt: 'Tell us what has you thinking about baptism.'
    },
    membership: {
      label: 'Membership',
      kind: 'next_step_membership',
      prompt: 'What would you like to know about becoming a member?'
    },
    group: {
      label: 'Joining a group',
      kind: 'next_step_group',
      prompt: 'Tell us a little about the kind of group you are looking for.'
    },
    serve: {
      label: 'Serving',
      kind: 'next_step_serve',
      prompt: 'Are there any areas where you already enjoy helping?'
    },
    pastor: {
      label: 'Talking with a pastor',
      kind: 'next_step_pastor',
      prompt: 'Share only what you are comfortable sharing before we connect.'
    }
  };

  function selectedStep() {
    var checked = form.querySelector('input[name="next_step"]:checked');
    return checked ? checked.value : '';
  }

  function setStep(value, scrollToForm) {
    if (!steps[value]) return;
    choices.forEach(function (input) { input.checked = input.value === value; });
    cards.forEach(function (card) {
      var selected = card.getAttribute('data-next-step') === value;
      card.classList.toggle('is-selected', selected);
      if (selected) card.setAttribute('aria-current', 'step');
      else card.removeAttribute('aria-current');
    });
    var message = form.elements.message;
    if (message) message.setAttribute('placeholder', steps[value].prompt);
    clearFieldError('next_step');
    if (scrollToForm) {
      var target = document.getElementById('next-step-form');
      if (target) {
        target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        window.setTimeout(function () {
          var name = form.elements.name;
          if (name) name.focus({ preventScroll: true });
        }, 500);
      }
    }
  }

  cards.forEach(function (card) {
    card.addEventListener('click', function (event) {
      event.preventDefault();
      setStep(card.getAttribute('data-next-step'), true);
    });
  });

  choices.forEach(function (input) {
    input.addEventListener('change', function () { setStep(input.value, false); });
  });

  function describedByWithoutError(field) {
    var described = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    return described.filter(function (id) { return !/-error$/.test(id); }).join(' ');
  }

  function setFieldError(name, message) {
    var field = form.elements[name];
    var error = document.getElementById('ns-' + name + '-error');
    if (field && field.length && !field.tagName) field = field[0];
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      var clean = describedByWithoutError(field);
      field.setAttribute('aria-describedby', (clean ? clean + ' ' : '') + 'ns-' + name + '-error');
    }
    if (error) { error.textContent = message; error.hidden = false; }
  }

  function clearFieldError(name) {
    var field = form.elements[name];
    var error = document.getElementById('ns-' + name + '-error');
    if (field && field.length && !field.tagName) {
      Array.prototype.forEach.call(field, function (item) {
        item.removeAttribute('aria-invalid');
        var clean = describedByWithoutError(item);
        if (clean) item.setAttribute('aria-describedby', clean); else item.removeAttribute('aria-describedby');
      });
    } else if (field) {
      field.removeAttribute('aria-invalid');
      var clean = describedByWithoutError(field);
      if (clean) field.setAttribute('aria-describedby', clean); else field.removeAttribute('aria-describedby');
    }
    if (error) { error.textContent = ''; error.hidden = true; }
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validate() {
    var errors = [];
    ['next_step', 'name', 'email', 'phone', 'preferred_contact'].forEach(clearFieldError);
    if (errorSummary) errorSummary.hidden = true;

    if (!selectedStep()) {
      setFieldError('next_step', 'Choose the next step you would like help with.');
      errors.push('Choose a next step.');
    }

    var name = form.elements.name.value.trim();
    if (!name) {
      setFieldError('name', 'Enter your name so we know who to contact.');
      errors.push('Enter your name.');
    }

    var email = form.elements.email.value.trim();
    if (!email) {
      setFieldError('email', 'Enter your email address.');
      errors.push('Enter your email address.');
    } else if (!validEmail(email)) {
      setFieldError('email', 'Enter a complete email address, such as name@example.com.');
      errors.push('Check your email address.');
    }

    var preferred = form.elements.preferred_contact.value;
    if (!preferred) {
      setFieldError('preferred_contact', 'Choose how you would like us to respond.');
      errors.push('Choose a contact method.');
    }

    var phone = form.elements.phone.value.trim();
    if ((preferred === 'Phone call' || preferred === 'Text message') && !phone) {
      setFieldError('phone', 'Add a phone number for a call or text response.');
      errors.push('Add your phone number.');
    }

    if (errors.length) {
      if (errorSummary) {
        errorSummary.textContent = errors.join(' ');
        errorSummary.hidden = false;
        errorSummary.focus();
      }
      return false;
    }
    return true;
  }

  Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea'), function (field) {
    var eventName = field.type === 'radio' || field.tagName === 'SELECT' ? 'change' : 'input';
    field.addEventListener(eventName, function () {
      if (field.name) clearFieldError(field.name);
      if (status) status.hidden = true;
    });
  });

  function setBusy(busy) {
    if (!submitButton) return;
    submitButton.disabled = busy;
    submitButton.setAttribute('aria-busy', busy ? 'true' : 'false');
    submitButton.textContent = busy ? 'Sending your next step...' : initialButtonLabel;
  }

  function showFailure(result) {
    setBusy(false);
    if (!status) return;
    status.hidden = false;
    status.className = 'ev-form-msg err';
    var text = 'We could not send that just now. Please call 304-587-4709 and we will help you personally.';
    if (/[?&]debug=1/.test(window.location.search) && result && result.errs && result.errs.length) {
      text += ' Debug: ' + result.errs.join(' | ');
    }
    status.textContent = text;
    status.focus();
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showSuccess(firstName, stepLabel) {
    if (!formCard) return;
    formCard.innerHTML =
      '<div class="ns-success" role="status" tabindex="-1">' +
        '<div class="ns-success-mark" aria-hidden="true">&#10003;</div>' +
        '<span class="kick">Next step received</span>' +
        '<h3>We are glad you reached out</h3>' +
        '<p>Thanks, ' + esc(firstName) + '. Your interest in ' + esc(stepLabel.toLowerCase()) + ' was sent securely to Fairview Baptist Temple. Someone from our church will follow up with you soon.</p>' +
        '<a class="btn btn-b" href="/">Return home</a>' +
      '</div>';
    var success = formCard.querySelector('.ns-success');
    if (success) success.focus();
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!validate()) return;

    var value = selectedStep();
    var step = steps[value];
    var name = form.elements.name.value.trim();
    var email = form.elements.email.value.trim();
    var phone = form.elements.phone.value.trim();
    var message = form.elements.message.value.trim();
    var preferred = form.elements.preferred_contact.value;

    if (form.elements.website && form.elements.website.value) {
      showSuccess(name.split(/\s+/)[0] || 'friend', step.label);
      return;
    }

    if (!window.FBTForms || typeof window.FBTForms.submit !== 'function') {
      showFailure({ errs: ['The form service did not load.'] });
      return;
    }

    setBusy(true);
    if (status) status.hidden = true;
    window.FBTForms.submit(step.kind, {
      name: name,
      email: email,
      phone: phone,
      message: message,
      details: {
        next_step: step.label,
        preferred_contact: preferred,
        source: 'Next Steps page'
      }
    }).then(function (result) {
      if (result && result.ok) showSuccess(name.split(/\s+/)[0] || 'friend', step.label);
      else showFailure(result || {});
    }).catch(function (error) {
      showFailure({ errs: [error && error.message ? error.message : String(error)] });
    });
  });

  var requested = '';
  try {
    requested = new URLSearchParams(window.location.search).get('step') || '';
  } catch (e) {
    var match = window.location.search.match(/[?&]step=([^&]+)/);
    requested = match ? decodeURIComponent(match[1]) : '';
  }
  if (steps[requested]) setStep(requested, false);
})();
