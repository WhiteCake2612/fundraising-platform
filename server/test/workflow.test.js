import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import XLSX from 'xlsx';
import { createApp } from '../src/app.js';
import { setLlmTransport } from '../src/services/llm.js';

let server, base, ctx, tmp;

class Client {
  constructor() { this.cookie = ''; }
  async req(method, url, body, { form } = {}) {
    const headers = { 'x-requested-with': 'fetch' };
    if (this.cookie) headers.cookie = this.cookie;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers, body: payload, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text() };
  }
  get(u) { return this.req('GET', u); }
  post(u, b) { return this.req('POST', u, b ?? {}); }
  put(u, b) { return this.req('PUT', u, b); }
  patch(u, b) { return this.req('PATCH', u, b); }
  del(u) { return this.req('DELETE', u); }
  async upload(category, filename, buffer) {
    const fd = new FormData();
    fd.append('category', category);
    fd.append('file', new Blob([buffer]), filename);
    return this.req('POST', '/api/founder/documents', undefined, { form: fd });
  }
}

function xlsx(rows, sheet = 'P&L') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-test-'));
  ctx = createApp({ dbFile: ':memory:', uploadDir: path.join(tmp, 'up'), secret: 'x'.repeat(40), env: {}, inlineJobs: false });
  ctx.db.prepare("INSERT INTO users(email, password_hash, role, name, email_verified) VALUES ('host@t.test', ?, 'host', 'Host', 1)").run(bcrypt.hashSync('host-password-1', 4));
  await new Promise(r => { server = ctx.app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); setLlmTransport(null); });

const founder = new Client(), founder2 = new Client(), investor = new Client(), host = new Client(), anon = new Client();
let companyId, docId, teaserId;

test('registration and login for all roles', async () => {
  let r = await founder.post('/api/auth/register', { email: 'f1@t.test', password: 'founder-pass-1', name: 'Asha Founder', role: 'founder', company_name: 'LedgerLoop', consent: true });
  assert.equal(r.status, 201);
  r = await founder2.post('/api/auth/register', { email: 'f2@t.test', password: 'founder-pass-2', name: 'Other Founder', role: 'founder', company_name: 'Other', consent: true });
  assert.equal(r.status, 201);
  r = await investor.post('/api/auth/register', { email: 'i1@t.test', password: 'investor-pass-1', name: 'Ivan Investor', role: 'investor', consent: true });
  assert.equal(r.status, 201);
  r = await anon.post('/api/auth/register', { email: 'x@t.test', password: 'short', name: 'X', role: 'host', consent: true });
  assert.equal(r.status, 400, 'cannot self-register as host; weak password rejected');
  r = await host.post('/api/auth/login', { email: 'host@t.test', password: 'wrong-password' });
  assert.equal(r.status, 401);
  r = await host.post('/api/auth/login', { email: 'host@t.test', password: 'host-password-1' });
  assert.equal(r.status, 200);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM login_events WHERE success=0').get().n, 1);
});

test('CSRF header is required for state-changing requests', async () => {
  const res = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie: founder.cookie } });
  assert.equal(res.status, 403);
});

