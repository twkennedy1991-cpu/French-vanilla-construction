import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';

const forms = [
  ['index.html', 'quote-form', {
    name: 'Synthetic Customer', phone: '555-0100', email: 'customer@example.invalid',
    location: 'Philadelphia', project: 'Custom Cabinetry', details: 'Synthetic project details', consent: true
  }],
  ['owner.html', 'login', { email: 'owner@example.invalid', password: 'synthetic-only' }]
];

for (const [file, id, fields] of forms) {
  test(`${id} cannot submit valid entries through native navigation before JavaScript starts`, t => {
    const url = `https://site-check.invalid/${file}`;
    const window = new Window({ url, settings: {
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      navigation: { disableMainFrameNavigation: true }
    } });
    t.after(() => window.happyDOM.close());
    const { document } = window;
    document.write(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
    const form = document.getElementById(id);
    for (const [name, value] of Object.entries(fields)) {
      const control = form.elements.namedItem(name);
      if (typeof value === 'boolean') control.checked = value;
      else control.value = value;
    }
    assert.equal(form.reportValidity(), true);
    const submit = form.querySelector('button[type="submit"]');
    submit.click();
    assert.equal(window.location.href === url, true, 'native submission would expose fields in the address');
    assert.equal(submit.disabled, true);
    assert.equal(document.head.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content, "form-action 'none'");
  });
}
