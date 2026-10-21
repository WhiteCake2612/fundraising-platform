import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Scramble, CountUp } from './motion.jsx';
import { ago, date, human, SEV_CLASS, parseMoney, isNum } from '../lib/format.js';

export function PageHead({ kicker, title, sub, children }) {
  return (
    <header className="page-head">
      <div className="meta">
        {kicker && <span className="label accent"><Scramble text={typeof kicker === 'string' ? kicker : ''} duration={500} />{typeof kicker !== 'string' && kicker}</span>}
        <h1 className="display d-l glitch" data-text={typeof title === 'string' ? title : ''}>{typeof title === 'string' ? <Scramble text={title} trigger="both" /> : title}</h1>
        {sub && <span className="muted reveal" style={{ '--d': 200 }}>{sub}</span>}
      </div>
      {children && <div className="row">{children}</div>}
    </header>
  );
}

export function Loading({ rows = 3 }) {
  return <div className="stack" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - i * 15}%` }} />)}</div>;
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="error row between" role="alert">
      <span>{error.message || String(error)}</span>
      {onRetry && <button className="btn sm ghost" onClick={() => onRetry()}>Retry</button>}
    </div>
  );
}

export function Empty({ title, children }) {
  return <div className="empty reveal"><div className="display d-s" style={{ color: 'var(--ink-2)' }}>{title}</div>{children && <div style={{ marginTop: 8 }}>{children}</div>}</div>;
}

// Wraps a page's data load: loading → error (with retry) → content.
export function Async({ q, children, rows }) {
  if (q.loading && !q.data) return <Loading rows={rows} />;
  if (q.error && !q.data) return <ErrorBox error={q.error} onRetry={q.reload} />;
  return <>{q.error && <ErrorBox error={q.error} onRetry={q.reload} />}{children(q.data)}</>;
}

export function Field({ label, hint, error, children, full }) {
  return (
    <label className={`field ${full ? 'full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && !error && <small className="hint">{hint}</small>}
      {error && <small className="err">{error}</small>}
    </label>
  );
}

export function MoneyInput({ value, onChange, placeholder = 'e.g. 2.5m' }) {
  const [text, setText] = useState(isNum(value) ? String(value) : '');
  const parsed = parseMoney(text);
  return (
    <>
      <input className="input" inputMode="decimal" value={text} placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); const v = parseMoney(e.target.value); if (!Number.isNaN(v)) onChange(v); }} />
      {Number.isNaN(parsed) && <small className="err">Enter a number like 750k, 2.5m or 1200000</small>}
    </>
  );
}

export function Chips({ options, value = [], onChange, labels = {}, variant }) {
  const toggle = (o) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o]);
  return (
    <div className="chips" role="group">
      {options.map(o => (
        <button type="button" key={o} className={`chip ${variant || ''}`} aria-pressed={value.includes(o)} onClick={() => toggle(o)}>{labels[o] || human(o)}</button>
      ))}
    </div>
  );
}

export function Sev({ s }) { return <span className={`badge ${SEV_CLASS[s] || ''}`}>{s}</span>; }

const STATUS_CLASS = {
  processed: 'b-ok', approved: 'b-ok', completed: 'b-ok', resolved: 'b-ok', explained: 'b-ok', succeeded: 'b-ok', active: 'b-ok', interested: 'b-accent', answered: 'b-ok',
  queued: 'b-muted', processing: 'b-accent', running: 'b-accent', pending: 'b-med', pending_approval: 'b-med', under_review: 'b-med', draft: 'b-muted', saved: 'b-muted', open: 'b-high',
  failed: 'b-crit', rejected: 'b-crit', needs_ai: 'b-med', not_configured: 'b-muted', suspended: 'b-crit', deactivated: 'b-crit', passed: 'b-muted', deferred: 'b-muted', dismissed: 'b-muted', superseded: 'b-muted',
};
export function Status({ s, label }) { return <span className={`badge ${STATUS_CLASS[s] || 'b-muted'}`}>{label || human(s)}</span>; }

export function Stat({ label, value, sub, pct }) {
  return (
    <div className="stat reveal corners">
      <span className="label">{label}</span>
      <span className="num">{typeof value === 'string' || typeof value === 'number' ? <CountUp value={value} /> : value}</span>
      {isNum(pct) && <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>}
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  const wrap = useRef();
  const [ink, setInk] = useState({ left: 0, width: 0 });
  const measure = () => {
    const el = wrap.current?.querySelector('[aria-selected="true"]');
    if (el) setInk({ left: el.offsetLeft, width: el.offsetWidth });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measure, [value, tabs.map(t => t.label + t.count).join()]);
  useEffect(() => { addEventListener('resize', measure); document.fonts?.ready.then(measure); return () => removeEventListener('resize', measure); }, []);
  return (
    <div className="tabs" role="tablist" ref={wrap}>
      {tabs.map(t => <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}>{t.label}{t.count != null ? ` · ${t.count}` : ''}</button>)}
      <span className="ink" style={ink} aria-hidden="true" />
    </div>
  );
}

export function Timeline({ items, dark }) {
  if (!items?.length) return <Empty title="No activity yet" />;
  return (
    <div className={dark ? 'dark card frame' : ''} style={dark ? { padding: 24 } : undefined}>
      <div className="timeline">
        {items.map((a, i) => (
          <div className="item" key={a.id} style={{ '--i': Math.min(i, 15) }}>
            <div className="when" title={date(a.created_at, true)}>{ago(a.created_at)}{a.actor ? ` · ${a.actor}` : ''}</div>
            <div>{a.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Runs an async action with busy/error/success state, so every button shows a real outcome.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const run = async (fn, successMsg) => {
    setBusy(true); setError(null); setOk(null);
    try { const r = await fn(); if (successMsg) setOk(successMsg); return r; } catch (e) { setError(e); throw e; } finally { setBusy(false); }
  };
  return { busy, error, ok, run, setError, setOk };
}

export function ActionMsg({ a }) {
  return <>{a.error && <ErrorBox error={a.error} />}{a.ok && <div className="success" role="status">{a.ok}</div>}</>;
}

export function Pager({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
      <button className="btn sm ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
      <span className="label">Page {page} / {pages}</span>
      <button className="btn sm ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}
