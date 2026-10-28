export const PAGE_SIZE = 25;
export const isUUID = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export function inboxCursor(row) {
  const date = row?.created_at;
  if (!isUUID(row?.id) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})$/.test(date) || !Number.isFinite(Date.parse(date))) throw Error('Unsupported inquiry cursor.');
  return { id: row.id.toLowerCase(), created_at: date };
}
export function inboxPath(cursor = null) {
  let path = `/rest/v1/quote_requests?select=*&order=created_at.desc,id.desc&limit=${PAGE_SIZE+1}`;
  if (cursor) {
    const c = inboxCursor(cursor);
    path += '&or=' + encodeURIComponent(`(created_at.lt.${c.created_at},and(created_at.eq.${c.created_at},id.lt.${c.id}))`);
  }
  return path;
}
const text = (value, max) => {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw Error('Unsupported inquiry text.');
  return value;
};
export function reviewInquiry(row) {
  inboxCursor(row);
  const design = row.design_options?.design;
  if (design != null && (typeof design !== 'object' || Array.isArray(design))) throw Error('Unsupported design.');
  return {
    id: row.id, created: row.created_at, name: text(row.customer_name,120), email: text(row.customer_email,254), phone: text(row.customer_phone,40),
    project: text(row.project_type,80), status: text(row.status,80), location: text(row.design_options?.location,200),
    description: text(row.project_description,4000), dimensions: text(row.measurements?.customer_supplied,200),
    consent: row.design_options?.contact_consent === true,
    design: design == null ? null : Object.fromEntries([['project',80],['wood',80],['finish',80],['style',80],['dimensions',200],['notes',2000]].map(([key,max]) => [key,text(design[key],max)]))
  };
}
export function readInboxPage(value) {
  if (!Array.isArray(value) || value.length > PAGE_SIZE+1) throw Error('Unexpected inbox response.');
  const visible = value.slice(0,PAGE_SIZE), rows = [];let rejected = 0, next = null, pagingUnavailable = false;
  for (const row of visible) { try { rows.push(reviewInquiry(row)); } catch { rejected++; } }
  if (value.length > PAGE_SIZE) try { next = inboxCursor(visible.at(-1)); } catch { pagingUnavailable = true; }
  return { rows, rejected, next, pagingUnavailable, loaded: visible.length };
}
export function matchingInquiries(rows, query) {
  const needle = String(query).trim().toLocaleLowerCase();
  return rows.filter(row => [row.name,row.email,row.phone,row.project,row.id,row.location].some(value => value.toLocaleLowerCase().includes(needle)));
}
