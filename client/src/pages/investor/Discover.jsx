import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, api } from '../../lib/api.js';
import { useMeta } from '../../components/Shell.jsx';
import { PageHead, Async, Empty, ErrorBox } from '../../components/ui.jsx';
import OpportunityCard from '../../components/OpportunityCard.jsx';
import SwipeProfile, { slidesFor } from '../../components/SwipeProfile.jsx';
import { stageLabel } from '../../lib/format.js';

const THRESHOLD = 120;

export default function InvestorDiscover() {
  const meta = useMeta();
  const [filters, setFilters] = useState({ sector: '', stage: '', geography: '', min_score: '', include_passed: '', hide_ineligible: '1' });
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const q = useApi(`/investor/feed?${qs}`, [qs]);
  const [index, setIndex] = useState(0);
  const [last, setLast] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => setIndex(0), [qs, q.data]);

  // After a rewind the restored card goes back on top of the deck, as in Tinder.
  const [rewound, setRewound] = useState(null);
  const raw = q.data?.items || [];
  const back = raw.find(x => x.company_id === rewound);
  const items = back ? [back, ...raw.filter(x => x !== back)] : raw;
  const current = items[index];

  const [fly, setFly] = useState(null);
  const act = useCallback(async (action) => {
    if (!current || fly) return;
    setErr(null);
    setFly(action);
    try {
      // The card flies off while the decision is recorded; it only advances once the server has accepted it.
      await Promise.all([api('/investor/swipes', { method: 'POST', body: { company_id: current.company_id, action } }), new Promise(r => setTimeout(r, 320))]);
      setLast({ id: current.company_id, action, title: current.name || `Project ${current.code}` });
      setIndex(i => i + 1);
    } catch (e) { setErr(e); }
    setFly(null);
  }, [current, fly]);

  const undo = async () => {
    if (!last) return;
    try { await api(`/investor/swipes/${last.id}`, { method: 'DELETE' }); setRewound(last.id); setLast(null); q.reload(true); } catch (e) { setErr(e); }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight') act('interested');
      if (e.key === 'ArrowLeft') act('passed');
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 's') act('saved');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const sel = (k, opts, lbl = (x) => x) => (
    <select className="input" style={{ width: 'auto' }} value={filters[k]} onChange={e => setFilters({ ...filters, [k]: e.target.value })} aria-label={k}>
      <option value="">{{ sector: 'All sectors', stage: 'All stages', geography: 'All geographies' }[k]}</option>{opts.map(o => <option key={o} value={o}>{lbl(o)}</option>)}
    </select>
  );

  return (
    <>
      <PageHead kicker="Deal discovery" title="Discover" sub="→ interested · ← pass · ↑ save · Ctrl+Z undo">
        {q.data && <span className="label">{Math.max(0, items.length - index)} remaining</span>}
      </PageHead>
      {meta && (
        <div className="row" style={{ marginBottom: 20 }}>
          {sel('sector', meta.sectors)}
          {sel('stage', meta.stages, stageLabel)}
          {sel('geography', meta.geographies)}
          <select className="input" style={{ width: 'auto' }} value={filters.min_score} onChange={e => setFilters({ ...filters, min_score: e.target.value })} aria-label="Minimum fit"><option value="">Any fit</option><option value="50">Fit ≥ 50</option><option value="70">Fit ≥ 70</option><option value="85">Fit ≥ 85</option></select>
          <label className="row small"><input type="checkbox" checked={filters.include_passed === '1'} onChange={e => setFilters({ ...filters, include_passed: e.target.checked ? '1' : '' })} /> Revisit passed</label>
          <label className="row small"><input type="checkbox" checked={filters.hide_ineligible === '0'} onChange={e => setFilters({ ...filters, hide_ineligible: e.target.checked ? '0' : '1' })} /> Show mandate exclusions</label>
        </div>
      )}
      <ErrorBox error={err} />
      <Async q={q}>{() => (
        current ? (
          <>
            <Deck key={current.company_id} item={current} next={items[index + 1]} onAct={act} fly={fly} />
            <div className="tp-actions">
              <button className="tb rewind" onClick={undo} disabled={!last} aria-label={last ? `Undo ${last.action} on ${last.title}` : 'Nothing to undo'} title="Undo (Ctrl+Z)"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z" /></svg></button>
              <button className="tb big nope" onClick={() => act('passed')} aria-label="Pass" title="Pass (←)"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z" /></svg></button>
              <button className="tb star" onClick={() => act('saved')} aria-label="Save for later" title="Save (↑)"><svg viewBox="0 0 24 24"><path fill="currentColor" d="m12 2 3 6.6 7.2.7-5.4 4.8 1.6 7.1L12 17.5 5.6 21.2l1.6-7.1L1.8 9.3 9 8.6 12 2Z" /></svg></button>
              <button className="tb big like" onClick={() => act('interested')} aria-label="Express interest" title="Interested (→)"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-7.5-4.6-10-9.2C.4 8.6 2.3 4.5 6.2 4.5c2.2 0 3.6 1.2 4.4 2.4l1.4 2 1.4-2c.8-1.2 2.2-2.4 4.4-2.4 3.9 0 5.8 4.1 4.2 7.3C19.5 16.4 12 21 12 21Z" /></svg></button>
              <Link className="tb info" to={`/investor/opportunities/${current.company_id}`} aria-label="View full teaser" title="Full teaser"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /></svg></Link>
            </div>
            <p className="tp-hint">Tap the photo to flip through · drag or use ← ↑ → · Ctrl+Z to rewind</p>
          </>
        ) : (
          <Empty title="You're up to date">
            <p>No more opportunities match your filters. New companies appear here after the host approves their teaser.</p>
            {last && <button className="btn ghost sm" onClick={undo}>Undo last action</button>} <Link className="btn ghost sm" to="/investor/mandate">Review mandate</Link>
          </Empty>
        )
      )}</Async>
    </>
  );
}

