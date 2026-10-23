import { useMemo, useRef, useState } from 'react';
import { money, pct, stageLabel } from '../lib/format.js';
import { Icon } from './icons.jsx';

// One colour per investor decision, used by every chart (validated for CVD on the dark surface).
export const DECISION = {
  interested: { label: 'Interested', color: '#3987e5' },
  saved: { label: 'Saved', color: '#d95926' },
  passed: { label: 'Passed', color: '#199e70' },
  deck: { label: 'Not reviewed', color: '#5b6168' },
};
export const SERIES = ['#3987e5', '#d95926', '#199e70'];

export const FIT_AXES = { stage: 'Stage', sector: 'Sector', ticket: 'Ticket', geography: 'Geography', traction: 'Traction', other: 'Lead' };
const ratio = (f) => (f.weight ? f.earned / f.weight : 0);

// Small hover tooltip anchored inside a relatively-positioned chart container.
export function useTip() {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const show = (e, content) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, content });
  };
  const node = tip && (
    <div className="viz-tip" role="tooltip" style={{ left: Math.min(tip.x + 14, tip.w - 190), top: tip.y + 14 }}>{tip.content}</div>
  );
  return { ref, show, hide: () => setTip(null), node };
}

export function Legend({ keys }) {
  return (
    <div className="viz-legend">
      {keys.map(k => <span key={k}><i style={{ background: DECISION[k].color }} />{DECISION[k].label}</span>)}
    </div>
  );
}

