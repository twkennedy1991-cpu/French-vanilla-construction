import { setupQuoteLayoutEditor } from './quote-layout-editor.mjs';
import { buildQuote, QuoteValidationError, submitQuote } from './quote-client.mjs';
import { setupQuoteDesign } from './quote-design.mjs';
import { parseLayoutLink, layoutSummary, attachLayoutToDesign } from './layout-planner.mjs';

export function setupQuoteForm({ document, window, send = submitQuote, requestId = window.crypto.randomUUID() }) {
  const get = id => document.getElementById(id), form = get('quote-form');
  const deliveryStatus = get('quote-status'), draftStatus = get('quote-draft-status');
  const button = form.querySelector('button[type="submit"]');
  const projectSelect = form.elements.namedItem('project');
  const requestedProject = new URLSearchParams(window.location.search).get('project');
  if ([...projectSelect.options].some(option => option.value === requestedProject)) projectSelect.value = requestedProject;
  const designAttachment = setupQuoteDesign({ document, window, projectSelect });
  let fieldError = null;
  const descriptionIds = control => (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  function clearFieldError() {
    if (!fieldError) return;
    const { control, message, addedDescription, previousInvalid } = fieldError;
    fieldError = null;
    if (addedDescription) {
      const remaining = descriptionIds(control).filter(id => id !== message.id);
      if (remaining.length) control.setAttribute('aria-describedby', remaining.join(' '));
      else control.removeAttribute('aria-describedby');
    }
    if (control.getAttribute('aria-invalid') === 'true') {
      if (previousInvalid === null) control.removeAttribute('aria-invalid');
      else control.setAttribute('aria-invalid', previousInvalid);
    }
    message.remove();
  }
  function showDraftError(error) {
    clearFieldError();
    const control = error instanceof QuoteValidationError && error.field ? form.elements.namedItem(error.field) : null;
    if (!control) { draftStatus.textContent = error.message;return; }
    const message = document.createElement('span');
    message.id = 'quote-field-error';
    message.textContent = error.message;
    draftStatus.replaceChildren(message);
    const ids = descriptionIds(control);
    const addedDescription = !ids.includes(message.id);
    fieldError = { control, message, addedDescription, previousInvalid: control.getAttribute('aria-invalid') };
    if (addedDescription) control.setAttribute('aria-describedby', [...ids, message.id].join(' '));
    control.setAttribute('aria-invalid', 'true');
    control.focus();
  }
  let suppliedLayout = null, removedLayout = null, pending = false, submitted = false, attempted = false, referenceEpoch = 0;
  const layoutParameter = new URLSearchParams(window.location.search).get('layout');let hasLayout = layoutParameter !== null;
  const layoutPanel = get('quote-layout'), includeLayout = get('quote-include-layout'), copyReference = get('quote-copy-reference');
  function clearLayoutFieldError() {
    if (fieldError?.control === includeLayout) clearFieldError();
  }
  function clearEditedFieldError({ target }) {
    if (target === fieldError?.control) clearFieldError();
    else if (target === projectSelect && projectSelect.value === 'Custom Cabinetry') clearLayoutFieldError();
  }
  form.addEventListener('input', clearEditedFieldError);
  form.addEventListener('change', clearEditedFieldError);
  if (hasLayout) {
    layoutPanel.hidden = false;
    try {
      suppliedLayout = parseLayoutLink(layoutParameter);
      get('quote-layout-summary').textContent = layoutSummary(suppliedLayout);includeLayout.disabled = false;
    } catch { get('quote-layout-summary').textContent = 'This layout link could not be loaded. You can still describe your project below or return to the planner to create a new concept.'; }
  }
  function updateAddress() {
    const url = new URL(window.location.href);
    if (suppliedLayout) url.searchParams.set('layout', JSON.stringify(suppliedLayout));else url.searchParams.delete('layout');
    try { window.history.replaceState(window.history.state, '', url.href); } catch { /* In-memory review remains usable. */ }
  }
  function layoutControls() {
    layoutEditor.setLocked(pending || submitted);
    get('quote-remove-layout').disabled = pending || submitted || !hasLayout;
    get('quote-restore-layout').hidden = !removedLayout;
    get('quote-restore-layout').disabled = pending || submitted || !removedLayout;
  }
  function showLayout(layout) {
    clearLayoutFieldError();
    suppliedLayout = layout;hasLayout = true;layoutPanel.hidden = false;
    if (!projectSelect.value) projectSelect.value = 'Custom Cabinetry';
    get('quote-layout-summary').textContent = layoutSummary(layout);includeLayout.checked = false;includeLayout.disabled = false;
    updateAddress();layoutControls();
  }
  const layoutEditor = setupQuoteLayoutEditor({ document, window, read: () => suppliedLayout, apply: layout => {
    removedLayout = null;showLayout(layout);
    draftStatus.textContent = 'Layout updated. Review it and check the inclusion box to add it to your inquiry. Your contact details are retained.';
  } });
  get('quote-remove-layout').addEventListener('click', () => {
    if (pending || submitted || !hasLayout) return;
    clearLayoutFieldError();
    layoutEditor.cancel();removedLayout = suppliedLayout;suppliedLayout = null;hasLayout = false;
    layoutPanel.hidden = true;get('quote-layout-summary').textContent = '';includeLayout.checked = false;includeLayout.disabled = true;
    updateAddress();layoutControls();get('quote-start-layout').focus();
    draftStatus.textContent = 'Layout removed from the current draft. Your contact details and design studio selections are retained.' + (removedLayout ? ' You can restore the removed layout on this page.' : '');
  });
  get('quote-restore-layout').addEventListener('click', () => {
    if (pending || submitted || !removedLayout) return;
    const restored = removedLayout;removedLayout = null;showLayout(restored);get('quote-edit-layout').focus();
    draftStatus.textContent = 'Layout restored. Review it and check the inclusion box if you want to include it. Restoring does not send a request.';
  });
  copyReference.addEventListener('click', async () => {
    if (pending || !attempted) return;const mine = referenceEpoch;
    try {
      await window.navigator.clipboard.writeText(requestId);
      if (mine === referenceEpoch && !pending) get('quote-reference-status').textContent = 'Request reference copied. Copying does not submit or confirm delivery.';
    } catch { if (mine === referenceEpoch && !pending) get('quote-reference-status').textContent = 'The reference could not be copied. Select the reference from the submission message above.'; }
  });
  window.addEventListener('pagehide', () => { referenceEpoch++; });
  layoutControls();
  form.addEventListener('submit', async event => {
    event.preventDefault();if (pending || submitted || !form.reportValidity()) return;
    let quote;
    try {
      let design = designAttachment.read();
      if (includeLayout.checked) {
        if (!suppliedLayout) throw new Error('Choose a valid planner layout before including it.');
        if (projectSelect.value !== 'Custom Cabinetry') {
          throw new QuoteValidationError('Choose Custom Cabinetry as the project type, or uncheck the layout concept.', includeLayout.id);
        }
        design = attachLayoutToDesign(design, suppliedLayout);
      }
      quote = buildQuote(Object.fromEntries(new window.FormData(form)), requestId, design);
    } catch (error) { showDraftError(error);return; }
    clearFieldError();
    const editable = [...new Set([...form.querySelectorAll('input,select,textarea'), ...document.querySelectorAll('#configurator input,#configurator select,#configurator textarea,#configurator button,[data-type]')])].map(control => [control, control.disabled]);
    for (const [control] of editable) control.disabled = true;
    pending = true;attempted = true;referenceEpoch++;copyReference.hidden = false;copyReference.disabled = true;
    draftStatus.textContent = '';
    get('quote-reference-status').textContent = '';layoutControls();button.disabled = true;form.setAttribute('aria-busy', 'true');deliveryStatus.textContent = 'Sending your request…';
    try {
      await send(quote);submitted = true;button.textContent = 'Request Sent';
      deliveryStatus.textContent = `Thank you — your request has been received for review. Reference: ${requestId}. Our team will contact you about your project.`;
    } catch {
      deliveryStatus.textContent = `We could not confirm your submission. Please call 601-504-5311 before resubmitting and mention reference ${requestId}. Your details are still here.`;
    } finally {
      pending = false;for (const [control, disabled] of editable) control.disabled = disabled;
      button.disabled = submitted;copyReference.disabled = false;layoutControls();form.removeAttribute('aria-busy');
    }
  });
  deliveryStatus.textContent = '';
  button.disabled = false;
}
if (typeof document !== 'undefined') setupQuoteForm({ document, window });
