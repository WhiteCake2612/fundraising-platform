import { useState } from 'react';
import { useApi, api } from '../../lib/api.js';
import { PageHead, Async, Tabs, Field, ActionMsg, useAction, Status, Empty } from '../../components/ui.jsx';
import { FindingsList, MetricsTable, SummaryKpis } from '../../components/Findings.jsx';
import { useMeta } from '../../components/Shell.jsx';
import { parseMoney, ago } from '../../lib/format.js';

export default function FounderAnalysis() {
  const q = useApi('/founder/analysis');
  const co = useApi('/founder/company');
  const meta = useMeta();
  const [tab, setTab] = useState('findings');
  return (
    <>
      <PageHead kicker="Financial review" title="Analysis" sub="Figures are extracted with their source and reconciled by deterministic checks. Differences are raised as questions, not conclusions." />
      {meta?.integrations?.llm?.status !== 'configured' && <div className="notice" style={{ marginBottom: 20 }}>AI-assisted extraction is not configured on this deployment. Spreadsheet figures are parsed directly; narrative documents are stored and reviewed by the host team.</div>}
      <Async q={q}>{d => (
        <>
          <SummaryKpis s={d.summary} currency={co.data?.company.currency} />
          <div className="section">
            <Tabs value={tab} onChange={setTab} tabs={[
              { key: 'findings', label: 'Findings', count: d.findings.filter(f => f.status === 'open').length },
              { key: 'figures', label: 'Extracted figures', count: d.metrics.length },
              { key: 'correct', label: 'Submit a correction' },
              { key: 'jobs', label: 'Processing log' },
            ]} />
            {tab === 'findings' && <FindingsList findings={d.findings} render={f => ['open', 'under_review'].includes(f.status) && <Respond f={f} onDone={() => q.reload(true)} />} />}
            {tab === 'figures' && <MetricsTable metrics={d.metrics} />}
            {tab === 'correct' && <Correction onDone={() => q.reload(true)} />}
            {tab === 'jobs' && (d.ai_jobs.length ? (
              <div className="table-wrap"><table><thead><tr><th>Document</th><th>Step</th><th>Status</th><th>Detail</th><th>Updated</th></tr></thead>
                <tbody>{d.ai_jobs.map(j => <tr key={j.id}><td>{j.filename}</td><td>{j.kind}</td><td><Status s={j.status} /></td><td className="small">{j.error || '—'}</td><td>{ago(j.updated_at)}</td></tr>)}</tbody></table></div>
            ) : <Empty title="No processing jobs yet" />)}
          </div>
        </>
      )}</Async>
    </>
  );
}

function Respond({ f, onDone }) {
  const [text, setText] = useState(f.founder_response || '');
  const a = useAction();
  return (
    <div className="stack">
      <Field label="Your response"><textarea className="input" value={text} onChange={e => setText(e.target.value)} placeholder="Explain the difference, e.g. deck shows ARR at year-end, statements show recognised revenue." /></Field>
      <ActionMsg a={a} />
      <div><button className="btn sm" disabled={a.busy || text.trim().length < 3} onClick={() => a.run(() => api(`/founder/findings/${f.id}/respond`, { method: 'POST', body: { response: text } }), 'Response sent to the host for review.').then(onDone).catch(() => {})}>Send response</button></div>
    </div>
  );
}

function Correction({ onDone }) {
  const [f, setF] = useState({ metric: 'revenue', period: '', value: '', unit: 'currency', note: '' });
  const a = useAction();
  const v = f.unit === 'currency' ? parseMoney(f.value) : f.unit === 'pct' ? Number(f.value) / 100 : Number(f.value);
  return (
    <form className="card stack" style={{ maxWidth: 640 }} onSubmit={e => { e.preventDefault(); a.run(() => api('/founder/corrections', { method: 'POST', body: { ...f, value: v } }), 'Correction recorded. It is shown as founder input alongside the original figure.').then(onDone).catch(() => {}); }}>
      <p className="muted small">Corrections never overwrite figures extracted from documents. They are recorded as founder input with your note, and the host reviews any difference.</p>
      <div className="form-grid">
        <Field label="Metric"><select className="input" value={f.metric} onChange={e => setF({ ...f, metric: e.target.value })}>{['revenue', 'gross_margin', 'ebitda', 'net_income', 'cash_balance', 'monthly_burn', 'runway_months', 'raise_amount', 'customers'].map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}</select></Field>
        <Field label="Period" hint="e.g. FY2024"><input className="input" value={f.period} onChange={e => setF({ ...f, period: e.target.value })} /></Field>
        <Field label="Unit"><select className="input" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}><option value="currency">Currency</option><option value="pct">Percent</option><option value="months">Months</option><option value="count">Count</option></select></Field>
        <Field label="Value" error={Number.isNaN(v) && f.value ? 'Enter a valid number' : null}><input className="input" value={f.value} onChange={e => setF({ ...f, value: e.target.value })} placeholder={f.unit === 'pct' ? '62' : '1.5m'} /></Field>
        <Field label="Explanation" full><textarea className="input" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <ActionMsg a={a} />
      <div><button className="btn" disabled={a.busy || f.value === '' || Number.isNaN(v)}>Submit correction</button></div>
    </form>
  );
}
