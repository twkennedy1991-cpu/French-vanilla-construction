import { buildQuote, submitQuote } from './quote-client.mjs';
const form = document.getElementById('quote-form');
const status = document.getElementById('quote-status');
let pending = false;
let submitted = false;
const requestId = crypto.randomUUID();
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (pending || submitted || !form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]');
  pending = true;
  button.disabled = true;
  status.textContent = 'Sending your request…';
  try {
    const design = document.getElementById('configurator').hidden ? null : {
      project: document.getElementById('config-title').textContent,
      wood: document.getElementById('wood').value,
      finish: document.getElementById('finish').value,
      style: document.getElementById('pattern').value,
      dimensions: document.getElementById('dimensions').value,
      notes: document.getElementById('design-notes').value
    };
    const quote = buildQuote(Object.fromEntries(new FormData(form)), requestId, design);
    await submitQuote(quote);
    submitted = true;
    button.textContent = 'Request Sent';
    status.textContent = `Thank you — your request has been received for review. Reference: ${requestId}. Our team will contact you about your project.`;
  } catch (error) {
    status.textContent = error instanceof TypeError || error.name === 'TimeoutError'
      ? 'We could not confirm your submission. Please call 601-504-5311 before resubmitting. Your details are still here.'
      : error.message;
  } finally {
    pending = false;
    button.disabled = submitted;
  }
});
