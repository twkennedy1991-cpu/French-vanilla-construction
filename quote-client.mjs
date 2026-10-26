// Public browser configuration. Access is enforced by database grants and RLS.
export const config = Object.freeze({
  url: 'https://znuqrkiwqdxaqiltzqya.supabase.co',
  key: 'sb_publishable_zU7wfcOUFTgwfihBhvU_wg_awW_yUIb'
});
export const projects = ['Custom Barn Door', 'Custom Cabinetry', 'Kitchen Remodel', 'Bathroom Remodel', 'Other Construction'];
const clean = (value, max, label, required = false) => {
  const text = String(value || '').trim();
  if ((required && !text) || text.length > max) throw new Error(`Please check ${label}.`);
  return text;
};
export function buildQuote(fields, id, design = null) {
  const customer_email = clean(fields.email, 254, 'your email', true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) throw new Error('Please enter a valid email.');
  if (!projects.includes(fields.project)) throw new Error('Please choose a project type.');
  if (fields.consent !== 'on') throw new Error('Please agree to be contacted about your project.');
  const location = clean(fields.location, 200, 'your project location', true);
  return {
    id,
    customer_name: clean(fields.name, 120, 'your name', true),
    customer_email,
    customer_phone: clean(fields.phone, 40, 'your phone', true),
    project_type: fields.project,
    project_description: clean(fields.details, 4000, 'your project details', true),
    measurements: { customer_supplied: clean(fields.size, 200, 'dimensions'), verified: false },
    design_options: { source: 'french-vanilla-website', location, contact_consent: true, design },
    status: 'new'
  };
}
export async function submitQuote(payload, request = fetch) {
  const response = await request(`${config.url}/rest/v1/quote_requests`, {
    method: 'POST',
    headers: { apikey: config.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('We could not confirm your submission. Your details are still here. Please call 601-504-5311 before resubmitting.');
}
