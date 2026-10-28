// Customer-controlled attachment of the existing material-selection studio.
// This prepares inquiry context only; it does not generate a 3D design or price.
const projectTypes = Object.freeze({
  'Kitchen Cabinetry': 'Custom Cabinetry',
  'Custom Barn Door': 'Custom Barn Door',
  'Bathroom Remodel': 'Bathroom Remodel'
});
export function setupQuoteDesign({ document, window, projectSelect }) {
  const get = id => document.getElementById(id);
  const studio = get('configurator'), include = get('quote-include-design');
  const summary = get('quote-design-summary');
  let selected = null;
  function values() {
    return { project: selected, wood: get('wood').value, finish: get('finish').value,
      style: get('pattern').value, dimensions: get('dimensions').value, notes: get('design-notes').value };
  }
  function refresh() {
    if (!selected || !include.checked) {
      summary.textContent = 'Design studio selections are not included in this request.';
      return;
    }
    const design = values();
    summary.textContent = `Included: ${design.project}; ${design.wood}; ${design.finish}; ${design.style}. Dimensions: ${design.dimensions || 'To be measured'}. Notes: ${design.notes || 'None'}. Measurements and selections need contractor review.`;
    if (projectSelect.value !== projectTypes[selected]) summary.textContent += ` Choose ${projectTypes[selected]} as the project type, or uncheck the design attachment.`;
  }
  for (const button of document.querySelectorAll('[data-type]')) button.addEventListener('click', () => {
    const type = button.dataset.type;
    if (!Object.hasOwn(projectTypes, type)) return;
    selected = type;
    get('config-title').textContent = selected + ' — Your Design Selections';
    studio.hidden = false;
    // Choosing a studio category alone never opts the customer into attaching it.
    include.checked = false;
    include.disabled = false;
    refresh();
    get('design-status').textContent = 'Choose your selections, then use them in the quote request or copy a summary.';
    studio.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  });
  get('use-design').addEventListener('click', () => {
    if (!selected || studio.hidden) return;
    projectSelect.value = projectTypes[selected];
    include.checked = true;
    refresh();
    get('design-status').textContent = 'Selections added to the quote form below. Review your details and contact permission before sending. No request has been sent.';
    get('contact').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    include.focus();
  });
  for (const control of studio.querySelectorAll('input,select,textarea')) control.addEventListener('input', refresh);
  include.addEventListener('change', refresh);
  projectSelect.addEventListener('change', refresh);
  get('copy-design').addEventListener('click', async () => {
    if (!selected || studio.hidden) return;
    const d = values();
    const text = `French Vanilla — Design Request\nProject: ${d.project}\nWood: ${d.wood}\nFinish: ${d.finish}\nStyle: ${d.style}\nDimensions: ${d.dimensions || 'To be measured'}\nNotes: ${d.notes || 'None'}`;
    let copied = false;
    try { await window.navigator.clipboard.writeText(text); copied = true; }
    catch { window.prompt('Copy this text:', text); }
    get('design-status').textContent = copied ? 'Design summary copied. No request has been sent.' : 'Copy your design summary from the dialog. No request has been sent.';
  });
  include.checked = false;
  include.disabled = true;
  refresh();
  return {
    read() {
      if (!include.checked) return null;
      if (!selected || studio.hidden) throw new Error('Choose your studio selections again or uncheck the design attachment.');
      if (projectSelect.value !== projectTypes[selected]) throw new Error(`Choose ${projectTypes[selected]} as the project type, or uncheck the design attachment.`);
      return values();
    }
  };
}
