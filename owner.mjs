import { config } from './quote-client.mjs';
import { isUUID, inboxPath, readInboxPage, matchingInquiries } from './owner-inbox-data.mjs';

export function setupOwnerInbox({ document, window, request = window.fetch.bind(window), clock = () => Date.now(), timeout = 20000 }) {
  const $ = id => document.getElementById(id), login = $('login'), loginButton = login.querySelector('button');
  let session = null, epoch = 0, renderVersion = 0, busy = false, loginBusy = false, expiryTimer;
  let rows = [], page = 0, cursors = [null], next = null, rejected = 0, loaded = 0;
  const controllers = new Set();
  function controls() {
    $('refresh').disabled = busy || !session;
    $('older').disabled = busy || !session || !next;
    $('newer').disabled = busy || !session || page === 0;
    $('inbox-search').disabled = busy || !session;
    $('clear-search').disabled = busy || !session;
    loginButton.disabled = loginBusy;
  }
  function clear(message = 'Signed out on this page.') {
    epoch++;renderVersion++;session = null;busy = false;loginBusy = false;
    window.clearTimeout(expiryTimer);for (const controller of controllers) controller.abort();controllers.clear();
    rows = [];page = 0;cursors = [null];next = null;rejected = 0;loaded = 0;
    $('requests').replaceChildren();$('inbox-search').value = '';$('inbox-matches').textContent = '';$('inbox-page').textContent = '';
    $('inbox').hidden = true;$('inbox').removeAttribute('aria-busy');login.hidden = false;login.reset();$('status').textContent = message;controls();
  }
  function current(mine) {
    if (mine !== epoch || !session) return false;
    if (clock() >= session.expires) { clear('Session expired. Please sign in again.');return false; }
    return true;
  }
  async function api(path, { token, method = 'GET', body } = {}) {
    const controller = new window.AbortController();controllers.add(controller);
    const timer = window.setTimeout(() => controller.abort(),timeout);
    try {
      const response = await request(config.url + path, { method, body, cache: 'no-store', signal: controller.signal,
        headers: { apikey: config.key, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' } });
      if (!response.ok) { const error = Error('Inbox request failed.');error.auth = response.status === 401 || response.status === 403;throw error; }
      return response.status === 204 ? null : await response.json();
    } finally { window.clearTimeout(timer);controllers.delete(controller); }
  }
  function render() {
    const mine = epoch, view = ++renderVersion;const list = $('requests');list.replaceChildren();
    if (!current(mine) || busy) return;
    const matches = matchingInquiries(rows,$('inbox-search').value);
    $('inbox-matches').textContent = `${matches.length} of ${rows.length} readable inquiries on this page.` + (rejected ? ` ${rejected} record(s) could not be displayed.` : '') + (!matches.length && rows.length ? ' Clear search or browse another page.' : '');
    const node = (tag, text) => { const element = document.createElement(tag);element.textContent = text;return element; };
    for (const row of matches) {
      const card = document.createElement('article');card.className = 'inquiry';
      card.append(node('h2',`${row.project || 'Project not supplied'} — ${row.name || 'Name not supplied'}`));
      card.append(node('p',`${new Date(row.created).toLocaleString()} · ${row.status || 'Status not supplied'} · ${row.id}`));
      card.append(node('p',`Email: ${row.email || 'Not supplied'}\nPhone: ${row.phone || 'Not supplied'}\nLocation: ${row.location || 'Not supplied'}`));
      card.append(node('h3','Customer project details'),node('p',row.description || 'Not supplied'));
      card.append(node('p',`Customer measurements (unverified): ${row.dimensions || 'Not supplied'}`));
      card.append(node('p',`Contact consent: ${row.consent ? 'Recorded in this inquiry' : 'Not confirmed; verify before contacting'}`));
      if (row.design) {
        const section = document.createElement('section');section.append(node('h3','Submitted design context — unverified'));
        for (const [key,label] of [['project','Project'],['wood','Wood'],['finish','Finish'],['style','Style'],['dimensions','Dimensions'],['notes','Notes / layout concept']]) if (row.design[key]) section.append(node('h4',label),node('p',row.design[key]));
        if (!Object.values(row.design).some(Boolean)) section.append(node('p','No design details supplied.'));
        card.append(section);
      } else card.append(node('p','No design attachment supplied.'));
      const copy = node('button','Copy request reference');copy.type = 'button';copy.className = 'btn';
      const active = () => current(mine) && view === renderVersion && !busy && list.contains(card);
      copy.addEventListener('click',async () => {
        if (!active()) return;
        try { await window.navigator.clipboard.writeText(row.id);if (active()) $('status').textContent = 'Request reference copied. No customer message was sent.'; }
        catch { if (active()) $('status').textContent = 'The reference could not be copied. Select it from the inquiry heading.'; }
      });card.append(copy);list.append(card);
    }
    if (!matches.length) list.append(node('p',rows.length ? 'No matches on this loaded page.' : loaded ? 'No readable inquiries on this page. Try another page or refresh.' : 'No inquiries on this page.'));
  }
  async function load(cursor = null, target = 0) {
    const mine = epoch;if (busy || !current(mine)) return;
    const token = session.token, user = session.user;
    busy = true;renderVersion++;rows = [];rejected = 0;loaded = 0;$('inbox').setAttribute('aria-busy','true');$('requests').replaceChildren();$('inbox-matches').textContent = '';$('inbox-page').textContent = 'Loading page…';$('status').textContent = 'Loading requests…';controls();
    try {
      const owners = await api('/rest/v1/owner_accounts?select=user_id',{token});if (!current(mine)) return;
      if (!Array.isArray(owners) || !owners.some(owner => owner.user_id === user)) { clear('This account does not have owner inbox access.');return; }
      const response = await api(inboxPath(cursor),{token});if (!current(mine)) return;
      const result = readInboxPage(response);rows = result.rows;rejected = result.rejected;loaded = result.loaded;next = result.next;page = target;
      if (target === 0) cursors = [null];else cursors[target] = cursor;
      $('inbox').hidden = false;login.hidden = true;
      $('inbox-page').textContent = `Page ${page+1} · up to 25 requests per page. Newer / Older reloads that page; this is not a fixed snapshot.`;
      $('status').textContent = `${loaded} request(s) loaded.` + (result.pagingUnavailable ? ' Older paging is unavailable for this page; refresh the latest inquiries.' : '');
      busy = false;render();
    } catch (error) {
      if (mine !== epoch) return;
      if (!current(mine)) return;
      if (error.auth) { clear('Owner access could not be confirmed. Please sign in again.');return; }
      rows = [];next = null;renderVersion++;$('requests').replaceChildren();$('inbox').hidden = false;login.hidden = true;
      $('inbox-page').textContent = 'No page loaded. Refresh to retry.';
      $('status').textContent = 'Requests could not be loaded. Refresh to retry; no records were changed.';
    } finally { if (mine === epoch) { busy = false;$('inbox').removeAttribute('aria-busy');controls(); } }
  }
  login.addEventListener('submit',async event => {
    event.preventDefault();if (loginBusy || !login.reportValidity()) return;
    const fields = Object.fromEntries(new window.FormData(login));clear('Signing in…');const mine = epoch;loginBusy = true;controls();
    try {
      const data = await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:fields.email,password:fields.password})});
      if (mine !== epoch) return;
      if (!data || typeof data.access_token !== 'string' || !data.access_token || !isUUID(data.user?.id) || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 2147483) throw Error('Unsupported session.');
      session = { token: data.access_token, user: data.user.id, expires: clock()+data.expires_in*1000 };
      expiryTimer = window.setTimeout(() => { if (mine === epoch) clear('Session expired. Please sign in again.'); },data.expires_in*1000);
      $('inbox').hidden = false;login.hidden = true;await load();
    } catch { if (mine === epoch) clear('Unable to sign in. Check your credentials and owner access, then try again.'); }
    finally { if (mine === epoch) { loginBusy = false;controls(); } }
  });
  $('refresh').addEventListener('click',() => load());
  $('older').addEventListener('click',() => { if (next) load(next,page+1); });
  $('newer').addEventListener('click',() => { if (page > 0) load(cursors[page-1],page-1); });
  $('inbox-search').addEventListener('input',render);
  $('clear-search').addEventListener('click',() => { $('inbox-search').value = '';render();$('inbox-search').focus(); });
  $('logout').addEventListener('click',() => { const token = session?.token;clear();if (token) api('/auth/v1/logout?scope=local',{token,method:'POST'}).catch(() => {}); });
  document.addEventListener('visibilitychange',() => { if (session && clock() >= session.expires) clear('Session expired. Please sign in again.'); });
  window.addEventListener('pagehide',() => clear());
  clear('Sign in to review quote requests.');
}
if (typeof document !== 'undefined') setupOwnerInbox({document,window});
