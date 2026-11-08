import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { setupQuoteForm } from '../quote-form.mjs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const reference = 'c819376a-48dd-4ed9-a221-a59f564d617b';
const tick = () => new Promise(resolve => setImmediate(resolve));
const testFields = { name: 'Test Customer', phone: '555-0100', email: 'test@example.invalid', location: 'Philadelphia MS', size: '36 x 84', details: 'Please discuss a door for our room.' };
function page(t, send, path = '', { seed = true } = {}) {
  const window = new Window({ url: 'https://example.invalid/' + path });
  t.after(() => window.happyDOM.close());
  const document = window.document;
  document.write(html);
  const form = document.getElementById('quote-form');
  if (seed) {
    for (const [key, value] of Object.entries(testFields)) form.elements.namedItem(key).value = value;
    form.elements.namedItem('project').value = 'Custom Barn Door';
    form.elements.namedItem('consent').checked = true;
  }
  setupQuoteForm({ document, window, send, requestId: reference });
  const submit = () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  return {
    window, document, form, submit, status: document.getElementById('quote-status'),
    draftStatus: document.getElementById('quote-draft-status'), button: form.querySelector('button[type="submit"]')
  };
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
  p.submit(); await tick(); assert.equal(payloads.length, 0); assert.match(p.draftStatus.textContent, /design notes/);
  assert.equal(notes.value.length, 2001); assert.equal(p.button.disabled, false);
  notes.value = 'Please use the existing hardware.'; p.submit(); await tick();
  assert.equal(payloads.length, 1); assert.equal(payloads[0].design_options.design.notes, notes.value);
});
test('custom quote validation focuses and describes the field that needs correction', async t => {
  const cases = [
    ['name', '   ', /check your name/],
    ['details', '   ', /check your project details/],
    ['email', 'customer@local', /enter a valid email/]
  ];
  for (const [name, invalidValue, message] of cases) {
    const payloads = [];
    const p = page(t, async quote => payloads.push(quote));
    const control = p.form.elements.namedItem(name);
    const validValue = control.value;
    const include = p.document.getElementById('quote-include-design');
    p.document.querySelector('[data-type="Custom Barn Door"]').click();
    p.document.getElementById('use-design').click();
    control.setAttribute('aria-describedby', 'quote-test-help');
    control.setAttribute('aria-invalid', 'false');
    control.value = invalidValue;
    assert.equal(p.form.reportValidity(), true);
    p.button.focus();
    p.button.click();
    assert.deepEqual(payloads, []);
    assert.equal(p.document.activeElement.getAttribute('name'), name);
    assert.match(p.draftStatus.textContent, message);
    assert.equal(control.getAttribute('aria-describedby'), 'quote-test-help quote-field-error');
    assert.match(p.document.getElementById('quote-field-error').textContent, message);
    assert.equal(control.getAttribute('aria-invalid'), 'true');
    assert.equal(control.value, invalidValue);
    assert.equal(include.checked, true);
    assert.equal(p.form.elements.namedItem('consent').checked, true);

    const size = p.form.elements.namedItem('size');
    size.dispatchEvent(new p.window.Event('input', { bubbles: true }));
    assert.match(p.draftStatus.textContent, message);
    control.value = validValue;
    control.dispatchEvent(new p.window.Event('input', { bubbles: true }));
    assert.equal(control.getAttribute('aria-describedby'), 'quote-test-help');
    assert.equal(control.getAttribute('aria-invalid'), 'false');
    assert.equal(p.draftStatus.textContent, '');
    p.button.click();
    await tick();
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].id, reference);
    assert.equal(payloads[0].design_options.design.project, 'Custom Barn Door');
  }
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
test('service-page quote links preselect only their editable project type', async t => {
  const cases = [
    ['cabinetry.html', 'Custom Cabinetry', ['nav', 'footer', '.service-hero', '.service-cta']],
    ['barn-doors.html', 'Custom Barn Door', ['nav', 'footer', '.service-hero', '.service-cta']],
    ['kitchen-planner.html', 'Custom Cabinetry', ['nav', 'noscript']]
  ];
  const document = new Window({ url: 'https://example.invalid/' }).document;
  t.after(() => document.defaultView.happyDOM.close());
  for (const [file, service, selectors] of cases) {
    const source = document.implementation.createHTMLDocument();
    source.documentElement.innerHTML = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    const destinations = selectors.map(selector => {
      const link = source.querySelector(selector + ' a[href$="#contact"]');
      assert.ok(link, file + ' ' + selector);
      const url = new URL(link.getAttribute('href'), 'https://example.invalid/' + file);
      assert.equal(url.origin, 'https://example.invalid');
      assert.equal(url.pathname, '/index.html');
      assert.equal(url.hash, '#contact');
      assert.deepEqual([...url.searchParams], [['project', service]], file + ' ' + selector);
      return url;
    });
    const target = destinations[0];
    const sent = [];
    const p = page(t, async quote => sent.push(quote), target.href.slice(target.origin.length + 1), { seed: false });
    const project = p.form.elements.namedItem('project');
    const consent = p.form.elements.namedItem('consent');
    assert.equal(project.value, service);
    assert.equal(project.disabled, false);
    assert.equal(consent.checked, false);
    assert.equal(p.document.getElementById('quote-include-design').checked, false);
    assert.equal(p.document.getElementById('quote-include-layout').checked, false);
    assert.equal(p.document.getElementById('quote-layout').hidden, true);
    for (const [field, value] of Object.entries(testFields)) {
      const control = p.form.elements.namedItem(field);
      assert.equal(control.value, '');
      control.value = value;
    }
    p.button.click();
    assert.deepEqual(sent, []);
    const chosen = file === 'kitchen-planner.html' ? 'Kitchen Remodel' : service;
    project.value = chosen;
    consent.checked = true;
    p.button.click();
    await tick();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].project_type, chosen);
    assert.equal(sent[0].design_options.design, null);
  }
  const generic = page(t, async () => assert.fail('opening a general quote must not send'), 'index.html#contact', { seed: false });
  assert.equal(generic.document.querySelector('.hero a.btn.gold').getAttribute('href'), '#contact');
  assert.equal(generic.form.elements.namedItem('project').value, '');
});

