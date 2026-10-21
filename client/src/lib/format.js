export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function money(v, currency = 'USD', { compact = true } = {}) {
  if (!isNum(v)) return 'Not disclosed';
  if (!compact) return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
  const abs = Math.abs(v);
  const sym = { USD: '$', EUR: '€', GBP: '£', INR: '₹' }[currency] ?? `${currency} `;
  const s = abs >= 1e9 ? `${(abs / 1e9).toFixed(1)}B` : abs >= 1e6 ? `${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M` : abs >= 1e3 ? `${(abs / 1e3).toFixed(0)}K` : abs.toFixed(0);
  return `${v < 0 ? '−' : ''}${sym}${s}`;
}
export const pct = (v, d = 0) => (isNum(v) ? `${(v * 100).toFixed(d)}%` : 'Not available');
export const months = (v) => (isNum(v) ? `${v.toFixed(1)} mo` : 'Not available');

export function date(s, withTime = false) {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return d.toLocaleString(undefined, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}
export function ago(s) {
  if (!s) return 'never';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  const m = Math.round((Date.now() - d) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
export const human = (k) => (k ? String(k).replace(/_/g, ' ') : '—');
export const STAGE_LABELS = { pre_seed: 'Pre-Seed', seed: 'Seed', series_a: 'Series A', series_b: 'Series B', series_c_plus: 'Series C+', growth: 'Growth' };
export const stageLabel = (k) => STAGE_LABELS[k] || human(k);
export const SEV_CLASS = { critical: 'b-crit', high: 'b-high', medium: 'b-med', low: 'b-low' };
export const ORIGIN = { founder: 'Founder', ai: 'AI-extracted', host: 'Host edited', analysis: 'Platform analysis' };

// Parse a human money input like "2.5m", "750k", "1,200,000".
export function parseMoney(s) {
  if (s === '' || s === null || s === undefined) return null;
  const m = String(s).trim().toLowerCase().replace(/[$,₹€£\s]/g, '').match(/^(-?\d*\.?\d+)(k|m|mn|b|bn|cr)?$/);
  if (!m) return NaN;
  return Number(m[1]) * ({ k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9, cr: 1e7 }[m[2]] || 1);
}
