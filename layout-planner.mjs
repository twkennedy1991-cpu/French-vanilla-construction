// Public customer layout concepts. No private JARVIS fabrication code is used.
export const DEFAULT_LAYOUT = Object.freeze({ schema: 'fv.layout.v1', shape: 'L', width: 144, depth: 120, cabinetDepth: 24, cabinetHeight: 34.5, moduleWidth: 30 });
export const LAYOUT_V2 = 'fv.layout.v2';
export const WALL_NAMES = Object.freeze({ back: 'Back wall', left: 'Left wall', right: 'Right wall' });
export function layoutRuns(layout) {
  return [{ wall: 'back', length: layout.width, x: 0, z: 0, side: false },
    ...(layout.shape !== 'straight' ? [{ wall: 'left', length: layout.depth - layout.cabinetDepth, x: 0, z: layout.cabinetDepth, side: true }] : []),
    ...(layout.shape === 'U' ? [{ wall: 'right', length: layout.depth - layout.cabinetDepth, x: layout.width - layout.cabinetDepth, z: layout.cabinetDepth, side: true }] : [])];
}
const limits = { width: [72, 360], depth: [72, 360], cabinetDepth: [12, 30], cabinetHeight: [24, 42], moduleWidth: [12, 48] };
export function readLayout(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_LAYOUT, key) && !(value.schema === LAYOUT_V2 && key === 'spaces'))) throw Error('Use a supported layout link.');
  if (![DEFAULT_LAYOUT.schema, LAYOUT_V2].includes(value.schema) || !['straight', 'L', 'U'].includes(value.shape)) throw Error('Choose a straight, L-shaped or U-shaped layout.');
  const result = { schema: value.schema, shape: value.shape };
  for (const [key, [min, max]] of Object.entries(limits)) {
    const number = value[key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max || !Number.isInteger(number * 4)) throw Error(`${key.replace(/[A-Z]/g, letter => ' ' + letter.toLowerCase())}: use ${min}–${max} inches in quarter-inch steps.`);
    result[key] = number;
  }
  if (result.shape === 'U' && result.width <= 2 * result.cabinetDepth) throw Error('Room width must leave open space between the two side runs.');
  if (result.schema === LAYOUT_V2) {
    if (!Array.isArray(value.spaces) || value.spaces.length > 4) throw Error('Use up to four reserved spaces.');
    const runs = layoutRuns(result);
    result.spaces = value.spaces.map((space, index) => {
      const error = message => Error(`Space ${index + 1}: ${message}`);
      if (!space || typeof space !== 'object' || Array.isArray(space) || Object.keys(space).length !== 3 || Object.keys(space).some(key => !['wall','offset','width'].includes(key))) throw error('use a supported reserved space.');
      const run = runs.find(row => row.wall === space.wall);
      if (!run) throw error('choose a wall used by this layout, or remove the space.');
      for (const key of ['offset','width']) if (typeof space[key] !== 'number' || !Number.isFinite(space[key]) || !Number.isInteger(space[key] * 4)) throw error('use inches in quarter-inch steps.');
      if (space.offset < 0 || space.width < 6 || space.offset + space.width > run.length) throw error(`use a width of at least 6 inches and keep the space within the ${run.length}-inch run.`);
      return { wall: space.wall, offset: space.offset, width: space.width };
    });
    for (const run of runs) {
      const spaces = result.spaces.filter(space => space.wall === run.wall).sort((a,b) => a.offset-b.offset);
      for (let i=1;i<spaces.length;i++) if (spaces[i].offset < spaces[i-1].offset + spaces[i-1].width) throw Error(`${WALL_NAMES[run.wall]}: reserved spaces overlap. Move or remove a space.`);
    }
  }
  return result;
}
export function parseLayoutLink(text) {
  if (typeof text !== 'string' || !text || text.length > 1000) throw Error('Use a supported layout link.');
  let value;try { value = JSON.parse(text); } catch { throw Error('The layout link could not be read.'); }
  return readLayout(value);
}
export function layoutModel(value) {
  const layout = readLayout(value), cabinets = [], unused = [], reserved = [], unusedSegments = [];
  for (const run of layoutRuns(layout)) {
    const spaces = (layout.spaces || []).map((space,index) => ({ ...space, number: index + 1 })).filter(space => space.wall === run.wall).sort((a,b) => a.offset-b.offset);
    let cursor = 0, spare = 0, sequence = 0, unusedSequence = 0;
    function pack(end) {
      const count = Math.floor((end - cursor) / layout.moduleWidth);
      for (let i=0;i<count;i++) {
        const offset = cursor + i * layout.moduleWidth;
        cabinets.push({ id: run.wall[0].toUpperCase() + (++sequence), run: run.wall, offset, wall: WALL_NAMES[run.wall], x: run.x + (run.side ? 0 : offset), z: run.z + (run.side ? offset : 0), width: run.side ? layout.cabinetDepth : layout.moduleWidth, depth: run.side ? layout.moduleWidth : layout.cabinetDepth, height: layout.cabinetHeight });
      }
      const remainder = end - cursor - count * layout.moduleWidth;
      if (remainder > 0) unusedSegments.push({ id: 'U' + run.wall[0].toUpperCase() + (++unusedSequence), wall: run.wall, offset: cursor + count * layout.moduleWidth, width: remainder });
      spare += remainder;
    }
    for (const space of spaces) {
      pack(space.offset);
      reserved.push({ ...space, x: run.x + (run.side ? 0 : space.offset), z: run.z + (run.side ? space.offset : 0), planWidth: run.side ? layout.cabinetDepth : space.width, planDepth: run.side ? space.width : layout.cabinetDepth });
      cursor = space.offset + space.width;
    }
    pack(run.length);
    unused.push({ wall: WALL_NAMES[run.wall], inches: spare });
  }
  return { layout, cabinets, unused, reserved, unusedSegments, openWidth: layout.width - (layout.shape === 'U' ? 2 : layout.shape === 'L' ? 1 : 0) * layout.cabinetDepth };
}
export function layoutSummary(value) {
  const model = layoutModel(value), l = model.layout;
  return `${l.shape === 'straight' ? 'Straight' : l.shape + '-shaped'} cabinet concept; room ${l.width} × ${l.depth} in; cabinet depth ${l.cabinetDepth} in, height ${l.cabinetHeight} in; nominal module width ${l.moduleWidth} in. ${model.cabinets.length} schematic modules.${model.reserved.length ? ' Reserved spaces: ' + model.reserved.map(r => '#' + r.number + ' ' + WALL_NAMES[r.wall] + ', start ' + r.offset + ' in, width ' + r.width + ' in').join('; ') + '. Side-run starts are measured after the back-run depth. Reserved widths only; appliance depth, height, hookups and clearances are not modeled.' : ''} Unallocated run space: ${model.unused.map(row => row.wall + ' ' + row.inches + ' in').join('; ')}. No appliances, openings, utilities, upper cabinets, countertop overhangs or corner-access design modeled. Dimensions and feasibility require contractor review; not a price or fabrication plan.`;
}
export function layoutQuoteLink(value) {
  const params = new URLSearchParams({ project: 'Custom Cabinetry', layout: JSON.stringify(readLayout(value)) });
  return 'index.html?' + params + '#contact';
}
export function attachLayoutToDesign(design, value) {
  const layout = readLayout(value), note = 'Customer layout concept (unverified): ' + layoutSummary(layout);
  return { ...(design || {}), project: design?.project || 'Kitchen Cabinetry', dimensions: design?.dimensions || `${layout.width} × ${layout.depth} in room; cabinet depth ${layout.cabinetDepth} in`, notes: [design?.notes, note].filter(Boolean).join('\n\n') };
}
const n = value => Number(value.toFixed(3));
export function planSVG(value) {
  const m = layoutModel(value), l = m.layout, margin = 24;
  const spaces = m.reserved.map(r => `<rect x="${r.x}" y="${r.z}" width="${r.planWidth}" height="${r.planDepth}" fill="#e0f2fe" stroke="#075985" stroke-width="1" stroke-dasharray="3 2"/><text x="${r.x+r.planWidth/2}" y="${r.z+r.planDepth/2}" text-anchor="middle" dominant-baseline="middle" font-size="8" fill="#075985">S${r.number}</text>`).join('');
  const boxes = m.cabinets.map(c => `<rect x="${c.x}" y="${c.z}" width="${c.width}" height="${c.depth}" fill="#d6a96e" stroke="#3e3022" stroke-width="1"/><text x="${c.x+c.width/2}" y="${c.z+c.depth/2}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.min(8,c.width/(c.id.length*.7),c.depth*.4)}" fill="#211b16">${c.id}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cabinet layout top view, all dimensions in inches" viewBox="-${margin} -${margin} ${l.width + 2 * margin} ${l.depth + 2 * margin}"><rect width="${l.width}" height="${l.depth}" fill="#faf7f0" stroke="#3e3022" stroke-width="2"/>${boxes}${spaces}<text x="${l.width / 2}" y="-8" text-anchor="middle" font-size="10" fill="#211b16">${l.width} in</text><text x="${l.width / 2}" y="${l.depth + 16}" text-anchor="middle" font-size="10" fill="#211b16">Room depth ${l.depth} in</text></svg>`;
}
export function perspectiveSVG(value, angle = 30) {
  if (typeof angle !== 'number' || !Number.isFinite(angle) || angle < -60 || angle > 60) throw Error('Choose a view angle between -60 and 60 degrees.');
  const m = layoutModel(value), l = m.layout, radians = angle * Math.PI / 180;
  const project = ([x, y, z]) => { const dx = x - l.width / 2, dz = z - l.depth / 2; return [dx * Math.cos(radians) - dz * Math.sin(radians), (dx * Math.sin(radians) + dz * Math.cos(radians)) * .5 - y]; };
  const points = vertices => vertices.map(v => project(v).map(n).join(',')).join(' ');
  const ground = [[0,0,0],[l.width,0,0],[l.width,0,l.depth],[0,0,l.depth]];
  const faces = [];
  for (const c of m.cabinets) {
    const x = c.x, z = c.z, w = c.width, d = c.depth, h = c.height;
    for (const [vertices, color] of [
      [[[x,0,z],[x+w,0,z],[x+w,h,z],[x,h,z]], '#ac7743'],
      [[[x,0,z+d],[x+w,0,z+d],[x+w,h,z+d],[x,h,z+d]], '#d6a96e'],
      [[[x,0,z],[x,0,z+d],[x,h,z+d],[x,h,z]], '#bd8b56'],
      [[[x+w,0,z],[x+w,0,z+d],[x+w,h,z+d],[x+w,h,z]], '#c19360'],
      [[[x,h,z],[x+w,h,z],[x+w,h,z+d],[x,h,z+d]], '#edcfaa']
    ]) faces.push({ vertices, color, order: vertices.reduce((sum, [px,,pz]) => sum + (px - l.width/2) * Math.sin(radians) + (pz - l.depth/2) * Math.cos(radians), 0) / vertices.length });
  }
  faces.sort((a,b) => a.order - b.order);
  const all = [...ground, ...faces.flatMap(f => f.vertices)].map(project), xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const left = Math.min(...xs) - 12, top = Math.min(...ys) - 12, width = Math.max(...xs) - left + 12, height = Math.max(...ys) - top + 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Schematic three-dimensional cabinet layout" viewBox="${[left,top,width,height].map(n).join(' ')}"><polygon points="${points(ground)}" fill="#eee5d6" stroke="#65503d" stroke-width="1"/>${m.reserved.map(r => `<polygon points="${points([[r.x,0,r.z],[r.x+r.planWidth,0,r.z],[r.x+r.planWidth,0,r.z+r.planDepth],[r.x,0,r.z+r.planDepth]])}" fill="#e0f2fe" stroke="#075985" stroke-width="1" stroke-dasharray="3 2"/>`).join('')}${faces.map(f => `<polygon points="${points(f.vertices)}" fill="${f.color}" stroke="#57402b" stroke-width=".65"/>`).join('')}</svg>`;
}
