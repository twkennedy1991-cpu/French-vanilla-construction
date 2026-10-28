import { layoutModel, layoutRuns, WALL_NAMES } from './layout-planner.mjs';

export function layoutSchedule(value) {
  const model = layoutModel(value), l = model.layout;
  const cabinets = model.cabinets.map(c => ({ kind: 'Cabinet', reference: c.id, wall: c.wall, offset: c.offset, width: l.moduleWidth, depth: l.cabinetDepth, height: c.height }));
  const spaces = model.reserved.map(s => ({ kind: 'Reserved width', reference: 'S'+s.number, wall: WALL_NAMES[s.wall], offset: s.offset, width: s.width, depth: '', height: '' }));
  const unused = model.unusedSegments.map(s => ({ kind: 'Unallocated', reference: s.id, wall: WALL_NAMES[s.wall], offset: s.offset, width: s.width, depth: '', height: '' }));
  return {
    rows: [...cabinets,...spaces,...unused].sort((a,b) => Object.values(WALL_NAMES).indexOf(a.wall)-Object.values(WALL_NAMES).indexOf(b.wall) || a.offset-b.offset),
    runs: layoutRuns(l).map(run => ({ wall: WALL_NAMES[run.wall], length: run.length, count: cabinets.filter(c => c.wall === WALL_NAMES[run.wall]).length, width: l.moduleWidth, depth: l.cabinetDepth, height: l.cabinetHeight, reserved: spaces.filter(s => s.wall === WALL_NAMES[run.wall]).reduce((sum,s) => sum+s.width,0), unused: model.unused.find(s => s.wall === WALL_NAMES[run.wall]).inches }))
  };
}

export function scheduleHTML(value) {
  const { runs, rows } = layoutSchedule(value);
  const table = (head, body, caption) => `<div class="layout-table-wrap"><table><caption>${caption}</caption><thead><tr>${head.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${body.map(row=>`<tr>${row.map((cell,index)=> index===0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return table(['Wall','Run (in)','Cabinets','Each W × D × H (in)','Reserved (in)','Unallocated (in)'],runs.map(r=>[r.wall,r.length,r.count,`${r.width} × ${r.depth} × ${r.height}`,r.reserved,r.unused]),'Run totals — concept dimensions') +
    `<details class="layout-schedule-details"><summary>Individual cabinet and space positions</summary><p>Start positions are measured from the left of the back run, or after the back-run depth on side runs. Blank depth/height means it is not modeled. Codes refer to this current concept and may change after edits.</p>${table(['Code','Type','Wall','Start (in)','Width (in)','Depth (in)','Height (in)'],rows.map(r=>[r.reference,r.kind,r.wall,r.offset,r.width,r.depth,r.height]),'Current concept positions — not fabrication dimensions')}</details>`;
}

export function scheduleCSV(value) {
  const { rows } = layoutSchedule(value), l = layoutModel(value).layout;
  const note = 'UNVERIFIED CONCEPT; not a cut list or fabrication plan. Codes may change after edits. Back-run starts from left; side-run starts after back-run depth. Reserved widths do not specify appliance dimensions or clearances.';
  const data = [['Code','Type','Wall','Start along run (in)','Width along run (in)','Cabinet depth (in)','Cabinet height (in)','Room width (in)','Room depth (in)','Shape','Review notes'],...rows.map(r=>[r.reference,r.kind,r.wall,r.offset,r.width,r.depth,r.height,l.width,l.depth,l.shape,note])];
  return data.map(row => row.map(cell => '"'+String(cell).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
}
