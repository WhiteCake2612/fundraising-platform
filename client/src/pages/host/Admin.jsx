import { useEffect, useState } from 'react';
import { useApi, api } from '../../lib/api.js';
import { useMeta } from '../../components/Shell.jsx';
import { PageHead, Async, Tabs, Field, ActionMsg, useAction, Status, Empty } from '../../components/ui.jsx';
import { date } from '../../lib/format.js';

const WEIGHT_LABELS = { stage: 'Stage compatibility', sector: 'Sector & business model', ticket: 'Ticket & round size', geography: 'Geography', traction: 'Revenue & traction', other: 'Lead / co-invest & other' };

export function HostSettings() {
  const q = useApi('/host/settings');
  const meta = useMeta();
  return (
    <>
      <PageHead kicker="Configuration" title="Settings" />
      <Async q={q}>{d => (
        <div className="grid g2">
          <Weights d={d} onSaved={() => q.reload(true)} />
          <Stages d={d} onSaved={() => q.reload(true)} />
          <div className="card stack">
            <span className="label accent">Integrations</span>
            {meta && Object.entries(meta.integrations).map(([k, v]) => (
              <div key={k} className="row between"><span>{k.replace('_', ' ')}</span><span className="row"><Status s={v.status === 'configured' ? 'active' : 'not_configured'} label={v.status.replace('_', ' ')} />{v.model && <span className="mono small">{v.provider} · {v.model}{v.documentText ? '' : ' · document text disabled'}</span>}</span></div>
            ))}
            <p className="small muted">Configure the LLM provider with LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in server/.env. Document text is only sent when LLM_ALLOW_DOCUMENT_TEXT=true.</p>
          </div>
        </div>
      )}</Async>
    </>
  );
}

function Weights({ d, onSaved }) {
  const [w, setW] = useState(d.weights);
  const a = useAction();
  useEffect(() => setW(d.weights), [d.weights]);
  const sum = Object.values(w).reduce((s, x) => s + Number(x || 0), 0);
  return (
    <div className="card stack">
      <span className="label accent">Matching weights</span>
      <p className="small muted">Initial defaults, not universal truths — review them against real investor behaviour on the Interest page.</p>
      {Object.keys(WEIGHT_LABELS).map(k => (
        <div key={k} className="row between"><span>{WEIGHT_LABELS[k]}</span><input className="input" style={{ width: 90 }} type="number" min="0" max="100" value={w[k]} onChange={e => setW({ ...w, [k]: Number(e.target.value) })} /></div>
      ))}
      <div className="row between"><strong>Total</strong><span className="mono" style={{ color: sum === 100 ? 'var(--ok)' : 'var(--crit)' }}>{sum} / 100</span></div>
      <ActionMsg a={a} />
      <div className="row"><button className="btn" disabled={sum !== 100 || a.busy} onClick={() => a.run(() => api('/host/settings', { method: 'PUT', body: { weights: w } }), 'Weights saved; all scores update immediately.').then(onSaved).catch(() => {})}>Save weights</button><button className="btn ghost" onClick={() => setW(d.defaults)}>Reset to defaults</button></div>
    </div>
  );
}

function Stages({ d, onSaved }) {
  const [s, setS] = useState(d.stages);
  const a = useAction();
  useEffect(() => setS(d.stages), [d.stages]);
  const add = () => setS([...s, { key: `custom_${Date.now().toString(36)}`, label: 'New stage' }]);
  const moveUp = (i) => { if (i === 0) return; const n = [...s]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setS(n); };
  return (
    <div className="card stack">
      <span className="label accent">Pipeline stages</span>
      <p className="small muted">Rename, reorder or add stages. Stages that deals are currently in cannot be removed. Automatic transitions only move deals forward through the screening stages; everything else is a host decision.</p>
      {s.map((st, i) => (
        <div key={st.key} className="row" style={{ flexWrap: 'nowrap' }}>
          <span className="mono small" style={{ width: 24 }}>{i + 1}</span>
          <input className="input" value={st.label} onChange={e => setS(s.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <button className="btn sm ghost" onClick={() => moveUp(i)} aria-label="Move up">↑</button>
          <button className="btn sm ghost" onClick={() => setS(s.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
        </div>
      ))}
      <ActionMsg a={a} />
      <div className="row"><button className="btn ghost sm" onClick={add}>Add stage</button><button className="btn" disabled={a.busy} onClick={() => a.run(() => api('/host/settings', { method: 'PUT', body: { stages: s } }), 'Stages saved.').then(onSaved).catch(() => {})}>Save stages</button></div>
    </div>
  );
}

export function HostAudit() {
  const q = useApi('/host/audit');
  const [tab, setTab] = useState('audit');
  return (
    <>
      <PageHead kicker="Compliance" title="Audit log" sub="Logins, uploads, downloads, disclosure changes and administrative actions." />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'audit', label: 'Actions' }, { key: 'logins', label: 'Logins' }, { key: 'outbox', label: 'Email outbox' }]} />
      <Async q={q}>{d => (
        <>
          {tab === 'audit' && (d.logs.length ? <div className="table-wrap"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Detail</th><th>IP</th></tr></thead>
            <tbody>{d.logs.map(l => <tr key={l.id}><td>{date(l.created_at, true)}</td><td>{l.actor || '—'}</td><td className="mono small">{l.action}</td><td className="small">{l.target_type ? `${l.target_type} #${l.target_id ?? ''}` : '—'}</td><td className="mono small" style={{ maxWidth: 320, wordBreak: 'break-all' }}>{l.detail || ''}</td><td className="mono small">{l.ip}</td></tr>)}</tbody></table></div> : <Empty title="No entries" />)}
          {tab === 'logins' && <div className="table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Email</th><th>Result</th><th>IP</th></tr></thead>
            <tbody>{d.logins.map(l => <tr key={l.id}><td>{date(l.created_at, true)}</td><td>{l.name || '—'}</td><td>{l.email}</td><td>{l.success ? <Status s="active" label="success" /> : <Status s="failed" />}</td><td className="mono small">{l.ip}</td></tr>)}</tbody></table></div>}
          {tab === 'outbox' && (
            <>
              <div className="notice" style={{ marginBottom: 12 }}>SMTP is not configured, so verification and reset emails are queued here and not delivered. Configure an email provider to send them.</div>
              {d.outbox.length ? <div className="table-wrap"><table><thead><tr><th>Queued</th><th>To</th><th>Subject</th><th>Sent</th></tr></thead><tbody>{d.outbox.map(o => <tr key={o.id}><td>{date(o.created_at, true)}</td><td>{o.to_email}</td><td>{o.subject}</td><td>{o.sent_at ? date(o.sent_at) : 'Not sent'}</td></tr>)}</tbody></table></div> : <Empty title="Outbox empty" />}
            </>
          )}
        </>
      )}</Async>
    </>
  );
}
