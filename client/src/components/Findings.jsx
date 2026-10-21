import { useState } from 'react';
import { Sev, Status, Empty } from './ui.jsx';
import { money, pct, months, human, date } from '../lib/format.js';

export function FindingCard({ f, children }) {
  const [open, setOpen] = useState(f.status === 'open');
  return (
    <div className="card" style={{ padding: 0 }}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="row between" style={{ width: '100%', padding: 16, border: 0, background: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span className="row" style={{ gap: 10 }}>
          <span className="label">F-{String(f.id).padStart(4, '0')}</span>
          <Sev s={f.severity} />
          <strong>{f.category}</strong>
          {f.metric && <span className="muted">· {human(f.metric)}{f.period ? ` · ${f.period}` : ''}</span>}
          {f.confidence === 'inconclusive' && <span className="badge b-muted">inconclusive</span>}
        </span>
        <Status s={f.status} />
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px' }} className="stack">
          {(f.value_a || f.value_b) && (
            <div className="grid g2">
              <div className="notice"><span className="label">Source A</span><div className="display d-s">{f.value_a || '—'}</div><div className="small muted">{f.source_a || '—'}</div></div>
              {f.value_b && <div className="notice"><span className="label">Source B</span><div className="display d-s">{f.value_b}</div><div className="small muted">{f.source_b}</div></div>}
            </div>
          )}
          <div><span className="label">Why it matters</span><p>{f.explanation}</p></div>
          <div className="small"><span className="label">Method</span> <span className="mono">{f.method}</span>{f.units ? <span className="muted"> · units: {f.units}</span> : null}</div>
          {f.question && <div><span className="label accent">Clarification requested</span><p>{f.question}</p></div>}
          {f.founder_response && <div className="notice"><span className="label">Founder response</span><p style={{ margin: 0 }}>{f.founder_response}</p></div>}
          {f.reviewer_notes && <div className="notice"><span className="label">Reviewer notes</span><p style={{ margin: 0 }}>{f.reviewer_notes}</p></div>}
          <div className="label">Updated {date(f.updated_at, true)}</div>
          {children}
        </div>
      )}
    </div>
  );
}

export function FindingsList({ findings, render }) {
  if (!findings.length) return <Empty title="No findings">Nothing currently requires clarification.</Empty>;
  return <div className="stack">{findings.map(f => <FindingCard key={f.id} f={f}>{render?.(f)}</FindingCard>)}</div>;
}

export function fmtMetric(m) {
  if (m.unit === 'pct') return pct(m.value, 1);
  if (m.unit === 'months') return months(m.value);
  if (m.unit === 'count') return String(m.value);
  return money(m.value, m.currency || 'USD');
}

export function MetricsTable({ metrics }) {
  if (!metrics.length) return <Empty title="No figures extracted yet">Upload financial statements or a model to populate this table.</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Metric</th><th>Period</th><th>Value</th><th>Basis</th><th>Source</th><th>Extractor</th></tr></thead>
        <tbody>
          {metrics.map(m => (
            <tr key={m.id}>
              <td>{human(m.metric)}</td>
              <td className="mono">{m.period || '—'}</td>
              <td className="mono">{fmtMetric(m)}</td>
              <td><span className={`badge ${m.basis === 'projection' ? 'b-med' : m.basis === 'historical' ? 'b-ok' : 'b-muted'}`}>{human(m.basis)}</span></td>
              <td className="small">{m.document_name || 'Company profile'}{m.source_location ? <div className="muted">{m.source_location}</div> : null}</td>
              <td className="label">{human(m.extractor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SummaryKpis({ s, currency }) {
  const row = (label, v, src) => (
    <div className="stat"><span className="label">{label}</span><span className="num">{v}</span><span className="sub">{src || 'Not available'}</span></div>
  );
  return (
    <div className="grid g3">
      {row('Revenue', s.revenue ? money(s.revenue.value, currency) : '—', s.revenue && `${s.revenue.period} · ${s.revenue.source}`)}
      {row('Growth', s.growth ? pct(s.growth.value) : '—', s.growth && `${s.growth.period} · ${s.growth.source}`)}
      {row('Gross margin', s.gross_margin ? pct(s.gross_margin.value) : '—', s.gross_margin?.source)}
      {row('EBITDA margin', s.ebitda_margin ? pct(s.ebitda_margin.value) : '—', s.ebitda_margin?.source)}
      {row('Monthly burn', s.burn ? money(s.burn.value, currency) : '—', s.burn?.source)}
      {row('Runway', s.runway ? months(s.runway.value) : '—', s.runway?.source)}
    </div>
  );
}