test('opening the studio does not silently attach design context or send a request', async t => {
  const payloads = [];const p = page(t, async quote => payloads.push(quote));
  p.document.querySelector('[data-type="Custom Barn Door"]').click();
  assert.equal(payloads.length, 0);assert.equal(p.document.getElementById('quote-include-design').checked, false);
  assert.match(p.document.getElementById('quote-design-summary').textContent, /not included/);
  p.submit();await tick();assert.equal(payloads[0].design_options.design, null);
});
test('opening a design category moves keyboard focus to the visible studio heading', t => {
  const p = page(t, () => assert.fail('opening the studio must not send'));
  const category = p.document.querySelector('[data-type="Kitchen Cabinetry"]');
  category.focus();
  category.click();
  assert.equal(p.document.getElementById('configurator').hidden, false);
  assert.equal(p.document.activeElement.id, 'config-title');
  assert.match(p.document.activeElement.textContent, /Kitchen Cabinetry/);
  assert.equal(p.document.getElementById('quote-include-design').checked, false);
});
test('using studio selections starts keyboard navigation at the quote heading', t => {
  const p = page(t, () => assert.fail('using selections must not send'));
  const consent = p.form.elements.namedItem('consent');
  consent.checked = false;
  p.document.querySelector('[data-type="Kitchen Cabinetry"]').click();
  const useSelections = p.document.getElementById('use-design');
  useSelections.focus();
  useSelections.click();
  assert.equal(p.document.activeElement.id, 'door-quote');
  assert.equal(p.form.elements.namedItem('project').value, 'Custom Cabinetry');
  assert.equal(p.document.getElementById('quote-include-design').checked, true);
  assert.equal(p.form.elements.namedItem('email').value, 'test@example.invalid');
  assert.equal(consent.checked, false);
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
  p.submit();await tick();assert.equal(payloads.length, 0);assert.match(p.draftStatus.textContent, /Choose Custom Barn Door/);
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
 p.document.getElementById('quote-include-layout').checked=true;p.submit();await tick();assert.equal(payloads.length,0);assert.match(p.draftStatus.textContent,/Choose Custom Cabinetry/);
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
 assert.equal(c.document.getElementById('quote-include-layout').disabled,true);c.document.getElementById('quote-include-layout').checked=true;c.submit();await tick();assert.match(c.draftStatus.textContent,/valid planner layout/);
});

