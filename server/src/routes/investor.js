import { Router } from 'express';
import { z } from 'zod';
import { HttpError, asyncH, requireRole, audit, activity, notifyHosts, signDocUrl, jparse } from '../lib/core.js';
import { tx, getSetting } from '../db.js';
import { STAGES, INVESTOR_TYPES, LEAD_PREFS, DISCOVERABLE_STAGES } from '../lib/constants.js';
import { scoreMatch } from '../services/matching.js';

const arr = z.array(z.string().max(60)).max(30);
const n = z.number().nonnegative().nullable().optional();
const MandateSchema = z.object({
  firm: z.string().max(200).nullable(), title: z.string().max(120).nullable(), website: z.string().max(300).nullable(), bio: z.string().max(2000).nullable(),
  investor_type: z.enum(INVESTOR_TYPES).nullable(),
  sectors: arr, business_models: arr, stages: z.array(z.enum(STAGES)), excluded_stages: z.array(z.enum(STAGES)), geographies: arr,
  ticket_min: n, ticket_max: n, round_min: n, round_max: n,
  lead_preference: z.enum(LEAD_PREFS).nullable(), min_revenue: n,
  requires_revenue: z.union([z.literal(0), z.literal(1)]), requires_profitability: z.union([z.literal(0), z.literal(1)]),
  other_criteria: z.string().max(2000).nullable(),
}).partial().superRefine((v, ctx) => {
  if (v.ticket_min != null && v.ticket_max != null && v.ticket_min > v.ticket_max) ctx.addIssue({ code: 'custom', path: ['ticket_max'], message: 'Maximum ticket must be ≥ minimum ticket' });
  if (v.round_min != null && v.round_max != null && v.round_min > v.round_max) ctx.addIssue({ code: 'custom', path: ['round_max'], message: 'Maximum round must be ≥ minimum round' });
  if (v.stages && v.excluded_stages && v.stages.some(s => v.excluded_stages.includes(s))) ctx.addIssue({ code: 'custom', path: ['excluded_stages'], message: 'A stage cannot be both preferred and excluded' });
});
const JSON_FIELDS = ['sectors', 'business_models', 'stages', 'excluded_stages', 'geographies'];

export function mandateCompleteness(p) {
  const checks = [p.investor_type, jparse(p.sectors).length, jparse(p.stages).length, jparse(p.geographies).length, p.ticket_min != null || p.ticket_max != null, p.lead_preference];
  return Math.round(100 * checks.filter(Boolean).length / checks.length);
}

// Builds the investor-facing view of a company from its *approved* teaser only, applying disclosure rules.
export function investorCompanyView(db, company, teaser, intro) {
  const content = jparse(teaser.content, {});
  const disclosed = company.disclose_identity === 1 || (intro && ['approved', 'completed'].includes(intro.status) && intro.disclose_founder === 1);
  const view = {
    company_id: company.id,
    teaser_id: teaser.id,
    teaser_version: teaser.version,
    approved_at: teaser.reviewed_at,
    identity_disclosed: disclosed,
    ...content,
    name: disclosed ? content.name : null,
    code: company.code,
    website: disclosed ? company.website : null,
    sources: (content.sources || []).map(s => ({ category: s.category, uploaded: s.uploaded, version: s.version, ...(disclosed ? { filename: s.filename } : {}) })),
  };
  return view;
}

