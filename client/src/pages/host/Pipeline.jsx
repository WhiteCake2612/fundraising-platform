import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApi, api } from '../../lib/api.js';
import { useMeta } from '../../components/Shell.jsx';
import { PageHead, Async, Tabs, Status, Pager, ErrorBox, Empty } from '../../components/ui.jsx';
import { money, stageLabel, date, ago } from '../../lib/format.js';

export default function HostPipeline() {
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') || 'board';
  const meta = useMeta();
  const [f, setF] = useState({ q: sp.get('q') || '', stage: '', industry: '', sort: sp.get('sort') || 'updated', page: 1 });
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), size: view === 'board' ? 500 : 25 }).toString();
  const q = useApi(`/host/deals?${qs}`, [qs]);
  const nav = useNavigate();
  const [err, setErr] = useState(null);
  const [over, setOver] = useState(null);

  const move = async (id, stage) => {
    setErr(null);
    try { await api(`/host/deals/${id}`, { method: 'PATCH', body: { stage, reason: 'Moved on pipeline board' } }); q.reload(true); } catch (e) { setErr(e); }
  };

  return (
    <>
      <PageHead kicker="Deal pipeline" title="Pipeline">
        <a className="btn ghost" href="/api/host/export/deals.csv">Export CSV</a>
      </PageHead>
      <Tabs value={view} onChange={v => setSp({ view: v })} tabs={[{ key: 'board', label: 'Kanban' }, { key: 'table', label: 'Table' }]} />
      <div className="row" style={{ marginBottom: 16 }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search company, code, founder email" value={f.q} onChange={e => setF({ ...f, q: e.target.value, page: 1 })} />
        {meta && <select className="input" style={{ width: 'auto' }} value={f.industry} onChange={e => setF({ ...f, industry: e.target.value, page: 1 })}><option value="">All industries</option>{meta.sectors.map(s => <option key={s}>{s}</option>)}</select>}
        {view === 'table' && q.data && <select className="input" style={{ width: 'auto' }} value={f.stage} onChange={e => setF({ ...f, stage: e.target.value, page: 1 })}><option value="">All stages</option>{q.data.stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>}
        {view === 'table' && <select className="input" style={{ width: 'auto' }} value={f.sort} onChange={e => setF({ ...f, sort: e.target.value })}><option value="updated">Recently updated</option><option value="raise">Largest raise</option><option value="interest">Most interest</option><option value="due">Next due</option><option value="name">Name</option></select>}
      </div>
      <ErrorBox error={err} />
      <Async q={q}>{d => view === 'board' ? (
        <div className="kanban">
          {d.stages.map(s => {
            const cards = d.deals.filter(x => x.stage === s.key);
            return (
              <div key={s.key} className={`lane ${over === s.key ? 'over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(s.key); }} onDragLeave={() => setOver(null)}
                onDrop={e => { e.preventDefault(); setOver(null); const id = Number(e.dataTransfer.getData('text/plain')); if (id) move(id, s.key); }}>
                <div className="row between"><span className="label" style={{ color: 'var(--ink)' }}>{s.label}</span><span className="mono small">{cards.length}</span></div>
                {cards.map(c => (
                  <div key={c.id} className="kcard" draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(c.id))} onClick={() => nav(`/host/deals/${c.id}`)} role="link" tabIndex={0} onKeyDown={e => e.key === 'Enter' && nav(`/host/deals/${c.id}`)}>
                    <div style={{ fontWeight: 600 }}>{c.name || c.code}</div>
                    <div className="small muted">{c.industry || '—'} · {stageLabel(c.round_stage)} · {money(c.raise_amount, c.currency)}</div>
                    <div className="row small" style={{ gap: 8, marginTop: 6 }}>
                      {c.interest > 0 && <span className="badge b-accent">{c.interest} interest</span>}
                      {c.open_findings > 0 && <span className="badge b-high">{c.open_findings} findings</span>}
                      {c.due_date && <span className={`badge ${c.due_date < new Date().toISOString().slice(0, 10) ? 'b-crit' : 'b-muted'}`}>due {c.due_date}</span>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : d.deals.length ? (
        <>
          <div className="table-wrap"><table>
            <thead><tr><th>Company</th><th>Round</th><th>Raise</th><th>Pipeline stage</th><th>Owner</th><th>Next action</th><th>Interest</th><th>Findings</th><th>Teaser</th><th>Updated</th></tr></thead>
            <tbody>{d.deals.map(c => (
              <tr key={c.id} className="click" onClick={() => nav(`/host/deals/${c.id}`)}>
                <td><Link to={`/host/deals/${c.id}`} onClick={e => e.stopPropagation()}><strong>{c.name || '—'}</strong></Link><div className="small muted">{c.code} · {c.founder_email}</div></td>
                <td>{stageLabel(c.round_stage)}</td><td>{money(c.raise_amount, c.currency)}</td>
                <td>{d.stages.find(s => s.key === c.stage)?.label}</td><td>{c.owner || '—'}</td>
                <td>{c.next_action || '—'}{c.due_date && <div className="small muted">{date(c.due_date)}</div>}</td>
                <td className="mono">{c.interest}</td><td className="mono">{c.open_findings}</td>
                <td>{c.teaser_status ? <Status s={c.teaser_status} /> : '—'}</td><td>{ago(c.updated_at)}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <Pager page={d.page} pages={d.pages} onPage={p => setF({ ...f, page: p })} />
        </>
      ) : <Empty title="No deals match" />}</Async>
    </>
  );
}
