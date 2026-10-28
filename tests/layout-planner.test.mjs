import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { DEFAULT_LAYOUT, readLayout, parseLayoutLink, layoutModel, layoutSummary, layoutQuoteLink, attachLayoutToDesign, planSVG, perspectiveSVG } from '../layout-planner.mjs';
import { setupLayoutPlanner } from '../layout-planner-ui.mjs';
const html = readFileSync(new URL('../kitchen-planner.html', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
test('all shapes keep modules inside the room, non-overlapping, and account for unused run length', () => {
  for (const shape of ['straight','L','U']) for (const width of [72,144,359.75]) {
    const m = layoutModel({ ...DEFAULT_LAYOUT, shape, width });
    assert.equal(m.unused.length, shape === 'U' ? 3 : shape === 'L' ? 2 : 1);
    for (const c of m.cabinets) {
      assert.ok(c.x >= 0 && c.z >= 0 && c.x + c.width <= width && c.z + c.depth <= m.layout.depth);
      assert.equal(c.height, DEFAULT_LAYOUT.cabinetHeight);
    }
    for (let i = 0; i < m.cabinets.length; i++) for (let j = i+1; j < m.cabinets.length; j++) {
      const a = m.cabinets[i], b = m.cabinets[j];
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.z + a.depth <= b.z || b.z + b.depth <= a.z);
    }
    for (const spare of m.unused) {
      const count = m.cabinets.filter(c => c.wall === spare.wall).length;
      assert.equal(count * m.layout.moduleWidth + spare.inches, spare.wall === 'Back wall' ? width : m.layout.depth - m.layout.cabinetDepth);
    }
  }
});
test('invalid and hostile dimensions/links never become geometry', () => {
  for (const change of [{width:71.75},{depth:361},{cabinetDepth:0},{cabinetHeight:NaN},{moduleWidth:Infinity},{width:'144'},{width:144.1},{shape:'unknown'},{schema:'other'},{remoteUrl:'https://elsewhere.invalid'}]) assert.throws(() => readLayout({...DEFAULT_LAYOUT,...change}));
  for (const text of ['{bad','null','[]','x'.repeat(1001),JSON.stringify({...DEFAULT_LAYOUT,width:'<script>'})]) assert.throws(() => parseLayoutLink(text));
  for (const angle of [-61,61,NaN,'30']) assert.throws(() => perspectiveSVG(DEFAULT_LAYOUT,angle));
});
test('share and quote links contain only bounded layout state; inquiry notes retain original customer text', () => {
  const url = new URL(layoutQuoteLink(DEFAULT_LAYOUT),'https://example.invalid/');
  assert.equal(url.pathname,'/index.html');assert.equal(url.searchParams.get('project'),'Custom Cabinetry');
  assert.deepEqual([...url.searchParams.keys()],['project','layout']);
  assert.deepEqual(parseLayoutLink(url.searchParams.get('layout')),DEFAULT_LAYOUT);
  const existing={project:'Kitchen Cabinetry',notes:'Keep the existing window.',dimensions:'Owner room sketch'};
  const attached=attachLayoutToDesign(existing,DEFAULT_LAYOUT);
  assert.equal(attached.dimensions,existing.dimensions);assert.ok(attached.notes.startsWith(existing.notes));assert.match(attached.notes,/unverified/);assert.match(attached.notes,/not a price or fabrication plan/);
  assert.equal(existing.notes,'Keep the existing window.');assert.ok(attached.notes.length<2000);
});
test('top and perspective SVG are bounded, accessible and numerically stable at all view angles', () => {
  for (const angle of [-60,0,60]) {
    const markup=perspectiveSVG({...DEFAULT_LAYOUT,shape:'U'},angle);
    assert.doesNotMatch(markup,/NaN|Infinity|script|foreignObject/);assert.match(markup,/role="img"/);assert.match(markup,/viewBox=/);
    assert.ok(markup.length<100000);
  }
  assert.match(planSVG(DEFAULT_LAYOUT),/144 in/);assert.match(layoutSummary(DEFAULT_LAYOUT),/Unallocated run space/);
});
function page(t,query='') {
  const window=new Window({url:'https://example.invalid/kitchen-planner.html'+query});t.after(()=>window.happyDOM.close());window.confirm=()=>true;
  const document=window.document;document.write(html);setupLayoutPlanner({document,window});
  return {window,document,get:id=>document.getElementById(id)};
}
test('planner edits update actual geometry and inquiry link, and invalid input clears previews and disables handoff', t => {
  const p=page(t),form=p.get('layout-controls');assert.ok(p.get('layout-plan').querySelector('svg'));assert.ok(p.get('layout-perspective').querySelector('svg'));
  form.elements.namedItem('width').value='180';form.dispatchEvent(new p.window.Event('input'));
  assert.match(p.get('layout-summary').textContent,/180 × 120/);
  assert.equal(parseLayoutLink(new URL(p.get('layout-quote').href).searchParams.get('layout')).width,180);
  form.elements.namedItem('width').value='bad';form.dispatchEvent(new p.window.Event('input'));
  assert.equal(p.get('layout-quote').hasAttribute('href'),false);assert.equal(p.get('layout-share').disabled,true);assert.equal(p.get('layout-plan').children.length,0);
  p.get('layout-reset').click();assert.ok(p.get('layout-plan').querySelector('svg'));assert.equal(form.elements.namedItem('width').value,'144');
});
test('valid shared concepts reopen exactly and malformed links cannot silently become a handoff', t => {
  const layout={...DEFAULT_LAYOUT,shape:'U',width:168.25};const p=page(t,'?layout='+encodeURIComponent(JSON.stringify(layout)));
  assert.equal(p.get('layout-controls').elements.namedItem('width').value,'168.25');assert.match(p.get('layout-summary').textContent,/U-shaped/);
  const bad=page(t,'?layout=invalid');assert.equal(bad.get('layout-quote').hasAttribute('href'),false);assert.match(bad.get('layout-status').textContent,/invalid link was not applied/);
});
test('copying a layout link carries only geometry and makes no submission', async t => {
  const p=page(t);let copied;p.window.navigator.clipboard.writeText=async text=>{copied=text;};
  p.get('layout-share').click();await tick();const url=new URL(copied);
  assert.equal(url.pathname,'/kitchen-planner.html');assert.deepEqual([...url.searchParams.keys()],['layout']);assert.deepEqual(parseLayoutLink(url.searchParams.get('layout')),DEFAULT_LAYOUT);
  assert.match(p.get('layout-status').textContent,/no inquiry was sent/);
});

test('print uses the current validated concept and a dimension-only reopening link', t => {
  const p=page(t);let printed=0;p.window.print=()=>{printed++;};
  const form=p.get('layout-controls');form.elements.namedItem('width').value='168.25';form.dispatchEvent(new p.window.Event('input'));
  p.get('layout-angle').value='-42';p.get('layout-angle').dispatchEvent(new p.window.Event('input'));
  const before=p.get('layout-perspective').innerHTML;
  p.get('layout-print').click();assert.equal(printed,1);assert.equal(p.get('layout-perspective').innerHTML,before);
  assert.match(p.get('layout-summary').textContent,/168.25 × 120/);
  const url=new URL(p.get('layout-reopen').href);assert.deepEqual([...url.searchParams.keys()],['layout']);
  assert.equal(parseLayoutLink(url.searchParams.get('layout')).width,168.25);
  form.elements.namedItem('width').value='0';form.dispatchEvent(new p.window.Event('input'));
  p.get('layout-print').dispatchEvent(new p.window.Event('click'));assert.equal(printed,1);
  assert.equal(p.get('layout-print').disabled,true);assert.equal(p.get('layout-reopen').hasAttribute('href'),false);
});
test('malformed shared links clear drawings and disable print until corrected', t => {
  const p=page(t,'?layout=invalid');let printed=0;p.window.print=()=>{printed++;};
  assert.equal(p.get('layout-plan').children.length,0);assert.equal(p.get('layout-perspective').children.length,0);
  assert.equal(p.get('layout-print').disabled,true);assert.equal(p.get('layout-reopen').hasAttribute('href'),false);
  p.get('layout-print').dispatchEvent(new p.window.Event('click'));assert.equal(printed,0);
  p.get('layout-reset').click();p.get('layout-print').click();assert.equal(printed,1);
});
test('print failures keep the concept and give a browser-print fallback', t => {
  const p=page(t);p.window.print=()=>{throw Error('unavailable');};
  p.get('layout-print').click();assert.match(p.get('layout-status').textContent,/browser’s Print command/);
  assert.ok(p.get('layout-plan').querySelector('svg'));assert.equal(p.get('layout-print').disabled,false);
});
