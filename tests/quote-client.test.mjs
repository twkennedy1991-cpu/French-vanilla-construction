import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuote, submitQuote } from '../quote-client.mjs';
const fields = { name: ' Test Visitor ', email: 'test@example.com', phone: '555-0100', location: 'Philadelphia, MS', project: 'Custom Barn Door', size: '36 × 84 inches', details: 'Test inquiry', consent: 'on' };
test('retains customer evidence and labels dimensions unverified', () => {
  const quote = buildQuote(fields, 'test-id', { wood: 'White Oak' });
  assert.equal(quote.customer_name, 'Test Visitor');
  assert.deepEqual(quote.measurements, { customer_supplied: fields.size, verified: false });
  assert.equal(quote.design_options.design.wood, 'White Oak');
  assert.equal(quote.design_options.contact_consent, true);
  assert.equal(quote.status, 'new');
});
test('rejects missing contact details, unknown project, oversized details and absent consent', () => {
  for (const change of [{ name: ' ' }, { email: 'invalid' }, { phone: '' }, { location: '' }, { project: 'Type of Project' }, { details: 'x'.repeat(4001) }, { consent: '' }]) {
    assert.throws(() => buildQuote({ ...fields, ...change }, 'test-id'));
  }
});
test('uses insert-only minimal response and reports success only after acceptance', async () => {
  let options;
  await submitQuote(buildQuote(fields, 'test-id'), async (url, init) => {
    assert.match(url, /\/rest\/v1\/quote_requests$/);
    options = init;
    return { ok: true };
  });
  assert.equal(options.headers.Prefer, 'return=minimal');
  assert.equal(options.method, 'POST');
  assert.equal(JSON.parse(options.body).id, 'test-id');
});
test('never turns rejection or a network failure into confirmation and never retries automatically', async () => {
  let calls = 0;
  await assert.rejects(submitQuote({}, async () => { calls++; return { ok: false }; }), /could not confirm/);
  assert.equal(calls, 1);
  await assert.rejects(submitQuote({}, async () => { throw new TypeError('offline'); }), /offline/);
});
