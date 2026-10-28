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

const reservedLayout = (spaces, extra={}) => ({...DEFAULT_LAYOUT, schema:'fv.layout.v2', shape:'U', spaces,...extra});
const separate = (a,b) => a.x+a.width<=b.x || b.x+b.width<=a.x || a.z+a.depth<=b.z || b.z+b.depth<=a.z;
test('reserved spaces split runs exactly, reconcile all lengths and never overlap cabinets', () => {
  for (const width of [144,168.25,360]) for (const offset of [0,12.25,30,60.5]) {
    const value=reservedLayout([{wall:'back',offset,width:36},{wall:'left',offset:12.25,width:24},{wall:'right',offset:30,width:30}],{width});
    const original=JSON.stringify(value), m=layoutModel(value);
    assert.equal(JSON.stringify(value),original);assert.equal(m.reserved.length,3);
    for (const c of m.cabinets) {
      assert.ok(c.x>=0 && c.z>=0 && c.x+c.width<=width && c.z+c.depth<=value.depth);
      for (const gap of m.reserved) assert.ok(separate(c,{x:gap.x,z:gap.z,width:gap.planWidth,depth:gap.planDepth}));
    }
    for (let i=0;i<m.cabinets.length;i++) for (let j=i+1;j<m.cabinets.length;j++) assert.ok(separate(m.cabinets[i],m.cabinets[j]));
    for (const [id,name,length] of [['back','Back wall',width],['left','Left wall',96],['right','Right wall',96]]) {
      assert.equal(m.cabinets.filter(c=>c.wall===name).length*value.moduleWidth + m.unused.find(r=>r.wall===name).inches + value.spaces.filter(s=>s.wall===id).reduce((sum,s)=>sum+s.width,0),length);
    }
  }
});
test('adjacent and full-run spaces are valid; overlap, out-of-range and malformed spaces are refused', () => {
  assert.equal(layoutModel(reservedLayout([{wall:'back',offset:0,width:144}])).cabinets.filter(c=>c.wall==='Back wall').length,0);
  assert.equal(layoutModel(reservedLayout([{wall:'back',offset:0,width:24},{wall:'back',offset:24,width:30}])).reserved.length,2);
  const good={wall:'back',offset:0,width:30};
  for (const spaces of [null,{},Array(5).fill(good),[null],[{...good,width:5.75}],[{...good,offset:-.25}],[{...good,offset:120}],[{...good,width:'30'}],[{...good,width:NaN}],[{...good,offset:.1}],[{...good,wall:'ceiling'}],[{...good,html:'<script>'}],[good,{...good,offset:29.75}]]) assert.throws(()=>readLayout(reservedLayout(spaces)));
  assert.throws(()=>readLayout(reservedLayout([{...good,wall:'left'}],{shape:'straight'})),/wall used/);
  assert.throws(()=>readLayout({...DEFAULT_LAYOUT,spaces:[]}),/supported/);
});
test('v2 links, plan markers and bounded quote notes retain exact reserved-space measurements', () => {
  const value=reservedLayout([{wall:'back',offset:10.25,width:36},{wall:'left',offset:0,width:24},{wall:'right',offset:6.5,width:30},{wall:'back',offset:80.5,width:24}]);
  const link=new URL(layoutQuoteLink(value),'https://example.invalid/');
  assert.deepEqual(parseLayoutLink(link.searchParams.get('layout')),value);assert.ok(link.searchParams.get('layout').length<1000);
  const note=attachLayoutToDesign({notes:'Keep the trim.'},value).notes;
  assert.match(note,/start 10.25 in, width 36 in/);assert.match(note,/Side-run starts/);assert.match(note,/Reserved widths only/);assert.ok(note.length<2000);
  for (const n of [1,2,3,4]) assert.match(planSVG(value),new RegExp('S'+n+'</text>'));
  for (const angle of [-60,0,60]) assert.doesNotMatch(perspectiveSVG(value,angle),/NaN|Infinity|undefined/);
  assert.deepEqual(readLayout(DEFAULT_LAYOUT),DEFAULT_LAYOUT);
});
test('reserved-space editor changes geometry, blocks conflicting spaces and recovers without losing dimensions', t => {
  const p=page(t), form=p.get('layout-controls');
  p.get('space-add').click();let row=p.get('layout-spaces').firstElementChild;
  assert.equal(p.document.activeElement,row.querySelector('select'));
  const set=(row,key,value)=>{row.querySelector(`[data-space-field=${key}]`).value=value;form.dispatchEvent(new p.window.Event('input'));};
  set(row,'offset','30.25');assert.match(p.get('layout-reserved-summary').textContent,/start 30.25 in/);
  let layout=parseLayoutLink(new URL(p.get('layout-quote').href).searchParams.get('layout'));assert.equal(layout.schema,'fv.layout.v2');assert.equal(layout.spaces[0].offset,30.25);
  set(row,'offset','');assert.equal(p.get('layout-print').disabled,true);set(row,'offset','30.25');assert.equal(p.get('layout-print').disabled,false);
  p.get('space-add').click();set(p.get('layout-spaces').lastElementChild,'offset','40');assert.match(p.get('layout-status').textContent,/overlap/);
  p.get('layout-spaces').lastElementChild.querySelector('button').click();assert.equal(p.get('layout-print').disabled,false);
  set(row,'wall','left');form.elements.namedItem('shape').value='straight';form.dispatchEvent(new p.window.Event('change'));
  assert.equal(p.get('layout-print').disabled,true);assert.match(p.get('layout-status').textContent,/wall used/);assert.equal(p.get('layout-spaces').children.length,1);
  row.querySelector('button').click();assert.equal(p.get('layout-print').disabled,false);assert.equal(form.elements.namedItem('width').value,'144');
  layout=parseLayoutLink(new URL(p.get('layout-quote').href).searchParams.get('layout'));assert.equal(layout.schema,'fv.layout.v1');
});
test('shared spaces reopen in order, support four rows, and reset removes only the concept', t => {
  const value=reservedLayout([{wall:'back',offset:90,width:30},{wall:'left',offset:0,width:24},{wall:'back',offset:0,width:30},{wall:'right',offset:0,width:30}]);
  const p=page(t,'?layout='+encodeURIComponent(JSON.stringify(value)));
  assert.equal(p.get('layout-spaces').children.length,4);assert.equal(p.get('space-add').disabled,true);
  assert.match(p.get('layout-reserved-summary').firstElementChild.textContent,/S1: Back wall, start 90 in/);
  p.get('space-add').dispatchEvent(new p.window.Event('click'));assert.equal(p.get('layout-spaces').children.length,4);
  p.get('layout-spaces').children[1].querySelector('button').click();assert.equal(p.get('space-add').disabled,false);
  assert.equal(p.get('layout-spaces').children[1].querySelector('legend').textContent,'Space 2');
  p.get('layout-reset').click();assert.equal(p.get('layout-spaces').children.length,0);assert.equal(p.get('layout-reserved-summary').children.length,0);
});