// Radar of mandate-fit factors. `series` = [{ label, color, factors }]; a single series needs no legend.
export function FitRadar({ series, size = 220, light = false }) {
  const keys = Object.keys(FIT_AXES).filter(k => series.some(s => s.factors.some(f => f.key === k && f.weight > 0)));
  const c = size / 2, r = c - 30;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / keys.length;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v];
  };
  const ink = light ? 'rgba(255,255,255,' : 'rgba(236,236,232,';
  if (keys.length < 3) return null;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="viz-radar" role="img" aria-label="Mandate fit by factor">
      {[0.25, 0.5, 0.75, 1].map(g => <polygon key={g} points={keys.map((_, i) => pt(i, g).join(',')).join(' ')} fill="none" stroke={`${ink}0.14)`} strokeWidth="1" />)}
      {keys.map((k, i) => {
        const [x, y] = pt(i, 1), [lx, ly] = pt(i, 1.2);
        return (
          <g key={k}>
            <line x1={c} y1={c} x2={x} y2={y} stroke={`${ink}0.12)`} strokeWidth="1" />
            <text x={lx} y={ly} textAnchor={Math.abs(lx - c) < 6 ? 'middle' : lx > c ? 'start' : 'end'} dominantBaseline="middle" fill={`${ink}0.75)`} fontSize="10.5" fontFamily="var(--mono)">{FIT_AXES[k]}</text>
          </g>
        );
      })}
      {series.map(s => {
        const vals = keys.map(k => s.factors.find(f => f.key === k));
        const pts = vals.map((f, i) => pt(i, f ? ratio(f) : 0));
        return (
          <g key={s.label}>
            <polygon points={pts.map(p => p.join(',')).join(' ')} fill={s.color} fillOpacity={series.length > 1 ? 0.12 : 0.28} stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
            {pts.map((p, i) => vals[i] && (
              <circle key={i} cx={p[0]} cy={p[1]} r="4" fill={s.color} stroke={light ? 'rgba(0,0,0,0.5)' : 'var(--surface)'} strokeWidth="2">
                <title>{`${s.label ? `${s.label} · ` : ''}${vals[i].label}: ${Math.round(vals[i].earned)}/${vals[i].weight} — ${vals[i].detail}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

const PEER_ROWS = [
  ['growth', 'YoY growth', (v) => pct(v), true],
  ['revenue', 'Revenue', null, true],
  ['gross_margin', 'Gross margin', (v) => pct(v), true],
  ['runway', 'Runway', (v) => `${v.toFixed(0)} mo`, true],
  ['raise', 'Round size', null, false],
];
// Where this company sits among discoverable companies at the same stage.
export function PeerBars({ peers = {}, stage, currency }) {
  const rows = PEER_ROWS.filter(([k]) => peers[k]);
  if (!rows.length) return <p className="viz-empty">Not enough {stageLabel(stage)} companies with comparable data yet.</p>;
  const n = Math.max(...rows.map(([k]) => peers[k].n));
  return (
    <div className="viz-peers">
      {rows.map(([k, label, fmt, better]) => {
        const p = peers[k];
        const tag = better ? (p.pct >= 50 ? `Top ${Math.max(1, 100 - p.pct)}%` : `Bottom ${Math.max(1, p.pct)}%`) : `Larger than ${p.pct}%`;
        return (
          <div key={k} className="viz-peer" title={`${label}: ${fmt ? fmt(p.value) : money(p.value, currency)} — ${p.pct}th percentile of ${p.n} ${stageLabel(stage)} companies`}>
            <div className="viz-peer-h"><span>{label}</span><b>{fmt ? fmt(p.value) : money(p.value, currency)}</b></div>
            <div className="viz-peer-t"><i style={{ width: `${p.pct}%` }} /><em style={{ left: `${p.pct}%` }} /><u /></div>
            <small className={better && p.pct >= 75 ? 'hi' : ''}>{tag}</small>
          </div>
        );
      })}
      <p className="viz-foot">vs {n} {stageLabel(stage)} companies on the platform · tick = median</p>
    </div>
  );
}

// Months of runway today vs. if the full round closes (derived; assumes constant burn).
export function RunwayTimeline({ fin, raise, currency }) {
  const cash = fin?.cash?.value, burn = fin?.burn?.value;
  if (!(cash >= 0) || !(burn > 0)) return null;
  const now = cash / burn;
  const after = raise > 0 ? (cash + raise) / burn : null;
  const max = Math.ceil(Math.max(24, after || now) / 6) * 6;
  const ticks = Array.from({ length: max / 6 + 1 }, (_, i) => i * 6);
  return (
    <div className="viz-runway">
      <div className="viz-runway-row"><span>Today</span><div><i className="now" style={{ width: `${(now / max) * 100}%` }} /></div><b>{now.toFixed(0)} mo</b></div>
      {after && <div className="viz-runway-row"><span>If raised</span><div><i className="after" style={{ width: `${(after / max) * 100}%` }} /></div><b>{after.toFixed(0)} mo</b></div>}
      <div className="viz-runway-axis">{ticks.map(t => <span key={t} style={{ left: `${(t / max) * 100}%` }}>{t}</span>)}</div>
      <p className="viz-foot">Cash ÷ burn of {money(burn, currency)}/mo, held constant. Derived, not a forecast.</p>
    </div>
  );
}

export const CONFIDENCE = {
  documented: { label: 'Documented', icon: 'shield', cls: 'good' },
  partial: { label: 'Partly documented', icon: 'file', cls: 'warn' },
  founder_stated: { label: 'Founder-stated', icon: 'pen', cls: 'warn' },
  none: { label: 'No financials', icon: 'alert', cls: 'muted' },
};
export function ConfidenceMeter({ c }) {
  if (!c) return null;
  const meta = CONFIDENCE[c.level];
  return (
    <div className="viz-conf">
      <div className={`viz-conf-h ${meta.cls}`}><Icon name={meta.icon} size={15} />{meta.label}</div>
      {c.metrics > 0 && (
        <div className="viz-conf-bar" role="img" aria-label={`${c.documented} of ${c.metrics} figures backed by documents`}>
          {Array.from({ length: c.metrics }, (_, i) => <i key={i} className={i < c.documented ? 'doc' : 'stated'} />)}
        </div>
      )}
      <div className="viz-conf-k">
        <span><b>{c.documented}</b>/{c.metrics} figures from documents</span>
        <span><b>{c.documents}</b> source document{c.documents === 1 ? '' : 's'}</span>
        <span className={c.flags.high ? 'bad' : ''}><b>{c.flags.high}</b> high-severity flag{c.flags.high === 1 ? '' : 's'}</span>
        <span><b>{c.flags.other}</b> other flag{c.flags.other === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}

// Market map: revenue (log) vs growth, bubble = round size, colour = your decision.
export function MarketMap({ points, onOpen }) {
  const tip = useTip();
  const plotted = points.filter(p => p.revenue > 0 && p.growth != null);
  const W = 640, H = 340, L = 48, R = 16, T = 14, B = 34;
  const scale = useMemo(() => {
    const xs = plotted.map(p => Math.log10(p.revenue)), ys = plotted.map(p => p.growth * 100);
    const x0 = Math.floor(Math.min(...xs, 4)), x1 = Math.ceil(Math.max(...xs, 5));
    const y0 = Math.min(0, Math.floor(Math.min(...ys, 0) / 50) * 50), top = Math.max(...ys, 50);
    const step = [10, 20, 25, 50, 100, 200, 250, 500, 1000].find(st => st >= (top - y0) / 4) || 1000;
    const y1 = y0 + step * Math.ceil((top - y0) / step);
    const rmax = Math.max(...plotted.map(p => p.raise || 0), 1);
    return { x0, x1, y0, y1, step, rmax };
  }, [plotted]);
  const sx = (v) => L + ((Math.log10(v) - scale.x0) / (scale.x1 - scale.x0)) * (W - L - R);
  const sy = (v) => T + (1 - (v * 100 - scale.y0) / (scale.y1 - scale.y0)) * (H - T - B);
  const sr = (v) => 4 + 12 * Math.sqrt((v || 0) / scale.rmax);
  const xt = Array.from({ length: scale.x1 - scale.x0 + 1 }, (_, i) => 10 ** (scale.x0 + i));
  const yt = Array.from({ length: Math.round((scale.y1 - scale.y0) / scale.step) + 1 }, (_, i) => scale.y0 + scale.step * i);
  const order = ['deck', 'passed', 'saved', 'interested'];
  const sorted = [...plotted].sort((a, b) => order.indexOf(a.swipe || 'deck') - order.indexOf(b.swipe || 'deck') || (b.raise || 0) - (a.raise || 0));
  return (
    <div className="viz-wrap" ref={tip.ref} onMouseLeave={tip.hide}>
      <Legend keys={['interested', 'saved', 'passed', 'deck']} />
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" aria-label="Market map of revenue against growth">
        {yt.map(v => <g key={v}><line x1={L} x2={W - R} y1={sy(v / 100)} y2={sy(v / 100)} className="viz-grid" /><text x={L - 8} y={sy(v / 100)} className="viz-axis" textAnchor="end" dominantBaseline="middle">{v}%</text></g>)}
        {xt.map(v => <text key={v} x={sx(v)} y={H - 12} className="viz-axis" textAnchor="middle">{money(v, 'USD')}</text>)}
        <text x={W - R} y={H - 0} className="viz-axis" textAnchor="end">Revenue (log) →</text>
        <text x={L} y={T - 4} className="viz-axis">↑ YoY growth</text>
        {sorted.map(p => {
          const d = DECISION[p.swipe || 'deck'];
          return (
            <circle key={p.company_id} cx={sx(p.revenue)} cy={sy(p.growth)} r={sr(p.raise)} fill={d.color} fillOpacity={p.swipe ? 0.9 : 0.55}
              stroke="var(--surface)" strokeWidth="2" className="viz-dot" tabIndex={0}
              onMouseMove={(e) => tip.show(e, <><b>{p.name}</b><span>{p.industry} · {stageLabel(p.stage)}</span><span>Revenue {money(p.revenue, p.currency)} · growth {pct(p.growth)}</span><span>Raising {money(p.raise, p.currency)} · fit {p.score}</span><span className="viz-tip-k" style={{ '--c': d.color }}>{d.label}</span></>)}
              onClick={() => onOpen?.(p.company_id)} onKeyDown={(e) => e.key === 'Enter' && onOpen?.(p.company_id)} />
          );
        })}
      </svg>
      {tip.node}
      <p className="viz-foot">Bubble size = round size. {points.length - plotted.length} compan{points.length - plotted.length === 1 ? 'y' : 'ies'} not plotted (pre-revenue or growth not disclosed). Click a bubble to open it.</p>
    </div>
  );
}

// Stacked columns of fit-score bins by decision.
export function FitColumns({ bins }) {
  const tip = useTip();
  const keys = ['interested', 'saved', 'passed', 'deck'];
  const max = Math.max(1, ...bins.map(b => keys.reduce((t, k) => t + b[k], 0)));
  const W = 640, H = 220, L = 30, B = 26, T = 8, bw = (W - L) / bins.length;
  const sy = (v) => ((H - T - B) * v) / max;
  return (
    <div className="viz-wrap" ref={tip.ref} onMouseLeave={tip.hide}>
      <Legend keys={keys} />
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" aria-label="Distribution of fit scores by decision">
        {[0, 0.5, 1].map(f => <g key={f}><line x1={L} x2={W} y1={H - B - sy(max * f)} y2={H - B - sy(max * f)} className="viz-grid" /><text x={L - 6} y={H - B - sy(max * f)} className="viz-axis" textAnchor="end" dominantBaseline="middle">{Math.round(max * f)}</text></g>)}
        {bins.map((b, i) => {
          let y = H - B;
          const x = L + i * bw + 6, w = bw - 12;
          return (
            <g key={b.k}>
              {keys.map((k, j) => {
                if (!b[k]) return null;
                const h = sy(b[k]);
                y -= h;
                const top = !keys.slice(j + 1).some(kk => b[kk]);
                return <rect key={k} x={x} y={y + (j ? 0 : 0)} width={w} height={Math.max(1, h - 2)} rx={top ? 4 : 0} fill={DECISION[k].color} className="viz-bar"
                  onMouseMove={(e) => tip.show(e, <><b>Fit {b.k}</b><span className="viz-tip-k" style={{ '--c': DECISION[k].color }}>{DECISION[k].label}: {b[k]}</span></>)} />;
              })}
              <text x={x + w / 2} y={H - 8} className="viz-axis" textAnchor="middle">{b.k}</text>
            </g>
          );
        })}
      </svg>
      {tip.node}
    </div>
  );
}

// Horizontal stacked bars of decisions per category (sector or stage).
export function DecisionMix({ rows, label = (k) => k }) {
  const tip = useTip();
  const keys = ['interested', 'saved', 'passed'];
  const max = Math.max(1, ...rows.map(r => r.total));
  if (!rows.length) return <p className="viz-empty">No decisions yet — swipe a few companies to see your mix.</p>;
  return (
    <div className="viz-wrap" ref={tip.ref} onMouseLeave={tip.hide}>
      <Legend keys={keys} />
      <div className="viz-mix">
        {rows.slice(0, 8).map(r => (
          <div key={r.k} className="viz-mix-row">
            <span>{label(r.k)}</span>
            <div style={{ width: `${(r.total / max) * 100}%` }}>
              {keys.map(k => r[k] > 0 && <i key={k} style={{ flex: r[k], background: DECISION[k].color }}
                onMouseMove={(e) => tip.show(e, <><b>{label(r.k)}</b><span className="viz-tip-k" style={{ '--c': DECISION[k].color }}>{DECISION[k].label}: {r[k]}</span></>)} />)}
            </div>
            <b>{r.total}</b>
          </div>
        ))}
      </div>
      {tip.node}
    </div>
  );
}

// Single-series horizontal bars (e.g. pass reasons). Colour is the series identity; text stays in ink.
export function SimpleBars({ rows, color = DECISION.passed.color, empty }) {
  const max = Math.max(1, ...rows.map(r => r.n));
  if (!rows.length) return <p className="viz-empty">{empty}</p>;
  return (
    <div className="viz-mix">
      {rows.map(r => (
        <div key={r.k} className="viz-mix-row" title={`${r.label}: ${r.n}`}>
          <span>{r.label}</span>
          <div style={{ width: `${(r.n / max) * 100}%` }}><i style={{ flex: 1, background: color }} /></div>
          <b>{r.n}</b>
        </div>
      ))}
    </div>
  );
}

export function Funnel({ steps }) {
  const max = Math.max(1, steps[0]?.n || 0);
  return (
    <div className="viz-funnel">
      {steps.map((s, i) => {
        const prev = steps[i - 1];
        const conv = prev && prev.n ? Math.round((100 * s.n) / prev.n) : null;
        return (
          <div key={s.k} className="viz-funnel-row" title={`${s.label}: ${s.n}`}>
            <span>{s.label}</span>
            <div><i style={{ width: `${Math.max(s.n ? 2 : 0, (s.n / max) * 100)}%` }} /></div>
            <b>{s.n}</b>
            <small>{i === 0 ? '' : conv == null ? '—' : `${conv}%`}</small>
          </div>
        );
      })}
      <p className="viz-foot">Right column: conversion from the previous step.</p>
    </div>
  );
}
