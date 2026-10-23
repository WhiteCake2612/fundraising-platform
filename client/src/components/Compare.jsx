import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { money, pct, stageLabel, isNum } from '../lib/format.js';
import { FitRadar, SERIES, CONFIDENCE } from './charts.jsx';
import { Icon, SectorIcon } from './icons.jsx';
import { coverStyle } from './SwipeProfile.jsx';

// Side-by-side comparison of up to three shortlisted companies.
// Each row bars values relative to the row's maximum; the best value is marked (where "best" is meaningful).
const ROWS = [
  ['Raising', (x) => x.raise?.amount, (v, x) => money(v, x.currency), null],
  ['Revenue', (x) => x.financials?.revenue?.value, (v, x) => money(v, x.currency), 'high'],
  ['YoY growth', (x) => x.financials?.growth?.value, (v) => pct(v), 'high'],
  ['Gross margin', (x) => x.financials?.gross_margin?.value, (v) => pct(v), 'high'],
  ['Runway', (x) => x.financials?.runway?.value, (v) => `${v.toFixed(0)} mo`, 'high'],
  ['Burn / month', (x) => x.financials?.burn?.value, (v, x) => money(v, x.currency), 'low'],
  ['Mandate fit', (x) => x.match.score, (v) => `${v}/100`, 'high'],
];

export default function Compare({ items, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const cols = { gridTemplateColumns: `150px repeat(${items.length}, minmax(0, 1fr))`, '--n': items.length };
  return (
    <div className="cmp-back" onClick={onClose}>
      <div className="cmp" role="dialog" aria-modal="true" aria-label="Compare companies" onClick={e => e.stopPropagation()}>
        <div className="row between cmp-top">
          <span className="label accent">Compare · {items.length} companies</span>
          <button className="tp-close static" onClick={onClose} aria-label="Close comparison"><Icon name="x" size={16} stroke={2.2} /></button>
        </div>
        <div className="cmp-grid" style={cols}>
          <div />
          {items.map((x, i) => (
            <div key={x.company_id} className="cmp-head" style={{ '--c': SERIES[i] }}>
              <span className="dz-av" style={coverStyle(x)}><SectorIcon sector={x.industry} size={18} /></span>
              <Link to={`/investor/opportunities/${x.company_id}`}><b>{x.name || `Project ${x.code}`}</b></Link>
              <small>{stageLabel(x.stage)} · {x.industry}</small>
            </div>
          ))}
          {ROWS.map(([label, get, fmt, better]) => {
            const vals = items.map(get);
            const nums = vals.filter(isNum);
            const max = Math.max(...nums.map(Math.abs), 0) || 1;
            const best = better && nums.length > 1 ? (better === 'high' ? Math.max(...nums) : Math.min(...nums)) : null;
            return [
              <div key={label} className="cmp-label">{label}</div>,
              ...items.map((x, i) => {
                const v = vals[i];
                return (
                  <div key={label + x.company_id} className={`cmp-cell ${v === best ? 'best' : ''}`}>
                    {isNum(v) ? <><b>{fmt(v, x)}{v === best && <Icon name="check" size={13} stroke={2.4} />}</b><i style={{ width: `${(Math.abs(v) / max) * 100}%`, background: SERIES[i] }} /></> : <span className="muted">Not disclosed</span>}
                  </div>
                );
              }),
            ];
          })}
          <div className="cmp-label">Data confidence</div>
          {items.map(x => <div key={'c' + x.company_id} className="cmp-cell">{x.confidence ? <span className={`tp-conf inline ${CONFIDENCE[x.confidence.level].cls}`}><Icon name={CONFIDENCE[x.confidence.level].icon} size={12} />{CONFIDENCE[x.confidence.level].label}</span> : '—'}</div>)}
          <div className="cmp-label">Open flags</div>
          {items.map(x => <div key={'f' + x.company_id} className="cmp-cell">{x.confidence ? `${x.confidence.flags.high} high · ${x.confidence.flags.other} other` : '—'}</div>)}
          <div className="cmp-label">My tags</div>
          {items.map(x => <div key={'t' + x.company_id} className="cmp-cell cmp-tags">{x.my_note?.tags?.length ? x.my_note.tags.map(t => <span key={t}>{t}</span>) : <span className="muted">—</span>}</div>)}
        </div>
        <div className="cmp-radar">
          <div>
            <span className="label">Mandate fit by factor</span>
            <div className="viz-legend">{items.map((x, i) => <span key={x.company_id}><i style={{ background: SERIES[i] }} />{x.name || `Project ${x.code}`}</span>)}</div>
          </div>
          <FitRadar series={items.map((x, i) => ({ label: x.name || `Project ${x.code}`, color: SERIES[i], factors: x.match.factors }))} size={300} />
        </div>
        <p className="viz-foot">Bars are relative to the largest value in each row. A tick marks the strongest value where higher (or, for burn, lower) is better. Founder-stated figures are unverified.</p>
      </div>
    </div>
  );
}
