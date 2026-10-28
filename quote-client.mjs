// Public browser configuration. Access is enforced by database grants and RLS.
export const config = Object.freeze({
  url: 'https://znuqrkiwqdxaqiltzqya.supabase.co',
  key: 'sb_publishable_zU7wfcOUFTgwfihBhvU_wg_awW_yUIb'
});
export const projects = ['Custom Barn Door', 'Custom Cabinetry', 'Kitchen Remodel', 'Bathroom Remodel', 'Other Construction'];
const clean = (value, max, label, required = false) => {
  if (value != null && typeof value !== 'string') throw new Error(`Please check ${label}.`);
  const text = String(value || '').trim();
  if ((required && !text) || text.length > max) throw new Error(`Please check ${label}.`);
  return text;
};
// Match the intake limits used by the private JARVIS inquiry reader.
export function cleanDesign(design) {
  if (design == null) return null;
  if (typeof design !== 'object' || Array.isArray(design)) throw new Error('Please check your design selections.');
  const limits = { project: 80, wood: 80, finish: 80, style: 80, dimensions: 200, notes: 2000 };
  if (Object.keys(design).some(key => !Object.hasOwn(limits, key))) throw new Error('Please check your design selections.');
  return Object.fromEntries(Object.entries(limits)
    .filter(([key]) => Object.hasOwn(design, key))
    .map(([key, max]) => [key, clean(design[key], max, `your design ${key}`)]));
}
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
    design_options: { source: 'french-vanilla-website', business_contact_email: 'frenchvanillaconstruction@gmail.com', location, contact_consent: true, design: cleanDesign(design) },
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

