import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { setupQuoteForm } from '../quote-form.mjs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const reference = 'c819376a-48dd-4ed9-a221-a59f564d617b';
const tick = () => new Promise(resolve => setImmediate(resolve));
function page(t, send, query = '') {
  const window = new Window({ url: 'https://example.invalid/' + query });
  t.after(() => window.happyDOM.close());
  const document = window.document;
  document.write(html);
  const form = document.getElementById('quote-form');
  const values = { name: 'Test Customer', phone: '555-0100', email: 'test@example.invalid', location: 'Philadelphia MS', project: 'Custom Barn Door', size: '36 x 84', details: 'Please discuss a door for our room.' };
  for (const [key, value] of Object.entries(values)) form.elements.namedItem(key).value = value;
  form.elements.namedItem('consent').checked = true;
  setupQuoteForm({ document, window, send, requestId: reference });
  const submit = () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  return { window, document, form, submit, status: document.getElementById('quote-status'), button: form.querySelector('button[type="submit"]') };
}
test('duplicate taps make one request and only acceptance creates a receipt', async t => {
  let finish, calls = 0;
  const p = page(t, () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  p.submit(); p.submit();
  assert.equal(calls, 1); assert.equal(p.button.disabled, true); assert.equal(p.form.getAttribute('aria-busy'), 'true');
  assert.doesNotMatch(p.status.textContent, /Thank you/);
  finish(); await tick();
  assert.match(p.status.textContent, new RegExp(reference)); assert.match(p.status.textContent, /received for review/);
  assert.equal(p.form.hasAttribute('aria-busy'), false); assert.equal(p.button.disabled, true);
  p.submit(); assert.equal(calls, 1);
});
test('rejected or timed out submissions preserve entries, reference and retry ownership', async t => {
  for (const error of [new TypeError('offline'), new DOMException('timeout', 'TimeoutError'), new Error('private provider diagnostic')]) {
    const payloads = [];
    const p = page(t, async quote => { payloads.push(quote); throw error; });
    p.submit(); await tick();
    assert.equal(payloads.length, 1); assert.equal(p.button.disabled, false);
    assert.equal(p.form.elements.namedItem('details').value, 'Please discuss a door for our room.');
    assert.match(p.status.textContent, /could not confirm/); assert.match(p.status.textContent, new RegExp(reference));
    assert.doesNotMatch(p.status.textContent, /private provider diagnostic/); assert.equal(p.form.hasAttribute('aria-busy'), false);
    p.submit(); await tick();
    assert.equal(payloads.length, 2); assert.equal(payloads[1].id, payloads[0].id);
  }
});
test('invalid design never leaves the browser and can be corrected without losing form fields', async t => {
  const payloads = []; const p = page(t, async quote => { payloads.push(quote); });
  p.document.getElementById('configurator').hidden = false;
  const notes = p.document.getElementById('design-notes'); notes.value = 'x'.repeat(2001);
  p.submit(); await tick(); assert.equal(payloads.length, 0); assert.match(p.status.textContent, /design notes/);
  assert.equal(notes.value.length, 2001); assert.equal(p.button.disabled, false);
  notes.value = 'Please use the existing hardware.'; p.submit(); await tick();
  assert.equal(payloads.length, 1); assert.equal(payloads[0].design_options.design.notes, notes.value);
});
test('hidden studio selections are excluded and native required/consent validation blocks sending', async t => {
  const payloads = []; const p = page(t, async quote => { payloads.push(quote); });
  p.form.elements.namedItem('consent').checked = false; p.submit(); await tick(); assert.equal(payloads.length, 0);
  p.form.elements.namedItem('consent').checked = true; p.submit(); await tick();
  assert.equal(payloads[0].design_options.design, null);
});
test('only known project query values are selected', t => {
  const known = page(t, async () => {}, '?project=Custom%20Cabinetry');
  assert.equal(known.form.elements.namedItem('project').value, 'Custom Cabinetry');
  const bad = page(t, async () => {}, '?project=Unlisted');
  assert.equal(bad.form.elements.namedItem('project').value, 'Custom Barn Door');
});
