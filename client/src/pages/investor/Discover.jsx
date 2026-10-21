import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, api } from '../../lib/api.js';
import { useMeta } from '../../components/Shell.jsx';
import { PageHead, Async, Empty, ErrorBox } from '../../components/ui.jsx';
import OpportunityCard from '../../components/OpportunityCard.jsx';
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

  const items = q.data?.items || [];
  const current = items[index];

  const act = useCallback(async (action) => {
    if (!current) return;
    setErr(null);
    try {
      await api('/investor/swipes', { method: 'POST', body: { company_id: current.company_id, action } });
      setLast({ id: current.company_id, action, title: current.name || `Project ${current.code}` });
      setIndex(i => i + 1);
    } catch (e) { setErr(e); }
  }, [current]);

  const undo = async () => {
    if (!last) return;
    try { await api(`/investor/swipes/${last.id}`, { method: 'DELETE' }); setLast(null); q.reload(true); } catch (e) { setErr(e); }
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
            <Deck key={current.company_id} item={current} next={items[index + 1]} onAct={act} />
            <div className="deck-actions">
              <button className="round no" onClick={() => act('passed')} aria-label="Pass">✕</button>
              <button className="round" onClick={() => act('saved')} aria-label="Save for later">☆</button>
              <button className="round yes" onClick={() => act('interested')} aria-label="Express interest">✓</button>
            </div>
            <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
              <Link className="bracket" to={`/investor/opportunities/${current.company_id}`}>View full teaser</Link>
              {last && <button className="btn ghost sm" onClick={undo}>Undo {last.action === 'interested' ? 'interest' : last.action} on {last.title}</button>}
            </div>
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

function Deck({ item, next, onAct }) {
  const ref = useRef();
  const start = useRef(null);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const down = (e) => { if (e.button !== undefined && e.button !== 0) return; start.current = { x: e.clientX, y: e.clientY }; ref.current.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (!start.current) return; setDx(e.clientX - start.current.x); setDy(e.clientY - start.current.y); };
  const up = () => {
    if (!start.current) return;
    start.current = null;
    if (dx > THRESHOLD) onAct('interested');
    else if (dx < -THRESHOLD) onAct('passed');
    else if (dy < -THRESHOLD) onAct('saved');
    setDx(0); setDy(0);
  };
  const rot = dx / 20;
  return (
    <div className="deck">
      {next && <div className="swipe-card behind" aria-hidden="true"><OpportunityCard item={next} /></div>}
      <div ref={ref} className="swipe-card" data-cursor="DRAG" role="article" aria-label={item.name || `Project ${item.code}`}
        style={{ transform: `translate(${dx}px, ${Math.min(0, dy)}px) rotate(${rot}deg)`, transition: start.current ? 'none' : 'transform 0.25s ease' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="stamp yes" style={{ opacity: Math.max(0, dx / THRESHOLD) }}>Interested</div>
        <div className="stamp no" style={{ opacity: Math.max(0, -dx / THRESHOLD) }}>Pass</div>
        <OpportunityCard item={item} />
      </div>
    </div>
  );
}
