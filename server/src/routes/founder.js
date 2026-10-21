import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { HttpError, asyncH, requireRole, audit, activity, notifyHosts, signDocUrl, jparse } from '../lib/core.js';
import { tx } from '../db.js';
import { ALLOWED_EXT, MAX_UPLOAD_BYTES, DOC_CATEGORIES, STAGES } from '../lib/constants.js';
import { summarize } from '../services/finance.js';

const num = z.union([z.number(), z.null()]).optional();
export const CompanySchema = z.object({
  legal_name: z.string().max(200).nullable(), brand_name: z.string().max(200).nullable(),
  website: z.string().max(300).nullable(), headquarters: z.string().max(200).nullable(),
  industry: z.string().max(100).nullable(), sub_industry: z.string().max(100).nullable(),
  business_model: z.string().max(100).nullable(), description: z.string().max(4000).nullable(),
  problem: z.string().max(2000).nullable(), solution: z.string().max(2000).nullable(),
  differentiation: z.string().max(2000).nullable(), market: z.string().max(2000).nullable(),
  founding_year: z.number().int().min(1900).max(2100).nullable(), leadership: z.string().max(4000).nullable(),
  product: z.string().max(2000).nullable(), target_market: z.string().max(1000).nullable(),
  geography: z.string().max(300).nullable(), stage: z.enum(STAGES).nullable(),
  currency: z.string().length(3), raise_amount: num, round_size: num,
  use_of_funds: z.string().max(2000).nullable(), previous_rounds: z.string().max(2000).nullable(),
  existing_investors: z.string().max(2000).nullable(), revenue: num, revenue_prior: num,
  gross_margin: z.number().min(-10).max(1).nullable(), cash_balance: num, monthly_burn: num, runway_months: num,
  traction: z.string().max(2000).nullable(), seeking_lead: z.union([z.literal(0), z.literal(1)]).nullable(),
}).partial();

const REQUIRED = ['legal_name', 'industry', 'business_model', 'description', 'stage', 'raise_amount', 'use_of_funds', 'geography', 'headquarters', 'founding_year'];
export const completeness = (c) => Math.round(100 * REQUIRED.filter(k => c[k] !== null && c[k] !== undefined && c[k] !== '').length / REQUIRED.length);

