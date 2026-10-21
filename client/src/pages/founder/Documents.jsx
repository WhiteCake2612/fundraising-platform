import { useEffect, useRef, useState } from 'react';
import { useApi, api, openDocument } from '../../lib/api.js';
import { useMeta } from '../../components/Shell.jsx';
import { PageHead, Async, Field, Status, Empty, ActionMsg, useAction } from '../../components/ui.jsx';
import { date, human } from '../../lib/format.js';

export default function FounderDocuments() {
  const q = useApi('/founder/documents');
  const meta = useMeta();
  const [category, setCategory] = useState('pitch_deck');
  const [file, setFile] = useState(null);
  const input = useRef();
  const a = useAction();
  const busyDocs = q.data?.documents.some(d => ['queued', 'processing'].includes(d.status));
  useEffect(() => {
    if (!busyDocs) return;
    const t = setInterval(() => q.reload(true), 2500);
    return () => clearInterval(t);
  }, [busyDocs, q.reload]);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    if (meta && file.size > meta.maxUpload) { a.setError(new Error(`File exceeds ${meta.maxUpload / 1048576} MB`)); return; }
    const fd = new FormData();
    fd.append('category', category);
    fd.append('file', file);
    const r = await a.run(() => api('/founder/documents', { method: 'POST', form: fd }), `Uploaded ${file.name}. Processing has started.`).catch(() => null);
    if (r) { setFile(null); input.current.value = ''; q.reload(true); }
  };

  return (
    <>
      <PageHead kicker="Private data room" title="Documents" sub="Visible only to you and the host team. Investors see documents only when the host shares them after an approved introduction." />
      <div className="grid g-side">
        <div>
          <Async q={q}>{d => d.documents.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Document</th><th>Category</th><th>Version</th><th>Uploaded</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {d.documents.map(doc => (
                    <tr key={doc.id}>
                      <td><div style={{ fontWeight: 600 }}>{doc.filename}</div><div className="small muted">{(doc.size / 1024).toFixed(0)} KB</div>{doc.status_detail && <div className="small muted" style={{ maxWidth: 360 }}>{doc.status_detail}</div>}</td>
                      <td>{human(doc.category)}</td>
                      <td className="mono">v{doc.version}</td>
                      <td>{date(doc.created_at, true)}</td>
                      <td><Status s={doc.status} label={doc.status === 'needs_ai' ? 'needs attention' : undefined} /></td>
                      <td className="row" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn sm ghost" onClick={() => openDocument('founder', doc.id).catch(e => a.setError(e))}>Open</button>
                        {['failed', 'needs_ai'].includes(doc.status) && <button className="btn sm ghost" onClick={() => a.run(() => api(`/founder/documents/${doc.id}/retry`, { method: 'POST' }), 'Retry started.').then(() => q.reload(true)).catch(() => {})}>Retry</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="No documents yet">Upload your pitch deck, historical financial statements, financial model and cap table.</Empty>}</Async>
        </div>
        <form className="card stack" onSubmit={upload} style={{ alignSelf: 'start' }}>
          <span className="label accent">Upload</span>
          <Field label="Category">
            <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
              {(meta?.docCategories || []).map(c => <option key={c} value={c}>{human(c)}</option>)}
            </select>
          </Field>
          <Field label="File" hint={meta ? `${meta.allowedExt.join(' ')} · max ${meta.maxUpload / 1048576} MB` : ''}>
            <input ref={input} className="input" type="file" accept={meta?.allowedExt.join(',')} onChange={e => setFile(e.target.files[0] || null)} />
          </Field>
          <ActionMsg a={a} />
          <button className="btn" disabled={!file || a.busy}>{a.busy ? 'Uploading…' : 'Upload document'}</button>
          <p className="small muted">Spreadsheets are parsed cell-by-cell with sheet/cell references. PDF, PPTX and DOCX text is extracted for review; scanned images require OCR, which is reported if unavailable.</p>
        </form>
      </div>
    </>
  );
}
