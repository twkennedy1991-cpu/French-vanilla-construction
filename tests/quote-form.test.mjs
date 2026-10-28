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
  p.document.querySelector('[data-type="Custom Barn Door"]').click();
  p.document.getElementById('use-design').click();
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

test('opening the studio does not silently attach design context or send a request', async t => {
  const payloads = [];const p = page(t, async quote => payloads.push(quote));
  p.document.querySelector('[data-type="Custom Barn Door"]').click();
  assert.equal(payloads.length, 0);assert.equal(p.document.getElementById('quote-include-design').checked, false);
  assert.match(p.document.getElementById('quote-design-summary').textContent, /not included/);
  p.submit();await tick();assert.equal(payloads[0].design_options.design, null);
});
test('explicitly using each studio category attaches selections under the matching quote service', async t => {
  for (const [type, service] of [['Kitchen Cabinetry', 'Custom Cabinetry'], ['Custom Barn Door', 'Custom Barn Door'], ['Bathroom Remodel', 'Bathroom Remodel']]) {
    const payloads = [];const p = page(t, async quote => payloads.push(quote));
    p.document.querySelector('[data-type="' + type + '"]').click();
    p.document.getElementById('dimensions').value = '36 x 84 inches';
    p.document.getElementById('design-notes').value = 'Keep the existing trim.';
    p.document.getElementById('use-design').click();
    assert.equal(payloads.length, 0);assert.match(p.document.getElementById('design-status').textContent, /No request has been sent/);
    assert.equal(p.form.elements.namedItem('project').value, service);
    assert.match(p.document.getElementById('quote-design-summary').textContent, /Included:/);
    assert.equal(p.form.elements.namedItem('details').value, 'Please discuss a door for our room.');
    p.submit();await tick();assert.equal(payloads.length, 1);
    assert.equal(payloads[0].project_type, service);assert.equal(payloads[0].design_options.design.project, type);
    assert.equal(payloads[0].design_options.design.notes, 'Keep the existing trim.');
  }
});
test('changing the quote service requires reconciling or removing the design attachment', async t => {
  const payloads = [];const p = page(t, async quote => payloads.push(quote));
  p.document.querySelector('[data-type="Custom Barn Door"]').click();p.document.getElementById('use-design').click();
  p.form.elements.namedItem('project').value = 'Custom Cabinetry';
  p.form.elements.namedItem('project').dispatchEvent(new p.window.Event('change'));
  assert.match(p.document.getElementById('quote-design-summary').textContent, /uncheck/);
  p.submit();await tick();assert.equal(payloads.length, 0);assert.match(p.status.textContent, /Choose Custom Barn Door/);
  const include = p.document.getElementById('quote-include-design');include.checked = false;include.dispatchEvent(new p.window.Event('change'));
  p.submit();await tick();assert.equal(payloads.length, 1);assert.equal(payloads[0].design_options.design, null);
  assert.equal(p.document.getElementById('configurator').hidden, false);
});
test('switching studio category resets attachment consent while retaining contact and project notes', t => {
  const p = page(t, async () => assert.fail('studio actions must not send'));
  p.document.querySelector('[data-type="Custom Barn Door"]').click();p.document.getElementById('use-design').click();
  p.document.getElementById('design-notes').value = 'Owner supplied hardware.';
  p.document.querySelector('[data-type="Kitchen Cabinetry"]').click();
  assert.equal(p.document.getElementById('quote-include-design').checked, false);
  assert.equal(p.document.getElementById('design-notes').value, 'Owner supplied hardware.');
  assert.equal(p.form.elements.namedItem('email').value, 'test@example.invalid');
  assert.match(p.document.getElementById('quote-design-summary').textContent, /not included/);
});
test('studio summary renders customer-entered text safely and copies without submitting or attaching', async t => {
  const p = page(t, async () => assert.fail('copy must not send'));let copied;
  p.window.navigator.clipboard.writeText = async text => { copied = text; };
  p.document.querySelector('[data-type="Custom Barn Door"]').click();
  const notes = p.document.getElementById('design-notes');notes.value = '<img src=x onerror=alert(1)>';notes.dispatchEvent(new p.window.Event('input'));
  p.document.getElementById('copy-design').click();await tick();assert.match(copied, /<img src=x/);
  assert.equal(p.document.getElementById('quote-include-design').checked, false);
  p.document.getElementById('use-design').click();
  assert.match(p.document.getElementById('quote-design-summary').textContent, /<img src=x/);
  assert.equal(p.document.querySelectorAll('#quote-design-summary img').length, 0);
});
test('pending submission locks customer and studio inputs then restores their original disabled states', async t => {
  let reject;const p = page(t, () => new Promise((resolve, fail) => { reject = fail; }));
  assert.equal(p.document.getElementById('quote-include-design').disabled, true);
  p.submit();assert.equal(p.form.elements.namedItem('email').disabled, true);
  assert.equal(p.document.getElementById('wood').disabled, true);assert.equal(p.document.querySelector('[data-type]').disabled, true);
  reject(new TypeError('offline'));await tick();
  assert.equal(p.form.elements.namedItem('email').disabled, false);assert.equal(p.document.getElementById('wood').disabled, false);
  assert.equal(p.document.getElementById('quote-include-design').disabled, true);
});

