import { buildQuote, submitQuote } from './quote-client.mjs';
import { setupQuoteDesign } from './quote-design.mjs';
import { parseLayoutLink, layoutSummary, attachLayoutToDesign } from './layout-planner.mjs';

export function setupQuoteForm({ document, window, send = submitQuote, requestId = window.crypto.randomUUID() }) {
  const form = document.getElementById('quote-form');
  const status = document.getElementById('quote-status');
  const requestedProject = new URLSearchParams(window.location.search).get('project');
  const projectSelect = form.elements.namedItem('project');
  if ([...projectSelect.options].some(option => option.value === requestedProject)) projectSelect.value = requestedProject;
  const designAttachment = setupQuoteDesign({ document, window, projectSelect });
  let suppliedLayout = null;
  const layoutParameter = new URLSearchParams(window.location.search).get('layout');
  const layoutPanel = document.getElementById('quote-layout');
  const includeLayout = document.getElementById('quote-include-layout');
  if (layoutParameter !== null) {
    layoutPanel.hidden = false;
    try {
      suppliedLayout = parseLayoutLink(layoutParameter);
      document.getElementById('quote-layout-summary').textContent = layoutSummary(suppliedLayout);
      includeLayout.disabled = false;
    } catch {
      document.getElementById('quote-layout-summary').textContent = 'This layout link could not be loaded. You can still describe your project below or return to the planner to create a new concept.';
    }
  }
  let pending = false;
  let submitted = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || submitted || !form.reportValidity()) return;
    let quote;
    try {
      let design = designAttachment.read();
      if (includeLayout.checked) {
        if (!suppliedLayout) throw new Error('Choose a valid planner layout before including it.');
        if (projectSelect.value !== 'Custom Cabinetry') throw new Error('Choose Custom Cabinetry as the project type, or uncheck the layout concept.');
        design = attachLayoutToDesign(design, suppliedLayout);
      }
      quote = buildQuote(Object.fromEntries(new window.FormData(form)), requestId, design);
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const editable = [...new Set([...form.querySelectorAll('input,select,textarea'), ...document.querySelectorAll('#configurator input,#configurator select,#configurator textarea,#configurator button,[data-type]')])].map(control => [control, control.disabled]);
    for (const [control] of editable) control.disabled = true;
    pending = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Sending your request…';
    try {
      await send(quote);
      submitted = true;
      button.textContent = 'Request Sent';
      status.textContent = `Thank you — your request has been received for review. Reference: ${requestId}. Our team will contact you about your project.`;
    } catch {
      // Network errors can follow a successful insert. Keep the same reference,
      // never retry automatically, and never display raw service diagnostics.
      status.textContent = `We could not confirm your submission. Please call 601-504-5311 before resubmitting and mention reference ${requestId}. Your details are still here.`;
    } finally {
      pending = false;
      for (const [control, disabled] of editable) control.disabled = disabled;
      button.disabled = submitted;
      form.removeAttribute('aria-busy');
    }
  });
}

if (typeof document !== 'undefined') setupQuoteForm({ document, window });
