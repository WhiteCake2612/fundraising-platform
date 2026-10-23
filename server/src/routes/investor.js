import { Router } from 'express';
import { z } from 'zod';
import { HttpError, asyncH, requireRole, audit, activity, notifyHosts, signDocUrl, jparse } from '../lib/core.js';
import { tx, getSetting } from '../db.js';
import { STAGES, INVESTOR_TYPES, LEAD_PREFS, DISCOVERABLE_STAGES, PASS_REASONS } from '../lib/constants.js';
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

// How much of the approved teaser's financial picture is backed by documents rather than founder input.
// Built only from the approved teaser snapshot, so it never reveals anything the host has not released.
export function dataConfidence(content) {
  const fin = content.financials || {};
  const keys = ['revenue', 'growth', 'gross_margin', 'runway'].filter(k => fin[k]);
  const stated = (m) => !m || m.basis === 'founder_input' || /founder/i.test(`${m.source || ''} ${m.period || ''}`);
  // Runway is derived from cash and burn, so it is only as documented as both of its inputs.
  const isStated = (k) => (k === 'runway' ? stated(fin.cash) || stated(fin.burn) : stated(fin[k]));
  const documented = keys.filter(k => !isStated(k)).length;
  const risks = content.risks || [];
  const level = !keys.length ? 'none' : documented === keys.length ? 'documented' : documented ? 'partial' : 'founder_stated';
  return {
    level, metrics: keys.length, documented, founder_stated: keys.length - documented,
    documents: (content.sources || []).length,
    flags: { high: risks.filter(r => ['critical', 'high'].includes(r.severity)).length, other: risks.filter(r => r.severity && !['critical', 'high'].includes(r.severity)).length },
  };
}

