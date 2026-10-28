import { DEFAULT_LAYOUT, readLayout, parseLayoutLink, layoutModel, layoutSummary, layoutQuoteLink, planSVG, perspectiveSVG } from './layout-planner.mjs';
export function setupLayoutPlanner({ document, window }) {
  const get = id => document.getElementById(id), form = get('layout-controls'), status = get('layout-status');
  const link = get('layout-quote'), share = get('layout-share'), print = get('layout-print'), reopen = get('layout-reopen');let current = null;
  const fields = ['shape', 'width', 'depth', 'cabinetDepth', 'cabinetHeight', 'moduleWidth'];
  function populate(layout) { for (const key of fields) form.elements.namedItem(key).value = layout[key]; }
  function invalidate(message) {
    current = null;link.removeAttribute('href');link.setAttribute('aria-disabled', 'true');
    share.disabled = true;print.disabled = true;reopen.removeAttribute('href');
    get('layout-plan').replaceChildren();get('layout-perspective').replaceChildren();
    get('layout-summary').textContent = '';get('layout-unused').textContent = '';
    status.textContent = message;
  }
  function draw() {
    try {
      const value = { schema: DEFAULT_LAYOUT.schema };
      for (const key of fields) value[key] = key === 'shape' ? form.elements.namedItem(key).value : Number(form.elements.namedItem(key).value);
      current = readLayout(value);
      const model = layoutModel(current), angle = Number(get('layout-angle').value);
      get('layout-plan').innerHTML = planSVG(current);
      get('layout-perspective').innerHTML = perspectiveSVG(current, angle);
      get('layout-angle-value').textContent = angle + '°';
      get('layout-summary').textContent = layoutSummary(current);
      get('layout-unused').textContent = model.unused.map(row => row.wall + ': ' + row.inches + ' in unallocated').join(' · ') + (current.shape === 'U' ? '. Open width between side runs: ' + model.openWidth + ' in; working clearance is not verified.' : '');
      link.href = layoutQuoteLink(current);link.removeAttribute('aria-disabled');share.disabled = false;print.disabled = false;
      const url = new URL('kitchen-planner.html', window.location.href);url.searchParams.set('layout', JSON.stringify(current));reopen.href = url.href;
      status.textContent = 'Concept updated. Unallocated space is not automatically filled. Verify dimensions, access and layout feasibility with French Vanilla.';
    } catch (error) {
      invalidate(error.message + ' Correct the inputs to rebuild the preview.');
    }
  }
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', draw);form.addEventListener('change', draw);
  get('layout-angle').addEventListener('input', draw);
  link.addEventListener('click', event => { if (!current) event.preventDefault(); });
  get('layout-reset').addEventListener('click', () => {
    if (!window.confirm('Reset only this layout concept to the starting dimensions?')) return;
    populate(DEFAULT_LAYOUT);get('layout-angle').value = '30';draw();
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