const editingLayout = {schema:'fv.layout.v2',shape:'U',width:168.25,depth:120,cabinetDepth:24,cabinetHeight:34.5,moduleWidth:30,spaces:[{wall:'back',offset:36.25,width:36}]};
const editingQuery = '?project=Custom%20Cabinetry&layout='+encodeURIComponent(JSON.stringify(editingLayout));
const editField = (p,key,value,spaceIndex=null) => {
 const parent = spaceIndex === null ? p.document.getElementById('quote-layout-edit-fields') : p.document.getElementById('quote-layout-edit-spaces').children[spaceIndex];
 const control=parent.querySelector(`[data-layout-field=${key}]`);control.value=value;control.dispatchEvent(new p.window.Event('input',{bubbles:true}));return control;
};
const applyEdit = p => p.document.getElementById('quote-layout-edit-form').dispatchEvent(new p.window.Event('submit',{bubbles:true,cancelable:true}));
test('editing and validating a quote preserves its unconfirmed delivery reference', async t => {
  const attempts = [];
  let confirmRetry;
  const p = page(t, async quote => {
    attempts.push(quote);
    if (attempts.length === 1) throw new Error('Response lost');
    await new Promise(resolve => { confirmRetry = resolve; });
  }, editingQuery);
  const get = id => p.document.getElementById(id);
  const includeLayout = get('quote-include-layout');
  includeLayout.checked = true;
  p.button.click();
  await tick();
  const unconfirmed = p.status.textContent;
  assert.match(unconfirmed, /could not confirm/);
  assert.ok(unconfirmed.includes(reference));

  const details = p.form.elements.namedItem('details');
  details.value = '   ';
  p.button.focus();
  p.button.click();
  assert.equal(attempts.length, 1);
  assert.equal(p.status.textContent, unconfirmed);
  assert.equal(p.document.activeElement.getAttribute('name'), 'details');
  assert.match(p.draftStatus.textContent, /check your project details/);

  get('quote-edit-layout').click();
  editField(p, 'width', '180.25');
  applyEdit(p);
  details.value = 'Revised project details.';
  details.dispatchEvent(new p.window.Event('input', { bubbles: true }));
  assert.equal(p.status.textContent, unconfirmed);
  assert.match(p.draftStatus.textContent, /Layout updated/);
  assert.equal(details.hasAttribute('aria-invalid'), false);
  assert.equal(details.hasAttribute('aria-describedby'), false);
  assert.equal(includeLayout.checked, false);
  get('quote-remove-layout').click();
  assert.equal(p.status.textContent, unconfirmed);
  get('quote-restore-layout').click();
  assert.equal(p.status.textContent, unconfirmed);
  assert.equal(includeLayout.checked, false);

  const project = p.form.elements.namedItem('project');
  includeLayout.checked = true;
  project.value = 'Custom Barn Door';
  p.button.click();
  assert.equal(attempts.length, 1);
  assert.match(p.draftStatus.textContent, /Choose Custom Cabinetry/);
  assert.equal(p.status.textContent, unconfirmed);

  p.window.navigator.clipboard.writeText = async () => { throw new Error('Unavailable'); };
  get('quote-copy-reference').click();
  await tick();
  assert.match(get('quote-reference-status').textContent, /Select the reference/);
  assert.equal(p.status.textContent, unconfirmed);

  project.value = 'Custom Cabinetry';
  p.button.click();
  p.button.click();
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].id, attempts[1].id);
  assert.equal(attempts[1].project_description, 'Revised project details.');
  assert.match(attempts[1].design_options.design.notes, /180\.25 × 120/);
  assert.equal(p.draftStatus.textContent, '');
  confirmRetry();
  await tick();
  assert.match(p.status.textContent, /received for review/);
});
test('quote layout edits preserve all contact and studio fields, require renewed inclusion and update only geometry in the URL', async t=>{
 const payloads=[];const p=page(t,async quote=>payloads.push(quote),editingQuery);
 p.document.querySelector('[data-type="Kitchen Cabinetry"]').click();p.document.getElementById('use-design').click();p.document.getElementById('design-notes').value='Keep the trim.';
 p.document.getElementById('quote-include-layout').checked=true;
 const before=[...p.form.querySelectorAll('input[name],select[name],textarea[name]')].map(c=>[c.name,c.value,c.checked]);
 p.document.getElementById('quote-edit-layout').click();assert.equal(p.document.getElementById('quote-layout-editor').open,true);
 editField(p,'width','180.25');editField(p,'offset','42.5',0);applyEdit(p);
 assert.equal(payloads.length,0);assert.equal(p.document.getElementById('quote-layout-editor').hidden,true);
 assert.deepEqual([...p.form.querySelectorAll('input[name],select[name],textarea[name]')].map(c=>[c.name,c.value,c.checked]),before);
 assert.equal(p.document.getElementById('design-notes').value,'Keep the trim.');assert.equal(p.document.getElementById('quote-include-layout').checked,false);
 const url=new URL(p.window.location.href);assert.deepEqual([...url.searchParams.keys()],['project','layout']);assert.doesNotMatch(url.href,/Test|Customer|example.invalid%40|Keep/);
 assert.equal(JSON.parse(url.searchParams.get('layout')).width,180.25);assert.equal(JSON.parse(url.searchParams.get('layout')).spaces[0].offset,42.5);
 assert.match(p.document.getElementById('quote-layout-summary').textContent,/180.25 × 120/);
 assert.equal(p.window.localStorage.length,0);assert.equal(p.window.sessionStorage.length,0);
 p.document.getElementById('quote-include-layout').checked=true;p.submit();await tick();assert.match(payloads[0].design_options.design.notes,/start 42.5 in, width 36 in/);assert.match(payloads[0].design_options.design.notes,/Keep the trim/);
});
test('cancel button and Escape discard draft edits and preserve original inclusion and URL',t=>{
 const p=page(t,()=>assert.fail('editing must not send'),editingQuery);const url=p.window.location.href;
 p.document.getElementById('quote-include-layout').checked=true;
 for(const kind of ['button','escape']){
  p.document.getElementById('quote-edit-layout').click();editField(p,'width','190');
  if(kind==='button')p.document.getElementById('quote-layout-cancel').click();else p.document.getElementById('quote-layout-editor').dispatchEvent(new p.window.Event('cancel',{cancelable:true}));
  assert.equal(p.window.location.href,url);assert.equal(p.document.getElementById('quote-include-layout').checked,true);assert.match(p.document.getElementById('quote-layout-summary').textContent,/168.25 × 120/);
  assert.equal(p.document.activeElement,p.document.getElementById('quote-edit-layout'));
 }
 p.document.getElementById('quote-edit-layout').click();assert.equal(p.document.querySelector('#quote-layout-edit-fields [data-layout-field=width]').value,'168.25');
});
test('quote editor rejects invalid dimensions and conflicting spaces without changing the original concept',t=>{
 const p=page(t,()=>assert.fail('editing must not send'),editingQuery),url=p.window.location.href;
 p.document.getElementById('quote-edit-layout').click();editField(p,'width','');applyEdit(p);
 assert.equal(p.document.getElementById('quote-layout-apply').disabled,true);assert.equal(p.document.getElementById('quote-layout-edit-preview').children.length,0);assert.equal(p.window.location.href,url);
 editField(p,'width','168.25');p.document.getElementById('quote-layout-add-space').click();editField(p,'offset','40',1);applyEdit(p);
 assert.match(p.document.getElementById('quote-layout-edit-status').textContent,/overlap/);assert.equal(p.window.location.href,url);
 p.document.getElementById('quote-layout-edit-spaces').children[1].querySelector('button').click();assert.equal(p.document.getElementById('quote-layout-apply').disabled,false);
 editField(p,'wall','left',0);editField(p,'shape','straight');assert.match(p.document.getElementById('quote-layout-edit-status').textContent,/wall used/);
 p.document.getElementById('quote-layout-edit-spaces').children[0].querySelector('button').click();applyEdit(p);
 assert.equal(JSON.parse(new URL(p.window.location.href).searchParams.get('layout')).schema,'fv.layout.v1');
});
test('pending and confirmed submissions fence detached layout-editor actions; failures restore editing',async t=>{
 for(const succeeds of [false,true]){
  let finish,fail;const p=page(t,()=>new Promise((resolve,reject)=>{finish=resolve;fail=reject;}),editingQuery);
  p.document.getElementById('quote-edit-layout').click();editField(p,'width','190');const detached=p.document.getElementById('quote-layout-apply');
  const before=p.window.location.href;p.submit();assert.equal(p.document.getElementById('quote-edit-layout').disabled,true);assert.equal(p.document.getElementById('quote-layout-editor').hidden,true);
  detached.dispatchEvent(new p.window.Event('click',{bubbles:true}));applyEdit(p);assert.equal(p.window.location.href,before);
  if(succeeds)finish();else fail(Error('offline'));await tick();
  assert.equal(p.document.getElementById('quote-edit-layout').disabled,succeeds);
  if(succeeds){p.document.getElementById('quote-edit-layout').dispatchEvent(new p.window.Event('click'));assert.equal(p.document.getElementById('quote-layout-editor').hidden,true);}
  else{p.document.getElementById('quote-edit-layout').click();assert.equal(p.document.getElementById('quote-layout-editor').hidden,false);}
 }
});
test('invalid incoming layouts cannot open the editor and valid old links edit without migration',t=>{
 const p=page(t,()=>assert.fail('no send'),'?layout=invalid');const edit=p.document.getElementById('quote-edit-layout');assert.equal(edit.disabled,true);edit.dispatchEvent(new p.window.Event('click'));assert.equal(p.document.getElementById('quote-layout-editor').hidden,true);
 const old={...editingLayout,schema:'fv.layout.v1'};delete old.spaces;
 const q=page(t,()=>assert.fail('no send'),'?layout='+encodeURIComponent(JSON.stringify(old)));q.document.getElementById('quote-edit-layout').click();editField(q,'width','180');applyEdit(q);
 assert.equal(JSON.parse(new URL(q.window.location.href).searchParams.get('layout')).schema,'fv.layout.v1');
});

