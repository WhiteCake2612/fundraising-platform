import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatch } from '../src/services/matching.js';
import { DEFAULT_WEIGHTS } from '../src/lib/constants.js';

const mandate = {
  sectors: '["Fintech"]', business_models: '["SaaS"]', stages: '["seed","series_a"]', excluded_stages: '["growth"]',
  geographies: '["India"]', ticket_min: 250_000, ticket_max: 2_000_000, round_min: 1_000_000, round_max: 10_000_000,
  lead_preference: 'any', requires_revenue: 1, min_revenue: null, requires_profitability: 0,
};
const company = { stage: 'seed', industry: 'Fintech', business_model: 'SaaS', raise_amount: 3_000_000, geography: 'India', revenue: 500_000, seeking_lead: 1 };

test('perfect fit scores 100 with every factor explained', () => {
  const r = scoreMatch(mandate, company, DEFAULT_WEIGHTS);
  assert.equal(r.score, 100);
  assert.equal(r.eligible, true);
  assert.equal(r.factors.length, 6);
  assert.ok(r.factors.every(f => f.detail));
});

test('weights drive partial scores', () => {
  const r = scoreMatch(mandate, { ...company, geography: 'Europe' }, DEFAULT_WEIGHTS);
  assert.equal(r.score, 90);
  assert.equal(r.factors.find(f => f.key === 'geography').status, 'mismatch');
});

test('excluded stage is a hard exclusion regardless of other factors', () => {
  const r = scoreMatch(mandate, { ...company, stage: 'growth' }, DEFAULT_WEIGHTS);
  assert.equal(r.eligible, false);
  assert.equal(r.score, 0);
  assert.match(r.exclusions[0], /excluded/);
});

test('raise below minimum ticket is a hard exclusion', () => {
  const r = scoreMatch(mandate, { ...company, raise_amount: 100_000 }, DEFAULT_WEIGHTS);
  assert.equal(r.eligible, false);
});

test('missing company data lowers confidence and gets partial credit, not zero or full', () => {
  const r = scoreMatch(mandate, { stage: 'seed', industry: 'Fintech', business_model: 'SaaS' }, DEFAULT_WEIGHTS);
  assert.ok(r.missing.includes('Ticket & round size'));
  assert.ok(r.missing.includes('Revenue & traction'));
  assert.equal(r.confidence, 'low');
  assert.ok(r.score > 0 && r.score < 100);
});

test('custom host weights are respected', () => {
  const w = { stage: 0, sector: 0, ticket: 0, geography: 100, traction: 0, other: 0 };
  assert.equal(scoreMatch(mandate, { ...company, geography: 'Europe' }, w).score, 0);
  assert.equal(scoreMatch(mandate, company, w).score, 100);
});

test('peer percentiles compare within the same stage and need at least 3 peers', async () => {
  const { peerStats } = await import('../src/routes/investor.js');
  const mk = (id, stage, growth) => ({ company_id: id, stage, financials: { growth: { value: growth } }, raise: {} });
  const stats = peerStats([mk(1, 'seed', 0.1), mk(2, 'seed', 0.5), mk(3, 'seed', 0.9), mk(4, 'series_a', 5), mk(5, 'series_a', 1)]);
  assert.equal(stats.get(3).growth.pct, 100);
  assert.equal(stats.get(1).growth.pct, 0);
  assert.equal(stats.get(2).growth.pct, 50);
  assert.equal(stats.get(4).growth, undefined, 'only 2 series A peers: no percentile');
});

test('data confidence separates founder-stated from documented figures', async () => {
  const { dataConfidence } = await import('../src/routes/investor.js');
  const c = dataConfidence({
    financials: { revenue: { value: 1, source: 'P&L.xlsx · Sheet1!B2', basis: 'historical' }, runway: { value: 9, source: 'Computed: cash ÷ monthly burn' }, cash: { value: 9, source: 'Bank.pdf' }, burn: { value: 1, source: 'Company profile (founder input)' }, gross_margin: { value: 0.5, period: 'Founder stated', source: 'Company profile (founder input)' } },
    risks: [{ severity: 'high' }, { severity: 'low' }, { origin: 'ai' }], sources: [{}, {}],
  });
  assert.equal(c.level, 'partial');
  assert.equal(c.documented, 1);
  assert.equal(c.founder_stated, 2, 'runway without documented cash and burn counts as founder-stated');
  assert.deepEqual(c.flags, { high: 1, other: 1 });
  assert.equal(c.documents, 2);
});
