import { config } from './quote-client.mjs';
const $ = id => document.getElementById(id);
let token = null;
let expiresAt = 0;
let expiryTimer;
function clearSession(message = 'Signed out.') {
  clearTimeout(expiryTimer);
  token = null;
  expiresAt = 0;
  $('requests').replaceChildren();
  $('inbox').hidden = true;
  $('login').hidden = false;
  $('status').textContent = message;
}
async function api(path, options = {}) {
  const response = await fetch(config.url + path, {
    ...options,
    headers: { apikey: config.key, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    if (response.status === 401) clearSession('Please sign in again.');
    throw new Error('Unable to access the owner inbox. Check your credentials and owner access, then try again.');
  }
  return response.status === 204 ? null : response.json();
}
async function load() {
  $('requests').replaceChildren();
  if (!token || Date.now() >= expiresAt) return clearSession('Session expired. Please sign in again.');
  const activeToken = token;
  $('status').textContent = 'Loading requests…';
  const owners = await api('/rest/v1/owner_accounts?select=user_id');
  if (!owners.length) throw new Error('This account does not have owner access.');
  const rows = await api('/rest/v1/quote_requests?select=*&order=created_at.desc&limit=100');
  if (token !== activeToken) return;
  $('inbox').hidden = false;
  $('login').hidden = true;
  for (const row of rows) {
    const card = document.createElement('article');
    card.className = 'inquiry';
    const heading = document.createElement('h2');
    heading.textContent = `${row.project_type} — ${row.customer_name}`;
    card.append(heading);
    for (const text of [
      `${new Date(row.created_at).toLocaleString()} · ${row.status} · ${row.id}`,
      `Email: ${row.customer_email}\nPhone: ${row.customer_phone || 'Not supplied'}`,
      `Location: ${row.design_options?.location || 'Not supplied'}`,
      row.project_description || '',
      `Customer measurements (unverified): ${row.measurements?.customer_supplied || 'Not supplied'}`,
      row.design_options?.design ? `Design selections: ${JSON.stringify(row.design_options.design, null, 2)}` : ''
    ].filter(Boolean)) {
      const p = document.createElement('p');
      p.textContent = text;
      card.append(p);
    }
    $('requests').append(card);
  }
  $('status').textContent = rows.length ? `${rows.length} request(s) loaded.` : 'No quote requests yet.';
}
$('login').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  $('status').textContent = 'Signing in…';
  try {
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const session = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify(fields) });
    token = session.access_token;
    expiresAt = Date.now() + session.expires_in * 1000;
    expiryTimer = setTimeout(() => clearSession('Session expired. Please sign in again.'), session.expires_in * 1000);
    event.target.reset();
    await load();
  } catch (error) { clearSession(error.message); }
  finally { button.disabled = false; }
});
$('refresh').addEventListener('click', () => load().catch(error => clearSession(error.message)));
$('logout').addEventListener('click', async () => {
  const logout = api('/auth/v1/logout?scope=local', { method: 'POST' });
  clearSession();
  try { await logout; } catch { /* The in-memory session has already been discarded. */ }
});
window.addEventListener('pagehide', () => clearSession());
