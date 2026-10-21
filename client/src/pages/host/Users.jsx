import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi, api } from '../../lib/api.js';
import { PageHead, Async, Tabs, Status, Empty, Pager, useAction, ActionMsg } from '../../components/ui.jsx';
import { date, ago, human, money, stageLabel } from '../../lib/format.js';

export function HostUsers() {
  const [f, setF] = useState({ role: '', q: '', status: '', page: 1 });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const q = useApi(`/host/users?${qs}`, [qs]);
  const nav = useNavigate();
  return (
    <>
      <PageHead kicker="Accounts" title="Users" />
      <Tabs value={f.role} onChange={role => setF({ ...f, role, page: 1 })} tabs={[{ key: '', label: 'All' }, { key: 'founder', label: 'Founders' }, { key: 'investor', label: 'Investors' }, { key: 'host', label: 'Hosts' }]} />
      <div className="row" style={{ marginBottom: 16 }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Search name, email, company, firm" value={f.q} onChange={e => setF({ ...f, q: e.target.value, page: 1 })} />
        <select className="input" style={{ width: 'auto' }} value={f.status} onChange={e => setF({ ...f, status: e.target.value, page: 1 })}><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="deactivated">Deactivated</option></select>
      </div>
      <Async q={q}>{d => d.users.length ? (
        <>
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Role</th><th>Organisation</th><th>Status</th><th>Verified</th><th>Registered</th><th>Last login</th><th>Last active</th></tr></thead>
            <tbody>{d.users.map(u => (
              <tr key={u.id} className="click" onClick={() => nav(`/host/users/${u.id}`)}>
                <td><strong>{u.name}</strong><div className="small muted">{u.email}</div></td><td>{u.role}</td>
                <td>{u.company_id ? <Link to={`/host/deals/${u.company_id}`} onClick={e => e.stopPropagation()}>{u.company}</Link> : u.firm || '—'}</td>
                <td><Status s={u.status} /></td><td>{u.email_verified ? 'Yes' : 'No'}</td>
                <td>{date(u.created_at)}</td><td>{ago(u.last_login_at)}</td><td>{ago(u.last_active_at)}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <Pager page={d.page} pages={d.pages} onPage={p => setF({ ...f, page: p })} />
        </>
      ) : <Empty title="No users found" />}</Async>
    </>
  );
}

export function HostUser() {
  const { id } = useParams();
  const q = useApi(`/host/users/${id}`, [id]);
  const a = useAction();
  return (
    <Async q={q}>{d => (
      <>
        <PageHead kicker={`${d.user.role} · ${d.user.email}`} title={d.user.name} sub={`Registered ${date(d.user.created_at)} · last login ${ago(d.user.last_login_at)}`}>
          <Status s={d.user.status} />
          {d.user.role !== 'host' && (d.user.status === 'active'
            ? <><button className="btn danger" onClick={() => a.run(() => api(`/host/users/${id}/status`, { method: 'POST', body: { status: 'suspended' } }), 'Account suspended; sessions and document access revoked.').then(() => q.reload(true)).catch(() => {})}>Suspend</button>
                <button className="btn danger" onClick={() => a.run(() => api(`/host/users/${id}/status`, { method: 'POST', body: { status: 'deactivated' } }), 'Account deactivated.').then(() => q.reload(true)).catch(() => {})}>Deactivate</button></>
            : <button className="btn" onClick={() => a.run(() => api(`/host/users/${id}/status`, { method: 'POST', body: { status: 'active' } }), 'Account reactivated.').then(() => q.reload(true)).catch(() => {})}>Reactivate</button>)}
        </PageHead>
        <ActionMsg a={a} />
        <div className="grid g2">
          <div className="stack">
            {d.company && <div className="card"><span className="label">Company</span><div><Link to={`/host/deals/${d.company.id}`}>{d.company.brand_name || d.company.legal_name || d.company.code}</Link></div></div>}
            {d.mandate && (
              <div className="card stack small">
                <span className="label accent">Mandate · {d.mandate_completeness}% complete</span>
                <div><b>Firm:</b> {d.mandate.firm || '—'} · {human(d.mandate.investor_type)}</div>
                <div><b>Sectors:</b> {d.mandate.sectors.join(', ') || 'Any'}</div>
                <div><b>Models:</b> {d.mandate.business_models.join(', ') || 'Any'}</div>
                <div><b>Stages:</b> {d.mandate.stages.map(stageLabel).join(', ') || 'Any'}{d.mandate.excluded_stages.length ? ` · excludes ${d.mandate.excluded_stages.map(stageLabel).join(', ')}` : ''}</div>
                <div><b>Geographies:</b> {d.mandate.geographies.join(', ') || 'Any'}</div>
                <div><b>Ticket:</b> {money(d.mandate.ticket_min)} – {money(d.mandate.ticket_max)} · <b>Round:</b> {money(d.mandate.round_min)} – {money(d.mandate.round_max)}</div>
                <div><b>Lead:</b> {human(d.mandate.lead_preference)} · <b>Min revenue:</b> {money(d.mandate.min_revenue)}{d.mandate.requires_revenue ? ' · revenue required' : ''}{d.mandate.requires_profitability ? ' · profitable only' : ''}</div>
              </div>
            )}
            {d.swipes && (
              <div><div className="section-title"><span className="label accent">Swipes</span></div>
                {d.swipes.length ? <div className="table-wrap"><table><thead><tr><th>Company</th><th>Action</th><th>Fit</th><th>When</th></tr></thead><tbody>{d.swipes.map(s => <tr key={s.company_id}><td><Link to={`/host/deals/${s.company_id}`}>{s.company}</Link></td><td><Status s={s.action} /></td><td className="mono">{s.score}</td><td>{date(s.updated_at, true)}</td></tr>)}</tbody></table></div> : <Empty title="No swipes yet" />}
              </div>
            )}
          </div>
          <div><div className="section-title"><span className="label accent">Login history</span></div>
            {d.logins.length ? <div className="table-wrap"><table><thead><tr><th>When</th><th>Result</th><th>IP</th></tr></thead><tbody>{d.logins.map((l, i) => <tr key={i}><td>{date(l.created_at, true)}</td><td>{l.success ? <Status s="active" label="success" /> : <Status s="failed" />}</td><td className="mono small">{l.ip}</td></tr>)}</tbody></table></div> : <Empty title="No logins recorded" />}
          </div>
        </div>
      </>
    )}</Async>
  );
}
