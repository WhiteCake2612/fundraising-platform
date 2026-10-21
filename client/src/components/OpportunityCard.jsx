import { money, pct, stageLabel, isNum } from '../lib/format.js';

const MARK = { match: '✓', no_preference: '·', partial: '◐', unknown: '?', mismatch: '✕' };
const COLOR = { match: 'var(--ok)', no_preference: 'var(--muted)', partial: 'var(--med)', unknown: 'var(--muted)', mismatch: 'var(--crit)' };

export function FitBreakdown({ match, compact }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      {match.factors.map(f => (
        <div key={f.key} className="row between small" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <span style={{ color: COLOR[f.status], width: 14, textAlign: 'center' }} aria-label={f.status}>{MARK[f.status]}</span>
            <span><strong>{f.label}</strong>{!compact && <span className="muted"> — {f.detail}</span>}</span>
          </span>
          <span className="mono muted">{Math.round(f.earned)}/{f.weight}</span>
        </div>
      ))}
      {match.exclusions.map((x, i) => <div key={i} className="small" style={{ color: 'var(--crit)' }}>Hard exclusion: {x}</div>)}
      {match.missing.length > 0 && <div className="small muted">Limited confidence — not disclosed: {match.missing.join(', ')}</div>}
    </div>
  );
}

export default function OpportunityCard({ item }) {
  const f = item.financials || {};
  const cur = item.currency;
  const title = item.name || `Project ${item.code}`;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label accent">{stageLabel(item.stage)} · {item.industry || 'Sector n/a'} · {item.business_model || 'Model n/a'}</span>
          <h2 className="display d-m">{title}</h2>
          <span className="label">{item.geography || item.headquarters || 'Geography not disclosed'}{!item.identity_disclosed ? ' · identity withheld' : ''}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="display" style={{ fontSize: 56, color: item.match.eligible ? 'var(--accent)' : 'var(--crit)' }}>{item.match.score}</div>
          <div className="label">Mandate fit</div>
        </div>
      </div>
      <p style={{ fontSize: 15, margin: 0 }}>{item.overview?.text || <span className="muted">Overview not disclosed.</span>}</p>
      <div className="grid g3" style={{ gap: 8 }}>
        <Mini label="Raising" v={money(item.raise?.amount, cur)} />
        <Mini label={`Revenue${f.revenue?.period ? ` · ${f.revenue.period}` : ''}`} v={f.revenue ? money(f.revenue.value, cur) : '—'} />
        <Mini label="Growth" v={f.growth && isNum(f.growth.value) ? pct(f.growth.value) : '—'} />
        <Mini label="Gross margin" v={f.gross_margin ? pct(f.gross_margin.value) : '—'} />
        <Mini label="Runway" v={f.runway ? `${f.runway.value.toFixed(0)} mo` : '—'} />
        <Mini label="Lead" v={item.raise?.seeking_lead === 1 ? 'Needed' : item.raise?.seeking_lead === 0 ? 'In place' : '—'} />
      </div>
      {item.traction?.text && <div><span className="label">Traction</span><p style={{ margin: 0 }}>{item.traction.text}</p></div>}
      {item.highlights?.length > 0 && <div><span className="label">Highlights</span><ul style={{ margin: 0, paddingLeft: 18 }}>{item.highlights.slice(0, 3).map((h, i) => <li key={i}>{h.text}</li>)}</ul></div>}
      <div>
        <span className="label" style={{ color: 'var(--high)' }}>Risk flags & open questions</span>
        {item.risks?.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{item.risks.slice(0, 4).map((r, i) => <li key={i}>{r.text}</li>)}</ul> : <div className="small muted">None recorded at approval.</div>}
      </div>
      <div><span className="label">Why this fits your mandate</span><FitBreakdown match={item.match} /></div>
      <div className="small muted">Fit measures alignment with your stated mandate only — it is not a prediction of returns or an endorsement.</div>
    </div>
  );
}

function Mini({ label, v }) {
  return <div style={{ border: '1px solid var(--line)', padding: '8px 10px' }}><div className="label">{label}</div><div className="display" style={{ fontSize: 22 }}>{v}</div></div>;
}
