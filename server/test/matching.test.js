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