test('incoming layout is shown but transmitted only after explicit inclusion',async t=>{
 const {DEFAULT_LAYOUT}=await import('../layout-planner.mjs');
 const query='?project=Custom%20Cabinetry&layout='+encodeURIComponent(JSON.stringify(DEFAULT_LAYOUT));
 const payloads=[];const p=page(t,async quote=>payloads.push(quote),query);
 assert.equal(p.document.getElementById('quote-layout').hidden,false);assert.equal(p.document.getElementById('quote-include-layout').checked,false);
 p.submit();await tick();assert.equal(payloads[0].design_options.design,null);
 const included=[];const other=page(t,async quote=>included.push(quote),query);other.document.getElementById('quote-include-layout').checked=true;
 other.submit();await tick();assert.match(included[0].design_options.design.notes,/Customer layout concept \(unverified\)/);
 assert.match(included[0].design_options.design.notes,/144 × 120/);assert.equal(included[0].design_options.design.project,'Kitchen Cabinetry');
});
test('layout service mismatches and overflowing combined notes cannot send, and invalid links keep ordinary inquiry available',async t=>{
 const {DEFAULT_LAYOUT}=await import('../layout-planner.mjs');
 const payloads=[];const p=page(t,async quote=>payloads.push(quote),'?layout='+encodeURIComponent(JSON.stringify(DEFAULT_LAYOUT)));
 p.document.getElementById('quote-include-layout').checked=true;p.submit();await tick();assert.equal(payloads.length,0);assert.match(p.status.textContent,/Choose Custom Cabinetry/);
 p.document.querySelector('[data-type="Kitchen Cabinetry"]').click();p.document.getElementById('use-design').click();p.document.getElementById('design-notes').value='x'.repeat(2000);
 p.submit();await tick();assert.equal(payloads.length,0);assert.equal(p.document.getElementById('design-notes').value.length,2000);
 const bad=[];const other=page(t,async quote=>bad.push(quote),'?layout=invalid');
 assert.equal(other.document.getElementById('quote-include-layout').disabled,true);assert.match(other.document.getElementById('quote-layout-summary').textContent,/could not be loaded/);
 other.submit();await tick();assert.equal(bad.length,1);assert.equal(bad[0].design_options.design,null);
});

test('reserved spaces reach inquiries only after inclusion and invalid spaces cannot attach',async t=>{
 const {DEFAULT_LAYOUT}=await import('../layout-planner.mjs');
 const layout={...DEFAULT_LAYOUT,schema:'fv.layout.v2',spaces:[{wall:'back',offset:30.25,width:36}]};
 const query='?project=Custom%20Cabinetry&layout='+encodeURIComponent(JSON.stringify(layout));
 const excluded=[];const a=page(t,async quote=>excluded.push(quote),query);a.submit();await tick();assert.equal(excluded[0].design_options.design,null);
 const included=[];const b=page(t,async quote=>included.push(quote),query);b.document.getElementById('quote-include-layout').checked=true;b.submit();await tick();
 assert.match(included[0].design_options.design.notes,/start 30.25 in, width 36 in/);assert.match(included[0].design_options.design.notes,/Reserved widths only/);
 const bad={...layout,spaces:[{wall:'right',offset:0,width:30}]};const c=page(t,async()=>assert.fail('invalid layout must not attach'),'?project=Custom%20Cabinetry&layout='+encodeURIComponent(JSON.stringify(bad)));
 assert.equal(c.document.getElementById('quote-include-layout').disabled,true);c.document.getElementById('quote-include-layout').checked=true;c.submit();await tick();assert.match(c.status.textContent,/valid planner layout/);
});
