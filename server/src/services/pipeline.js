// Background processing: document extraction → AI enrichment → reconciliation → teaser.
// Every step is idempotent (keyed by document hash / fingerprints) and safe to retry.
import path from 'node:path';
import { tx, getSetting } from '../db.js';
import { activity, notifyHosts, notify, jparse } from '../lib/core.js';
import { extractDocument } from './extraction.js';
import { reconcile, summarize } from './finance.js';
import { completeJson, llmConfig, ExtractionSchema, EXTRACTION_SYSTEM, LlmNotConfigured } from './llm.js';

export function createPipeline({ db, uploadDir, env = process.env, inline = false }) {
  const pending = new Set();
  const schedule = (fn) => {
    if (inline) return fn();
    const p = Promise.resolve().then(fn).catch(e => console.error('[pipeline]', e.message)).finally(() => pending.delete(p));
    pending.add(p);
    return p;
  };

  function insertMetrics(companyId, documentId, extractor, list) {
    const del = db.prepare('DELETE FROM metrics WHERE document_id = ? AND extractor = ?');
    const ins = db.prepare('INSERT INTO metrics(company_id, document_id, metric, period, value, unit, currency, basis, source_location, extractor) VALUES (?,?,?,?,?,?,?,?,?,?)');
    tx(db, () => {
      del.run(documentId, extractor);
      for (const m of list) ins.run(companyId, documentId, m.metric, m.period || '', m.value, m.unit || 'currency', m.currency ?? null, m.basis, [m.source_location, m.quote ? `“${m.quote}”` : null].filter(Boolean).join(' · ') || null, extractor);
    });
  }

  async function processDocument(documentId) {
    const doc = db.prepare('SELECT d.*, c.currency, c.id AS cid FROM documents d JOIN companies c ON c.id = d.company_id WHERE d.id = ?').get(documentId);
    if (!doc) return;
    db.prepare("UPDATE documents SET status='processing', status_detail=NULL WHERE id=?").run(documentId);
    advanceStage(doc.cid, 'ai_processing', null, 'Document processing started');
    let extracted;
    try {
      extracted = await extractDocument(path.join(uploadDir, doc.stored_name), { filename: doc.filename, category: doc.category, currency: doc.currency });
    } catch (e) {
      db.prepare("UPDATE documents SET status='failed', status_detail=?, processed_at=datetime('now') WHERE id=?").run(`Could not read file: ${e.message}`, documentId);
      activity(db, doc.cid, null, 'document_failed', `Processing failed for ${doc.filename}`, true);
      return;
    }
    insertMetrics(doc.cid, documentId, 'parser', extracted.metrics);
    db.prepare('UPDATE documents SET text_excerpt=? WHERE id=?').run(extracted.text.slice(0, 60_000), documentId);

    const ai = await aiExtract(doc, extracted);
    let status = 'processed', detail = `${extracted.metrics.length} figure(s) parsed directly from the file.`;
    if (extracted.needsOcr && ai.status !== 'succeeded') { status = 'needs_ai'; detail = 'Scanned/image document: OCR or AI extraction is required but not available. ' + (ai.error || ''); }
    else if (ai.status === 'succeeded') detail += ` AI extracted ${ai.count} additional figure(s).`;
    else if (ai.status === 'not_configured') detail += ' AI extraction not run: ' + ai.error;
    else if (ai.status === 'failed') { status = 'needs_ai'; detail += ' AI extraction failed: ' + ai.error + ' (retry available).'; }
    db.prepare("UPDATE documents SET status=?, status_detail=?, processed_at=datetime('now') WHERE id=?").run(status, detail, documentId);
    activity(db, doc.cid, null, 'document_processed', `${doc.filename}: ${detail}`, true);
    runAnalysis(doc.cid);
  }

  async function aiExtract(doc, extracted) {
    const cfg = llmConfig(env);
    const key = `extract:${doc.id}:${doc.sha256}`;
    const existing = db.prepare('SELECT * FROM ai_jobs WHERE idempotency_key=?').get(key);
    if (existing?.status === 'succeeded') return { status: 'succeeded', count: jparse(existing.result, {}).metrics?.length || 0 };
    if (!existing) db.prepare('INSERT INTO ai_jobs(company_id, document_id, kind, idempotency_key) VALUES (?,?,?,?)').run(doc.cid, doc.id, 'extract', key);
    const setJob = (status, error, result) => db.prepare("UPDATE ai_jobs SET status=?, error=?, result=?, attempts=attempts+1, updated_at=datetime('now') WHERE idempotency_key=?").run(status, error ?? null, result ? JSON.stringify(result) : null, key);

    if (!cfg.configured) { setJob('not_configured', 'No LLM provider configured.'); return { status: 'not_configured', error: 'No LLM provider configured.' }; }
    if (!cfg.allowDocumentText) { setJob('not_configured', 'Sending confidential document text to the LLM is disabled (LLM_ALLOW_DOCUMENT_TEXT is not true).'); return { status: 'not_configured', error: 'Document text sharing with the LLM provider is not authorised.' }; }
    if (!extracted.text.trim()) { setJob('failed', 'No machine-readable text (OCR provider not configured).'); return { status: 'failed', error: 'No machine-readable text.' }; }
    db.prepare("UPDATE ai_jobs SET status='running' WHERE idempotency_key=?").run(key);
    try {
      const out = await completeJson({ system: EXTRACTION_SYSTEM, user: `Document category: ${doc.category}\nFile: ${doc.filename}\nReporting currency (default): ${doc.currency}\n\n${redact(extracted.text).slice(0, 40_000)}`, schema: ExtractionSchema, env });
      insertMetrics(doc.cid, doc.id, 'llm', out.metrics.map(m => ({ ...m, currency: m.unit === 'currency' ? (m.currency || doc.currency) : null })));
      setJob('succeeded', null, out);
      return { status: 'succeeded', count: out.metrics.length };
    } catch (e) {
      setJob(e instanceof LlmNotConfigured ? 'not_configured' : 'failed', e.message);
      return { status: 'failed', error: e.message };
    }
  }

  // Data minimisation before text leaves the server.
  function redact(text) {
    return text.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/\+?\d[\d\s().-]{8,}\d/g, (m) => (/\d{4}/.test(m) && m.replace(/\D/g, '').length >= 10 ? '[phone]' : m));
  }

  function loadMetrics(companyId) {
    return db.prepare('SELECT m.*, d.filename AS document_name FROM metrics m LEFT JOIN documents d ON d.id = m.document_id WHERE m.company_id = ? ORDER BY m.id').all(companyId);
  }

  function founderMetrics(company) {
    // Profile figures participate in reconciliation as founder input.
    const out = [];
    const push = (metric, value, unit = 'currency') => { if (typeof value === 'number') out.push({ id: `p_${metric}`, metric, period: '', value, unit, currency: company.currency, basis: 'founder_input', document_id: null, document_name: null }); };
    push('cash_balance', company.cash_balance); push('monthly_burn', company.monthly_burn); push('runway_months', company.runway_months, 'months');
    return out;
  }

  function runAnalysis(companyId) {
    const company = db.prepare('SELECT * FROM companies WHERE id=?').get(companyId);
    if (!company) return [];
    const documents = db.prepare('SELECT id, category FROM documents WHERE company_id=?').all(companyId);
    const metrics = [...loadMetrics(companyId), ...founderMetrics(company)];
    const found = reconcile(metrics, { company, documents });
    const upsert = db.prepare(`INSERT INTO findings(company_id, fingerprint, severity, category, metric, value_a, source_a, value_b, source_b, period, units, method, explanation, question, confidence)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(company_id, fingerprint) DO UPDATE SET severity=excluded.severity, value_a=excluded.value_a, value_b=excluded.value_b, source_a=excluded.source_a, source_b=excluded.source_b, explanation=excluded.explanation, updated_at=datetime('now')`);
    const fps = new Set(found.map(f => f.fingerprint));
    tx(db, () => {
      for (const f of found) upsert.run(companyId, f.fingerprint, f.severity, f.category, f.metric ?? null, f.value_a ?? null, f.source_a ?? null, f.value_b ?? null, f.source_b ?? null, f.period ?? null, f.units ?? null, f.method, f.explanation, f.question ?? null, f.confidence || 'verified');
      // Findings no longer produced by the data (e.g. corrected document) are auto-resolved, with history.
      for (const old of db.prepare("SELECT id, fingerprint, status FROM findings WHERE company_id=? AND status IN ('open','under_review')").all(companyId)) {
        if (!fps.has(old.fingerprint)) {
          db.prepare("UPDATE findings SET status='resolved', updated_at=datetime('now') WHERE id=?").run(old.id);
          db.prepare('INSERT INTO finding_history(finding_id, from_status, to_status, note) VALUES (?,?,?,?)').run(old.id, old.status, 'resolved', 'No longer detected after re-analysis');
        }
      }
    });
    const openCount = db.prepare("SELECT COUNT(*) n FROM findings WHERE company_id=? AND status='open' AND severity IN ('critical','high')").get(companyId).n;
    if (openCount > 0) advanceStage(companyId, 'awaiting_clarification', null, `${openCount} high-severity finding(s) need founder clarification`);
    else advanceStage(companyId, 'screening', null, 'Analysis complete');
    return found;
  }

  function buildTeaserContent(companyId) {
    const c = db.prepare('SELECT * FROM companies WHERE id=?').get(companyId);
    const metrics = loadMetrics(companyId);
    const s = summarize(metrics, c);
    const aiJobs = db.prepare("SELECT result FROM ai_jobs WHERE company_id=? AND kind='extract' AND status='succeeded' ORDER BY id DESC").all(companyId).map(j => jparse(j.result, {}));
    const aiField = (k) => aiJobs.map(j => j.company?.[k]).find(Boolean);
    const field = (k) => c[k] ? { text: c[k], origin: 'founder' } : aiField(k) ? { text: aiField(k), origin: 'ai' } : null;
    const findings = db.prepare("SELECT * FROM findings WHERE company_id=? AND status IN ('open','under_review') ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 4").all(companyId);
    const docs = db.prepare('SELECT filename, category, created_at, version FROM documents WHERE company_id=? ORDER BY created_at').all(companyId);
    const highlights = [...new Set(aiJobs.flatMap(j => j.highlights || []))].slice(0, 4);
    return {
      name: c.brand_name || c.legal_name, code: c.code,
      industry: c.industry, sub_industry: c.sub_industry, business_model: c.business_model, stage: c.stage,
      headquarters: c.headquarters, geography: c.geography, founding_year: c.founding_year,
      overview: field('description'), problem: field('problem'), solution: field('solution'),
      market: field('market'), differentiation: field('differentiation'), traction: field('traction'),
      revenue_model: c.business_model ? { text: c.business_model, origin: 'founder' } : null,
      financials: s, currency: c.currency,
      raise: { amount: c.raise_amount, round_size: c.round_size, use_of_funds: field('use_of_funds'), seeking_lead: c.seeking_lead },
      highlights: highlights.map(h => ({ text: h, origin: 'ai' })),
      risks: [
        ...findings.map(f => ({ text: `${f.category}${f.metric ? ` (${f.metric})` : ''}: requires clarification`, origin: 'analysis', severity: f.severity })),
        ...[...new Set(aiJobs.flatMap(j => j.risks || []))].slice(0, 2).map(r => ({ text: r, origin: 'ai' })),
      ],
      sources: docs.map(d => ({ filename: d.filename, category: d.category, uploaded: d.created_at, version: d.version })),
      generated_at: new Date().toISOString(),
    };
  }

  function generateTeaser(companyId, actorId) {
    const content = buildTeaserContent(companyId);
    return tx(db, () => {
      const next = (db.prepare('SELECT MAX(version) v FROM teasers WHERE company_id=?').get(companyId).v || 0) + 1;
      db.prepare("UPDATE teasers SET status='superseded' WHERE company_id=? AND status IN ('draft','pending_approval','rejected')").run(companyId);
      const r = db.prepare('INSERT INTO teasers(company_id, version, content, status, generated_by, created_by) VALUES (?,?,?,?,?,?)')
        .run(companyId, next, JSON.stringify(content), 'draft', llmConfig(env).configured ? 'template+ai' : 'template', actorId ?? null);
      activity(db, companyId, actorId, 'teaser_generated', `Teaser v${next} generated`, true);
      return Number(r.lastInsertRowid);
    });
  }

  // Automatic (system) transitions. Anything not listed requires a host decision;
  // host-controlled states such as on hold / closed are never changed automatically.
  const AUTO = {
    registered: ['profile_incomplete', 'documents_received', 'ai_processing'],
    profile_incomplete: ['documents_received', 'ai_processing'],
    documents_received: ['ai_processing'],
    ai_processing: ['screening', 'awaiting_clarification'],
    awaiting_clarification: ['ai_processing', 'screening'],
    screening: ['ai_processing', 'awaiting_clarification', 'teaser_pending'],
    discovery: ['interest_received'],
    interest_received: ['intro_pending'],
    intro_pending: ['intro_completed'],
  };
  function advanceStage(companyId, stage, actorId, reason) {
    const deal = db.prepare('SELECT stage FROM deals WHERE company_id=?').get(companyId);
    if (!deal || deal.stage === stage || !(AUTO[deal.stage] || []).includes(stage)) return;
    setStage(companyId, stage, actorId, reason, { system: true });
  }

  function setStage(companyId, stage, actorId, reason, { system = false } = {}) {
    const stages = getSetting(db, 'pipeline_stages');
    if (!stages.some(s => s.key === stage)) throw new Error(`Unknown stage ${stage}`);
    const deal = db.prepare('SELECT stage FROM deals WHERE company_id=?').get(companyId);
    tx(db, () => {
      db.prepare("UPDATE deals SET stage=?, updated_at=datetime('now'), closed_at = CASE WHEN ? IN ('closed_funded','closed_lost') THEN datetime('now') ELSE closed_at END WHERE company_id=?").run(stage, stage, companyId);
      const lbl = (k) => stages.find(s => s.key === k)?.label || k;
      activity(db, companyId, actorId, 'stage_change', `Stage: ${lbl(deal?.stage)} → ${lbl(stage)}${reason ? ` (${reason})` : ''}${system ? ' [automatic]' : ''}`, true);
    });
  }

  return {
    pending,
    whenIdle: () => Promise.all([...pending]),
    processDocument: (id) => schedule(() => processDocument(id)),
    runAnalysis, generateTeaser, buildTeaserContent, setStage, advanceStage, loadMetrics,
    notifyHosts: (...a) => notifyHosts(db, ...a), notify: (...a) => notify(db, ...a),
  };
}