test('founder completes profile', async () => {
  const r = await founder.put('/api/founder/company', {
    legal_name: 'LedgerLoop Pvt Ltd', brand_name: 'LedgerLoop', industry: 'Fintech', business_model: 'SaaS', description: 'Reconciliation software for SMB lenders.',
    stage: 'seed', raise_amount: 3_000_000, use_of_funds: 'Engineering 50%, GTM 40%, G&A 10%', geography: 'India', headquarters: 'Bengaluru', founding_year: 2021,
    currency: 'USD', cash_balance: 600_000, monthly_burn: 50_000, seeking_lead: 1,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.completeness, 100);
  companyId = r.body.company.id;
  const bad = await founder.put('/api/founder/company', { stage: 'series_z' });
  assert.equal(bad.status, 400);
});

test('upload validation rejects disguised or disallowed files', async () => {
  let r = await founder.upload('pitch_deck', 'deck.exe', Buffer.from('MZ...'));
  assert.equal(r.status, 400);
  r = await founder.upload('pitch_deck', 'deck.pdf', Buffer.from('not really a pdf'));
  assert.equal(r.status, 400);
  r = await founder.upload('nonsense', 'a.csv', Buffer.from('a,b'));
  assert.equal(r.status, 400);
});

test('founder uploads financials; extraction + reconciliation produce sourced findings', async () => {
  const pl = xlsx([['USD', 'FY2023', 'FY2024'], ['Revenue', 1_000_000, 1_500_000], ['Cost of sales', 500_000, 600_000], ['Operating expenses', 700_000, 800_000], ['EBITDA', -200_000, 300_000]]);
  let r = await founder.upload('financial_statements', 'pl.xlsx', pl);
  assert.equal(r.status, 201);
  docId = r.body.document.id;
  const deck = xlsx([['Metric', 'FY2024'], ['Revenue', 2_400_000], ['Amount being raised', 5_000_000]], 'Deck figures');
  r = await founder.upload('pitch_deck', 'deck-figures.xlsx', deck);
  assert.equal(r.status, 201);
  const dup = await founder.upload('pitch_deck', 'deck-again.xlsx', deck);
  assert.equal(dup.status, 409, 'exact duplicate upload is rejected');
  await ctx.pipeline.whenIdle();

  const docs = (await founder.get('/api/founder/documents')).body.documents;
  assert.ok(docs.every(d => d.status === 'processed'), JSON.stringify(docs));
  assert.match(docs[0].status_detail, /AI extraction not run/, 'no fake AI success when LLM is unconfigured');

  const a = (await founder.get('/api/founder/analysis')).body;
  const cats = a.findings.map(f => f.category);
  assert.ok(cats.includes('Cross-document discrepancy'), cats.join());
  assert.ok(cats.includes('EBITDA does not reconcile'));
  assert.ok(cats.includes('Fundraising amount inconsistent'));
  const xdoc = a.findings.find(f => f.category === 'Cross-document discrepancy');
  assert.match(xdoc.source_a + xdoc.source_b, /Sheet/);
  assert.ok(a.ai_jobs.every(j => j.status === 'not_configured'));
  // Re-running analysis does not duplicate findings.
  const before = a.findings.length;
  await host.post(`/api/host/deals/${companyId}/reanalyze`);
  assert.equal((await founder.get('/api/founder/analysis')).body.findings.length, before);
});

test('founder isolation: cannot see or download another founder’s documents', async () => {
  const r = await founder2.get(`/api/founder/documents/${docId}/url`);
  assert.equal(r.status, 404);
  const own = await founder.get(`/api/founder/documents/${docId}/url`);
  assert.equal(own.status, 200);
  const steal = await founder2.get(own.body.url);
  assert.equal(steal.status, 403, 'signed URL is bound to the user it was issued to');
  const ok = await founder.get(own.body.url);
  assert.equal(ok.status, 200);
  const expired = own.body.url.replace(/exp=\d+/, 'exp=1');
  assert.equal((await founder.get(expired)).status, 403);
});

test('non-hosts cannot reach host operations', async () => {
  for (const c of [founder, investor]) {
    assert.equal((await c.get('/api/host/dashboard')).status, 403);
    assert.equal((await c.patch(`/api/host/deals/${companyId}`, { stage: 'discovery' })).status, 403);
  }
  assert.equal((await anon.get('/api/host/users')).status, 401);
  assert.equal((await investor.get('/api/founder/company')).status, 403);
});

test('company is not discoverable before teaser approval', async () => {
  await investor.put('/api/investor/mandate', { investor_type: 'vc_fund', firm: 'Ivan Capital', sectors: ['Fintech'], business_models: ['SaaS'], stages: ['seed'], geographies: ['India'], ticket_min: 250_000, ticket_max: 1_000_000, lead_preference: 'lead' });
  const feed = (await investor.get('/api/investor/feed')).body;
  assert.equal(feed.total, 0);
  assert.equal((await investor.post('/api/investor/swipes', { company_id: companyId, action: 'interested' })).status, 404);
});

test('teaser generation, founder edit, submission and host approval', async () => {
  let r = await founder.post('/api/founder/teaser/generate');
  assert.equal(r.status, 201);
  teaserId = r.body.id;
  const t = (await founder.get('/api/founder/teaser')).body.teaser;
  assert.equal(t.content.financials.revenue.value, 1_500_000, 'teaser uses reported historical revenue');
  assert.equal(t.content.market, null, 'missing narrative stays null — not invented');
  r = await founder.put(`/api/founder/teaser/${teaserId}`, { market: 'SMB lending in India' });
  assert.equal(r.status, 200);
  r = await founder.post(`/api/founder/teaser/${teaserId}/submit`);
  assert.equal(r.status, 200);
  r = await host.post(`/api/host/teasers/${teaserId}/review`, { decision: 'reject' });
  assert.equal(r.status, 400, 'rejection requires a note');
  r = await host.post(`/api/host/teasers/${teaserId}/review`, { decision: 'approve' });
  assert.equal(r.status, 200);
  const deal = (await host.get(`/api/host/deals/${companyId}`)).body.deal;
  assert.equal(deal.stage, 'discovery');
});

test('investor discovers an anonymised teaser with explainable score', async () => {
  const feed = (await investor.get('/api/investor/feed')).body;
  assert.equal(feed.total, 1);
  const item = feed.items[0];
  assert.equal(item.name, null, 'identity hidden until host discloses');
  assert.ok(item.code.startsWith('PRJ-'));
  assert.ok(item.sources.every(s => !s.filename));
  assert.ok(item.match.score > 0 && item.match.factors.length === 6);
  assert.equal(item.market.text, 'SMB lending in India');
});

test('right swipe persists, is idempotent, and is immediately visible to the host', async () => {
  let r = await investor.post('/api/investor/swipes', { company_id: companyId, action: 'interested' });
  assert.equal(r.status, 200);
  r = await investor.post('/api/investor/swipes', { company_id: companyId, action: 'interested' });
  assert.equal(r.status, 200);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM swipes').get().n, 1);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM introductions').get().n, 1);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) n FROM notifications WHERE title='New investor interest'").get().n, 1, 'no duplicate notifications');
  const hi = (await host.get('/api/host/interest')).body.swipes;
  assert.equal(hi[0].investor, 'Ivan Investor');
  assert.equal(hi[0].company, 'LedgerLoop');
  assert.equal((await investor.get('/api/investor/feed')).body.total, 0, 'swiped company leaves the feed');
  const dash = (await host.get('/api/host/dashboard')).body;
  assert.equal(dash.interest.total, 1);
  assert.equal(dash.capital.committed, 0, 'interest is never counted as committed capital');
  const fi = (await founder.get('/api/founder/interest')).body;
  assert.equal(fi.interested, 1);
  assert.equal(fi.introductions.length, 0, 'founder sees no investor identity before approval');
});

