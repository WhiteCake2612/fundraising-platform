// Explainable, rules-based mandate-fit scoring. Score = mandate fit, not likelihood of success.
import { STAGE_LABELS } from '../lib/constants.js';
import { isNum } from './finance.js';

const parse = (v) => (Array.isArray(v) ? v : v ? JSON.parse(v) : []);

/**
 * Returns { score, eligible, factors: [{key,label,weight,earned,status,detail}], exclusions: [], missing: [] }
 * status: 'match' | 'partial' | 'mismatch' | 'unknown' | 'no_preference'
 * Factors with unknown company data earn half credit and are listed under `missing` (lower confidence).
 */
export function scoreMatch(mandate, company, weights) {
  const sectors = parse(mandate.sectors), models = parse(mandate.business_models), stages = parse(mandate.stages);
  const excluded = parse(mandate.excluded_stages), geos = parse(mandate.geographies);
  const factors = [], exclusions = [], missing = [];
  const add = (key, label, status, detail) => {
    const w = Number(weights[key]) || 0;
    const credit = { match: 1, no_preference: 1, partial: 0.5, unknown: 0.5, mismatch: 0 }[status];
    factors.push({ key, label, weight: w, earned: w * credit, status, detail });
    if (status === 'unknown') missing.push(label);
  };

  // Stage — hard exclusion when explicitly excluded.
  if (!company.stage) add('stage', 'Funding stage', 'unknown', 'Company has not specified its stage');
  else if (excluded.includes(company.stage)) {
    exclusions.push(`${STAGE_LABELS[company.stage]} is an excluded stage in your mandate`);
    add('stage', 'Funding stage', 'mismatch', `${STAGE_LABELS[company.stage]} is excluded`);
  } else if (!stages.length) add('stage', 'Funding stage', 'no_preference', 'No stage preference set');
  else if (stages.includes(company.stage)) add('stage', 'Funding stage', 'match', `${STAGE_LABELS[company.stage]} is in your target stages`);
  else add('stage', 'Funding stage', 'mismatch', `${STAGE_LABELS[company.stage]} is outside your target stages`);

  // Sector & business model (half weight each).
  const sectorOk = !sectors.length ? null : company.industry ? sectors.includes(company.industry) : undefined;
  const modelOk = !models.length ? null : company.business_model ? models.includes(company.business_model) : undefined;
  if (sectorOk === undefined && modelOk === undefined) add('sector', 'Sector & business model', 'unknown', 'Sector and model not specified');
  else {
    const parts = [sectorOk, modelOk].filter(x => x !== null);
    const hits = parts.filter(x => x === true).length;
    const status = !parts.length ? 'no_preference' : parts.includes(undefined) ? (hits ? 'partial' : 'unknown') : hits === parts.length ? 'match' : hits ? 'partial' : 'mismatch';
    const d = [];
    if (sectorOk !== null) d.push(sectorOk ? `${company.industry} matches` : sectorOk === false ? `${company.industry} not in your sectors` : 'Sector not specified');
    if (modelOk !== null) d.push(modelOk ? `${company.business_model} matches` : modelOk === false ? `${company.business_model} not in your models` : 'Model not specified');
    add('sector', 'Sector & business model', status, d.join('; ') || 'No sector preference set');
  }

  // Ticket vs raise. Hard exclusion if the whole round is smaller than the minimum ticket.
  const raise = company.raise_amount;
  if (!isNum(raise)) add('ticket', 'Ticket & round size', 'unknown', 'Raise amount not specified');
  else {
    const tmin = mandate.ticket_min, tmax = mandate.ticket_max, rmin = mandate.round_min, rmax = mandate.round_max;
    if (isNum(tmin) && raise < tmin) {
      exclusions.push(`Total raise ${fmt(raise)} is below your minimum ticket ${fmt(tmin)}`);
      add('ticket', 'Ticket & round size', 'mismatch', `Raise ${fmt(raise)} < minimum ticket ${fmt(tmin)}`);
    } else {
      const roundOk = (!isNum(rmin) || raise >= rmin) && (!isNum(rmax) || raise <= rmax);
      if (!isNum(rmin) && !isNum(rmax) && !isNum(tmin) && !isNum(tmax)) add('ticket', 'Ticket & round size', 'no_preference', 'No ticket preference set');
      else if (roundOk) add('ticket', 'Ticket & round size', 'match', `Round of ${fmt(raise)} fits your range`);
      else add('ticket', 'Ticket & round size', 'partial', `Round of ${fmt(raise)} is outside your preferred round size`);
    }
  }

  // Geography.
  if (!geos.length || geos.includes('Global')) add('geography', 'Geography', 'no_preference', 'No geographic restriction');
  else if (!company.geography) add('geography', 'Geography', 'unknown', 'Company geography not specified');
  else {
    const cg = company.geography.split(',').map(s => s.trim());
    const hit = cg.some(g => geos.includes(g));
    add('geography', 'Geography', hit ? 'match' : 'mismatch', hit ? `${company.geography} is in your geographies` : `${company.geography} is outside your geographies`);
  }

  // Traction / maturity.
  const rev = company.metrics_revenue ?? company.revenue;
  if (!mandate.requires_revenue && !isNum(mandate.min_revenue) && !mandate.requires_profitability) add('traction', 'Revenue & traction', 'no_preference', 'No traction requirement');
  else if (!isNum(rev)) add('traction', 'Revenue & traction', 'unknown', 'Revenue not disclosed');
  else {
    const fails = [];
    if (mandate.requires_revenue && !(rev > 0)) fails.push('pre-revenue');
    if (isNum(mandate.min_revenue) && rev < mandate.min_revenue) fails.push(`revenue ${fmt(rev)} below ${fmt(mandate.min_revenue)}`);
    if (mandate.requires_profitability) {
      if (!isNum(company.metrics_ebitda)) fails.push('profitability not evidenced');
      else if (company.metrics_ebitda < 0) fails.push('not profitable');
    }
    add('traction', 'Revenue & traction', fails.length ? (fails.length === 1 ? 'partial' : 'mismatch') : 'match', fails.length ? fails.join('; ') : `Revenue ${fmt(rev)} meets your criteria`);
  }

  // Lead / co-invest.
  const lp = mandate.lead_preference;
  if (!lp || lp === 'any') add('other', 'Lead / co-invest', 'no_preference', 'No lead preference');
  else if (company.seeking_lead === null || company.seeking_lead === undefined) add('other', 'Lead / co-invest', 'unknown', 'Company has not said whether it needs a lead');
  else if (lp === 'lead') add('other', 'Lead / co-invest', company.seeking_lead ? 'match' : 'partial', company.seeking_lead ? 'Company is seeking a lead investor' : 'Lead may already be in place');
  else add('other', 'Lead / co-invest', company.seeking_lead ? 'partial' : 'match', company.seeking_lead ? 'Company still needs a lead' : 'Round has a lead; co-invest fits');

  const total = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const raw = Math.round((factors.reduce((s, f) => s + f.earned, 0) / total) * 100);
  const eligible = exclusions.length === 0;
  return { score: eligible ? raw : Math.min(raw, 0), rawScore: raw, eligible, factors, exclusions, missing, confidence: missing.length >= 2 ? 'low' : missing.length ? 'medium' : 'high' };
}

function fmt(v) {
  if (!isNum(v)) return '—';
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`;
}
