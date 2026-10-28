import { DEFAULT_LAYOUT, LAYOUT_V2, WALL_NAMES, readLayout, layoutSummary, planSVG, perspectiveSVG } from './layout-planner.mjs';

// Quote fields stay in their original DOM. Only validated geometry crosses this boundary.
export function setupQuoteLayoutEditor({ document, window, read, apply }) {
  const get = id => document.getElementById(id), button = get('quote-edit-layout');
  const dialog = get('quote-layout-editor'), form = get('quote-layout-edit-form');
  const fields = get('quote-layout-edit-fields'), spaces = get('quote-layout-edit-spaces');
  const status = get('quote-layout-edit-status'), preview = get('quote-layout-edit-preview');
  const save = get('quote-layout-apply'), add = get('quote-layout-add-space');
  let locked = false, active = false, candidate = null, opener = button;
  const create = get('quote-start-layout'), launchers = [...document.querySelectorAll('[data-start-layout]')];
  function field(parent, text, key, value, options) {
    const label = document.createElement('label');label.textContent = text;
    const control = document.createElement(options ? 'select' : 'input');control.dataset.layoutField = key;
    if (options) for (const [value,text] of options) {
      const option = document.createElement('option');option.value = value;option.textContent = text;control.append(option);
    }
    else { control.type = 'number';control.step = '0.25';control.inputMode = 'decimal';control.required = true; }
    control.value = String(value);label.append(control);parent.append(label);return control;
  }
  function relabel() {
    [...spaces.children].forEach((row,index) => {
      row.querySelector('legend').textContent = `Space ${index+1}`;
      row.querySelector('button').setAttribute('aria-label', `Remove space ${index+1}`);
    });add.disabled = spaces.children.length >= 4;
  }
  function spaceRow(space = { wall: 'back', offset: 0, width: 30 }) {
    if (spaces.children.length >= 4) return;
    const row = document.createElement('fieldset'), legend = document.createElement('legend');row.append(legend);
    field(row,'Wall','wall',space.wall,Object.entries(WALL_NAMES));
    const offset = field(row,'Start along run (in)','offset',space.offset);offset.min = '0';offset.max = '360';
    const width = field(row,'Reserved width (in)','width',space.width);width.min = '6';width.max = '360';
    const remove = document.createElement('button');remove.type = 'button';remove.textContent = 'Remove space';
    remove.addEventListener('click', () => { if (!active || locked) return;row.remove();relabel();draw();add.focus(); });
    row.append(remove);spaces.append(row);relabel();return row;
  }
  function values(parent) {
    return Object.fromEntries([...parent.querySelectorAll('[data-layout-field]')].map(control => [control.dataset.layoutField,
      control.tagName === 'SELECT' ? control.value : control.value === '' ? NaN : Number(control.value)]));
  }
  function draw() {
    if (!active || locked) return;
    try {
      const value = { schema: spaces.children.length ? LAYOUT_V2 : DEFAULT_LAYOUT.schema, ...values(fields) };
      if (spaces.children.length) value.spaces = [...spaces.children].map(values);
      candidate = readLayout(value);
      preview.innerHTML = planSVG(candidate) + perspectiveSVG(candidate);
      status.textContent = layoutSummary(candidate);save.disabled = false;
    } catch (error) {
      candidate = null;save.disabled = true;preview.replaceChildren();status.textContent = error.message;
    }
  }
  function close() {
    active = false;candidate = null;
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    dialog.removeAttribute('open');dialog.hidden = true;fields.replaceChildren();spaces.replaceChildren();preview.replaceChildren();
    if (!locked) (opener?.hidden ? button : opener)?.focus();
  }
  function open(value, source) {
    if (locked || active) return;
    const layout = readLayout(value);opener = source;
    fields.replaceChildren();spaces.replaceChildren();
    field(fields,'Layout shape','shape',layout.shape,[['straight','Straight'],['L','L-shaped'],['U','U-shaped']]);
    for (const [key,text,min,max] of [['width','Room width (in)',72,360],['depth','Room depth (in)',72,360],['cabinetDepth','Cabinet depth (in)',12,30],['cabinetHeight','Cabinet height (in)',24,42],['moduleWidth','Nominal module width (in)',12,48]]) {
      const control = field(fields,text,key,layout[key]);control.min = String(min);control.max = String(max);
    }
    for (const space of layout.spaces || []) spaceRow(space);relabel();
    active = true;dialog.hidden = false;
    if (typeof dialog.showModal === 'function') dialog.showModal();else dialog.setAttribute('open','');
    draw();fields.querySelector('select').focus();
  }
  button.addEventListener('click', () => { if (read()) open(read(),button); });
  create.addEventListener('click', () => open(read() || DEFAULT_LAYOUT,create));
  for (const link of launchers) link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();open(read() || DEFAULT_LAYOUT,link);
  });
  add.addEventListener('click', () => { if (!active || locked) return;const row=spaceRow();draw();row?.querySelector('select').focus(); });
  form.addEventListener('input',draw);form.addEventListener('change',draw);
  form.addEventListener('submit', event => {
    event.preventDefault();if (!active || locked) return;draw();
    if (!candidate || !form.reportValidity()) return;
    apply(readLayout(candidate));close();
  });
  get('quote-layout-cancel').addEventListener('click',close);
  dialog.addEventListener('cancel',event => { event.preventDefault();close(); });
  window.addEventListener('pagehide',close);
  return { cancel: close, setLocked(value) {
    locked = Boolean(value);button.disabled = locked || !read();create.disabled = locked;create.hidden = Boolean(read());
    for (const link of launchers) { if (locked) link.setAttribute('aria-disabled','true');else link.removeAttribute('aria-disabled'); }
    if (locked && active) close();
  } };
}