function Deck({ item, next, onAct, fly }) {
  const ref = useRef();
  const start = useRef(null);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [slide, setSlide] = useState(0);
  const [info, setInfo] = useState(false);
  const count = slidesFor(item).length;
  const down = (e) => { if (info || (e.button !== undefined && e.button !== 0)) return; start.current = { x: e.clientX, y: e.clientY }; ref.current.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (!start.current) return; setDx(e.clientX - start.current.x); setDy(e.clientY - start.current.y); };
  const up = (e) => {
    if (!start.current) return;
    const s = start.current;
    start.current = null;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
      // A tap, not a drag: like Tinder, the left/right half of the photo steps through the slides.
      const r = ref.current.getBoundingClientRect();
      setSlide(i => (s.x - r.left < r.width / 2 ? Math.max(0, i - 1) : Math.min(count - 1, i + 1)));
    } else if (dx > THRESHOLD) onAct('interested');
    else if (dx < -THRESHOLD) onAct('passed');
    else if (dy < -THRESHOLD) onAct('saved');
    setDx(0); setDy(0);
  };
  const out = { interested: 'translate(150%, 40px) rotate(28deg)', passed: 'translate(-150%, 40px) rotate(-28deg)', saved: 'translate(0, -140%) scale(0.9)' }[fly];
  const like = fly === 'interested' ? 1 : Math.max(0, dx / THRESHOLD), nope = fly === 'passed' ? 1 : Math.max(0, -dx / THRESHOLD), save = fly === 'saved' ? 1 : Math.max(0, -dy / THRESHOLD) * (Math.abs(dx) < THRESHOLD / 2 ? 1 : 0);
  return (
    <div className="tp-deck">
      {next && <div className="tp-card behind" aria-hidden="true" style={fly ? { transform: 'scale(1)', opacity: 1 } : undefined}><SwipeProfile item={next} /></div>}
      <div ref={ref} className="tp-card" data-cursor={info ? undefined : 'DRAG'} role="article" aria-label={item.name || `Project ${item.code}`}
        style={{ transform: out || `translate(${dx}px, ${Math.min(0, dy)}px) rotate(${dx / 18}deg)`, transition: start.current ? 'none' : `transform ${fly ? 0.34 : 0.28}s var(--ease)` }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="tp-stamp like" style={{ opacity: like }}>Like</div>
        <div className="tp-stamp nope" style={{ opacity: nope }}>Nope</div>
        <div className="tp-stamp save" style={{ opacity: save }}>Save</div>
        <SwipeProfile item={item} slide={slide} onInfo={() => setInfo(true)} />
        <div className={`tp-sheet ${info ? 'open' : ''}`} onPointerDown={e => e.stopPropagation()} aria-hidden={!info}>
          <button className="tp-close" onClick={() => setInfo(false)} aria-label="Close full profile">↓</button>
          {info && <OpportunityCard item={item} />}
        </div>
      </div>
    </div>
  );
}
