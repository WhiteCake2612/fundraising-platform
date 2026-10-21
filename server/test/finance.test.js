import { test } from 'node:test';
import assert from 'node:assert/strict';
import { growth, margin, runwayMonths, ebitdaFromComponents, closingCash, relDiff, reconcile, summarize } from '../src/services/finance.js';
import { parsePeriod, canonicalMetric, parseSpreadsheet } from '../src/services/extraction.js';
import XLSX from 'xlsx';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('basic formulas on known examples', () => {
  near(growth(1_500_000, 1_000_000), 0.5);
  near(growth(800, 1000), -0.2);
  assert.equal(growth(100, 0), null);
  assert.equal(growth(100, undefined), null);
  near(margin(600, 1000), 0.6);
  near(runwayMonths(1_200_000, 100_000), 12);
  assert.equal(runwayMonths(1_000_000, 0), null, 'no burn → runway undefined, not infinite or zero');
  assert.equal(runwayMonths(1_000_000, -5000), null);
  assert.equal(ebitdaFromComponents({ revenue: 1000, cogs: 400, opex: 450 }), 150);
  assert.equal(ebitdaFromComponents({ revenue: 1000, cogs: 400 }), null, 'missing components are never treated as zero');
  assert.equal(closingCash({ opening: 500, operating: -200, investing: -50, financing: 1000 }), 1250);
  near(relDiff(100, 98), 0.02);
});

const doc = (id, name) => ({ document_id: id, document_name: name });
test('cross-document revenue discrepancy is flagged with both sources and severity', () => {
  const metrics = [
    { id: 1, metric: 'revenue', period: 'FY2024', value: 2_400_000, unit: 'currency', currency: 'USD', basis: 'stated', ...doc(10, 'deck.pdf'), source_location: 'Page 6' },
    { id: 2, metric: 'revenue', period: 'FY2024', value: 1_800_000, unit: 'currency', currency: 'USD', basis: 'historical', ...doc(11, 'pl.xlsx'), source_location: 'Sheet "P&L" C4' },
  ];
  const f = reconcile(metrics, { company: { raise_amount: 1, use_of_funds: 'x' }, documents: [] }).filter(x => x.category === 'Cross-document discrepancy');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'critical'); // 25% gap on revenue
  assert.match(f[0].source_a, /deck\.pdf · Page 6/);
  assert.match(f[0].source_b, /pl\.xlsx · Sheet "P&L" C4/);
  assert.doesNotMatch(f[0].explanation, /fraud/i);
});

test('rounding differences within tolerance are not flagged', () => {
  const metrics = [
    { id: 1, metric: 'revenue', period: 'FY2024', value: 1_200_000, unit: 'currency', currency: 'USD', basis: 'stated', ...doc(10, 'deck') },
    { id: 2, metric: 'revenue', period: 'FY2024', value: 1_184_000, unit: 'currency', currency: 'USD', basis: 'historical', ...doc(11, 'pl') },
  ];
  assert.equal(reconcile(metrics, { company: { raise_amount: 1, use_of_funds: 'x' } }).length, 0);
});

test('currency mismatch is inconclusive, not a numeric discrepancy', () => {
  const metrics = [
    { id: 1, metric: 'revenue', period: 'FY2024', value: 100, unit: 'currency', currency: 'USD', basis: 'historical', ...doc(1, 'a') },
    { id: 2, metric: 'revenue', period: 'FY2024', value: 8300, unit: 'currency', currency: 'INR', basis: 'historical', ...doc(2, 'b') },
  ];
  const f = reconcile(metrics, { company: { raise_amount: 1, use_of_funds: 'x' } });
  assert.equal(f.length, 1);
  assert.equal(f[0].category, 'Currency inconsistency');
  assert.equal(f[0].confidence, 'inconclusive');
});

