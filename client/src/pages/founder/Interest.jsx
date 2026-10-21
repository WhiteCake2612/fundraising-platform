import { useState } from 'react';
import { useApi, api } from '../../lib/api.js';
import { PageHead, Async, Stat, Status, Empty, Field, ActionMsg, useAction } from '../../components/ui.jsx';
import { date, human } from '../../lib/format.js';

export function FounderInterest() {
  const q = useApi('/founder/interest');
  return (
    <>
      <PageHead kicker="Investor interest" title="Investors" sub="Investor identities are shared only when the host approves an introduction and disclosure." />
      <Async q={q}>{d => (
        <>
          <div className="grid g3">
            <Stat label="Expressions of interest" value={d.interested} sub="Not a commitment to invest" />
            <Stat label="Saved for later" value={d.saved} />
            <Stat label="Approved introductions" value={d.introductions.length} />
          </div>
          <div className="section">
            <div className="section-title"><span className="label accent">Introductions</span></div>
            {d.introductions.length ? (
              <div className="table-wrap"><table><thead><tr><th>Investor</th><th>Type</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>{d.introductions.map(i => (
                  <tr key={i.id}><td>{i.disclose_investor ? <><strong>{i.investor_name}</strong>{i.investor_firm ? ` · ${i.investor_firm}` : ''}<div className="small muted">{i.investor_email}</div></> : <span className="muted">Investor identity not yet disclosed</span>}</td>
                    <td>{human(i.investor_type)}</td><td><Status s={i.status} /></td><td>{date(i.updated_at)}</td></tr>
                ))}</tbody></table></div>
            ) : <Empty title="No introductions yet">When the host approves an introduction it will appear here.</Empty>}
          </div>
        </>
      )}</Async>
    </>
  );
}

export function FounderRequests() {
  const q = useApi('/founder/requests');
  return (
    <>
      <PageHead kicker="Due diligence" title="Requests" sub="Additional information requested by the host team." />
      <Async q={q}>{d => d.requests.length ? (
        <div className="stack">{d.requests.map(r => <Request key={r.id} r={r} onDone={() => q.reload(true)} />)}</div>
      ) : <Empty title="No requests" />}</Async>
    </>
  );
}

function Request({ r, onDone }) {
  const [text, setText] = useState('');
  const a = useAction();
  return (
    <div className="card stack">
      <div className="row between"><span className="label">{date(r.created_at, true)}</span><Status s={r.status} /></div>
      <p style={{ fontSize: 15 }}>{r.message}</p>
      {r.response ? <div className="notice"><span className="label">Your answer · {date(r.answered_at)}</span><p style={{ margin: 0 }}>{r.response}</p></div> : (
        <>
          <Field label="Answer"><textarea className="input" value={text} onChange={e => setText(e.target.value)} /></Field>
          <div className="small muted">If the answer is a document, upload it under Documents and reference it here.</div>
          <ActionMsg a={a} />
          <div><button className="btn sm" disabled={!text.trim() || a.busy} onClick={() => a.run(() => api(`/founder/requests/${r.id}/answer`, { method: 'POST', body: { response: text } })).then(onDone).catch(() => {})}>Send answer</button></div>
        </>
      )}
    </div>
  );
}
