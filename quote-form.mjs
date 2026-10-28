import { buildQuote, submitQuote } from './quote-client.mjs';

export function setupQuoteForm({ document, window, send = submitQuote, requestId = window.crypto.randomUUID() }) {
  const form = document.getElementById('quote-form');
  const status = document.getElementById('quote-status');
  const requestedProject = new URLSearchParams(window.location.search).get('project');
  const projectSelect = form.elements.namedItem('project');
  if ([...projectSelect.options].some(option => option.value === requestedProject)) projectSelect.value = requestedProject;
  let pending = false;
  let submitted = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || submitted || !form.reportValidity()) return;
    let quote;
    try {
      const design = document.getElementById('configurator').hidden ? null : {
        project: document.getElementById('config-title').textContent,
        wood: document.getElementById('wood').value,
        finish: document.getElementById('finish').value,
        style: document.getElementById('pattern').value,
        dimensions: document.getElementById('dimensions').value,
        notes: document.getElementById('design-notes').value
      };
      quote = buildQuote(Object.fromEntries(new window.FormData(form)), requestId, design);
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    const button = form.querySelector('button[type="submit"]');
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
      button.disabled = submitted;
      form.removeAttribute('aria-busy');
    }
  });
}

if (typeof document !== 'undefined') setupQuoteForm({ document, window });