test('left swipe and undo', async () => {
  // Second company for pass/undo.
  await founder2.put('/api/founder/company', { legal_name: 'Other', industry: 'Fintech', business_model: 'SaaS', stage: 'seed', raise_amount: 2_000_000, geography: 'India', currency: 'USD' });
  const c2 = (await founder2.get('/api/founder/company')).body.company.id;
  const tid = (await host.post(`/api/host/deals/${c2}/teaser/generate`)).body.id;
  await host.post(`/api/host/teasers/${tid}/review`, { decision: 'approve' });
  let r = await investor.post('/api/investor/swipes', { company_id: c2, action: 'passed' });
  assert.equal(r.status, 200);
  assert.equal(ctx.db.prepare("SELECT action FROM swipes WHERE company_id=?").get(c2).action, 'passed');
  assert.equal((await investor.get('/api/investor/feed')).body.total, 0);
  assert.equal((await investor.get('/api/investor/feed?include_passed=1')).body.total, 1, 'passed items only return when explicitly requested');
  r = await investor.del(`/api/investor/swipes/${c2}`);
  assert.equal(r.status, 200);
  assert.equal((await investor.get('/api/investor/feed')).body.total, 1);
});

test('host controls introductions and data-room access', async () => {
  const intro = ctx.db.prepare('SELECT id FROM introductions WHERE company_id=?').get(companyId);
  let r = await investor.get(`/api/investor/documents/${docId}/url`);
  assert.equal(r.status, 403, 'investor cannot access an unapproved data room');
  r = await host.post('/api/host/grants', { document_id: docId, investor_id: ctx.db.prepare("SELECT id FROM users WHERE email='i1@t.test'").get().id });
  assert.equal(r.status, 409, 'cannot share before introduction approval');
  r = await host.patch(`/api/host/introductions/${intro.id}`, { status: 'approved', disclose_founder: 1, disclose_investor: 1 });
  assert.equal(r.status, 200);
  const invId = ctx.db.prepare("SELECT id FROM users WHERE email='i1@t.test'").get().id;
  r = await host.post('/api/host/grants', { document_id: docId, investor_id: invId });
  assert.equal(r.status, 201);
  r = await investor.get(`/api/investor/documents/${docId}/url`);
  assert.equal(r.status, 200);
  assert.equal((await investor.get(r.body.url)).status, 200);
  const intros = (await investor.get('/api/investor/introductions')).body.introductions;
  assert.equal(intros[0].name, 'LedgerLoop');
  const fi = (await founder.get('/api/founder/interest')).body;
  assert.equal(fi.introductions[0].investor_name, 'Ivan Investor');
  r = await host.del(`/api/host/grants?document_id=${docId}&investor_id=${invId}`);
  assert.equal(r.status, 200);
  assert.equal((await investor.get(`/api/investor/documents/${docId}/url`)).status, 403, 'revocation is immediate');
  const log = ctx.db.prepare('SELECT action FROM document_access_log WHERE document_id=?').all(docId).map(x => x.action);
  assert.ok(log.includes('download') && log.some(a => a.startsWith('grant')) && log.some(a => a.startsWith('revoke')));
});