export default function founderRoutes({ db, uploadDir, secret, pipeline }) {
  const r = Router();
  r.use(requireRole('founder'));
  const myCompany = (req) => {
    const c = db.prepare('SELECT * FROM companies WHERE owner_user_id = ?').get(req.user.id);
    if (!c) throw new HttpError(404, 'Company not found');
    return c;
  };

  r.get('/company', (req, res) => {
    const c = myCompany(req);
    res.json({ company: c, completeness: completeness(c), missing: REQUIRED.filter(k => c[k] === null || c[k] === '') });
  });

  r.put('/company', asyncH(async (req, res) => {
    const c = myCompany(req);
    const data = CompanySchema.parse(req.body);
    const keys = Object.keys(data);
    if (!keys.length) return res.json({ company: c });
    const changed = keys.filter(k => String(c[k] ?? '') !== String(data[k] ?? ''));
    db.prepare(`UPDATE companies SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...keys.map(k => data[k] ?? null), c.id);
    const updated = db.prepare('SELECT * FROM companies WHERE id=?').get(c.id);
    if (changed.length) {
      activity(db, c.id, req.user.id, 'profile_updated', `Profile updated: ${changed.join(', ')}`, true);
      audit(db, req, 'company.update', 'company', c.id, { fields: changed });
    }
    const pct = completeness(updated);
    pipeline.advanceStage(c.id, pct < 100 ? 'profile_incomplete' : 'documents_received', req.user.id, pct < 100 ? `Profile ${pct}% complete` : 'Profile complete');
    pipeline.runAnalysis(c.id);
    res.json({ company: updated, completeness: pct });
  }));

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req, _file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) return cb(new HttpError(400, `File type ${ext || '(none)'} is not allowed. Allowed: ${ALLOWED_EXT.join(', ')}`));
      cb(null, true);
    },
  });

  r.get('/documents', (req, res) => {
    const c = myCompany(req);
    res.json({ documents: db.prepare('SELECT id, category, filename, mime, size, version, status, status_detail, created_at, processed_at FROM documents WHERE company_id=? ORDER BY created_at DESC, id DESC').all(c.id) });
  });

  r.post('/documents', upload.single('file'), asyncH(async (req, res) => {
    const c = myCompany(req);
    if (!req.file) throw new HttpError(400, 'No file uploaded');
    const category = String(req.body.category || '');
    if (!DOC_CATEGORIES.includes(category)) { fs.rmSync(req.file.path, { force: true }); throw new HttpError(400, 'Choose a valid document category'); }
    const buf = fs.readFileSync(req.file.path);
    if (!sniffOk(path.extname(req.file.originalname).toLowerCase(), buf)) { fs.rmSync(req.file.path, { force: true }); throw new HttpError(400, 'File contents do not match its extension'); }
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const dup = db.prepare('SELECT id FROM documents WHERE company_id=? AND sha256=?').get(c.id, sha);
    if (dup) { fs.rmSync(req.file.path, { force: true }); throw new HttpError(409, 'This exact file has already been uploaded'); }
    const filename = path.basename(req.file.originalname).slice(0, 200);
    const id = tx(db, () => {
      const v = (db.prepare('SELECT MAX(version) v FROM documents WHERE company_id=? AND category=? AND filename=?').get(c.id, category, filename).v || 0) + 1;
      const id = Number(db.prepare('INSERT INTO documents(company_id, uploaded_by, category, filename, stored_name, mime, size, sha256, version) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(c.id, req.user.id, category, filename, req.file.filename, req.file.mimetype, req.file.size, sha, v).lastInsertRowid);
      activity(db, c.id, req.user.id, 'document_uploaded', `Uploaded ${filename} (${category.replace(/_/g, ' ')}, v${v})`, true);
      return id;
    });
    audit(db, req, 'document.upload', 'document', id, { category, size: req.file.size });
    notifyHosts(db, 'New document uploaded', `${c.brand_name || c.code}: ${filename}`, `/host/deals/${c.id}`, `doc:${id}`);
    pipeline.advanceStage(c.id, 'documents_received', req.user.id, 'Document uploaded');
    pipeline.processDocument(id);
    res.status(201).json({ document: db.prepare('SELECT id, category, filename, size, version, status, created_at FROM documents WHERE id=?').get(id) });
  }));

  r.post('/documents/:id/retry', asyncH(async (req, res) => {
    const c = myCompany(req);
    const d = db.prepare('SELECT id FROM documents WHERE id=? AND company_id=?').get(Number(req.params.id), c.id);
    if (!d) throw new HttpError(404, 'Document not found');
    db.prepare("UPDATE documents SET status='queued' WHERE id=?").run(d.id);
    pipeline.processDocument(d.id);
    res.json({ ok: true });
  }));

  r.get('/documents/:id/url', (req, res) => {
    const c = myCompany(req);
    const d = db.prepare('SELECT id FROM documents WHERE id=? AND company_id=?').get(Number(req.params.id), c.id);
    if (!d) throw new HttpError(404, 'Document not found');
    res.json({ url: signDocUrl(d.id, req.user.id, secret) });
  });

  r.get('/analysis', (req, res) => {
    const c = myCompany(req);
    const metrics = pipeline.loadMetrics(c.id);
    res.json({
      summary: summarize(metrics, c),
      metrics,
      findings: db.prepare("SELECT id, severity, category, metric, value_a, source_a, value_b, source_b, period, units, method, explanation, question, confidence, status, founder_response, updated_at FROM findings WHERE company_id=? AND status != 'dismissed' ORDER BY status='resolved', CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END").all(c.id),
      ai_jobs: db.prepare('SELECT j.id, j.kind, j.status, j.error, j.attempts, j.updated_at, d.filename FROM ai_jobs j LEFT JOIN documents d ON d.id=j.document_id WHERE j.company_id=? ORDER BY j.id DESC').all(c.id),
    });
  });

  r.post('/findings/:id/respond', asyncH(async (req, res) => {
    const c = myCompany(req);
    const { response } = z.object({ response: z.string().trim().min(3).max(4000) }).parse(req.body);
    const f = db.prepare('SELECT * FROM findings WHERE id=? AND company_id=?').get(Number(req.params.id), c.id);
    if (!f) throw new HttpError(404, 'Finding not found');
    tx(db, () => {
      db.prepare("UPDATE findings SET founder_response=?, status=CASE WHEN status='open' THEN 'under_review' ELSE status END, updated_at=datetime('now') WHERE id=?").run(response, f.id);
      db.prepare('INSERT INTO finding_history(finding_id, actor_id, from_status, to_status, note) VALUES (?,?,?,?,?)').run(f.id, req.user.id, f.status, f.status === 'open' ? 'under_review' : f.status, `Founder response: ${response}`);
      activity(db, c.id, req.user.id, 'finding_response', `Founder responded to finding #${f.id} (${f.category})`, true);
    });
    notifyHosts(db, 'Founder clarification received', `${c.brand_name || c.code}: ${f.category}`, `/host/deals/${c.id}`);
    res.json({ ok: true });
  }));

  // Founder corrections are recorded as founder_input with provenance; they never overwrite parsed figures.
  r.post('/corrections', asyncH(async (req, res) => {
    const c = myCompany(req);
    const body = z.object({ metric: z.string().min(2).max(40), period: z.string().max(40).default(''), value: z.number(), unit: z.enum(['currency', 'pct', 'months', 'count']).default('currency'), note: z.string().max(1000).optional() }).parse(req.body);
    db.prepare('INSERT INTO metrics(company_id, metric, period, value, unit, currency, basis, source_location, extractor) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(c.id, body.metric, body.period, body.value, body.unit, body.unit === 'currency' ? c.currency : null, 'founder_input', `Founder correction${body.note ? `: ${body.note}` : ''}`, 'founder_correction');
    activity(db, c.id, req.user.id, 'correction', `Founder corrected ${body.metric} ${body.period}`.trim(), true);
    audit(db, req, 'metric.correction', 'company', c.id, { metric: body.metric, period: body.period });
    pipeline.runAnalysis(c.id);
    res.status(201).json({ ok: true });
  }));

  r.get('/teaser', (req, res) => {
    const c = myCompany(req);
    const t = db.prepare("SELECT * FROM teasers WHERE company_id=? AND status != 'superseded' ORDER BY version DESC LIMIT 1").get(c.id);
    res.json({ teaser: t ? { ...t, content: jparse(t.content, {}) } : null });
  });

  r.post('/teaser/generate', (req, res) => {
    const c = myCompany(req);
    const id = pipeline.generateTeaser(c.id, req.user.id);
    res.status(201).json({ id });
  });

  const NarrativeSchema = z.object(Object.fromEntries(['overview', 'problem', 'solution', 'market', 'differentiation', 'traction'].map(k => [k, z.string().max(1500).nullable().optional()])));
  r.put('/teaser/:id', asyncH(async (req, res) => {
    const c = myCompany(req);
    const t = db.prepare('SELECT * FROM teasers WHERE id=? AND company_id=?').get(Number(req.params.id), c.id);
    if (!t) throw new HttpError(404, 'Teaser not found');
    if (!['draft', 'rejected'].includes(t.status)) throw new HttpError(409, 'Only draft or rejected teasers can be edited');
    const edits = NarrativeSchema.parse(req.body);
    const content = jparse(t.content, {});
    for (const [k, v] of Object.entries(edits)) content[k] = v ? { text: v, origin: 'founder' } : null;
    db.prepare("UPDATE teasers SET content=?, status='draft' WHERE id=?").run(JSON.stringify(content), t.id);
    activity(db, c.id, req.user.id, 'teaser_edited', `Teaser v${t.version} edited by founder`, true);
    res.json({ ok: true });
  }));

  r.post('/teaser/:id/submit', (req, res) => {
    const c = myCompany(req);
    const t = db.prepare('SELECT * FROM teasers WHERE id=? AND company_id=?').get(Number(req.params.id), c.id);
    if (!t) throw new HttpError(404, 'Teaser not found');
    if (!['draft', 'rejected'].includes(t.status)) throw new HttpError(409, 'Teaser is not in a submittable state');
    db.prepare("UPDATE teasers SET status='pending_approval' WHERE id=?").run(t.id);
    activity(db, c.id, req.user.id, 'teaser_submitted', `Teaser v${t.version} submitted for approval`, true);
    pipeline.advanceStage(c.id, 'teaser_pending', req.user.id, 'Teaser submitted');
    notifyHosts(db, 'Teaser awaiting approval', c.brand_name || c.code, `/host/deals/${c.id}`, `teaser:${t.id}`);
    res.json({ ok: true });
  });

  r.get('/interest', (req, res) => {
    const c = myCompany(req);
    const counts = db.prepare("SELECT action, COUNT(*) n FROM swipes WHERE company_id=? GROUP BY action").all(c.id);
    const intros = db.prepare(`SELECT i.id, i.status, i.created_at, i.updated_at, i.disclose_investor,
        CASE WHEN i.disclose_investor=1 THEN u.name END AS investor_name,
        CASE WHEN i.disclose_investor=1 THEN p.firm END AS investor_firm,
        CASE WHEN i.disclose_investor=1 THEN p.investor_type END AS investor_type,
        CASE WHEN i.disclose_investor=1 THEN u.email END AS investor_email
      FROM introductions i JOIN users u ON u.id=i.investor_id LEFT JOIN investor_profiles p ON p.user_id=i.investor_id
      WHERE i.company_id=? AND i.status IN ('approved','completed') ORDER BY i.updated_at DESC`).all(c.id);
    res.json({ interested: counts.find(x => x.action === 'interested')?.n || 0, saved: counts.find(x => x.action === 'saved')?.n || 0, introductions: intros });
  });

  r.get('/requests', (req, res) => {
    const c = myCompany(req);
    res.json({ requests: db.prepare('SELECT id, message, status, response, created_at, answered_at FROM info_requests WHERE company_id=? ORDER BY created_at DESC').all(c.id) });
  });

  r.post('/requests/:id/answer', asyncH(async (req, res) => {
    const c = myCompany(req);
    const { response } = z.object({ response: z.string().trim().min(1).max(4000) }).parse(req.body);
    const q = db.prepare('SELECT * FROM info_requests WHERE id=? AND company_id=?').get(Number(req.params.id), c.id);
    if (!q) throw new HttpError(404, 'Request not found');
    db.prepare("UPDATE info_requests SET response=?, status='answered', answered_at=datetime('now') WHERE id=?").run(response, q.id);
    activity(db, c.id, req.user.id, 'request_answered', 'Founder answered an information request', true);
    notifyHosts(db, 'Information request answered', c.brand_name || c.code, `/host/deals/${c.id}`);
    res.json({ ok: true });
  }));

  r.get('/activity', (req, res) => {
    const c = myCompany(req);
    res.json({ activity: db.prepare('SELECT id, type, summary, created_at FROM activities WHERE company_id=? AND visible_to_founder=1 ORDER BY id DESC LIMIT 100').all(c.id) });
  });

  r.get('/dashboard', (req, res) => {
    const c = myCompany(req);
    const deal = db.prepare('SELECT stage FROM deals WHERE company_id=?').get(c.id);
    const docs = db.prepare('SELECT status, COUNT(*) n FROM documents WHERE company_id=? GROUP BY status').all(c.id);
    const openFindings = db.prepare("SELECT COUNT(*) n FROM findings WHERE company_id=? AND status='open'").get(c.id).n;
    const openRequests = db.prepare("SELECT COUNT(*) n FROM info_requests WHERE company_id=? AND status='open'").get(c.id).n;
    const teaser = db.prepare("SELECT id, version, status FROM teasers WHERE company_id=? AND status!='superseded' ORDER BY version DESC LIMIT 1").get(c.id);
    const interest = db.prepare("SELECT COUNT(*) n FROM swipes WHERE company_id=? AND action='interested'").get(c.id).n;
    const intros = db.prepare("SELECT COUNT(*) n FROM introductions WHERE company_id=? AND status IN ('approved','completed')").get(c.id).n;
    const pct = completeness(c);
    const docCount = docs.reduce((s, d) => s + d.n, 0);
    const next = [];
    if (pct < 100) next.push({ label: `Complete your company profile (${pct}%)`, to: '/founder/company' });
    if (!docCount) next.push({ label: 'Upload your pitch deck and financial statements', to: '/founder/documents' });
    if (docs.some(d => ['failed', 'needs_ai'].includes(d.status) && d.n)) next.push({ label: 'Some documents need attention', to: '/founder/documents' });
    if (openFindings) next.push({ label: `Respond to ${openFindings} open finding(s)`, to: '/founder/analysis' });
    if (openRequests) next.push({ label: `Answer ${openRequests} information request(s)`, to: '/founder/requests' });
    if (!teaser && docCount) next.push({ label: 'Generate your investment teaser', to: '/founder/teaser' });
    if (teaser && ['draft', 'rejected'].includes(teaser.status)) next.push({ label: teaser.status === 'rejected' ? 'Revise and resubmit your teaser' : 'Review and submit your teaser', to: '/founder/teaser' });
    res.json({ company: c, stage: deal?.stage, completeness: pct, documents: docs, documentCount: docCount, openFindings, openRequests, teaser, interest, introductions: intros, next });
  });

  return r;
}

// Magic-byte check so a renamed executable cannot pass as a document.
function sniffOk(ext, buf) {
  const head = buf.subarray(0, 8);
  const zip = head[0] === 0x50 && head[1] === 0x4b;
  if (ext === '.pdf') return head.toString('latin1', 0, 5) === '%PDF-';
  if (['.docx', '.xlsx', '.pptx'].includes(ext)) return zip;
  if (ext === '.xls') return head[0] === 0xd0 && head[1] === 0xcf;
  if (ext === '.png') return head[0] === 0x89 && head.toString('latin1', 1, 4) === 'PNG';
  if (['.jpg', '.jpeg'].includes(ext)) return head[0] === 0xff && head[1] === 0xd8;
  if (ext === '.csv') return !buf.subarray(0, 4096).includes(0);
  return false;
}
