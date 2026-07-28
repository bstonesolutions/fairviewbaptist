const test = require('node:test');
const assert = require('node:assert/strict');

const notify = require('../api/notify');

test('public email validation matches durable Studio form requirements', function () {
  assert.throws(function () {
    notify.validate({ kind: 'contact', name: 'A Visitor', email: 'visitor@example.com' });
  }, /message is required/i);
  assert.throws(function () {
    notify.validate({ kind: 'visit', name: 'A Visitor', message: 'Coming Sunday' });
  }, /name and email are required/i);
  assert.throws(function () {
    notify.validate({ kind: 'newsletter', name: 'A Visitor' });
  }, /email is required/i);
  assert.throws(function () {
    notify.validate({ kind: 'next_step_baptism', name: 'A Visitor', message: 'I have questions.' });
  }, /name and email are required/i);

  const row = notify.validate({
    kind: 'next_step_baptism', name: 'A Visitor', email: 'VISITOR@EXAMPLE.COM',
    message: 'I have questions.', details: { preferred_contact: 'Email' }
  });
  assert.equal(row.email, 'visitor@example.com');
  assert.equal(row.kind, 'next_step_baptism');
});

test('public email validation rejects over-limit values instead of truncating them', function () {
  assert.throws(function () {
    notify.validate({
      kind: 'prayer', name: 'x'.repeat(121), message: 'Please pray.'
    });
  }, /too long/i);
  assert.throws(function () {
    notify.validate({
      kind: 'newsletter', email: 'a'.repeat(250) + '@example.com'
    });
  }, /too long/i);
});