test('pipeline stage changes persist and appear in activity', async () => {
  let r = await host.patch(`/api/host/deals/${companyId}`, { stage: 'due_diligence', next_action: 'Send DD list', due_date: '2026-11-01' });
  assert.equal(r.status, 200);
  r = await host.patch(`/api/host/deals/${companyId}`, { stage: 'closed_funded' });
  assert.equal(r.status, 400, 'funded close requires amount');
  r = await host.patch(`/api/host/deals/${companyId}`, { stage: 'closed_funded', amount_funded: 3_000_000 });
  assert.equal(r.status, 200);
  r = await host.patch(`/api/host/deals/${companyId}`, { stage: 'negotiation' });
  assert.equal(r.status, 409, 'closed deals require explicit reopen');
  const d = (await host.get(`/api/host/deals/${companyId}`)).body;
  assert.equal(d.deal.stage, 'closed_funded');
  assert.ok(d.activity.some(a => /Due diligence/.test(a.summary)));
  const dash = (await host.get('/api/host/dashboard')).body;
  assert.equal(dash.capital.funded, 3_000_000);
  assert.equal(dash.deals.closed_funded, 1);
});

test('suspended users lose access immediately', async () => {
  const id = ctx.db.prepare("SELECT id FROM users WHERE email='f2@t.test'").get().id;
  await host.post(`/api/host/users/${id}/status`, { status: 'suspended' });
  assert.equal((await founder2.get('/api/founder/company')).status, 401);
  assert.equal((await founder2.post('/api/auth/login', { email: 'f2@t.test', password: 'founder-pass-2' })).status, 403);
});

test('failed AI calls are recorded and retryable without corrupting records', async () => {
  const env = { LLM_BASE_URL: 'http://llm.invalid/v1', LLM_MODEL: 'test', LLM_ALLOW_DOCUMENT_TEXT: 'true' };
  const app2 = createApp({ dbFile: ':memory:', uploadDir: path.join(tmp, 'up2'), secret: 'y'.repeat(40), env, inlineJobs: true });
  const u = app2.db.prepare("INSERT INTO users(email,password_hash,role,name) VALUES ('a@b.c','x','founder','A')").run().lastInsertRowid;
  const c = app2.db.prepare("INSERT INTO companies(owner_user_id, code) VALUES (?, 'PRJ-T')").run(u).lastInsertRowid;
  app2.db.prepare("INSERT INTO deals(company_id, stage) VALUES (?, 'documents_received')").run(c);
  fs.writeFileSync(path.join(tmp, 'up2', 'f1'), xlsx([['x', 'FY2024', 'FY2023'], ['Revenue', 10, 8]]));
  const d = app2.db.prepare("INSERT INTO documents(company_id, category, filename, stored_name, size, sha256) VALUES (?, 'financial_model', 'm.xlsx', 'f1', 1, 'abc')").run(c).lastInsertRowid;

  setLlmTransport(async () => { throw new Error('429 quota exceeded'); });
  await app2.pipeline.processDocument(Number(d));
  let doc = app2.db.prepare('SELECT * FROM documents WHERE id=?').get(d);
  assert.equal(doc.status, 'needs_ai');
  assert.match(doc.status_detail, /quota/);
  assert.equal(app2.db.prepare("SELECT COUNT(*) n FROM metrics WHERE extractor='parser'").get().n, 2, 'deterministic figures are kept');
  assert.equal(app2.db.prepare("SELECT COUNT(*) n FROM metrics WHERE extractor='llm'").get().n, 0);

  setLlmTransport(async () => JSON.stringify({ company: { market: 'x' }, metrics: [{ metric: 'arr', period: 'FY2024', value: 12, unit: 'currency', basis: 'historical', source_location: 'Sheet', quote: 'ARR 12' }] }));
  await app2.pipeline.processDocument(Number(d));
  await app2.pipeline.processDocument(Number(d));
  doc = app2.db.prepare('SELECT * FROM documents WHERE id=?').get(d);
  assert.equal(doc.status, 'processed');
  assert.equal(app2.db.prepare("SELECT COUNT(*) n FROM metrics WHERE extractor='llm'").get().n, 1, 'retry is idempotent');
  assert.equal(app2.db.prepare('SELECT COUNT(*) n FROM ai_jobs').get().n, 1);

  setLlmTransport(async () => JSON.stringify({ metrics: [{ metric: 'revenue', value: 'lots' }] }));
  const { completeJson, ExtractionSchema } = await import('../src/services/llm.js');
  await assert.rejects(() => completeJson({ system: '', user: '', schema: ExtractionSchema, env }), /schema validation/);
});
