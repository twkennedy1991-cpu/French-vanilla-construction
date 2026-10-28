// Public customer layout concepts. No private JARVIS fabrication code is used.
export const DEFAULT_LAYOUT = Object.freeze({ schema: 'fv.layout.v1', shape: 'L', width: 144, depth: 120, cabinetDepth: 24, cabinetHeight: 34.5, moduleWidth: 30 });
const limits = { width: [72, 360], depth: [72, 360], cabinetDepth: [12, 30], cabinetHeight: [24, 42], moduleWidth: [12, 48] };
export function readLayout(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_LAYOUT, key))) throw Error('Use a supported layout link.');
  if (value.schema !== DEFAULT_LAYOUT.schema || !['straight', 'L', 'U'].includes(value.shape)) throw Error('Choose a straight, L-shaped or U-shaped layout.');
  const result = { schema: value.schema, shape: value.shape };
  for (const [key, [min, max]] of Object.entries(limits)) {
    const number = value[key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max || !Number.isInteger(number * 4)) throw Error(`${key.replace(/[A-Z]/g, letter => ' ' + letter.toLowerCase())}: use ${min}–${max} inches in quarter-inch steps.`);
    result[key] = number;
  }
  if (result.shape === 'U' && result.width <= 2 * result.cabinetDepth) throw Error('Room width must leave open space between the two side runs.');
  return result;
}
export function parseLayoutLink(text) {
  if (typeof text !== 'string' || !text || text.length > 1000) throw Error('Use a supported layout link.');
  let value;try { value = JSON.parse(text); } catch { throw Error('The layout link could not be read.'); }
  return readLayout(value);
}
export function layoutModel(value) {
  const layout = readLayout(value), cabinets = [], unused = [];
  function run(name, length, startX, startZ, side = false) {
    const count = Math.floor(length / layout.moduleWidth);
    for (let i = 0; i < count; i++) cabinets.push({ wall: name, x: startX + (side ? 0 : i * layout.moduleWidth), z: startZ + (side ? i * layout.moduleWidth : 0), width: side ? layout.cabinetDepth : layout.moduleWidth, depth: side ? layout.moduleWidth : layout.cabinetDepth, height: layout.cabinetHeight });
    unused.push({ wall: name, inches: length - count * layout.moduleWidth });
  }
  run('Back wall', layout.width, 0, 0);
  if (layout.shape !== 'straight') run('Left wall', layout.depth - layout.cabinetDepth, 0, layout.cabinetDepth, true);
  if (layout.shape === 'U') run('Right wall', layout.depth - layout.cabinetDepth, layout.width - layout.cabinetDepth, layout.cabinetDepth, true);
  return { layout, cabinets, unused, openWidth: layout.width - (layout.shape === 'U' ? 2 : layout.shape === 'L' ? 1 : 0) * layout.cabinetDepth };
}
export function layoutSummary(value) {
  const model = layoutModel(value), l = model.layout;
  return `${l.shape === 'straight' ? 'Straight' : l.shape + '-shaped'} cabinet concept; room ${l.width} × ${l.depth} in; cabinet depth ${l.cabinetDepth} in, height ${l.cabinetHeight} in; nominal module width ${l.moduleWidth} in. ${model.cabinets.length} schematic modules. Unallocated run space: ${model.unused.map(row => row.wall + ' ' + row.inches + ' in').join('; ')}. No appliances, openings, utilities, upper cabinets, countertop overhangs or corner-access design modeled. Dimensions and feasibility require contractor review; not a price or fabrication plan.`;
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
  const boxes = m.cabinets.map(c => `<rect x="${c.x}" y="${c.z}" width="${c.width}" height="${c.depth}" fill="#d6a96e" stroke="#3e3022" stroke-width="1"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cabinet layout top view, all dimensions in inches" viewBox="-${margin} -${margin} ${l.width + 2 * margin} ${l.depth + 2 * margin}"><rect width="${l.width}" height="${l.depth}" fill="#faf7f0" stroke="#3e3022" stroke-width="2"/>${boxes}<text x="${l.width / 2}" y="-8" text-anchor="middle" font-size="10" fill="#211b16">${l.width} in</text><text x="${l.width / 2}" y="${l.depth + 16}" text-anchor="middle" font-size="10" fill="#211b16">Room depth ${l.depth} in</text></svg>`;
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
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Schematic three-dimensional cabinet layout" viewBox="${[left,top,width,height].map(n).join(' ')}"><polygon points="${points(ground)}" fill="#eee5d6" stroke="#65503d" stroke-width="1"/>${faces.map(f => `<polygon points="${points(f.vertices)}" fill="${f.color}" stroke="#57402b" stroke-width=".65"/>`).join('')}</svg>`;
}