test('customers can start a layout inline without losing quote fields, choosing inclusion, storing data or sending',t=>{
 const p=page(t,()=>assert.fail('planning must not send'));const url=p.window.location.href;
 p.form.elements.namedItem('project').value='';
 const contact=p.form.elements.namedItem('email').value;
 p.document.getElementById('quote-start-layout').click();assert.equal(p.document.getElementById('quote-layout-editor').open,true);
 editField(p,'width','180.25');p.document.getElementById('quote-layout-cancel').click();assert.equal(p.window.location.href,url);assert.equal(p.document.getElementById('quote-layout').hidden,true);assert.equal(p.document.activeElement,p.document.getElementById('quote-start-layout'));
 p.document.getElementById('quote-start-layout').click();editField(p,'width','168.25');applyEdit(p);
 assert.equal(p.form.elements.namedItem('email').value,contact);assert.equal(p.form.elements.namedItem('project').value,'Custom Cabinetry');assert.equal(p.document.getElementById('quote-include-layout').checked,false);assert.equal(p.document.getElementById('quote-include-layout').disabled,false);
 assert.equal(p.document.getElementById('quote-start-layout').hidden,true);assert.equal(p.document.activeElement,p.document.getElementById('quote-edit-layout'));assert.match(p.document.getElementById('quote-layout-summary').textContent,/168.25/);
 assert.equal(p.window.localStorage.length,0);assert.equal(p.window.sessionStorage.length,0);
});
test('normal studio planner clicks open inline while modified clicks retain the standalone link',t=>{
 const p=page(t,()=>assert.fail('no send'));const link=p.document.querySelector('[data-start-layout]');
 const modified=new p.window.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});link.dispatchEvent(modified);assert.equal(modified.defaultPrevented,false);assert.equal(p.document.getElementById('quote-layout-editor').hidden,true);
 const normal=new p.window.MouseEvent('click',{bubbles:true,cancelable:true});link.dispatchEvent(normal);assert.equal(normal.defaultPrevented,true);assert.equal(p.document.getElementById('quote-layout-editor').hidden,false);
 p.document.getElementById('quote-layout-cancel').click();assert.equal(p.document.activeElement,link);
});
test('applying a studio layout moves focus to the quote review and preserves the draft', t => {
  const p = page(t, () => assert.fail('planning must not send'));
  p.form.elements.namedItem('project').value = 'Custom Cabinetry';
  p.document.querySelector('[data-start-layout]').click();
  editField(p, 'width', '168.25');
  applyEdit(p);

  assert.equal(p.document.getElementById('quote-layout-editor').hidden, true);
  assert.equal(p.document.activeElement.id, 'quote-edit-layout');
  assert.match(p.document.getElementById('quote-layout-summary').textContent, /168\.25 × 120/);
  assert.equal(p.document.getElementById('quote-include-layout').checked, false);
  assert.equal(p.form.elements.namedItem('email').value, 'test@example.invalid');
});
test('remove and restore retain exact concept and customer selections but require inclusion again',async t=>{
 const payloads=[];const p=page(t,async q=>payloads.push(q),editingQuery);
 p.document.querySelector('[data-type="Kitchen Cabinetry"]').click();p.document.getElementById('use-design').click();p.document.getElementById('design-notes').value='Preserve maple trim.';
 p.document.getElementById('quote-include-layout').checked=true;const original=p.document.getElementById('quote-layout-summary').textContent;
 p.document.getElementById('quote-remove-layout').click();assert.equal(p.document.getElementById('quote-layout').hidden,true);assert.equal(new URL(p.window.location.href).searchParams.has('layout'),false);assert.equal(p.document.getElementById('quote-include-layout').checked,false);assert.equal(p.document.getElementById('quote-include-layout').disabled,true);
 assert.equal(p.document.getElementById('quote-include-design').checked,true);assert.equal(p.document.getElementById('design-notes').value,'Preserve maple trim.');assert.equal(p.form.elements.namedItem('email').value,'test@example.invalid');
 p.document.getElementById('quote-restore-layout').click();assert.equal(p.document.getElementById('quote-layout-summary').textContent,original);assert.deepEqual(JSON.parse(new URL(p.window.location.href).searchParams.get('layout')),editingLayout);assert.equal(p.document.getElementById('quote-include-layout').checked,false);
 p.submit();await tick();assert.equal(payloads.length,1);assert.equal(payloads[0].design_options.design.notes,'Preserve maple trim.');
});
test('creating a replacement clears the removed concept; malformed concepts can be removed explicitly',t=>{
 const p=page(t,()=>assert.fail('no send'),editingQuery);p.document.getElementById('quote-remove-layout').click();p.document.getElementById('quote-start-layout').click();editField(p,'width','200');applyEdit(p);assert.equal(p.document.getElementById('quote-restore-layout').hidden,true);assert.match(p.document.getElementById('quote-layout-summary').textContent,/200 × 120/);
 const bad=page(t,()=>assert.fail('no send'),'?layout=invalid');bad.document.getElementById('quote-remove-layout').click();assert.equal(new URL(bad.window.location.href).searchParams.has('layout'),false);assert.equal(bad.document.getElementById('quote-restore-layout').hidden,true);bad.document.getElementById('quote-start-layout').click();applyEdit(bad);assert.equal(bad.document.getElementById('quote-include-layout').disabled,false);
});
test('submission locking fences create/remove/restore and studio link navigation',async t=>{
 let finish;const p=page(t,()=>new Promise(resolve=>{finish=resolve;}),editingQuery);p.document.getElementById('quote-remove-layout').click();const before=p.window.location.href;p.submit();
 for(const id of ['quote-start-layout','quote-restore-layout','quote-remove-layout']){assert.equal(p.document.getElementById(id).disabled,true);p.document.getElementById(id).dispatchEvent(new p.window.Event('click'));}
 const e=new p.window.MouseEvent('click',{bubbles:true,cancelable:true});p.document.querySelector('[data-start-layout]').dispatchEvent(e);assert.equal(e.defaultPrevented,true);assert.equal(p.document.getElementById('quote-layout-editor').hidden,true);assert.equal(p.window.location.href,before);
 finish();await tick();p.document.getElementById('quote-restore-layout').dispatchEvent(new p.window.Event('click'));assert.equal(p.window.location.href,before);
});
test('the studio link cannot navigate while the quote is locked and returns after an unconfirmed request', async t => {
  for (const accepted of [false, true]) {
    let settle;
    const p = page(t, () => new Promise((resolve, reject) => {
      settle = () => accepted ? resolve() : reject(new Error('Offline'));
    }));
    const link = p.document.querySelector('[data-start-layout]');
    const destination = link.getAttribute('href');
    assert.equal(destination, 'kitchen-planner.html');

    function assertLocked() {
      let blocked;
      link.addEventListener('click', event => {
        blocked = event.defaultPrevented;
        event.preventDefault();
      }, { once: true });
      link.dispatchEvent(new p.window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      assert.equal(blocked, true);
      assert.equal(link.getAttribute('aria-disabled'), 'true');
      assert.equal(link.hasAttribute('href'), false);
      assert.equal(p.document.getElementById('quote-layout-editor').hidden, true);
    }

    p.submit();
    assertLocked();
    settle();
    await tick();

    if (accepted) assertLocked();
    else {
      assert.equal(link.getAttribute('href'), destination);
      assert.equal(link.hasAttribute('aria-disabled'), false);
      link.click();
      assert.equal(p.document.getElementById('quote-layout-editor').open, true);
    }
  }
});
test('reference copying is enabled only after a settled attempt and never confirms failed delivery',async t=>{
 let fail;const p=page(t,()=>new Promise((_,reject)=>{fail=reject;}));let copied=[];p.window.navigator.clipboard.writeText=async text=>copied.push(text);
 const button=p.document.getElementById('quote-copy-reference');button.dispatchEvent(new p.window.Event('click'));assert.equal(copied.length,0);assert.equal(button.hidden,true);
 p.submit();button.dispatchEvent(new p.window.Event('click'));assert.equal(copied.length,0);assert.equal(button.disabled,true);
 fail(Error('offline'));await tick();button.click();await tick();assert.deepEqual(copied,[reference]);assert.match(p.status.textContent,/could not confirm/);assert.match(p.document.getElementById('quote-reference-status').textContent,/does not submit or confirm delivery/);
 p.window.navigator.clipboard.writeText=async()=>{throw Error('blocked');};button.click();await tick();assert.match(p.document.getElementById('quote-reference-status').textContent,/could not be copied/);assert.match(p.status.textContent,/could not confirm/);
});
test('reference copy completes after success without resending; late copy is fenced by retries and page leave',async t=>{
 let calls=0;const p=page(t,async()=>{calls++;});p.submit();await tick();let finish;p.window.navigator.clipboard.writeText=()=>new Promise(resolve=>{finish=resolve;});p.document.getElementById('quote-copy-reference').click();p.window.dispatchEvent(new p.window.Event('pagehide'));finish();await tick();assert.equal(p.document.getElementById('quote-reference-status').textContent,'');assert.equal(calls,1);
 p.window.navigator.clipboard.writeText=async()=>{};p.document.getElementById('quote-copy-reference').click();await tick();assert.match(p.document.getElementById('quote-reference-status').textContent,/copied/);assert.equal(calls,1);assert.match(p.status.textContent,/received for review/);
 let reject;const q=page(t,()=>new Promise((_,fail)=>{reject=fail;}));q.submit();reject(Error('offline'));await tick();let done;q.window.navigator.clipboard.writeText=()=>new Promise(resolve=>{done=resolve;});q.document.getElementById('quote-copy-reference').click();q.submit();done();await tick();assert.equal(q.document.getElementById('quote-reference-status').textContent,'');reject(Error('offline'));await tick();
});
