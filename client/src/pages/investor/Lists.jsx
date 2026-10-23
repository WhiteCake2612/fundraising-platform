import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi, api, openDocument } from '../../lib/api.js';
import { PageHead, Async, Tabs, Empty, Status, Field, ActionMsg, useAction } from '../../components/ui.jsx';
import TeaserView from '../../components/TeaserView.jsx';
import { FitBreakdown } from '../../components/OpportunityCard.jsx';
import { money, stageLabel, date, human } from '../../lib/format.js';
import Compare from '../../components/Compare.jsx';
import { useMeta } from '../../components/Shell.jsx';
import { Icon } from '../../components/icons.jsx';

export function InvestorShortlist() {
  const q = useApi('/investor/shortlist');
  const [tab, setTab] = useState('interested');
  const a = useAction();
  const meta = useMeta();
  const [picked, setPicked] = useState([]);
  const [comparing, setComparing] = useState(false);
  const [tag, setTag] = useState('');
  const pick = (id) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= 3 ? p : [...p, id]));
  return (
    <>
      <PageHead kicker="Your decisions" title="Shortlist" sub="Tick up to three companies to compare them side by side." />
      <Async q={q}>{d => {
        const everything = [...d.interested, ...d.saved, ...d.passed];
        const tags = [...new Set(everything.flatMap(x => x.my_note?.tags || []))].sort();
        const rows = d[tab].filter(x => !tag || x.my_note?.tags?.includes(tag));
        return (
        <>
          <Tabs value={tab} onChange={setTab} tabs={[{ key: 'interested', label: 'Interested', count: d.interested.length }, { key: 'saved', label: 'Saved', count: d.saved.length }, { key: 'passed', label: 'Passed', count: d.passed.length }]} />
          <ActionMsg a={a} />
          <div className="row" style={{ margin: '12px 0' }}>
            {tags.length > 0 && <select className="input" style={{ width: 'auto' }} value={tag} onChange={e => setTag(e.target.value)} aria-label="Filter by tag"><option value="">All tags</option>{tags.map(t => <option key={t}>{t}</option>)}</select>}
            <button className="btn sm" disabled={picked.length < 2} onClick={() => setComparing(true)}><Icon name="columns" size={13} /> Compare{picked.length ? ` (${picked.length})` : ''}</button>
            {picked.length > 0 && <button className="btn ghost sm" onClick={() => setPicked([])}>Clear selection</button>}
            {picked.length >= 3 && <span className="small muted">Comparison is limited to three so every series stays distinguishable.</span>}
          </div>
          {comparing && <Compare items={picked.map(id => everything.find(x => x.company_id === id)).filter(Boolean)} onClose={() => setComparing(false)} />}
          {rows.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th aria-label="Select" /><th>Opportunity</th><th>Stage</th><th>Raising</th><th>Fit</th><th>{tab === 'passed' ? 'Pass reason' : 'Introduction'}</th><th>My tags</th><th /></tr></thead>
              <tbody>{rows.map(x => (
                <tr key={x.company_id}>
                  <td><input type="checkbox" checked={picked.includes(x.company_id)} disabled={!picked.includes(x.company_id) && picked.length >= 3} onChange={() => pick(x.company_id)} aria-label={`Select ${x.name || x.code} to compare`} /></td>
                  <td><Link to={`/investor/opportunities/${x.company_id}`}><strong>{x.name || `Project ${x.code}`}</strong></Link><div className="small muted">{x.industry} · {x.business_model}</div></td>
                  <td>{stageLabel(x.stage)}</td><td>{money(x.raise?.amount, x.currency)}</td>
                  <td className="display" style={{ fontSize: 24 }}>{x.match.score}</td>
                  <td>{tab === 'passed' ? (x.pass_reason ? (meta?.passReasons?.[x.pass_reason] || human(x.pass_reason)) : <span className="muted">—</span>) : x.introduction ? <Status s={x.introduction.status} /> : <span className="muted">—</span>}</td>
                  <td className="cmp-tags">{x.my_note?.tags?.length ? x.my_note.tags.map(t => <span key={t}>{t}</span>) : <span className="muted">—</span>}{x.my_note?.note && <Icon name="pen" size={12} title={x.my_note.note} />}</td>
                  <td className="row" style={{ flexWrap: 'nowrap' }}>
                    {tab !== 'interested' && <button className="btn sm" onClick={() => a.run(() => api('/investor/swipes', { method: 'POST', body: { company_id: x.company_id, action: 'interested' } }), 'Interest recorded.').then(() => q.reload(true)).catch(() => {})}>Interested</button>}
                    {tab === 'saved' && <button className="btn sm ghost" onClick={() => a.run(() => api('/investor/swipes', { method: 'POST', body: { company_id: x.company_id, action: 'passed' } })).then(() => q.reload(true)).catch(() => {})}>Pass</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty title={tag ? `No ${tab} opportunities tagged “${tag}”` : `No ${tab} opportunities`} />}
        </>
        );
      }}</Async>
    </>
  );
}

export function InvestorIntroductions() {
  const q = useApi('/investor/introductions');
  return (
    <>
      <PageHead kicker="Host-managed" title="Introductions" sub="Every expression of interest is reviewed by the host before an introduction is made." />
      <Async q={q}>{d => d.introductions.length ? (
        <div className="table-wrap"><table>
          <thead><tr><th>Company</th><th>Status</th><th>Deal stage</th><th>Founder contact</th><th>Updated</th></tr></thead>
          <tbody>{d.introductions.map(i => (
            <tr key={i.id}>
              <td><Link to={`/investor/opportunities/${i.company_id}`}><strong>{i.name || `Project ${i.code}`}</strong></Link><div className="small muted">{i.industry} · {stageLabel(i.stage)}</div>{i.website && <div className="small">{i.website}</div>}</td>
              <td><Status s={i.status} label={i.status === 'pending' ? 'awaiting host review' : undefined} /></td>
              <td>{i.deal_stage ? human(i.deal_stage) : '—'}</td>
              <td>{i.founder_name ? <>{i.founder_name}<div className="small muted">{i.founder_email}</div></> : <span className="muted">Disclosed after approval</span>}</td>
              <td>{date(i.updated_at)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <Empty title="No introductions yet">Swipe right on opportunities to request an introduction.</Empty>}</Async>
    </>
  );
}

export function InvestorOpportunity() {
  const { id } = useParams();
  const q = useApi(`/investor/companies/${id}`, [id]);
  const a = useAction();
  const [msg, setMsg] = useState('');
  return (
    <Async q={q}>{({ item, documents }) => (
      <>
        <PageHead kicker={`${stageLabel(item.stage)} · ${item.industry}`} title={item.name || `Project ${item.code}`} sub={`Teaser v${item.teaser_version} · approved ${date(item.approved_at)}`}>
          <button className="btn ghost" onClick={() => window.print()}>Export PDF</button>
          {item.swipe !== 'interested' && <button className="btn accent" onClick={() => a.run(() => api('/investor/swipes', { method: 'POST', body: { company_id: item.company_id, action: 'interested' } }), 'Interest recorded. The host will review your introduction request.').then(() => q.reload(true)).catch(() => {})}>I'm interested</button>}
          {!item.swipe && <button className="btn ghost" onClick={() => a.run(() => api('/investor/swipes', { method: 'POST', body: { company_id: item.company_id, action: 'saved' } }), 'Saved.').then(() => q.reload(true)).catch(() => {})}>Save</button>}
        </PageHead>
        <ActionMsg a={a} />
        <div className="grid g-side" style={{ marginTop: 16 }}>
          <TeaserView c={item} anonymous={!item.identity_disclosed} />
          <aside className="stack" style={{ gap: 20 }}>
            <div className="card"><div className="row between"><span className="label">Mandate fit</span><span className="display" style={{ fontSize: 48, color: 'var(--accent)' }}>{item.match.score}</span></div><FitBreakdown match={item.match} /></div>
            <div className="card stack">
              <span className="label">Status</span>
              <div className="row">{item.swipe ? <Status s={item.swipe} /> : <span className="muted">Not reviewed</span>}{item.introduction && <Status s={item.introduction.status} label={`intro ${item.introduction.status}`} />}</div>
            </div>
            <div className="card stack">
              <span className="label">Shared documents</span>
              {documents.length ? documents.map(dd => <button key={dd.id} className="btn ghost sm" onClick={() => openDocument('investor', dd.id).catch(e => a.setError(e))}>{dd.filename} (v{dd.version})</button>) : <span className="small muted">No documents shared. The host shares data-room documents after an approved introduction.</span>}
            </div>
            <div className="card stack">
              <span className="label">Request more information</span>
              <textarea className="input" value={msg} onChange={e => setMsg(e.target.value)} placeholder="Your question is routed through the host team." />
              <button className="btn sm" disabled={msg.trim().length < 5 || a.busy} onClick={() => a.run(() => api(`/investor/companies/${item.company_id}/questions`, { method: 'POST', body: { message: msg } }), 'Question sent to the host.').then(() => setMsg('')).catch(() => {})}>Send</button>
            </div>
          </aside>
        </div>
      </>
    )}</Async>
  );
}
