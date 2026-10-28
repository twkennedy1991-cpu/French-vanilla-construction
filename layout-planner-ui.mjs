import { scheduleHTML, scheduleCSV } from './layout-schedule.mjs';
import { DEFAULT_LAYOUT, LAYOUT_V2, WALL_NAMES, readLayout, parseLayoutLink, layoutModel, layoutSummary, layoutQuoteLink, planSVG, perspectiveSVG } from './layout-planner.mjs';
export function setupLayoutPlanner({ document, window }) {
  const get = id => document.getElementById(id), form = get('layout-controls'), status = get('layout-status');
  const link = get('layout-quote'), share = get('layout-share'), print = get('layout-print'), reopen = get('layout-reopen');let current = null;
  const fields = ['shape', 'width', 'depth', 'cabinetDepth', 'cabinetHeight', 'moduleWidth'];
  const spaces = get('layout-spaces'), addSpace = get('space-add');
  function updateSpaceLabels() {
    [...spaces.children].forEach((row,index) => {
      row.querySelector('legend').textContent = `Space ${index+1}`;
      row.querySelector('button').setAttribute('aria-label', `Remove space ${index+1}`);
    });
    addSpace.disabled = spaces.children.length >= 4;
  }
  function addSpaceRow(space = { wall: 'back', offset: 0, width: 30 }) {
    if (spaces.children.length >= 4) return;
    const row = document.createElement('fieldset'), legend = document.createElement('legend');row.append(legend);
    function field(text, name, control) {
      const label = document.createElement('label');label.textContent = text;control.dataset.spaceField = name;label.append(control);row.append(label);
    }
    const wall = document.createElement('select');
    for (const [value,text] of Object.entries(WALL_NAMES)) { const option = document.createElement('option');option.value = value;option.textContent = text;wall.append(option); }
    wall.value = space.wall;field('Wall', 'wall', wall);
    for (const [key,text,min] of [['offset','Start along run (in)',0],['width','Reserved width (in)',6]]) {
      const input = document.createElement('input');input.type = 'number';input.min = String(min);input.max = '360';input.step = '0.25';input.required = true;input.inputMode = 'decimal';input.value = space[key];field(text,key,input);
    }
    const remove = document.createElement('button');remove.type = 'button';remove.className = 'planner-secondary';remove.textContent = 'Remove space';
    remove.addEventListener('click', () => { row.remove();updateSpaceLabels();draw();addSpace.focus(); });row.append(remove);spaces.append(row);updateSpaceLabels();
    return row;
  }
  function populate(layout) {
    for (const key of fields) form.elements.namedItem(key).value = layout[key];
    spaces.replaceChildren();for (const space of layout.spaces || []) addSpaceRow(space);updateSpaceLabels();
  }
  function invalidate(message) {
    current = null;link.removeAttribute('href');link.setAttribute('aria-disabled', 'true');
    share.disabled = true;print.disabled = true;reopen.removeAttribute('href');
    get('layout-plan').replaceChildren();get('layout-perspective').replaceChildren();
    get('layout-summary').textContent = '';get('layout-unused').textContent = '';get('layout-reserved-summary').replaceChildren();
    get('layout-schedule').replaceChildren();get('layout-schedule-section').hidden = true;get('layout-schedule-download').disabled = true;
    status.textContent = message;
  }
  function draw() {
    try {
      const value = { schema: DEFAULT_LAYOUT.schema };
      for (const key of fields) value[key] = key === 'shape' ? form.elements.namedItem(key).value : Number(form.elements.namedItem(key).value);
      if (spaces.children.length) {
        value.schema = LAYOUT_V2;
        value.spaces = [...spaces.children].map(row => Object.fromEntries([...row.querySelectorAll('[data-space-field]')].map(control => [control.dataset.spaceField, control.dataset.spaceField === 'wall' ? control.value : (control.value === '' ? NaN : Number(control.value))])));
      }
      current = readLayout(value);
      const model = layoutModel(current), angle = Number(get('layout-angle').value);
      get('layout-plan').innerHTML = planSVG(current);
      get('layout-perspective').innerHTML = perspectiveSVG(current, angle);
      get('layout-angle-value').textContent = angle + '°';
      get('layout-summary').textContent = layoutSummary(current);
      get('layout-unused').textContent = model.unused.map(row => row.wall + ': ' + row.inches + ' in unallocated').join(' · ') + (current.shape === 'U' ? '. Open width between side runs: ' + model.openWidth + ' in; working clearance is not verified.' : '');
      get('layout-reserved-summary').replaceChildren();
      for (const space of [...model.reserved].sort((a,b) => a.number-b.number)) {
        const item = document.createElement('li');item.textContent = `S${space.number}: ${WALL_NAMES[space.wall]}, start ${space.offset} in, reserved width ${space.width} in.`;get('layout-reserved-summary').append(item);
      }
      get('layout-schedule').innerHTML = scheduleHTML(current);get('layout-schedule-section').hidden = false;get('layout-schedule-download').disabled = false;
      link.href = layoutQuoteLink(current);link.removeAttribute('aria-disabled');share.disabled = false;print.disabled = false;
      const url = new URL('kitchen-planner.html', window.location.href);url.searchParams.set('layout', JSON.stringify(current));reopen.href = url.href;
      status.textContent = 'Concept updated. Reserved spaces mark widths only. Unallocated space is not automatically filled. Verify dimensions, access and layout feasibility with French Vanilla.';
    } catch (error) {
      invalidate(error.message + ' Correct the inputs to rebuild the preview.');
    }
  }
  addSpace.addEventListener('click', () => { const row = addSpaceRow();draw();row?.querySelector('select').focus(); });
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', draw);form.addEventListener('change', draw);
  get('layout-angle').addEventListener('input', draw);
  link.addEventListener('click', event => { if (!current) event.preventDefault(); });
  get('layout-reset').addEventListener('click', () => {
    if (!window.confirm('Reset only this layout concept to the starting dimensions?')) return;
    populate(DEFAULT_LAYOUT);get('layout-angle').value = '30';draw();
  });
  get('layout-schedule-download').addEventListener('click', () => {
    if (!current) return;
    let url, anchor;
    try {
      const csv = scheduleCSV(current);
      url = window.URL.createObjectURL(new window.Blob([csv], { type: 'text/csv;charset=utf-8' }));
      anchor = document.createElement('a');anchor.href = url;anchor.download = 'french-vanilla-concept-schedule.csv';document.body.append(anchor);anchor.click();
      status.textContent = 'Schedule download requested. Review this unverified concept with French Vanilla before pricing or fabrication.';
    } catch { status.textContent = 'The schedule could not download. Your concept is retained; try your browser’s Print command for the concept review sheet.'; }
    finally { anchor?.remove();if (url) window.setTimeout(() => window.URL.revokeObjectURL(url), 1000); }
  });
  print.addEventListener('click', () => {
    if (!current) return;
    try { window.print(); }
    catch { status.textContent = 'The print dialog could not open. Use your browser’s Print command to save this concept.'; }
  });
  share.addEventListener('click', async () => {
    if (!current) return;
    const url = new URL('kitchen-planner.html', window.location.href);url.searchParams.set('layout', JSON.stringify(current));
    try { await window.navigator.clipboard.writeText(url.href);status.textContent = 'Layout link copied. It contains layout dimensions only; no inquiry was sent.'; }
    catch { window.prompt('Copy this layout link:', url.href);status.textContent = 'Copy the layout link from the dialog. No inquiry was sent.'; }
  });
  populate(DEFAULT_LAYOUT);
  const parameter = new URLSearchParams(window.location.search).get('layout');let error;
  if (parameter !== null) try { populate(parseLayoutLink(parameter)); } catch (e) { error = e.message; }
  draw();
  if (error) invalidate(error + ' The invalid link was not applied. Change a layout input or reset to start a new concept.');

}
if (typeof document !== 'undefined') setupLayoutPlanner({ document, window });
