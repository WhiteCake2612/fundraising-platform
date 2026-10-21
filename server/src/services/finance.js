// Deterministic financial calculations and cross-document reconciliation.
// Nothing here calls an LLM; every number in a finding comes from extracted metrics with provenance.

export const PCT_METRICS = new Set(['gross_margin', 'ebitda_margin', 'revenue_growth', 'ownership_pct']);

export function growth(current, prior) {
  if (!isNum(current) || !isNum(prior) || prior === 0) return null;
  return (current - prior) / Math.abs(prior);
}

export function margin(numerator, revenue) {
  if (!isNum(numerator) || !isNum(revenue) || revenue === 0) return null;
  return numerator / revenue;
}

// Returns months of runway, or null when burn is zero/negative (cash-generative) or inputs are missing.
export function runwayMonths(cash, monthlyBurn) {
  if (!isNum(cash) || !isNum(monthlyBurn) || monthlyBurn <= 0) return null;
  return cash / monthlyBurn;
}

export function ebitdaFromComponents({ revenue, cogs, opex }) {
  if (![revenue, cogs, opex].every(isNum)) return null;
  return revenue - cogs - opex;
}

export function closingCash({ opening, operating, investing = 0, financing = 0 }) {
  if (!isNum(opening) || !isNum(operating)) return null;
  return opening + operating + (investing || 0) + (financing || 0);
}

export function relDiff(a, b) {
  if (!isNum(a) || !isNum(b)) return null;
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) return 0;
  return Math.abs(a - b) / base;
}

export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Tolerance absorbs rounding (e.g. $1.2M in a deck vs $1,184,000 in statements is 1.3%).
const ROUNDING_TOLERANCE = 0.02;

function severityForGap(gap, metric) {
  const material = ['revenue', 'raise_amount', 'cash_balance', 'ebitda', 'net_income'].includes(metric);
  if (gap >= 0.25) return material ? 'critical' : 'high';
  if (gap >= 0.10) return material ? 'high' : 'medium';
  if (gap >= 0.05) return 'medium';
  return 'low';
}

export function fmtValue(value, unit, currency) {
  if (!isNum(value)) return 'Not available';
  if (unit === 'pct') return `${(value * 100).toFixed(1)}%`;
  if (unit === 'months') return `${value.toFixed(1)} months`;
  if (unit === 'currency') {
    const abs = Math.abs(value);
    const s = abs >= 1e9 ? `${(value / 1e9).toFixed(2)}B` : abs >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : abs >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : value.toFixed(0);
    return `${currency || ''} ${s}`.trim();
  }
  return String(value);
}

function src(m) {
  return [m.document_name || (m.basis === 'founder_input' ? 'Company profile (founder input)' : 'Unknown source'), m.source_location].filter(Boolean).join(' · ');
}

const HIST_LIKE = new Set(['historical', 'stated', 'founder_input']);

/**
 * metrics: [{ id, metric, period, value, unit, currency, basis, document_id, document_name, source_location }]
 * context: { company, documents: [{category}] }
 * returns findings with stable fingerprints so re-running is idempotent.
 */
