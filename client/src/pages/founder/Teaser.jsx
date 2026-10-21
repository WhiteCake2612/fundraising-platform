import { useState } from 'react';
import { useApi, api } from '../../lib/api.js';
import { PageHead, Async, Field, ActionMsg, useAction, Status, Empty } from '../../components/ui.jsx';
import TeaserView from '../../components/TeaserView.jsx';

const EDITABLE = [['overview', 'Company overview'], ['problem', 'Problem'], ['solution', 'Solution'], ['market', 'Market opportunity'], ['differentiation', 'Differentiation'], ['traction', 'Traction']];

export default function FounderTeaser() {
  const q = useApi('/founder/teaser');
  const a = useAction();
  const [edit, setEdit] = useState(null);
  const generate = () => a.run(() => api('/founder/teaser/generate', { method: 'POST' }), 'New teaser draft generated from your latest profile and documents.').then(() => q.reload(true)).catch(() => {});
  return (
    <Async q={q}>{({ teaser }) => (
      <>
        <PageHead kicker="Investment teaser" title={teaser ? `Teaser v${teaser.version}` : 'Teaser'} sub={teaser ? <span className="row"><Status s={teaser.status} />{teaser.review_note && <span>Host note: {teaser.review_note}</span>}</span> : 'Generate a standardised one-page teaser from your profile and documents.'}>
          {teaser && <button className="btn ghost" onClick={() => window.print()}>Export PDF</button>}
          <button className="btn ghost" onClick={generate} disabled={a.busy}>{teaser ? 'Regenerate' : 'Generate teaser'}</button>
          {teaser && ['draft', 'rejected'].includes(teaser.status) && <button className="btn" onClick={() => a.run(() => api(`/founder/teaser/${teaser.id}/submit`, { method: 'POST' }), 'Submitted to the host for approval.').then(() => q.reload(true)).catch(() => {})}>Submit for approval</button>}
        </PageHead>
        <ActionMsg a={a} />
        {!teaser ? <Empty title="No teaser yet"><button className="btn" onClick={generate}>Generate teaser</button></Empty> : (
          <div className="grid g-side" style={{ marginTop: 16 }}>
            <TeaserView c={{ ...teaser.content }} />
            <aside className="stack">
              <div className="notice small">Missing items show as “Not disclosed”. Nothing is estimated on your behalf. Financial figures come from your documents and profile and cannot be edited here — use Analysis → Submit a correction.</div>
              {['draft', 'rejected'].includes(teaser.status) ? (
                edit ? <EditForm t={teaser} onDone={() => { setEdit(null); q.reload(true); }} onCancel={() => setEdit(null)} /> : <button className="btn ghost" onClick={() => setEdit(true)}>Edit narrative</button>
              ) : <div className="notice small">This version is {teaser.status.replace('_', ' ')} and locked. Regenerate to start a new draft.</div>}
            </aside>
          </div>
        )}
      </>
    )}</Async>
  );
}

function EditForm({ t, onDone, onCancel }) {
  const [v, setV] = useState(Object.fromEntries(EDITABLE.map(([k]) => [k, t.content[k]?.text || ''])));
  const a = useAction();
  return (
    <div className="card stack">
      {EDITABLE.map(([k, l]) => <Field key={k} label={l}><textarea className="input" value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} /></Field>)}
      <ActionMsg a={a} />
      <div className="row">
        <button className="btn" disabled={a.busy} onClick={() => a.run(() => api(`/founder/teaser/${t.id}`, { method: 'PUT', body: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null])) })).then(onDone).catch(() => {})}>Save</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