test('stated growth, runway, EBITDA, cash flow and cap table reconciliations', () => {
  const base = { unit: 'currency', currency: 'USD', basis: 'historical', ...doc(5, 'fin.xlsx') };
  const metrics = [
    { id: 1, metric: 'revenue', period: 'FY2023', value: 1000, ...base },
    { id: 2, metric: 'revenue', period: 'FY2024', value: 1500, ...base },
    { id: 3, metric: 'revenue_growth', period: 'FY2023 → FY2024', value: 1.2, unit: 'pct', basis: 'stated', ...doc(6, 'deck') },
    { id: 4, metric: 'cash_balance', period: 'FY2024', value: 600_000, ...base },
    { id: 5, metric: 'monthly_burn', period: 'FY2024', value: 50_000, ...base },
    { id: 6, metric: 'runway_months', period: 'FY2024', value: 24, unit: 'months', basis: 'stated', ...doc(6, 'deck') },
    { id: 7, metric: 'ebitda', period: 'FY2024', value: 300, ...base },
    { id: 8, metric: 'cogs', period: 'FY2024', value: 500, ...base },
    { id: 9, metric: 'opex', period: 'FY2024', value: 900, ...base },
    { id: 10, metric: 'opening_cash', period: 'FY2024', value: 1000, ...base },
    { id: 11, metric: 'operating_cash_flow', period: 'FY2024', value: -400, ...base },
    { id: 12, metric: 'financing_cash_flow', period: 'FY2024', value: 0, ...base },
    { id: 13, metric: 'closing_cash', period: 'FY2024', value: 900, ...base },
    { id: 14, metric: 'ownership_pct', period: 'Founder A', value: 0.6, unit: 'pct', basis: 'historical', ...doc(7, 'cap.xlsx') },
    { id: 15, metric: 'ownership_pct', period: 'Seed Fund', value: 0.3, unit: 'pct', basis: 'historical', ...doc(7, 'cap.xlsx') },
  ];
  const cats = reconcile(metrics, { company: { raise_amount: 1, use_of_funds: 'x' } }).map(f => f.category);
  assert.ok(cats.includes('Growth rate does not reconcile'), 'stated 120% vs computed 50%');
  assert.ok(cats.includes('Runway does not reconcile'), 'stated 24 vs computed 12 months');
  assert.ok(cats.includes('EBITDA does not reconcile'), '300 vs 1500-500-900=100');
  assert.ok(cats.includes('Cash flow does not reconcile'), '900 vs 600');
  assert.ok(cats.includes('Cap table does not reconcile'), '90% total');
});

test('missing information is reported, not filled with zeros', () => {
  const f = reconcile([], { company: { stage: 'series_a' }, documents: [{ category: 'pitch_deck' }] });
  const metricsMissing = f.map(x => x.metric);
  assert.ok(metricsMissing.includes('Historical financial statements'));
  assert.ok(metricsMissing.includes('Cap table'));
  assert.ok(metricsMissing.includes('Amount being raised'));
  const s = summarize([], { currency: 'USD' });
  assert.equal(s.revenue, null);
  assert.equal(s.runway, null);
});

test('reconcile is deterministic (stable fingerprints for idempotent upserts)', () => {
  const m = [
    { id: 1, metric: 'revenue', period: 'FY2024', value: 2, unit: 'currency', currency: 'USD', basis: 'stated', ...doc(1, 'a') },
    { id: 2, metric: 'revenue', period: 'FY2024', value: 1, unit: 'currency', currency: 'USD', basis: 'historical', ...doc(2, 'b') },
  ];
  const a = reconcile(m, { company: {} }).map(f => f.fingerprint);
  const b = reconcile(m, { company: {} }).map(f => f.fingerprint);
  assert.deepEqual(a, b);
});

test('period and label parsing', () => {
  assert.deepEqual(parsePeriod('FY2024'), { period: 'FY2024', projection: false });
  assert.deepEqual(parsePeriod('2026E'), { period: '2026', projection: true });
  assert.deepEqual(parsePeriod('2025 (Forecast)'), { period: '2025', projection: true });
  assert.equal(parsePeriod('Revenue'), null);
  assert.equal(canonicalMetric('Total Revenue'), 'revenue');
  assert.equal(canonicalMetric('Cost of Goods Sold'), 'cogs');
  assert.equal(canonicalMetric('Adjusted EBITDA'), 'ebitda');
  assert.equal(canonicalMetric('Marketing'), null);
});

test('spreadsheet parser extracts periods, projections and cell provenance', () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['USD', 'FY2023', 'FY2024', '2026E'],
    ['Revenue', 1000000, 1500000, 4000000],
    ['Gross margin %', 55, 62, 70],
    ['Marketing', 1, 2, 3],
  ]), 'P&L');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const { metrics } = parseSpreadsheet(buf, { category: 'financial_model', currency: 'USD' });
  const rev24 = metrics.find(m => m.metric === 'revenue' && m.period === 'FY2024');
  assert.equal(rev24.value, 1_500_000);
  assert.equal(rev24.basis, 'historical');
  assert.equal(rev24.source_location, 'Sheet "P&L" C2');
  assert.equal(metrics.find(m => m.metric === 'revenue' && m.period === '2026').basis, 'projection');
  near(metrics.find(m => m.metric === 'gross_margin' && m.period === 'FY2024').value, 0.62);
  assert.ok(!metrics.some(m => m.metric === null));
});