export function reconcile(metrics, context = {}) {
  const findings = [];
  const company = context.company || {};

  // 1. Same metric + period reported differently across sources.
  const groups = new Map();
  for (const m of metrics) {
    if (!HIST_LIKE.has(m.basis) && m.basis !== 'projection') continue;
    const cls = m.basis === 'projection' ? 'projection' : 'actual';
    const key = `${m.metric}|${m.period}|${cls}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  for (const [key, list] of groups) {
    const [metric, period] = key.split('|');
    const bySource = dedupeBySource(list);
    for (let i = 0; i < bySource.length; i++) {
      for (let j = i + 1; j < bySource.length; j++) {
        const a = bySource[i], b = bySource[j];
        if (a.currency && b.currency && a.currency !== b.currency && a.unit === 'currency') {
          findings.push({
            fingerprint: `currency|${metric}|${period}|${a.id}|${b.id}`,
            severity: 'medium', category: 'Currency inconsistency', metric, period, units: `${a.currency} vs ${b.currency}`,
            value_a: fmtValue(a.value, a.unit, a.currency), source_a: src(a),
            value_b: fmtValue(b.value, b.unit, b.currency), source_b: src(b),
            method: 'Compared reported currency for the same metric and period across sources.',
            explanation: 'Figures for the same metric are reported in different currencies; they cannot be compared until the conversion basis is confirmed.',
            question: `Which currency and FX rate should be used for ${metric} (${period || 'unspecified period'})?`,
            confidence: 'inconclusive',
          });
          continue;
        }
        const gap = relDiff(a.value, b.value);
        if (gap === null || gap <= ROUNDING_TOLERANCE) continue;
        findings.push({
          fingerprint: `xdoc|${metric}|${period}|${a.id}|${b.id}`,
          severity: severityForGap(gap, metric),
          category: 'Cross-document discrepancy', metric, period, units: a.unit === 'currency' ? a.currency || company.currency : a.unit,
          value_a: fmtValue(a.value, a.unit, a.currency), source_a: src(a),
          value_b: fmtValue(b.value, b.unit, b.currency), source_b: src(b),
          method: `|A − B| / max(|A|,|B|) = ${(gap * 100).toFixed(1)}% (tolerance ${(ROUNDING_TOLERANCE * 100).toFixed(0)}% for rounding).`,
          explanation: `The same ${label(metric)} for ${period || 'the same period'} differs between sources by ${(gap * 100).toFixed(1)}%. This may reflect adjusted vs reported figures, a different period end, or an outdated document; it requires clarification.`,
          question: `Please explain the difference in ${label(metric)} for ${period || 'this period'} between ${a.document_name || 'source A'} and ${b.document_name || 'source B'}, and confirm which figure is correct.`,
        });
      }
    }
    // Same period labelled both historical and projection.
  }
  const periodsActual = new Set(metrics.filter(m => HIST_LIKE.has(m.basis) && m.metric === 'revenue').map(m => m.period));
  for (const p of metrics.filter(m => m.basis === 'projection' && m.metric === 'revenue')) {
    if (p.period && periodsActual.has(p.period)) {
      const actual = metrics.find(m => HIST_LIKE.has(m.basis) && m.metric === 'revenue' && m.period === p.period);
      const gap = relDiff(actual.value, p.value);
      if (gap !== null && gap > ROUNDING_TOLERANCE) {
        findings.push({
          fingerprint: `hist_vs_proj|${p.period}|${actual.id}|${p.id}`,
          severity: gap >= 0.2 ? 'high' : 'medium', category: 'Historical vs projected', metric: 'revenue', period: p.period, units: p.currency || company.currency,
          value_a: fmtValue(actual.value, 'currency', actual.currency), source_a: src(actual),
          value_b: fmtValue(p.value, 'currency', p.currency), source_b: src(p),
          method: 'Compared reported actual revenue with the model projection for the same period.',
          explanation: `Actual revenue for ${p.period} differs from the projection by ${(gap * 100).toFixed(1)}%. The model may not have been updated for actuals.`,
          question: `Has the financial model been updated for ${p.period} actuals? Please explain the variance.`,
        });
      }
    }
  }

  // 2. Stated growth vs computed growth.
  for (const g of metrics.filter(m => m.metric === 'revenue_growth')) {
    const [prevP, curP] = (g.period || '').split('→').map(s => s?.trim());
    const pick = (p) => metrics.find(m => m.metric === 'revenue' && m.period === p && HIST_LIKE.has(m.basis) && m.document_id !== null);
    const cur = curP && pick(curP), prev = prevP && pick(prevP);
    if (!cur || !prev) continue;
    const computed = growth(cur.value, prev.value);
    if (computed === null) continue;
    const diffPts = Math.abs(computed - g.value);
    if (diffPts > 0.05) {
      findings.push({
        fingerprint: `growth|${g.id}`,
        severity: diffPts > 0.25 ? 'high' : 'medium', category: 'Growth rate does not reconcile', metric: 'revenue_growth', period: g.period, units: '%',
        value_a: fmtValue(g.value, 'pct'), source_a: src(g),
        value_b: fmtValue(computed, 'pct'), source_b: `Computed from ${src(prev)} and ${src(cur)}`,
        method: `(Revenue ${curP} − Revenue ${prevP}) / Revenue ${prevP}`,
        explanation: `The stated growth rate differs from the rate implied by reported revenue by ${(diffPts * 100).toFixed(1)} percentage points.`,
        question: 'How was the stated growth rate calculated (period, annualisation, revenue definition)?',
      });
    }
  }

  // 3. Runway vs cash / burn.
  const latest = (name) => pickLatest(metrics.filter(m => m.metric === name && HIST_LIKE.has(m.basis)));
  const cash = latest('cash_balance'), burn = latest('monthly_burn'), runway = latest('runway_months');
  if (runway && cash && burn) {
    const computed = runwayMonths(cash.value, burn.value);
    if (computed !== null && Math.abs(computed - runway.value) > Math.max(1, runway.value * 0.15)) {
      findings.push({
        fingerprint: `runway|${runway.id}|${cash.id}|${burn.id}`,
        severity: 'medium', category: 'Runway does not reconcile', metric: 'runway_months', period: runway.period, units: 'months',
        value_a: fmtValue(runway.value, 'months'), source_a: src(runway),
        value_b: fmtValue(computed, 'months'), source_b: `Cash ${fmtValue(cash.value, 'currency', cash.currency)} ÷ burn ${fmtValue(burn.value, 'currency', burn.currency)}/month`,
        method: 'Runway = cash balance ÷ net monthly burn',
        explanation: 'Stated runway is inconsistent with the reported cash balance and monthly burn. Runway may assume future revenue or cost changes that are not documented.',
        question: 'What assumptions underlie the stated runway (e.g. planned hiring, revenue growth, committed funding)?',
      });
    }
  }

  // 4. EBITDA vs components, per period.
  const periods = new Set(metrics.filter(m => m.metric === 'ebitda').map(m => m.period));
  for (const p of periods) {
    const get = (n) => metrics.find(m => m.metric === n && m.period === p);
    const e = get('ebitda'), r = get('revenue'), c = get('cogs'), o = get('opex');
    if (!e || !r || !c || !o) continue;
    const computed = ebitdaFromComponents({ revenue: r.value, cogs: c.value, opex: o.value });
    const gap = relDiff(e.value, computed);
    if (gap !== null && Math.abs(e.value - computed) > Math.max(1, Math.abs(r.value) * 0.01)) {
      findings.push({
        fingerprint: `ebitda|${p}|${e.id}`,
        severity: gap > 0.25 ? 'high' : 'medium', category: 'EBITDA does not reconcile', metric: 'ebitda', period: p, units: e.currency || company.currency,
        value_a: fmtValue(e.value, 'currency', e.currency), source_a: src(e),
        value_b: fmtValue(computed, 'currency', e.currency), source_b: 'Computed: revenue − COGS − operating expenses',
        method: 'EBITDA = Revenue − COGS − Operating expenses (excl. D&A)',
        explanation: 'Reported EBITDA does not equal revenue less cost of sales and operating expenses. The difference may be adjustments (e.g. one-offs, stock compensation) that should be disclosed.',
        question: `Please provide the EBITDA bridge for ${p}, including any adjustments.`,
      });
    }
  }

  // 5. Cash roll-forward.
  const cf = new Set(metrics.filter(m => m.metric === 'closing_cash').map(m => m.period));
  for (const p of cf) {
    const get = (n) => metrics.find(m => m.metric === n && m.period === p);
    const close = get('closing_cash'), open = get('opening_cash'), op = get('operating_cash_flow');
    if (!close || !open || !op) continue;
    const computed = closingCash({ opening: open.value, operating: op.value, investing: get('investing_cash_flow')?.value, financing: get('financing_cash_flow')?.value });
    if (Math.abs(computed - close.value) > Math.max(1, Math.abs(close.value) * 0.01)) {
      findings.push({
        fingerprint: `cashflow|${p}|${close.id}`,
        severity: 'high', category: 'Cash flow does not reconcile', metric: 'closing_cash', period: p, units: close.currency || company.currency,
        value_a: fmtValue(close.value, 'currency', close.currency), source_a: src(close),
        value_b: fmtValue(computed, 'currency', close.currency), source_b: 'Computed: opening cash + operating + investing + financing cash flows',
        method: 'Closing cash = opening cash + CFO + CFI + CFF',
        explanation: 'The closing cash balance does not reconcile with the cash-flow statement components.',
        question: `Please reconcile closing cash for ${p} with the cash-flow statement.`,
      });
    }
  }

  // 6. Gross margin swing between consecutive historical periods.
  const gm = metrics.filter(m => m.metric === 'gross_margin' && HIST_LIKE.has(m.basis) && m.period).sort((a, b) => a.period.localeCompare(b.period));
  for (let i = 1; i < gm.length; i++) {
    if (gm[i].period === gm[i - 1].period) continue;
    const swing = Math.abs(gm[i].value - gm[i - 1].value);
    if (swing >= 0.15) {
      findings.push({
        fingerprint: `gm_swing|${gm[i - 1].id}|${gm[i].id}`,
        severity: 'low', category: 'Unexplained margin change', metric: 'gross_margin', period: `${gm[i - 1].period} → ${gm[i].period}`, units: '%',
        value_a: fmtValue(gm[i - 1].value, 'pct'), source_a: src(gm[i - 1]),
        value_b: fmtValue(gm[i].value, 'pct'), source_b: src(gm[i]),
        method: 'Absolute change in gross margin between consecutive periods ≥ 15 percentage points.',
        explanation: 'Gross margin moved materially between periods. This can be legitimate (mix, pricing, scale) but should be explained.',
        question: 'What drove the change in gross margin between these periods?',
      });
    }
  }

  // 7. Cap table must sum to ~100%.
  const cap = metrics.filter(m => m.metric === 'ownership_pct');
  const byDoc = groupBy(cap, m => m.document_id);
  for (const [docId, rows] of byDoc) {
    const total = rows.reduce((s, m) => s + m.value, 0);
    if (Math.abs(total - 1) > 0.005) {
      findings.push({
        fingerprint: `captable|${docId}`,
        severity: 'high', category: 'Cap table does not reconcile', metric: 'ownership_pct', period: '', units: '%',
        value_a: fmtValue(total, 'pct'), source_a: rows[0].document_name || 'Cap table',
        value_b: '100.0%', source_b: 'Expected fully diluted total',
        method: 'Sum of ownership percentages across all listed holders.',
        explanation: 'Ownership percentages do not add up to 100%. There may be missing holders, an unallocated option pool, or rounding.',
        question: 'Please provide a fully diluted cap table including the option pool and any convertible instruments.',
      });
    }
  }

  // 8. Raise amount: profile vs documents.
  if (isNum(company.raise_amount)) {
    for (const m of metrics.filter(x => x.metric === 'raise_amount' && x.document_id)) {
      const gap = relDiff(company.raise_amount, m.value);
      if (gap > ROUNDING_TOLERANCE) {
        findings.push({
          fingerprint: `raise|${m.id}|${company.raise_amount}`,
          severity: severityForGap(gap, 'raise_amount'), category: 'Fundraising amount inconsistent', metric: 'raise_amount', period: 'Current round', units: company.currency,
          value_a: fmtValue(company.raise_amount, 'currency', company.currency), source_a: 'Company profile (founder input)',
          value_b: fmtValue(m.value, 'currency', m.currency), source_b: src(m),
          method: 'Compared the amount being raised in the profile with uploaded materials.',
          explanation: 'The amount being raised differs between the company profile and supporting documents.',
          question: 'Please confirm the target raise for this round.',
        });
      }
    }
  }

  // 9. Missing information.
  const cats = new Set((context.documents || []).map(d => d.category));
  const hasFinancials = ['financial_statements', 'profit_and_loss', 'balance_sheet', 'cash_flow'].some(c => cats.has(c));
  if ((context.documents || []).length && !hasFinancials) {
    findings.push(missing('missing|financials', 'medium', 'Historical financial statements', 'No historical financial statements (P&L, balance sheet or cash flow) have been uploaded, so reported figures cannot be verified.', 'Please upload historical financial statements (management accounts are acceptable if not audited).'));
  }
  if ((context.documents || []).length && !cats.has('cap_table') && ['series_a', 'series_b', 'series_c_plus', 'growth'].includes(company.stage)) {
    findings.push(missing('missing|captable', 'medium', 'Cap table', 'No cap table has been uploaded.', 'Please upload a current fully diluted cap table.'));
  }
  if (!isNum(company.raise_amount)) findings.push(missing('missing|raise', 'high', 'Amount being raised', 'The target raise is not specified.', 'How much are you raising in this round?'));
  if (!company.use_of_funds) findings.push(missing('missing|uof', 'low', 'Use of proceeds', 'The intended use of proceeds is not specified.', 'How will the proceeds of this round be allocated?'));

  return findings;
}

function missing(fingerprint, severity, metric, explanation, question) {
  return { fingerprint, severity, category: 'Missing information', metric, period: '', units: '', value_a: 'Not provided', source_a: '', value_b: '', source_b: '', method: 'Checklist of required information for the stated funding stage.', explanation, question, confidence: 'verified' };
}

function dedupeBySource(list) {
  const seen = new Map();
  for (const m of list) {
    const k = `${m.document_id ?? 'profile'}|${m.basis}`;
    if (!seen.has(k)) seen.set(k, m);
  }
  return [...seen.values()];
}

function pickLatest(list) {
  if (!list.length) return null;
  return [...list].sort((a, b) => (b.period || '').localeCompare(a.period || '') || (b.id - a.id))[0];
}

function groupBy(list, fn) {
  const m = new Map();
  for (const x of list) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}

const LABELS = { revenue: 'revenue', ebitda: 'EBITDA', gross_margin: 'gross margin', cash_balance: 'cash balance', monthly_burn: 'monthly burn', raise_amount: 'raise amount', net_income: 'net income', cogs: 'cost of sales', opex: 'operating expenses' };
export function label(metric) { return LABELS[metric] || metric.replace(/_/g, ' '); }

// Summary metrics for teaser/cards, computed only from what exists.
export function summarize(metrics, company) {
  const actual = metrics.filter(m => HIST_LIKE.has(m.basis));
  const rev = actual.filter(m => m.metric === 'revenue' && m.period).sort((a, b) => b.period.localeCompare(a.period));
  const latestRev = rev[0] || null;
  const priorRev = rev.find(m => m.period !== latestRev?.period) || null;
  const out = {
    revenue: latestRev ? { value: latestRev.value, period: latestRev.period, source: src(latestRev), basis: latestRev.basis } : (isNum(company.revenue) ? { value: company.revenue, period: 'Latest (founder stated)', source: 'Company profile (founder input)', basis: 'founder_input' } : null),
    growth: null, gross_margin: null, ebitda_margin: null, burn: null, runway: null, cash: null,
  };
  if (latestRev && priorRev) {
    out.growth = { value: growth(latestRev.value, priorRev.value), period: `${priorRev.period} → ${latestRev.period}`, source: 'Computed from reported revenue' };
  } else if (isNum(company.revenue) && isNum(company.revenue_prior)) {
    out.growth = { value: growth(company.revenue, company.revenue_prior), period: 'YoY (founder stated)', source: 'Computed from founder-stated revenue' };
  }
  const gm = actual.find(m => m.metric === 'gross_margin' && m.period === latestRev?.period) ||
    (latestRev && actual.find(m => m.metric === 'gross_profit' && m.period === latestRev.period));
  const cogs = latestRev && actual.find(m => m.metric === 'cogs' && m.period === latestRev.period);
  if (gm) out.gross_margin = { value: gm.metric === 'gross_profit' ? margin(gm.value, latestRev.value) : gm.value, period: gm.period, source: src(gm) };
  else if (cogs) out.gross_margin = { value: margin(latestRev.value - cogs.value, latestRev.value), period: cogs.period, source: 'Computed: (revenue − cost of sales) ÷ revenue' };
  else if (isNum(company.gross_margin)) out.gross_margin = { value: company.gross_margin, period: 'Founder stated', source: 'Company profile (founder input)' };
  const eb = latestRev && actual.find(m => m.metric === 'ebitda' && m.period === latestRev.period);
  if (eb) out.ebitda_margin = { value: margin(eb.value, latestRev.value), period: eb.period, source: src(eb) };
  const cash = pickLatest(actual.filter(m => m.metric === 'cash_balance'));
  const burn = pickLatest(actual.filter(m => m.metric === 'monthly_burn'));
  const cashV = cash?.value ?? company.cash_balance, burnV = burn?.value ?? company.monthly_burn;
  if (isNum(cashV)) out.cash = { value: cashV, source: cash ? src(cash) : 'Company profile (founder input)' };
  if (isNum(burnV)) out.burn = { value: burnV, source: burn ? src(burn) : 'Company profile (founder input)' };
  const rw = runwayMonths(cashV, burnV);
  if (rw !== null) out.runway = { value: rw, source: 'Computed: cash ÷ monthly burn' };
  return out;
}
