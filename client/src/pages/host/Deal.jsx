import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi, api, openDocument } from '../../lib/api.js';
import { PageHead, Async, Tabs, Field, ActionMsg, useAction, Status, Empty, Timeline, MoneyInput } from '../../components/ui.jsx';
import { FindingsList, MetricsTable, SummaryKpis } from '../../components/Findings.jsx';
import TeaserView from '../../components/TeaserView.jsx';
import { FitBreakdown } from '../../components/OpportunityCard.jsx';
import { money, stageLabel, date, ago, human } from '../../lib/format.js';

export default function HostDeal() {
  const { id } = useParams();
  const q = useApi(`/host/deals/${id}`, [id]);
  const [tab, setTab] = useState('overview');
  return (
    <Async q={q} rows={6}>{d => {
      const c = d.company;
      const reload = () => q.reload(true);
      return (
        <>
          <PageHead kicker={`${c.code} · ${d.stages.find(s => s.key === d.deal.stage)?.label}`} title={c.brand_name || c.legal_name || c.code} sub={`${c.industry || 'Industry n/a'} · ${stageLabel(c.stage)} · raising ${money(c.raise_amount, c.currency)} · founder ${d.founder.name} (${d.founder.email})`} />
          <Tabs value={tab} onChange={setTab} tabs={[
            { key: 'overview', label: 'Deal' },
            { key: 'docs', label: 'Documents', count: d.documents.length },
            { key: 'analysis', label: 'Analysis', count: d.findings.filter(f => ['open', 'under_review'].includes(f.status)).length },
            { key: 'teaser', label: 'Teaser' },
            { key: 'investors', label: 'Investors', count: d.interest.length },
            { key: 'notes', label: 'Notes & requests' },
            { key: 'activity', label: 'Activity' },
          ]} />
          {tab === 'overview' && <Overview d={d} reload={reload} />}
          {tab === 'docs' && <Docs d={d} reload={reload} />}
          {tab === 'analysis' && <Analysis d={d} reload={reload} />}
          {tab === 'teaser' && <Teaser d={d} reload={reload} />}
          {tab === 'investors' && <Investors d={d} reload={reload} />}
          {tab === 'notes' && <Notes d={d} reload={reload} />}
          {tab === 'activity' && (
            <div className="grid g2">
              <div><div className="section-title"><span className="label accent">Timeline</span></div><Timeline dark items={d.activity} /></div>
              <div><div className="section-title"><span className="label accent">Document access log</span></div>
                {d.access_log.length ? <div className="table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Document</th><th>Action</th></tr></thead><tbody>{d.access_log.map(l => <tr key={l.id}><td>{date(l.created_at, true)}</td><td>{l.user}</td><td>{l.filename}</td><td className="mono small">{l.action}</td></tr>)}</tbody></table></div> : <Empty title="No access yet" />}
              </div>
            </div>
          )}
        </>
      );
    }}</Async>
  );
}

function Overview({ d, reload }) {
  const hosts = useApi('/host/hosts');
  const [f, setF] = useState(d.deal);
  const [reason, setReason] = useState('');
  const a = useAction();
  useEffect(() => setF(d.deal), [d.deal]);
  const terminal = d.stages.find(s => s.key === d.deal.stage)?.terminal;
  const save = () => {
    const body = { owner_user_id: f.owner_user_id ? Number(f.owner_user_id) : null, next_action: f.next_action || null, due_date: f.due_date || null, outcome: f.outcome || null, amount_committed: f.amount_committed ?? null, amount_funded: f.amount_funded ?? null };
    if (f.stage !== d.deal.stage) Object.assign(body, { stage: f.stage, reason: reason || undefined, reopen: terminal || undefined });
    return a.run(() => api(`/host/deals/${d.company.id}`, { method: 'PATCH', body }), 'Deal updated.').then(reload).catch(() => {});
  };
  const c = d.company;
  return (
    <div className="grid g-side">
      <div className="stack" style={{ gap: 20 }}>
        <div className="card stack">
          <span className="label accent">Deal controls</span>
          <div className="form-grid">
            <Field label="Pipeline stage" hint={terminal ? 'Closed deal — changing stage will reopen it.' : null}><select className="input" value={f.stage} onChange={e => setF({ ...f, stage: e.target.value })}>{d.stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
            <Field label="Reason for stage change"><input className="input" value={reason} onChange={e => setReason(e.target.value)} /></Field>
            <Field label="Deal owner"><select className="input" value={f.owner_user_id ?? ''} onChange={e => setF({ ...f, owner_user_id: e.target.value || null })}><option value="">Unassigned</option>{hosts.data?.hosts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
            <Field label="Due date"><input className="input" type="date" value={f.due_date ?? ''} onChange={e => setF({ ...f, due_date: e.target.value })} /></Field>
            <Field label="Next action" full><input className="input" value={f.next_action ?? ''} onChange={e => setF({ ...f, next_action: e.target.value })} /></Field>
            <Field label={`Amount committed (${c.currency})`} hint="Signed commitments only — never expressions of interest"><MoneyInput value={f.amount_committed} onChange={v => setF({ ...f, amount_committed: v })} /></Field>
            <Field label={`Amount funded (${c.currency})`} hint="Required to close as funded"><MoneyInput value={f.amount_funded} onChange={v => setF({ ...f, amount_funded: v })} /></Field>
            <Field label="Outcome / closing notes" full><textarea className="input" value={f.outcome ?? ''} onChange={e => setF({ ...f, outcome: e.target.value })} /></Field>
          </div>
          <ActionMsg a={a} />
          <div><button className="btn" onClick={save} disabled={a.busy}>Save deal</button></div>
        </div>
        <div className="card stack">
          <span className="label accent">Company profile ({d.completeness}% complete)</span>
          <div className="grid g2 small">
            {[['Legal name', c.legal_name], ['Website', c.website], ['HQ', c.headquarters], ['Founded', c.founding_year], ['Model', c.business_model], ['Geography', c.geography], ['Round size', money(c.round_size, c.currency)], ['Seeking lead', c.seeking_lead == null ? '—' : c.seeking_lead ? 'Yes' : 'No'], ['Previous rounds', c.previous_rounds], ['Existing investors', c.existing_investors]].map(([k, v]) => <div key={k}><span className="label">{k}</span><div>{v || '—'}</div></div>)}
          </div>
          {[['Description', c.description], ['Leadership', c.leadership], ['Use of funds', c.use_of_funds], ['Traction', c.traction]].map(([k, v]) => <div key={k}><span className="label">{k}</span><p>{v || <span className="muted">Not provided</span>}</p></div>)}
        </div>
      </div>
      <aside className="stack" style={{ gap: 16 }}>
        <Disclosure d={d} reload={reload} />
        <div className="card stack small">
          <span className="label">Founder account</span>
          <div><Link to={`/host/users/${d.founder.id}`}>{d.founder.name}</Link> · <Status s={d.founder.status} /></div>
          <div className="muted">Registered {date(d.founder.created_at)} · last login {ago(d.founder.last_login_at)}</div>
        </div>
        <div className="card stack small">
          <span className="label">Deal record</span>
          <div>Owner: {d.deal.owner || 'Unassigned'}</div>
          <div>Updated {ago(d.deal.updated_at)}</div>
          {d.deal.closed_at && <div>Closed {date(d.deal.closed_at)}</div>}
        </div>
      </aside>
    </div>
  );
}

function Disclosure({ d, reload }) {
  const a = useAction();
  const on = d.company.disclose_identity === 1;
  return (
    <div className="card stack">
      <span className="label accent">Identity disclosure</span>
      <p className="small">{on ? 'Company name, website and document names are visible to all investors who can see this teaser.' : 'Investors see an anonymised project code until you disclose per introduction or globally.'}</p>
      <ActionMsg a={a} />
      <button className={`btn sm ${on ? 'danger' : 'ghost'}`} disabled={a.busy} onClick={() => a.run(() => api(`/host/deals/${d.company.id}`, { method: 'PATCH', body: { disclose_identity: on ? 0 : 1 } })).then(reload).catch(() => {})}>{on ? 'Re-anonymise' : 'Disclose to all investors'}</button>
    </div>
  );
}

function Docs({ d, reload }) {
  const a = useAction();
  const approved = d.introductions.filter(i => ['approved', 'completed'].includes(i.status));
  const [grant, setGrant] = useState({});
  return (
    <div className="stack" style={{ gap: 20 }}>
      <ActionMsg a={a} />
      {d.documents.length ? (
        <div className="table-wrap"><table>
          <thead><tr><th>Document</th><th>Category</th><th>Status</th><th>Uploaded</th><th>Share with approved investor</th><th /></tr></thead>
          <tbody>{d.documents.map(doc => (
            <tr key={doc.id}>
              <td><strong>{doc.filename}</strong> <span className="mono small">v{doc.version}</span><div className="small muted" style={{ maxWidth: 340 }}>{doc.status_detail}</div></td>
              <td>{human(doc.category)}</td><td><Status s={doc.status} /></td><td>{date(doc.created_at, true)}</td>
              <td>
                {approved.length ? (
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <select className="input" style={{ width: 'auto' }} value={grant[doc.id] || ''} onChange={e => setGrant({ ...grant, [doc.id]: e.target.value })}><option value="">Select investor…</option>{approved.map(i => <option key={i.investor_id} value={i.investor_id}>{i.investor}{i.firm ? ` (${i.firm})` : ''}</option>)}</select>
                    <button className="btn sm" disabled={!grant[doc.id]} onClick={() => a.run(() => api('/host/grants', { method: 'POST', body: { document_id: doc.id, investor_id: Number(grant[doc.id]) } }), 'Access granted.').then(reload).catch(() => {})}>Share</button>
                  </div>
                ) : <span className="small muted">Approve an introduction first</span>}
              </td>
              <td className="row" style={{ flexWrap: 'nowrap' }}>
                <button className="btn sm ghost" onClick={() => openDocument('host', doc.id).catch(e => a.setError(e))}>Open</button>
                <button className="btn sm ghost" onClick={() => a.run(() => api(`/host/documents/${doc.id}/reprocess`, { method: 'POST' }), 'Reprocessing started.').then(() => setTimeout(reload, 1500)).catch(() => {})}>Reprocess</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <Empty title="No documents uploaded" />}
      <div>
        <div className="section-title"><span className="label accent">Data-room grants</span></div>
        {d.grants.length ? <div className="table-wrap"><table><thead><tr><th>Document</th><th>Investor</th><th>Granted</th><th>Status</th><th /></tr></thead>
          <tbody>{d.grants.map(g => (
            <tr key={`${g.document_id}-${g.investor_id}`}><td>{g.filename}</td><td>{g.investor}</td><td>{date(g.created_at, true)}</td><td>{g.revoked_at ? <Status s="rejected" label={`revoked ${date(g.revoked_at)}`} /> : <Status s="active" />}</td>
              <td>{!g.revoked_at && <button className="btn sm danger" onClick={() => a.run(() => api(`/host/grants?document_id=${g.document_id}&investor_id=${g.investor_id}`, { method: 'DELETE' }), 'Access revoked.').then(reload).catch(() => {})}>Revoke</button>}</td></tr>
          ))}</tbody></table></div> : <div className="small muted">No documents shared with investors.</div>}
      </div>
    </div>
  );
}

function Analysis({ d, reload }) {
  const a = useAction();
  const [view, setView] = useState('findings');
  return (
    <div className="stack" style={{ gap: 20 }}>
      <SummaryKpis s={d.summary} currency={d.company.currency} />
      <div className="row between">
        <Tabs value={view} onChange={setView} tabs={[{ key: 'findings', label: 'Findings', count: d.findings.length }, { key: 'figures', label: 'Figures', count: d.metrics.length }, { key: 'jobs', label: 'AI jobs', count: d.ai_jobs.length }]} />
        <button className="btn ghost sm" onClick={() => a.run(() => api(`/host/deals/${d.company.id}/reanalyze`, { method: 'POST' }), 'Analysis re-run.').then(reload).catch(() => {})}>Re-run analysis</button>
      </div>
      <ActionMsg a={a} />
      {view === 'findings' && <FindingsList findings={d.findings} render={f => <Review f={f} reload={reload} companyId={d.company.id} />} />}
      {view === 'figures' && <MetricsTable metrics={d.metrics} />}
      {view === 'jobs' && (d.ai_jobs.length ? <div className="table-wrap"><table><thead><tr><th>Document</th><th>Kind</th><th>Status</th><th>Attempts</th><th>Error</th><th>Updated</th></tr></thead><tbody>{d.ai_jobs.map(j => <tr key={j.id}><td>{j.filename}</td><td>{j.kind}</td><td><Status s={j.status} /></td><td>{j.attempts}</td><td className="small">{j.error || '—'}</td><td>{ago(j.updated_at)}</td></tr>)}</tbody></table></div> : <Empty title="No AI jobs" />)}
    </div>
  );
}

function Review({ f, reload, companyId }) {
  const [notes, setNotes] = useState(f.reviewer_notes || '');
  const a = useAction();
  const [showHist, setShowHist] = useState(false);
  const [history, setHistory] = useState(null);
  const set = (status) => a.run(() => api(`/host/findings/${f.id}`, { method: 'PATCH', body: { status, reviewer_notes: notes || undefined } }), `Marked ${status.replace('_', ' ')}.`).then(reload).catch(() => {});
  return (
    <div className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <Field label="Reviewer notes (internal)"><textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      <ActionMsg a={a} />
      <div className="row">
        {['under_review', 'explained', 'resolved', 'dismissed', 'open'].filter(s => s !== f.status).map(s => <button key={s} className={`btn sm ${s === 'dismissed' ? 'danger' : 'ghost'}`} disabled={a.busy} onClick={() => set(s)}>{human(s)}</button>)}
        {f.question && <button className="btn sm ghost" onClick={() => a.run(() => api(`/host/deals/${companyId}/requests`, { method: 'POST', body: { message: f.question } }), 'Question sent to founder.').then(reload).catch(() => {})}>Ask founder</button>}
        <button className="btn sm ghost" onClick={async () => { setShowHist(!showHist); if (!history) setHistory((await api(`/host/findings/${f.id}/history`)).history); }}>History</button>
      </div>
      {showHist && history && (history.length ? <div className="small">{history.map(h => <div key={h.id}>{date(h.created_at, true)} · {h.actor || 'system'} · {h.from_status} → {h.to_status}{h.note ? ` — ${h.note}` : ''}</div>)}</div> : <div className="small muted">No history yet.</div>)}
    </div>
  );
}

function Teaser({ d, reload }) {
  const a = useAction();
  const [sel, setSel] = useState(d.teasers.find(t => t.status !== 'superseded')?.id || d.teasers[0]?.id);
  const t = d.teasers.find(x => x.id === sel);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  return (
    <div className="grid g-side">
      <div>{t ? <TeaserView c={t.content} /> : <Empty title="No teaser generated yet" />}</div>
      <aside className="stack" style={{ gap: 16 }}>
        <ActionMsg a={a} />
        <button className="btn ghost" onClick={() => a.run(() => api(`/host/deals/${d.company.id}/teaser/generate`, { method: 'POST' }), 'New draft generated.').then(r => { reload(); setSel(r?.id); }).catch(() => {})}>Generate new version</button>
        {t && <button className="btn ghost" onClick={() => window.print()}>Export PDF</button>}
        {t && ['pending_approval', 'draft'].includes(t.status) && (
          <div className="card stack">
            <span className="label accent">Review v{t.version}</span>
            <Field label="Note to founder" hint="Required for rejection"><textarea className="input" value={note} onChange={e => setNote(e.target.value)} /></Field>
            <div className="row">
              <button className="btn accent" disabled={a.busy} onClick={() => a.run(() => api(`/host/teasers/${t.id}/review`, { method: 'POST', body: { decision: 'approve', note: note || undefined } }), 'Approved. The company is now in investor discovery.').then(reload).catch(() => {})}>Approve & release</button>
              <button className="btn danger" disabled={a.busy} onClick={() => a.run(() => api(`/host/teasers/${t.id}/review`, { method: 'POST', body: { decision: 'reject', note } }), 'Rejected and returned to founder.').then(reload).catch(() => {})}>Reject</button>
            </div>
            {!editing ? <button className="btn ghost sm" onClick={() => setEditing(true)}>Edit content</button> : <HostEdit t={t} onDone={() => { setEditing(false); reload(); }} />}
          </div>
        )}
        <div className="card stack">
          <span className="label">Versions</span>
          {d.teasers.length ? d.teasers.map(x => (
            <button key={x.id} className="row between" onClick={() => setSel(x.id)} style={{ border: 0, background: x.id === sel ? 'var(--surface-2)' : 'transparent', padding: 8, cursor: 'pointer' }}>
              <span>v{x.version} · {x.generated_by}</span><Status s={x.status} />
            </button>
          )) : <span className="small muted">None</span>}
        </div>
      </aside>
    </div>
  );
}

function HostEdit({ t, onDone }) {
  const keys = ['overview', 'problem', 'solution', 'market', 'differentiation', 'traction'];
  const [v, setV] = useState({ ...Object.fromEntries(keys.map(k => [k, t.content[k]?.text || ''])), highlights: (t.content.highlights || []).map(h => h.text).join('\n'), risks: (t.content.risks || []).map(r => r.text).join('\n') });
  const a = useAction();
  return (
    <div className="stack">
      {keys.map(k => <Field key={k} label={k}><textarea className="input" value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} /></Field>)}
      <Field label="Highlights (one per line)"><textarea className="input" value={v.highlights} onChange={e => setV({ ...v, highlights: e.target.value })} /></Field>
      <Field label="Risks (one per line)"><textarea className="input" value={v.risks} onChange={e => setV({ ...v, risks: e.target.value })} /></Field>
      <ActionMsg a={a} />
      <button className="btn sm" onClick={() => a.run(() => api(`/host/teasers/${t.id}`, { method: 'PUT', body: { ...Object.fromEntries(keys.map(k => [k, v[k].trim() || null])), highlights: v.highlights.split('\n').map(s => s.trim()).filter(Boolean), risks: v.risks.split('\n').map(s => s.trim()).filter(Boolean) } })).then(onDone).catch(() => {})}>Save edits</button>
    </div>
  );
}

function Investors({ d, reload }) {
  const m = useApi(`/host/deals/${d.company.id}/matches`, [d.company.id]);
  const a = useAction();
  return (
    <div className="stack" style={{ gap: 24 }}>
      <ActionMsg a={a} />
      <div>
        <div className="section-title"><span className="label accent">Introductions</span></div>
        {d.introductions.length ? <IntroTable rows={d.introductions} a={a} reload={reload} /> : <Empty title="No introduction requests" />}
      </div>
      <div>
        <div className="section-title"><span className="label accent">All swipe activity</span></div>
        {d.interest.length ? <div className="table-wrap"><table><thead><tr><th>Investor</th><th>Action</th><th>Fit at swipe</th><th>When</th></tr></thead>
          <tbody>{d.interest.map(i => <tr key={i.investor_id}><td><Link to={`/host/users/${i.investor_id}`}>{i.name}</Link>{i.firm ? ` · ${i.firm}` : ''}</td><td><Status s={i.action} /></td><td className="mono">{i.score ?? '—'}</td><td>{date(i.updated_at, true)}</td></tr>)}</tbody></table></div> : <Empty title="No swipes yet" />}
      </div>
      <div>
        <div className="section-title"><span className="label accent">Mandate fit — all active investors</span></div>
        <Async q={m}>{x => x.matches.length ? (
          <div className="grid g2">{x.matches.slice(0, 12).map(r => (
            <div key={r.investor_id} className="card stack"><div className="row between"><span><strong>{r.name}</strong>{r.firm ? ` · ${r.firm}` : ''}</span><span className="display" style={{ fontSize: 32, color: r.match.eligible ? 'var(--accent)' : 'var(--crit)' }}>{r.match.score}</span></div><FitBreakdown match={r.match} compact /></div>
          ))}</div>
        ) : <Empty title="No investors registered" />}</Async>
      </div>
    </div>
  );
}

export function IntroTable({ rows, a, reload, showCompany }) {
  const patch = (id, body, msg) => a.run(() => api(`/host/introductions/${id}`, { method: 'PATCH', body }), msg).then(reload).catch(() => {});
  return (
    <div className="table-wrap"><table>
      <thead><tr>{showCompany && <th>Company</th>}<th>Investor</th><th>Status</th><th>Disclose investor → founder</th><th>Disclose company → investor</th><th>Requested</th><th>Decision</th></tr></thead>
      <tbody>{rows.map(i => (
        <tr key={i.id}>
          {showCompany && <td><Link to={`/host/deals/${i.company_id}`}>{i.company}</Link><div className="small muted">{i.code}</div></td>}
          <td><Link to={`/host/users/${i.investor_id}`}>{i.investor}</Link>{i.firm ? <div className="small muted">{i.firm}</div> : null}{i.score != null && <div className="small mono">fit {i.score}</div>}</td>
          <td><Status s={i.status} /></td>
          <td><input type="checkbox" aria-label="Disclose investor identity to founder" checked={!!i.disclose_investor} onChange={e => patch(i.id, { disclose_investor: e.target.checked ? 1 : 0 }, 'Disclosure updated.')} /></td>
          <td><input type="checkbox" aria-label="Disclose company identity to investor" checked={!!i.disclose_founder} onChange={e => patch(i.id, { disclose_founder: e.target.checked ? 1 : 0 }, 'Disclosure updated.')} /></td>
          <td>{date(i.created_at, true)}</td>
          <td className="row" style={{ flexWrap: 'nowrap' }}>
            {i.status !== 'approved' && i.status !== 'completed' && <button className="btn sm accent" onClick={() => patch(i.id, { status: 'approved' }, 'Introduction approved; both parties notified.')}>Approve</button>}
            {i.status === 'approved' && <button className="btn sm" onClick={() => patch(i.id, { status: 'completed' }, 'Marked completed.')}>Mark done</button>}
            {i.status === 'pending' && <button className="btn sm ghost" onClick={() => patch(i.id, { status: 'deferred' }, 'Deferred.')}>Defer</button>}
            {!['rejected', 'completed'].includes(i.status) && <button className="btn sm danger" onClick={() => patch(i.id, { status: 'rejected' }, 'Rejected; any shared documents were revoked.')}>Reject</button>}
          </td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function Notes({ d, reload }) {
  const [note, setNote] = useState('');
  const [fu, setFu] = useState('');
  const [req, setReq] = useState('');
  const a = useAction();
  return (
    <div className="grid g2">
      <div className="stack">
        <div className="card stack">
          <span className="label accent">Internal note (host only)</span>
          <textarea className="input" value={note} onChange={e => setNote(e.target.value)} />
          <Field label="Follow-up date (optional)"><input className="input" type="date" value={fu} onChange={e => setFu(e.target.value)} /></Field>
          <button className="btn sm" disabled={!note.trim() || a.busy} onClick={() => a.run(() => api(`/host/deals/${d.company.id}/notes`, { method: 'POST', body: { body: note, follow_up_date: fu || null } }), 'Note added.').then(() => { setNote(''); setFu(''); reload(); }).catch(() => {})}>Add note</button>
        </div>
        {d.notes.map(n => <div key={n.id} className="card"><div className="label">{date(n.created_at, true)} · {n.author}{n.follow_up_date ? ` · follow up ${n.follow_up_date}` : ''}</div><p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{n.body}</p></div>)}
      </div>
      <div className="stack">
        <div className="card stack">
          <span className="label accent">Request information from founder</span>
          <textarea className="input" value={req} onChange={e => setReq(e.target.value)} placeholder="Visible to the founder" />
          <button className="btn sm" disabled={req.trim().length < 3 || a.busy} onClick={() => a.run(() => api(`/host/deals/${d.company.id}/requests`, { method: 'POST', body: { message: req } }), 'Request sent to founder.').then(() => { setReq(''); reload(); }).catch(() => {})}>Send request</button>
        </div>
        <ActionMsg a={a} />
        {d.requests.map(r => <div key={r.id} className="card stack"><div className="row between"><span className="label">{date(r.created_at, true)}</span><Status s={r.status} /></div><p style={{ margin: 0 }}>{r.message}</p>{r.response && <div className="notice"><span className="label">Founder · {date(r.answered_at)}</span><p style={{ margin: 0 }}>{r.response}</p></div>}</div>)}
      </div>
    </div>
  );
}