const PEER_METRICS = {
  revenue: (x) => x.financials?.revenue?.value, growth: (x) => x.financials?.growth?.value,
  gross_margin: (x) => x.financials?.gross_margin?.value, runway: (x) => x.financials?.runway?.value, raise: (x) => x.raise?.amount,
};
// Percentile of each metric among discoverable companies at the same stage (needs at least 3 with data).
export function peerStats(items) {
  const byStage = new Map();
  for (const x of items) byStage.set(x.stage, [...(byStage.get(x.stage) || []), x]);
  return new Map(items.map(x => {
    const peers = byStage.get(x.stage) || [];
    const out = {};
    for (const [k, get] of Object.entries(PEER_METRICS)) {
      const v = get(x);
      const vals = peers.map(get).filter(n => typeof n === 'number' && Number.isFinite(n));
      if (typeof v !== 'number' || !Number.isFinite(v) || vals.length < 3) continue;
      const below = vals.filter(n => n < v).length, equal = vals.filter(n => n === v).length;
      out[k] = { value: v, pct: Math.round(100 * (below + (equal - 1) / 2) / Math.max(1, vals.length - 1)), n: vals.length };
    }
    return [x.company_id, out];
  }));
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
    const notes = new Map(db.prepare('SELECT * FROM investor_notes WHERE investor_id=?').all(uid).map(n => [n.company_id, { note: n.note, tags: jparse(n.tags), updated_at: n.updated_at }]));
    const reasons = new Map(db.prepare('SELECT company_id, reason FROM swipes WHERE investor_id=? AND reason IS NOT NULL').all(uid).map(s => [s.company_id, s.reason]));
    const list = discoverable().map(c => {
      const content = jparse(c.t_content, {});
      const fin = content.financials || {};
      const match = scoreMatch(p, { ...c, metrics_revenue: fin.revenue?.value, metrics_ebitda: fin.ebitda_margin?.value != null && fin.revenue?.value != null ? fin.ebitda_margin.value * fin.revenue.value : undefined }, weights);
      const view = investorCompanyView(db, c, { id: c.t_id, version: c.t_version, content: c.t_content, reviewed_at: c.t_reviewed_at }, intros.get(c.id));
      return { ...view, match, confidence: dataConfidence(content), swipe: swipes.get(c.id) || null, pass_reason: reasons.get(c.id) || null, my_note: notes.get(c.id) || null, introduction: intros.get(c.id) ? { status: intros.get(c.id).status } : null };
    });
    const peers = peerStats(list);
    return list.map(x => ({ ...x, peers: peers.get(x.company_id) }));
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
    const rev = (x) => x.financials?.revenue?.value;
    if (q.min_revenue) list = list.filter(x => rev(x) != null && rev(x) >= Number(q.min_revenue));
    if (q.max_revenue) list = list.filter(x => rev(x) == null || rev(x) <= Number(q.max_revenue));
    if (q.revenue === 'pre') list = list.filter(x => !rev(x));
    if (q.revenue === 'yes') list = list.filter(x => rev(x) > 0);
    if (q.min_growth) list = list.filter(x => x.financials?.growth?.value != null && x.financials.growth.value * 100 >= Number(q.min_growth));
    if (q.min_runway) list = list.filter(x => x.financials?.runway?.value != null && x.financials.runway.value >= Number(q.min_runway));
    if (q.needs_lead === '1') list = list.filter(x => x.raise?.seeking_lead === 1);
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
        ON CONFLICT(investor_id, company_id) DO UPDATE SET action=excluded.action, score=excluded.score, reason=NULL, updated_at=datetime('now')`).run(req.user.id, company_id, action, item.match.score);
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
        const remaining = db.prepare("SELECT COUNT(*) n FROM swipes WHERE company_id=? AND action='interested'").get(cid).n;
        if (!remaining && db.prepare('SELECT stage FROM deals WHERE company_id=?').get(cid)?.stage === 'interest_received') {
          db.prepare("UPDATE deals SET stage='discovery', updated_at=datetime('now') WHERE company_id=?").run(cid);
          activity(db, cid, null, 'stage_change', 'Stage: Investor interest received → Approved for investor discovery (interest withdrawn) [automatic]', true);
        }
      }
    });
    audit(db, req, 'swipe.undo', 'company', cid, { action: s.action });
    res.json({ ok: true });
  });

  // Optional reason attached to a pass after the fact, so passing stays a single gesture.
  r.patch('/swipes/:companyId', asyncH(async (req, res) => {
    const cid = Number(req.params.companyId);
    const { reason } = z.object({ reason: z.enum(Object.keys(PASS_REASONS)).nullable() }).parse(req.body);
    const s = db.prepare('SELECT action FROM swipes WHERE investor_id=? AND company_id=?').get(req.user.id, cid);
    if (!s) throw new HttpError(404, 'No decision recorded for this company');
    if (s.action !== 'passed') throw new HttpError(409, 'Reasons can only be added to passes');
    db.prepare("UPDATE swipes SET reason=?, updated_at=datetime('now') WHERE investor_id=? AND company_id=?").run(reason, req.user.id, cid);
    db.prepare('INSERT INTO swipe_events(investor_id, company_id, action, reason) VALUES (?,?,?,?)').run(req.user.id, cid, 'pass_reason', reason);
    res.json({ ok: true });
  }));

  const NoteSchema = z.object({ note: z.string().max(4000), tags: z.array(z.string().trim().min(1).max(30)).max(12) });
  r.put('/notes/:companyId', asyncH(async (req, res) => {
    const cid = Number(req.params.companyId);
    const { note, tags } = NoteSchema.parse(req.body);
    if (!scored(req.user.id).some(x => x.company_id === cid)) throw new HttpError(404, 'Opportunity not available');
    const uniq = [...new Set(tags.map(t => t.toLowerCase()))];
    db.prepare(`INSERT INTO investor_notes(investor_id, company_id, note, tags) VALUES (?,?,?,?)
      ON CONFLICT(investor_id, company_id) DO UPDATE SET note=excluded.note, tags=excluded.tags, updated_at=datetime('now')`).run(req.user.id, cid, note, JSON.stringify(uniq));
    res.json({ ok: true, my_note: { note, tags: uniq } });
  }));

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

  // Deal-flow analytics computed from the investor's own decisions and the live deck.
  r.get('/analytics', (req, res) => {
    const uid = req.user.id;
    const all = scored(uid);
    const decided = all.filter(x => x.swipe);
    const group = (rows, key) => Object.values(rows.reduce((m, x) => {
      const k = key(x) || 'Unspecified';
      m[k] ||= { k, interested: 0, saved: 0, passed: 0, total: 0 };
      m[k][x.swipe] += 1; m[k].total += 1;
      return m;
    }, {})).sort((a, b) => b.total - a.total);
    const bins = Array.from({ length: 10 }, (_, i) => ({ k: i === 9 ? '90-100' : `${i * 10}-${i * 10 + 9}`, deck: 0, interested: 0, passed: 0, saved: 0 }));
    for (const x of all) { const b = bins[Math.min(9, Math.floor(x.match.score / 10))]; b[x.swipe || 'deck'] += 1; }
    const avg = (a) => a.length ? Math.round(a.reduce((t, x) => t + x.match.score, 0) / a.length) : null;
    const one = (sql) => db.prepare(sql).get(uid).n;
    res.json({
      map: all.map(x => ({
        company_id: x.company_id, name: x.name || `Project ${x.code}`, industry: x.industry, stage: x.stage,
        revenue: x.financials?.revenue?.value ?? null, growth: x.financials?.growth?.value ?? null, raise: x.raise?.amount ?? null,
        currency: x.currency, score: x.match.score, eligible: x.match.eligible, swipe: x.swipe,
      })),
      bySector: group(decided, x => x.industry),
      byStage: group(decided, x => x.stage),
      fitBins: bins,
      avgFit: { interested: avg(decided.filter(x => x.swipe === 'interested')), saved: avg(decided.filter(x => x.swipe === 'saved')), passed: avg(decided.filter(x => x.swipe === 'passed')), deck: avg(all.filter(x => !x.swipe)) },
      passReasons: Object.entries(PASS_REASONS).map(([k, label]) => ({ k, label, n: decided.filter(x => x.pass_reason === k).length })).filter(r => r.n),
      funnel: [
        { k: 'reviewed', label: 'Reviewed', n: one('SELECT COUNT(*) n FROM swipes WHERE investor_id=?') },
        { k: 'interested', label: 'Interested', n: one("SELECT COUNT(*) n FROM swipes WHERE investor_id=? AND action='interested'") },
        { k: 'intro', label: 'Intro approved', n: one("SELECT COUNT(*) n FROM introductions WHERE investor_id=? AND status IN ('approved','completed')") },
        { k: 'diligence', label: 'Diligence', n: one("SELECT COUNT(*) n FROM introductions i JOIN deals d ON d.company_id=i.company_id WHERE i.investor_id=? AND i.status IN ('approved','completed') AND d.stage IN ('due_diligence','negotiation','closed_funded')") },
        { k: 'funded', label: 'Funded', n: one("SELECT COUNT(*) n FROM introductions i JOIN deals d ON d.company_id=i.company_id WHERE i.investor_id=? AND i.status IN ('approved','completed') AND d.stage='closed_funded'") },
      ],
    });
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

