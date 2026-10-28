import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSite } from '../scripts/check-site.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(),'fv-site-check-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'scripts'));mkdirSync(join(root,'tests'));
  return { root, write: (name,text) => writeFileSync(join(root,name),text) };
}
test('missing homepage background image fails even when HTML image references are valid', t => {
  const f=fixture(t);f.write('index.html','<img src="door.jpeg"><link rel="stylesheet" href="styles.css">');
  f.write('door.jpeg','fixture');f.write('styles.css',".hero{background:url('assets/door.jpeg')}");
  assert.throws(()=>checkSite(f.root),/styles.css: missing local file assets\/door.jpeg/);
  f.write('styles.css',".hero{background:url('door.jpeg')}");assert.equal(checkSite(f.root).pages,1);
});
test('missing navigation and relative module imports fail while external URLs are never fetched', t => {
  const f=fixture(t);f.write('index.html','<a href="missing.html?project=Cabinetry#contact">Quote</a><img src="https://example.invalid/image"><a href="tel:+15550100">Call</a><a href="#content">Skip</a>');
  f.write('ui.mjs',"import './missing.mjs';");
  assert.throws(()=>checkSite(f.root),error=>/missing.html/.test(error.message)&&/missing.mjs/.test(error.message)&&!/example.invalid/.test(error.message));
  f.write('missing.html','<main id="contact"></main>');f.write('missing.mjs','export const ready=true;');
  assert.equal(checkSite(f.root).pages,2);
});
test('invalid JavaScript fails without executing site code', t => {
  const f=fixture(t);f.write('index.html','<script type="module" src="ui.mjs"></script>');
  f.write('ui.mjs','const = ;');assert.throws(()=>checkSite(f.root),/JavaScript syntax check failed/);
  f.write('ui.mjs',"throw Error('must never execute');");assert.equal(checkSite(f.root).pages,1);
});
