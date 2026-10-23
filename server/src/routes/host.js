import { Router } from 'express';
import { z } from 'zod';
import { HttpError, asyncH, requireRole, audit, activity, notify, signDocUrl, jparse } from '../lib/core.js';
import { tx, getSetting } from '../db.js';
import { scoreMatch } from '../services/matching.js';
import { summarize } from '../services/finance.js';
import { completeness } from './founder.js';
import { mandateCompleteness } from './investor.js';
import { DEFAULT_WEIGHTS } from '../lib/constants.js';

const csv = (rows, cols) => [cols.join(','), ...rows.map(r => cols.map(c => {
  const v = r[c] ?? '';
  const s = String(v);
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
}).join(','))].join('\n');

export default function hostRoutes({ db, secret, pipeline }) {
  const r = Router();
  r.use(requireRole('host'));
  const stages = () => getSetting(db, 'pipeline_stages');
  const company = (id) => {
    const c = db.prepare('SELECT * FROM companies WHERE id=?').get(Number(id));
    if (!c) throw new HttpError(404, 'Company not found');
    return c;
  };

  r.get('/dashboard', (_req, res) => {
    const one = (sql, ...a) => db.prepare(sql).get(...a);
    const all = (sql, ...a) => db.prepare(sql).all(...a);
    const funnelKeys = ['registered', 'documents_received', 'screening', 'discovery', 'interest_received', 'intro_completed', 'due_diligence', 'closed_funded'];
    const order = stages().map(s => s.key);
    const dealStages = all('SELECT stage FROM deals').map(d => d.stage);
    // Conversion = deals currently at or beyond each milestone (excluding lost/on-hold, which are counted separately).
    const reached = (key) => dealStages.filter(s => !['closed_lost', 'on_hold'].includes(s) && order.indexOf(s) >= order.indexOf(key)).length;
    res.json({
      definitions: {
        stated_raise: 'Sum of "amount being raised" entered by founders on active (not closed/lost) deals. Not committed capital.',
        committed: 'Sum of amount committed recorded by the host on deal records.',
        funded: 'Sum of amount funded on deals closed as funded.',
        interest: 'Distinct investor–company pairs where the investor swiped right. Expressions of interest are not commitments.',
        active_users: 'Users with any authenticated activity in the last 30 days.',
      },
      users: {
        founders: one("SELECT COUNT(*) n FROM users WHERE role='founder'").n,
        investors: one("SELECT COUNT(*) n FROM users WHERE role='investor'").n,
        active30: one("SELECT COUNT(*) n FROM users WHERE role!='host' AND last_active_at >= datetime('now','-30 days')").n,
        inactive: one("SELECT COUNT(*) n FROM users WHERE role!='host' AND (last_active_at IS NULL OR last_active_at < datetime('now','-30 days'))").n,
        suspended: one("SELECT COUNT(*) n FROM users WHERE status!='active'").n,
      },
      registrations: all("SELECT strftime('%Y-%m-%d', created_at) day, role, COUNT(*) n FROM users WHERE role!='host' AND created_at >= datetime('now','-30 days') GROUP BY day, role ORDER BY day"),
      byRoundStage: all("SELECT COALESCE(stage,'unspecified') k, COUNT(*) n FROM companies GROUP BY k ORDER BY n DESC"),
      passReasons: all("SELECT reason k, COUNT(*) n FROM swipes WHERE action='passed' AND reason IS NOT NULL GROUP BY reason ORDER BY n DESC"),
      byIndustry: all("SELECT COALESCE(industry,'Unspecified') k, COUNT(*) n FROM companies GROUP BY k ORDER BY n DESC"),
      byPipeline: all('SELECT stage k, COUNT(*) n FROM deals GROUP BY stage'),
      capital: {
        stated_raise: one("SELECT COALESCE(SUM(c.raise_amount),0) v FROM companies c JOIN deals d ON d.company_id=c.id WHERE d.stage NOT IN ('closed_lost','closed_funded')").v,
        committed: one('SELECT COALESCE(SUM(amount_committed),0) v FROM deals').v,
        funded: one("SELECT COALESCE(SUM(amount_funded),0) v FROM deals WHERE stage='closed_funded'").v,
      },
      queue: {
        teasers_pending: one("SELECT COUNT(*) n FROM teasers WHERE status='pending_approval'").n,
        analyses_review: one("SELECT COUNT(DISTINCT company_id) n FROM findings WHERE status='under_review'").n,
        failed_docs: one("SELECT COUNT(*) n FROM documents WHERE status IN ('failed','needs_ai')").n,
        intros_pending: one("SELECT COUNT(*) n FROM introductions WHERE status='pending'").n,
        overdue: one("SELECT COUNT(*) n FROM deals WHERE due_date IS NOT NULL AND due_date < date('now') AND stage NOT IN ('closed_funded','closed_lost')").n,
        open_requests: one("SELECT COUNT(*) n FROM info_requests WHERE status='open'").n,
      },
      findings: all("SELECT severity k, COUNT(*) n FROM findings WHERE status IN ('open','under_review') GROUP BY severity"),
      interest: {
        total: one("SELECT COUNT(*) n FROM swipes WHERE action='interested'").n,
        passes: one("SELECT COUNT(*) n FROM swipes WHERE action='passed'").n,
        saves: one("SELECT COUNT(*) n FROM swipes WHERE action='saved'").n,
        top: all("SELECT c.id, COALESCE(c.brand_name, c.legal_name, c.code) name, COUNT(*) n FROM swipes s JOIN companies c ON c.id=s.company_id WHERE s.action='interested' GROUP BY c.id ORDER BY n DESC LIMIT 5"),
      },
      intros: {
        pending: one("SELECT COUNT(*) n FROM introductions WHERE status='pending'").n,
        approved: one("SELECT COUNT(*) n FROM introductions WHERE status='approved'").n,
        completed: one("SELECT COUNT(*) n FROM introductions WHERE status='completed'").n,
      },
      deals: {
        diligence: one("SELECT COUNT(*) n FROM deals WHERE stage='due_diligence'").n,
        closed_funded: one("SELECT COUNT(*) n FROM deals WHERE stage='closed_funded'").n,
        closed_lost: one("SELECT COUNT(*) n FROM deals WHERE stage='closed_lost'").n,
      },
      funnel: funnelKeys.map(k => ({ key: k, label: stages().find(s => s.key === k)?.label, n: reached(k) })),
      recent: all("SELECT a.id, a.summary, a.created_at, a.company_id, COALESCE(c.brand_name,c.code) company FROM activities a LEFT JOIN companies c ON c.id=a.company_id WHERE a.type NOT IN ('interest_anon') ORDER BY a.id DESC LIMIT 12"),
    });
  });

  // ---- Users ----
  r.get('/users', (req, res) => {
    const { role, q, status } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1), size = 25;
    const where = ['1=1'], args = [];
    if (role) { where.push('u.role=?'); args.push(role); }
    if (status) { where.push('u.status=?'); args.push(status); }
    if (q) { where.push('(u.name LIKE ? OR u.email LIKE ? OR c.brand_name LIKE ? OR p.firm LIKE ?)'); args.push(...Array(4).fill(`%${q}%`)); }
    const base = `FROM users u LEFT JOIN companies c ON c.owner_user_id=u.id LEFT JOIN investor_profiles p ON p.user_id=u.id WHERE ${where.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) n ${base}`).get(...args).n;
    const rows = db.prepare(`SELECT u.id, u.email, u.name, u.role, u.status, u.email_verified, u.created_at, u.last_login_at, u.last_active_at, c.id company_id, COALESCE(c.brand_name, c.legal_name, c.code) company, p.firm ${base} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).all(...args, size, (page - 1) * size);
    res.json({ users: rows, total, page, pages: Math.ceil(total / size) });
  });

  r.get('/users/:id', (req, res) => {
    const u = db.prepare('SELECT id, email, name, role, status, email_verified, created_at, last_login_at, last_active_at FROM users WHERE id=?').get(Number(req.params.id));
    if (!u) throw new HttpError(404, 'User not found');
    const logins = db.prepare('SELECT success, ip, user_agent, created_at FROM login_events WHERE user_id=? ORDER BY id DESC LIMIT 50').all(u.id);
    let extra = {};
    if (u.role === 'investor') {
      const p = db.prepare('SELECT * FROM investor_profiles WHERE user_id=?').get(u.id);
      extra = {
        mandate: { ...p, sectors: jparse(p.sectors), business_models: jparse(p.business_models), stages: jparse(p.stages), excluded_stages: jparse(p.excluded_stages), geographies: jparse(p.geographies) },
        mandate_completeness: mandateCompleteness(p),
        swipes: db.prepare('SELECT s.action, s.score, s.updated_at, c.id company_id, COALESCE(c.brand_name, c.legal_name, c.code) company FROM swipes s JOIN companies c ON c.id=s.company_id WHERE s.investor_id=? ORDER BY s.updated_at DESC').all(u.id),
      };
    } else if (u.role === 'founder') {
      extra = { company: db.prepare('SELECT id, code, brand_name, legal_name FROM companies WHERE owner_user_id=?').get(u.id) };
    }
    res.json({ user: u, logins, ...extra });
  });

  r.post('/users/:id/status', asyncH(async (req, res) => {
    const { status } = z.object({ status: z.enum(['active', 'suspended', 'deactivated']) }).parse(req.body);
    const u = db.prepare('SELECT id, role FROM users WHERE id=?').get(Number(req.params.id));
    if (!u) throw new HttpError(404, 'User not found');
    if (u.id === req.user.id) throw new HttpError(400, 'You cannot change your own status');
    tx(db, () => {
      db.prepare('UPDATE users SET status=? WHERE id=?').run(status, u.id);
      if (status !== 'active' && u.role === 'investor') db.prepare("UPDATE document_grants SET revoked_at=datetime('now') WHERE investor_id=? AND revoked_at IS NULL").run(u.id);
    });
    audit(db, req, 'user.status', 'user', u.id, { status });
    res.json({ ok: true });
  }));

  r.get('/investors', (_req, res) => {
    res.json({ investors: db.prepare("SELECT u.id, u.name, u.email, u.status, p.firm, p.investor_type FROM users u JOIN investor_profiles p ON p.user_id=u.id WHERE u.role='investor' ORDER BY u.name").all() });
  });

  r.get('/hosts', (_req, res) => res.json({ hosts: db.prepare("SELECT id, name FROM users WHERE role='host' AND status='active'").all() }));

  // ---- Deals ----
  const DEAL_SORT = { updated: 'd.updated_at DESC', raise: 'c.raise_amount DESC', name: 'name ASC', interest: 'interest DESC', due: 'd.due_date IS NULL, d.due_date ASC' };
  r.get('/deals', (req, res) => {
    const { q, stage, owner, industry } = req.query;
    const sort = DEAL_SORT[req.query.sort] || DEAL_SORT.updated;
    const page = Math.max(1, Number(req.query.page) || 1), size = Math.min(500, Number(req.query.size) || 25);
    const where = ['1=1'], args = [];
    if (q) { where.push('(c.brand_name LIKE ? OR c.legal_name LIKE ? OR c.code LIKE ? OR u.email LIKE ?)'); args.push(...Array(4).fill(`%${q}%`)); }
    if (stage) { where.push('d.stage=?'); args.push(stage); }
    if (owner) { where.push('d.owner_user_id=?'); args.push(Number(owner)); }
    if (industry) { where.push('c.industry=?'); args.push(industry); }
    const base = `FROM deals d JOIN companies c ON c.id=d.company_id JOIN users u ON u.id=c.owner_user_id LEFT JOIN users o ON o.id=d.owner_user_id WHERE ${where.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) n ${base}`).get(...args).n;
    const rows = db.prepare(`SELECT c.id, c.code, COALESCE(c.brand_name, c.legal_name) name, c.industry, c.stage round_stage, c.raise_amount, c.currency,
        d.stage, d.next_action, d.due_date, d.updated_at, o.name owner, u.name founder, u.email founder_email,
        (SELECT COUNT(*) FROM swipes s WHERE s.company_id=c.id AND s.action='interested') interest,
        (SELECT COUNT(*) FROM findings f WHERE f.company_id=c.id AND f.status='open') open_findings,
        (SELECT COUNT(*) FROM documents x WHERE x.company_id=c.id) docs,
        (SELECT status FROM teasers t WHERE t.company_id=c.id AND t.status!='superseded' ORDER BY version DESC LIMIT 1) teaser_status
      ${base} ORDER BY ${sort} LIMIT ? OFFSET ?`).all(...args, size, (page - 1) * size);
    res.json({ deals: rows, total, page, pages: Math.ceil(total / size), stages: stages() });
  });

  r.get('/deals/:id', (req, res) => {
    const c = company(req.params.id);
    const metrics = pipeline.loadMetrics(c.id);
    const teasers = db.prepare('SELECT * FROM teasers WHERE company_id=? ORDER BY version DESC').all(c.id).map(t => ({ ...t, content: jparse(t.content, {}) }));
    res.json({
      company: c,
      completeness: completeness(c),
      founder: db.prepare('SELECT id, name, email, status, last_login_at, created_at FROM users WHERE id=?').get(c.owner_user_id),
      deal: db.prepare('SELECT d.*, o.name owner FROM deals d LEFT JOIN users o ON o.id=d.owner_user_id WHERE company_id=?').get(c.id),
      documents: db.prepare('SELECT id, category, filename, size, version, status, status_detail, created_at, processed_at FROM documents WHERE company_id=? ORDER BY created_at DESC').all(c.id),
      metrics, summary: summarize(metrics, c),
      findings: db.prepare('SELECT * FROM findings WHERE company_id=? ORDER BY status IN (\'resolved\',\'dismissed\'), CASE severity WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END').all(c.id),
      teasers,
      ai_jobs: db.prepare('SELECT j.*, d.filename FROM ai_jobs j LEFT JOIN documents d ON d.id=j.document_id WHERE j.company_id=? ORDER BY j.id DESC').all(c.id).map(j => ({ ...j, result: undefined })),
      interest: db.prepare(`SELECT s.action, s.score, s.updated_at, u.id investor_id, u.name, p.firm, p.investor_type, i.id intro_id, i.status intro_status
        FROM swipes s JOIN users u ON u.id=s.investor_id LEFT JOIN investor_profiles p ON p.user_id=u.id LEFT JOIN introductions i ON i.investor_id=s.investor_id AND i.company_id=s.company_id
        WHERE s.company_id=? ORDER BY s.updated_at DESC`).all(c.id),
      introductions: db.prepare('SELECT i.*, u.name investor, p.firm FROM introductions i JOIN users u ON u.id=i.investor_id LEFT JOIN investor_profiles p ON p.user_id=u.id WHERE i.company_id=? ORDER BY i.updated_at DESC').all(c.id),
      grants: db.prepare('SELECT g.*, d.filename, u.name investor FROM document_grants g JOIN documents d ON d.id=g.document_id JOIN users u ON u.id=g.investor_id WHERE d.company_id=? ORDER BY g.created_at DESC').all(c.id),
      notes: db.prepare('SELECT n.*, u.name author FROM deal_notes n LEFT JOIN users u ON u.id=n.author_id WHERE company_id=? ORDER BY n.id DESC').all(c.id),
      requests: db.prepare('SELECT * FROM info_requests WHERE company_id=? ORDER BY id DESC').all(c.id),
      activity: db.prepare('SELECT a.*, u.name actor FROM activities a LEFT JOIN users u ON u.id=a.actor_id WHERE company_id=? AND a.type != \'interest_anon\' ORDER BY a.id DESC LIMIT 200').all(c.id),
      access_log: db.prepare('SELECT l.*, d.filename, u.name user FROM document_access_log l JOIN documents d ON d.id=l.document_id LEFT JOIN users u ON u.id=l.user_id WHERE d.company_id=? ORDER BY l.id DESC LIMIT 100').all(c.id),
      stages: stages(),
    });
  });

  const DealPatch = z.object({
    stage: z.string(), reopen: z.boolean(), reason: z.string().max(500),
    owner_user_id: z.number().int().nullable(), next_action: z.string().max(500).nullable(), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    outcome: z.string().max(1000).nullable(), amount_committed: z.number().nonnegative().nullable(), amount_funded: z.number().nonnegative().nullable(),
    disclose_identity: z.union([z.literal(0), z.literal(1)]),
  }).partial();
  r.patch('/deals/:id', asyncH(async (req, res) => {
    const c = company(req.params.id);
    const body = DealPatch.parse(req.body);
    const deal = db.prepare('SELECT * FROM deals WHERE company_id=?').get(c.id);
    if (body.stage && body.stage !== deal.stage) {
      const all = stages();
      if (!all.some(s => s.key === body.stage)) throw new HttpError(400, 'Unknown stage');
      if (all.find(s => s.key === deal.stage)?.terminal && !body.reopen) throw new HttpError(409, 'This deal is closed. Confirm reopening to change its stage.');
      if (['discovery'].includes(body.stage) && !db.prepare("SELECT 1 FROM teasers WHERE company_id=? AND status='approved'").get(c.id)) throw new HttpError(409, 'Approve a teaser before releasing the company to investor discovery.');
      if (body.stage === 'closed_funded' && body.amount_funded == null && deal.amount_funded == null) throw new HttpError(400, 'Record the amount funded when closing as funded.');
      pipeline.setStage(c.id, body.stage, req.user.id, body.reason);
      audit(db, req, 'deal.stage', 'company', c.id, { from: deal.stage, to: body.stage });
    }
    const fields = ['owner_user_id', 'next_action', 'due_date', 'outcome', 'amount_committed', 'amount_funded'].filter(k => k in body);
    if (fields.length) {
      db.prepare(`UPDATE deals SET ${fields.map(k => `${k}=?`).join(', ')}, updated_at=datetime('now') WHERE company_id=?`).run(...fields.map(k => body[k]), c.id);
      activity(db, c.id, req.user.id, 'deal_updated', `Deal updated: ${fields.join(', ')}`);
      audit(db, req, 'deal.update', 'company', c.id, { fields });
    }
    if ('disclose_identity' in body) {
      db.prepare('UPDATE companies SET disclose_identity=? WHERE id=?').run(body.disclose_identity, c.id);
      activity(db, c.id, req.user.id, 'disclosure', `Company identity ${body.disclose_identity ? 'disclosed to all eligible investors' : 'anonymised'}`, true);
      audit(db, req, 'disclosure.company', 'company', c.id, { disclose_identity: body.disclose_identity });
    }
    res.json({ ok: true });
  }));

  r.post('/deals/:id/notes', asyncH(async (req, res) => {
    const c = company(req.params.id);
    const { body, follow_up_date } = z.object({ body: z.string().trim().min(1).max(4000), follow_up_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }).parse(req.body);
    db.prepare('INSERT INTO deal_notes(company_id, author_id, body, follow_up_date) VALUES (?,?,?,?)').run(c.id, req.user.id, body, follow_up_date ?? null);
    if (follow_up_date) db.prepare("UPDATE deals SET due_date=?, next_action=COALESCE(next_action, 'Follow up'), updated_at=datetime('now') WHERE company_id=?").run(follow_up_date, c.id);
    activity(db, c.id, req.user.id, 'note', 'Internal note added');
    res.status(201).json({ ok: true });
  }));

  r.post('/deals/:id/requests', asyncH(async (req, res) => {
    const c = company(req.params.id);
    const { message } = z.object({ message: z.string().trim().min(3).max(4000) }).parse(req.body);
    db.prepare('INSERT INTO info_requests(company_id, requested_by, message) VALUES (?,?,?)').run(c.id, req.user.id, message);
    activity(db, c.id, req.user.id, 'info_request', 'Additional information requested', true);
    notify(db, c.owner_user_id, 'Information requested', message.slice(0, 160), '/founder/requests');
    pipeline.advanceStage(c.id, 'awaiting_clarification', req.user.id, 'Information requested');
    res.status(201).json({ ok: true });
  }));

  r.post('/deals/:id/reanalyze', (req, res) => {
    const c = company(req.params.id);
    const found = pipeline.runAnalysis(c.id);
    activity(db, c.id, req.user.id, 'reanalysis', `Analysis re-run: ${found.length} finding(s)`);
    res.json({ findings: found.length });
  });

  r.post('/documents/:id/reprocess', (req, res) => {
    const d = db.prepare('SELECT id FROM documents WHERE id=?').get(Number(req.params.id));
    if (!d) throw new HttpError(404, 'Document not found');
    pipeline.processDocument(d.id);
    res.json({ ok: true });
  });

  r.get('/deals/:id/matches', (req, res) => {
    const c = company(req.params.id);
    const t = db.prepare("SELECT content FROM teasers WHERE company_id=? AND status='approved' ORDER BY version DESC LIMIT 1").get(c.id);
    const fin = t ? jparse(t.content, {}).financials || {} : summarize(pipeline.loadMetrics(c.id), c);
    const weights = getSetting(db, 'match_weights');
    const rows = db.prepare("SELECT u.id, u.name, p.* FROM users u JOIN investor_profiles p ON p.user_id=u.id WHERE u.role='investor' AND u.status='active'").all();
    const out = rows.map(p => ({ investor_id: p.id, name: p.name, firm: p.firm, match: scoreMatch(p, { ...c, metrics_revenue: fin.revenue?.value }, weights) }))
      .sort((a, b) => b.match.score - a.match.score);
    res.json({ matches: out });
  });

  r.get('/documents/:id/url', (req, res) => {
    const d = db.prepare('SELECT id FROM documents WHERE id=?').get(Number(req.params.id));
    if (!d) throw new HttpError(404, 'Document not found');
    res.json({ url: signDocUrl(d.id, req.user.id, secret) });
  });

  // ---- Findings ----
  r.patch('/findings/:id', asyncH(async (req, res) => {
    const { status, reviewer_notes } = z.object({ status: z.enum(['open', 'under_review', 'explained', 'resolved', 'dismissed']).optional(), reviewer_notes: z.string().max(4000).optional() }).parse(req.body);
    const f = db.prepare('SELECT * FROM findings WHERE id=?').get(Number(req.params.id));
    if (!f) throw new HttpError(404, 'Finding not found');
    if (status === 'dismissed' && !(reviewer_notes || f.reviewer_notes)) throw new HttpError(400, 'Add a reviewer note explaining why the finding is dismissed.');
    tx(db, () => {
      db.prepare("UPDATE findings SET status=COALESCE(?, status), reviewer_notes=COALESCE(?, reviewer_notes), updated_at=datetime('now') WHERE id=?").run(status ?? null, reviewer_notes ?? null, f.id);
      db.prepare('INSERT INTO finding_history(finding_id, actor_id, from_status, to_status, note) VALUES (?,?,?,?,?)').run(f.id, req.user.id, f.status, status ?? f.status, reviewer_notes ?? null);
      activity(db, f.company_id, req.user.id, 'finding_review', `Finding #${f.id} (${f.category}) → ${status ?? f.status}`, true);
    });
    res.json({ ok: true });
  }));

  r.get('/findings/:id/history', (req, res) => {
    res.json({ history: db.prepare('SELECT h.*, u.name actor FROM finding_history h LEFT JOIN users u ON u.id=h.actor_id WHERE finding_id=? ORDER BY h.id').all(Number(req.params.id)) });
  });

  // ---- Teasers ----
  r.get('/teasers', (req, res) => {
    const status = req.query.status || 'pending_approval';
    res.json({ teasers: db.prepare('SELECT t.id, t.company_id, t.version, t.status, t.generated_by, t.created_at, COALESCE(c.brand_name, c.legal_name, c.code) company FROM teasers t JOIN companies c ON c.id=t.company_id WHERE t.status=? ORDER BY t.created_at').all(status) });
  });

  r.post('/deals/:id/teaser/generate', (req, res) => {
    const c = company(req.params.id);
    res.status(201).json({ id: pipeline.generateTeaser(c.id, req.user.id) });
  });

  const TeaserEdit = z.object(Object.fromEntries(['overview', 'problem', 'solution', 'market', 'differentiation', 'traction'].map(k => [k, z.string().max(1500).nullable().optional()])))
    .extend({ highlights: z.array(z.string().max(300)).max(6).optional(), risks: z.array(z.string().max(300)).max(8).optional() });
  r.put('/teasers/:id', asyncH(async (req, res) => {
    const t = db.prepare('SELECT * FROM teasers WHERE id=?').get(Number(req.params.id));
    if (!t) throw new HttpError(404, 'Teaser not found');
    if (['approved', 'superseded'].includes(t.status)) throw new HttpError(409, 'Approved teasers are immutable; regenerate to create a new version.');
    const edits = TeaserEdit.parse(req.body);
    const content = jparse(t.content, {});
    for (const [k, v] of Object.entries(edits)) {
      if (k === 'highlights' || k === 'risks') content[k] = v.map(text => ({ text, origin: 'host' }));
      else content[k] = v ? { text: v, origin: 'host' } : null;
    }
    db.prepare('UPDATE teasers SET content=? WHERE id=?').run(JSON.stringify(content), t.id);
    activity(db, t.company_id, req.user.id, 'teaser_edited', `Teaser v${t.version} edited by host`);
    res.json({ ok: true });
  }));

  r.post('/teasers/:id/review', asyncH(async (req, res) => {
    const { decision, note } = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(2000).optional() }).parse(req.body);
    const t = db.prepare('SELECT * FROM teasers WHERE id=?').get(Number(req.params.id));
    if (!t) throw new HttpError(404, 'Teaser not found');
    if (!['pending_approval', 'draft'].includes(t.status)) throw new HttpError(409, `Teaser is ${t.status}`);
    if (decision === 'reject' && !note) throw new HttpError(400, 'Explain what needs to change when rejecting.');
    const c = company(t.company_id);
    tx(db, () => {
      if (decision === 'approve') db.prepare("UPDATE teasers SET status='superseded' WHERE company_id=? AND status='approved'").run(t.company_id);
      db.prepare("UPDATE teasers SET status=?, reviewed_by=?, review_note=?, reviewed_at=datetime('now') WHERE id=?").run(decision === 'approve' ? 'approved' : 'rejected', req.user.id, note ?? null, t.id);
      activity(db, t.company_id, req.user.id, 'teaser_review', `Teaser v${t.version} ${decision === 'approve' ? 'approved' : 'rejected'}${note ? `: ${note}` : ''}`, true);
    });
    audit(db, req, `teaser.${decision}`, 'teaser', t.id);
    notify(db, c.owner_user_id, decision === 'approve' ? 'Teaser approved' : 'Teaser needs changes', note || '', '/founder/teaser', `teaser_review:${t.id}`);
    const deal = db.prepare('SELECT stage FROM deals WHERE company_id=?').get(c.id);
    // Approval is the host's release decision: pre-discovery deals move into investor discovery.
    if (decision === 'approve' && ['registered', 'profile_incomplete', 'documents_received', 'ai_processing', 'awaiting_clarification', 'screening', 'teaser_pending'].includes(deal.stage)) {
      pipeline.setStage(c.id, 'discovery', req.user.id, 'Teaser approved');
    }
    res.json({ ok: true });
  }));

  // ---- Interest & introductions ----
  r.get('/interest', (req, res) => {
    const action = req.query.action;
    const rows = db.prepare(`SELECT s.investor_id, s.company_id, s.action, s.score, s.created_at, s.updated_at, u.name investor, p.firm, p.investor_type,
        COALESCE(c.brand_name, c.legal_name, c.code) company, c.code, c.industry, c.stage round_stage, i.id intro_id, i.status intro_status
      FROM swipes s JOIN users u ON u.id=s.investor_id LEFT JOIN investor_profiles p ON p.user_id=u.id JOIN companies c ON c.id=s.company_id
      LEFT JOIN introductions i ON i.investor_id=s.investor_id AND i.company_id=s.company_id
      ${action ? 'WHERE s.action=?' : ''} ORDER BY s.updated_at DESC LIMIT 500`).all(...(action ? [action] : []));
    const events = db.prepare(`SELECT e.*, u.name investor, COALESCE(c.brand_name, c.legal_name, c.code) company FROM swipe_events e JOIN users u ON u.id=e.investor_id JOIN companies c ON c.id=e.company_id ORDER BY e.id DESC LIMIT 100`).all();
    res.json({ swipes: rows, events });
  });

  r.get('/introductions', (req, res) => {
    const status = req.query.status;
    res.json({
      introductions: db.prepare(`SELECT i.*, u.name investor, p.firm, COALESCE(c.brand_name, c.legal_name, c.code) company, c.code, s.score
        FROM introductions i JOIN users u ON u.id=i.investor_id LEFT JOIN investor_profiles p ON p.user_id=u.id JOIN companies c ON c.id=i.company_id
        LEFT JOIN swipes s ON s.investor_id=i.investor_id AND s.company_id=i.company_id
        ${status ? 'WHERE i.status=?' : ''} ORDER BY i.status='pending' DESC, i.updated_at DESC`).all(...(status ? [status] : [])),
    });
  });

  const IntroPatch = z.object({ status: z.enum(['pending', 'approved', 'deferred', 'rejected', 'completed']).optional(), disclose_investor: z.union([z.literal(0), z.literal(1)]).optional(), disclose_founder: z.union([z.literal(0), z.literal(1)]).optional(), note: z.string().max(2000).optional() });
  r.patch('/introductions/:id', asyncH(async (req, res) => {
    const body = IntroPatch.parse(req.body);
    const i = db.prepare('SELECT * FROM introductions WHERE id=?').get(Number(req.params.id));
    if (!i) throw new HttpError(404, 'Introduction not found');
    if (body.status === 'completed' && !['approved', 'completed'].includes(i.status)) throw new HttpError(409, 'Approve the introduction before marking it completed.');
    const c = company(i.company_id);
    const inv = db.prepare('SELECT name FROM users WHERE id=?').get(i.investor_id);
    tx(db, () => {
      db.prepare(`UPDATE introductions SET status=COALESCE(?, status), disclose_investor=COALESCE(?, disclose_investor), disclose_founder=COALESCE(?, disclose_founder), note=COALESCE(?, note), decided_by=?, updated_at=datetime('now') WHERE id=?`)
        .run(body.status ?? null, body.disclose_investor ?? null, body.disclose_founder ?? null, body.note ?? null, req.user.id, i.id);
      if (body.status && ['rejected', 'deferred', 'pending'].includes(body.status)) db.prepare("UPDATE document_grants SET revoked_at=datetime('now') WHERE investor_id=? AND revoked_at IS NULL AND document_id IN (SELECT id FROM documents WHERE company_id=?)").run(i.investor_id, i.company_id);
      activity(db, i.company_id, req.user.id, 'introduction', `Introduction with ${inv.name}: ${body.status ?? i.status}${'disclose_investor' in body || 'disclose_founder' in body ? ' (disclosure updated)' : ''}`);
      if (body.status === 'approved' || body.status === 'completed') activity(db, i.company_id, null, 'introduction_anon', `Introduction ${body.status}`, true);
    });
    audit(db, req, 'introduction.update', 'introduction', i.id, body);
    if (body.status === 'approved') {
      notify(db, i.investor_id, 'Introduction approved', `Your introduction to ${body.disclose_founder || i.disclose_founder || c.disclose_identity ? c.brand_name || c.legal_name : c.code} was approved.`, '/investor/introductions', `intro_ok:${i.id}`);
      notify(db, c.owner_user_id, 'Introduction approved', 'The host approved an investor introduction.', '/founder/interest', `intro_ok_f:${i.id}`);
      pipeline.advanceStage(c.id, 'intro_pending', req.user.id, 'Introduction approved');
    }
    if (body.status === 'completed') pipeline.advanceStage(c.id, 'intro_completed', req.user.id, 'Introduction completed');
    res.json({ ok: true });
  }));

  // ---- Data-room grants ----
  r.post('/grants', asyncH(async (req, res) => {
    const { document_id, investor_id } = z.object({ document_id: z.number().int(), investor_id: z.number().int() }).parse(req.body);
    const d = db.prepare('SELECT * FROM documents WHERE id=?').get(document_id);
    if (!d) throw new HttpError(404, 'Document not found');
    const intro = db.prepare("SELECT 1 FROM introductions WHERE investor_id=? AND company_id=? AND status IN ('approved','completed')").get(investor_id, d.company_id);
    if (!intro) throw new HttpError(409, 'Documents can only be shared with investors whose introduction has been approved.');
    db.prepare(`INSERT INTO document_grants(document_id, investor_id, granted_by) VALUES (?,?,?)
      ON CONFLICT(document_id, investor_id) DO UPDATE SET revoked_at=NULL, granted_by=excluded.granted_by, created_at=datetime('now')`).run(document_id, investor_id, req.user.id);
    db.prepare('INSERT INTO document_access_log(document_id, user_id, action) VALUES (?,?,?)').run(document_id, req.user.id, `grant:${investor_id}`);
    activity(db, d.company_id, req.user.id, 'grant', `Shared ${d.filename} with investor #${investor_id}`);
    audit(db, req, 'document.grant', 'document', document_id, { investor_id });
    notify(db, investor_id, 'New document shared', 'A document has been shared with you.', '/investor/introductions', `grant:${document_id}:${investor_id}:${Date.now()}`);
    res.status(201).json({ ok: true });
  }));

  r.delete('/grants', asyncH(async (req, res) => {
    const { document_id, investor_id } = z.object({ document_id: z.coerce.number().int(), investor_id: z.coerce.number().int() }).parse(req.query);
    const d = db.prepare('SELECT * FROM documents WHERE id=?').get(document_id);
    if (!d) throw new HttpError(404, 'Document not found');
    db.prepare("UPDATE document_grants SET revoked_at=datetime('now') WHERE document_id=? AND investor_id=?").run(document_id, investor_id);
    db.prepare('INSERT INTO document_access_log(document_id, user_id, action) VALUES (?,?,?)').run(document_id, req.user.id, `revoke:${investor_id}`);
    activity(db, d.company_id, req.user.id, 'revoke', `Revoked ${d.filename} from investor #${investor_id}`);
    audit(db, req, 'document.revoke', 'document', document_id, { investor_id });
    res.json({ ok: true });
  }));

  // ---- Audit, settings, exports ----
  r.get('/audit', (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    res.json({
      logs: db.prepare('SELECT a.*, u.name actor, u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100 OFFSET ?').all((page - 1) * 100),
      logins: db.prepare('SELECT l.*, u.name FROM login_events l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 100').all(),
      outbox: db.prepare('SELECT id, to_email, subject, created_at, sent_at FROM email_outbox ORDER BY id DESC LIMIT 50').all(),
    });
  });

  r.get('/settings', (_req, res) => res.json({ weights: getSetting(db, 'match_weights'), stages: stages(), defaults: DEFAULT_WEIGHTS }));

  r.put('/settings', asyncH(async (req, res) => {
    const body = z.object({
      weights: z.object({ stage: z.number().min(0).max(100), sector: z.number().min(0).max(100), ticket: z.number().min(0).max(100), geography: z.number().min(0).max(100), traction: z.number().min(0).max(100), other: z.number().min(0).max(100) }).optional(),
      stages: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]+$/), label: z.string().min(1).max(80), terminal: z.boolean().optional() })).min(3).optional(),
    }).parse(req.body);
    if (body.weights) {
      const sum = Object.values(body.weights).reduce((a, b) => a + b, 0);
      if (sum !== 100) throw new HttpError(400, `Weights must total 100 (currently ${sum}).`);
      db.prepare("UPDATE settings SET value=? WHERE key='match_weights'").run(JSON.stringify(body.weights));
    }
    if (body.stages) {
      const used = db.prepare('SELECT DISTINCT stage FROM deals').all().map(x => x.stage);
      const missing = used.filter(k => !body.stages.some(s => s.key === k));
      if (missing.length) throw new HttpError(409, `Cannot remove stages that deals are currently in: ${missing.join(', ')}`);
      const required = ['registered', 'discovery', 'closed_funded', 'closed_lost'];
      if (required.some(k => !body.stages.some(s => s.key === k))) throw new HttpError(400, `Stages ${required.join(', ')} are required by the workflow.`);
      db.prepare("UPDATE settings SET value=? WHERE key='pipeline_stages'").run(JSON.stringify(body.stages));
    }
    audit(db, req, 'settings.update', 'settings', null, body);
    res.json({ ok: true });
  }));

  r.get('/export/:kind.csv', (req, res) => {
    let rows, cols;
    if (req.params.kind === 'deals') {
      rows = db.prepare(`SELECT c.code, COALESCE(c.brand_name,c.legal_name) name, c.industry, c.stage round_stage, c.currency, c.raise_amount stated_raise, d.stage pipeline_stage, o.name owner, d.next_action, d.due_date, d.amount_committed, d.amount_funded, d.outcome, d.closed_at,
          (SELECT COUNT(*) FROM swipes s WHERE s.company_id=c.id AND s.action='interested') interest_count
        FROM deals d JOIN companies c ON c.id=d.company_id LEFT JOIN users o ON o.id=d.owner_user_id ORDER BY c.id`).all();
      cols = ['code', 'name', 'industry', 'round_stage', 'currency', 'stated_raise', 'pipeline_stage', 'owner', 'next_action', 'due_date', 'amount_committed', 'amount_funded', 'outcome', 'closed_at', 'interest_count'];
    } else if (req.params.kind === 'interest') {
      rows = db.prepare(`SELECT u.name investor, p.firm, COALESCE(c.brand_name,c.legal_name,c.code) company, s.action, s.score, s.updated_at, i.status intro_status FROM swipes s JOIN users u ON u.id=s.investor_id LEFT JOIN investor_profiles p ON p.user_id=u.id JOIN companies c ON c.id=s.company_id LEFT JOIN introductions i ON i.investor_id=s.investor_id AND i.company_id=s.company_id ORDER BY s.updated_at DESC`).all();
      cols = ['investor', 'firm', 'company', 'action', 'score', 'updated_at', 'intro_status'];
    } else throw new HttpError(404, 'Unknown export');
    audit(db, req, 'export', req.params.kind, null, { rows: rows.length });
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="${req.params.kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv(rows, cols));
  });

  return r;
}
