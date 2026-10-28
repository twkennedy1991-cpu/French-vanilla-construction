// Offline contract check against a separately checked out private JARVIS repo.
// No network, credentials, real customer data or persistent storage is used.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildQuote, projects } from '../quote-client.mjs';
import { DEFAULT_LAYOUT, attachLayoutToDesign, layoutSummary } from '../layout-planner.mjs';
if (!process.argv[2]) throw new Error('Usage: node scripts/check-jarvis-intake.mjs /path/to/jarvis-source');
const source = name => pathToFileURL(resolve(process.argv[2], name)).href;
const { importWebsiteInquiry } = await import(source('jarvis-website-inquiries.mjs'));
const { openLeadBook } = await import(source('jarvis-leads.mjs'));
const { prepareWebsiteInquiryJob } = await import(source('jarvis-inquiry-job.mjs'));
const { openJobScopeBook } = await import(source('jarvis-job-scope.mjs'));
const fields = { name: 'Synthetic Customer', phone: '555-0100', email: 'contract@example.invalid', location: 'L'.repeat(200), details: '"'.repeat(4000), size: 'M'.repeat(200), consent: 'on' };
const design = { project: 'P'.repeat(80), wood: 'W'.repeat(80), finish: 'F'.repeat(80), style: 'S'.repeat(80), dimensions: 'D'.repeat(200), notes: '"'.repeat(2000) };
for (const project of projects) {
  const payload = buildQuote({ ...fields, project }, 'c819376a-48dd-4ed9-a221-a59f564d617b', design);
  const row = JSON.parse(JSON.stringify({ ...payload, created_at: '2026-10-27T12:00:00Z' }));
  const saved = new Map(), tasks = new Map(), scope = 'contract-check';
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const options = { row, storage, scope, day: '2026-10-27', onTask: task => tasks.set(task.id, task) };
  await importWebsiteInquiry(options);
  const leads = openLeadBook(storage, scope), lead = leads.read().leads[0];
  assert.equal(lead.email, fields.email); assert.ok(lead.notes.includes(design.notes)); assert.ok(lead.notes.includes(fields.details));
  const draft = prepareWebsiteInquiryJob(options);
  assert.ok(draft.document.intakeText.includes(design.notes)); assert.ok(draft.document.intakeText.includes(fields.details));
  assert.ok(draft.document.sourceNotes.includes(design.dimensions));
  // Repeat handoffs must preserve contractor work and stable task/job identity.
  leads.save({ ...lead, notes: 'Contractor follow-up notes' }, lead.id);
  const jobs = openJobScopeBook(storage, scope);
  jobs.save({ ...draft.document, scope: 'Contractor revised scope' }, draft.id);
  await importWebsiteInquiry(options);
  const repeated = prepareWebsiteInquiryJob(options);
  assert.equal(leads.read().leads.length, 1); assert.equal(leads.read().leads[0].notes, 'Contractor follow-up notes');
  assert.equal(tasks.size, 1); assert.equal(jobs.read().length, 1);
  assert.equal(repeated.existing, true); assert.equal(repeated.document.scope, 'Contractor revised scope');
  console.log('PASS website → FURY → STARK: ' + project);
}

// The public planner travels as bounded, explicitly unverified design notes.
{
  const layout = { ...DEFAULT_LAYOUT, shape: 'U', width: 168.25 };
  const payload = buildQuote({ ...fields, details: 'Review this kitchen concept.', project: 'Custom Cabinetry' }, 'c819376a-48dd-4ed9-a221-a59f564d617b', attachLayoutToDesign({ notes: 'Keep the existing trim.' }, layout));
  const row = JSON.parse(JSON.stringify({ ...payload, created_at: '2026-10-27T12:00:00Z' }));
  const saved = new Map(), storage = { getItem: key => saved.get(key) ?? null, setItem: (key,value) => saved.set(key,value) }, scope = 'layout-contract';
  await importWebsiteInquiry({ row, storage, scope, day: '2026-10-27', onTask: () => {} });
  const lead = openLeadBook(storage,scope).read().leads[0], draft = prepareWebsiteInquiryJob({ row,storage,scope });
  for (const text of [lead.notes,draft.document.intakeText]) {
    assert.ok(text.includes(layoutSummary(layout)));assert.ok(text.includes('Keep the existing trim.'));assert.ok(text.includes('unverified'));
  }
  console.log('PASS layout concept → FURY → STARK: exact dimensions and owner notes retained');
}