export default function investorRoutes({ db, secret }) {
  const r = Router();
  r.use(requireRole('investor'));
  const profile = (uid) => db.prepare('SELECT * FROM investor_profiles WHERE user_id=?').get(uid);

  r.get('/mandate', (req, res) => {
    const p = profile(req.user.id);
    res.json({ mandate: { ...p, ...Object.fromEntries(JSON_FIELDS.map(k => [k, jparse(p[k])])) }, completeness: mandateCompleteness(p) });
  });

  r.put('/mandate', asyncH(async (req, res) => {
    const data = MandateSchema.parse(req.body);
    const keys = Object.keys(data);
    if (keys.length) {
      db.prepare(`UPDATE investor_profiles SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE user_id = ?`)
        .run(...keys.map(k => (JSON_FIELDS.includes(k) ? JSON.stringify(data[k]) : data[k] ?? null)), req.user.id);
      audit(db, req, 'mandate.update', 'user', req.user.id, { fields: keys });
    }
    const p = profile(req.user.id);
    res.json({ completeness: mandateCompleteness(p) });
  }));

  // Approved, discoverable companies with the latest approved teaser.
  function discoverable() {
    return db.prepare(`SELECT c.*, t.id AS t_id, t.version AS t_version, t.content AS t_content, t.reviewed_at AS t_reviewed_at
      FROM companies c JOIN deals d ON d.company_id=c.id
      JOIN teasers t ON t.id = (SELECT id FROM teasers WHERE company_id=c.id AND status='approved' ORDER BY version DESC LIMIT 1)
      JOIN users u ON u.id=c.owner_user_id AND u.status='active'
      WHERE d.stage IN (${DISCOVERABLE_STAGES.map(() => '?').join(',')})`).all(...DISCOVERABLE_STAGES);
  }

  function scored(uid) {
    const p = profile(uid);
    const weights = getSetting(db, 'match_weights');
    const swipes = new Map(db.prepare('SELECT company_id, action FROM swipes WHERE investor_id=?').all(uid).map(s => [s.company_id, s.action]));
    const intros = new Map(db.prepare('SELECT * FROM introductions WHERE investor_id=?').all(uid).map(i => [i.company_id, i]));
    return discoverable().map(c => {
      const content = jparse(c.t_content, {});
      const fin = content.financials || {};
      const match = scoreMatch(p, { ...c, metrics_revenue: fin.revenue?.value, metrics_ebitda: fin.ebitda_margin?.value != null && fin.revenue?.value != null ? fin.ebitda_margin.value * fin.revenue.value : undefined }, weights);
      const view = investorCompanyView(db, c, { id: c.t_id, version: c.t_version, content: c.t_content, reviewed_at: c.t_reviewed_at }, intros.get(c.id));
      return { ...view, match, swipe: swipes.get(c.id) || null, introduction: intros.get(c.id) ? { status: intros.get(c.id).status } : null };
    });
  }

  r.get('/feed', (req, res) => {
    const q = req.query;
    const includePassed = q.include_passed === '1';
    let list = scored(req.user.id).filter(x => !x.swipe || (includePassed && x.swipe === 'passed'));
    if (q.sector) list = list.filter(x => x.industry === q.sector);
    if (q.stage) list = list.filter(x => x.stage === q.stage);
    if (q.geography) list = list.filter(x => (x.geography || '').includes(q.geography));
    if (q.max_raise) list = list.filter(x => x.raise?.amount != null && x.raise.amount <= Number(q.max_raise));
    if (q.min_score) list = list.filter(x => x.match.score >= Number(q.min_score));
    if (q.hide_ineligible !== '0') list = list.filter(x => x.match.eligible);
    list.sort((a, b) => b.match.score - a.match.score || (b.approved_at || '').localeCompare(a.approved_at || ''));
    res.json({ items: list, total: list.length });
  });

  r.get('/companies/:id', (req, res) => {
    const item = scored(req.user.id).find(x => x.company_id === Number(req.params.id));
    if (!item) throw new HttpError(404, 'Opportunity not found or not available');
    const docs = db.prepare(`SELECT d.id, d.category, d.filename, d.version, d.created_at FROM document_grants g JOIN documents d ON d.id=g.document_id
      WHERE g.investor_id=? AND d.company_id=? AND g.revoked_at IS NULL`).all(req.user.id, item.company_id);
    res.json({ item, documents: docs });
  });

  const SwipeSchema = z.object({ company_id: z.number().int(), action: z.enum(['interested', 'passed', 'saved']) });
  r.post('/swipes', asyncH(async (req, res) => {
    const { company_id, action } = SwipeSchema.parse(req.body);
    const item = scored(req.user.id).find(x => x.company_id === company_id);
    if (!item) throw new HttpError(404, 'Opportunity not available');
    const prev = db.prepare('SELECT action FROM swipes WHERE investor_id=? AND company_id=?').get(req.user.id, company_id);
    const c = db.prepare('SELECT * FROM companies WHERE id=?').get(company_id);
    tx(db, () => {
      db.prepare(`INSERT INTO swipes(investor_id, company_id, action, score) VALUES (?,?,?,?)
        ON CONFLICT(investor_id, company_id) DO UPDATE SET action=excluded.action, score=excluded.score, updated_at=datetime('now')`).run(req.user.id, company_id, action, item.match.score);
      db.prepare('INSERT INTO swipe_events(investor_id, company_id, action) VALUES (?,?,?)').run(req.user.id, company_id, action);
      if (action === 'interested' && prev?.action !== 'interested') {
        // Interest creates a pending introduction for host review — it does not disclose anything by itself.
        db.prepare("INSERT OR IGNORE INTO introductions(investor_id, company_id, status) VALUES (?,?,'pending')").run(req.user.id, company_id);
        activity(db, company_id, req.user.id, 'interest', `Investor ${req.user.name} expressed interest (fit ${item.match.score})`);
        activity(db, company_id, null, 'interest_anon', 'An investor expressed interest', true);
      }
    });
    if (action === 'interested' && prev?.action !== 'interested') {
      notifyHosts(db, 'New investor interest', `${req.user.name} → ${c.brand_name || c.code}`, `/host/interest`, `interest:${req.user.id}:${company_id}`);
      const deal = db.prepare('SELECT stage FROM deals WHERE company_id=?').get(company_id);
      if (deal.stage === 'discovery') {
        db.prepare("UPDATE deals SET stage='interest_received', updated_at=datetime('now') WHERE company_id=?").run(company_id);
        activity(db, company_id, null, 'stage_change', 'Stage: Approved for investor discovery → Investor interest received [automatic]', true);
      }
    }
    audit(db, req, `swipe.${action}`, 'company', company_id);
    res.json({ ok: true, previous: prev?.action || null });
  }));

  // Undo the most recent swipe on a company. Interest already reviewed by the host cannot be silently withdrawn.
  r.delete('/swipes/:companyId', (req, res) => {
    const cid = Number(req.params.companyId);
    const s = db.prepare('SELECT * FROM swipes WHERE investor_id=? AND company_id=?').get(req.user.id, cid);
    if (!s) throw new HttpError(404, 'Nothing to undo');
    const intro = db.prepare('SELECT * FROM introductions WHERE investor_id=? AND company_id=?').get(req.user.id, cid);
    if (intro && intro.status !== 'pending') throw new HttpError(409, 'The host has already acted on this interest; contact the host to withdraw.');
    tx(db, () => {
      db.prepare('DELETE FROM swipes WHERE investor_id=? AND company_id=?').run(req.user.id, cid);
      db.prepare('INSERT INTO swipe_events(investor_id, company_id, action) VALUES (?,?,?)').run(req.user.id, cid, `undo_${s.action}`);
      if (s.action === 'interested' && intro) {
        db.prepare('DELETE FROM introductions WHERE id=?').run(intro.id);
        activity(db, cid, req.user.id, 'interest_withdrawn', `Investor ${req.user.name} undid interest`);
      }
    });
    audit(db, req, 'swipe.undo', 'company', cid, { action: s.action });
    res.json({ ok: true });
  });

  r.get('/shortlist', (req, res) => {
    const all = scored(req.user.id);
    res.json({
      interested: all.filter(x => x.swipe === 'interested'),
      saved: all.filter(x => x.swipe === 'saved'),
      passed: all.filter(x => x.swipe === 'passed'),
    });
  });

  r.get('/introductions', (req, res) => {
    const rows = db.prepare(`SELECT i.*, c.code, c.disclose_identity, c.brand_name, c.legal_name, c.website, c.industry, c.stage AS round_stage, d.stage AS deal_stage, u.name AS founder_name, u.email AS founder_email
      FROM introductions i JOIN companies c ON c.id=i.company_id JOIN deals d ON d.company_id=c.id JOIN users u ON u.id=c.owner_user_id
      WHERE i.investor_id=? ORDER BY i.updated_at DESC`).all(req.user.id);
    res.json({
      introductions: rows.map(x => {
        const disclosed = ['approved', 'completed'].includes(x.status) && (x.disclose_founder === 1 || x.disclose_identity === 1);
        return {
          id: x.id, company_id: x.company_id, status: x.status, created_at: x.created_at, updated_at: x.updated_at,
          code: x.code, industry: x.industry, stage: x.round_stage, deal_stage: ['approved', 'completed'].includes(x.status) ? x.deal_stage : null,
          name: disclosed ? x.brand_name || x.legal_name : null, website: disclosed ? x.website : null,
          founder_name: disclosed ? x.founder_name : null, founder_email: disclosed ? x.founder_email : null,
        };
      }),
    });
  });

  r.post('/companies/:id/questions', asyncH(async (req, res) => {
    const cid = Number(req.params.id);
    const { message } = z.object({ message: z.string().trim().min(5).max(2000) }).parse(req.body);
    if (!scored(req.user.id).some(x => x.company_id === cid)) throw new HttpError(404, 'Opportunity not available');
    // Routed via the host, who decides whether to forward it to the founder.
    db.prepare('INSERT INTO deal_notes(company_id, author_id, body) VALUES (?,?,?)').run(cid, req.user.id, `[Investor question from ${req.user.name}] ${message}`);
    activity(db, cid, req.user.id, 'investor_question', `Investor ${req.user.name} requested more information`);
    notifyHosts(db, 'Investor information request', message.slice(0, 120), `/host/deals/${cid}`);
    res.status(201).json({ ok: true });
  }));

  r.get('/documents/:id/url', (req, res) => {
    const g = db.prepare('SELECT 1 FROM document_grants WHERE document_id=? AND investor_id=? AND revoked_at IS NULL').get(Number(req.params.id), req.user.id);
    if (!g) throw new HttpError(403, 'You do not have access to this document');
    res.json({ url: signDocUrl(Number(req.params.id), req.user.id, secret) });
  });

  r.get('/dashboard', (req, res) => {
    const all = scored(req.user.id);
    const p = profile(req.user.id);
    const recent = all.filter(x => x.approved_at && Date.now() - Date.parse(x.approved_at + 'Z') < 14 * 864e5);
    res.json({
      completeness: mandateCompleteness(p),
      counts: {
        new: all.filter(x => !x.swipe && x.match.eligible).length,
        interested: all.filter(x => x.swipe === 'interested').length,
        saved: all.filter(x => x.swipe === 'saved').length,
        passed: all.filter(x => x.swipe === 'passed').length,
        intros_approved: db.prepare("SELECT COUNT(*) n FROM introductions WHERE investor_id=? AND status IN ('approved','completed')").get(req.user.id).n,
        diligence: db.prepare("SELECT COUNT(*) n FROM introductions i JOIN deals d ON d.company_id=i.company_id WHERE i.investor_id=? AND i.status IN ('approved','completed') AND d.stage IN ('due_diligence','negotiation')").get(req.user.id).n,
      },
      recommended: all.filter(x => !x.swipe && x.match.eligible).sort((a, b) => b.match.score - a.match.score).slice(0, 4),
      recent: recent.filter(x => x.match.eligible).slice(0, 5),
    });
  });

  return r;
}

