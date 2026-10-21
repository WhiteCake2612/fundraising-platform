import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Shell.jsx';
import { Scramble, Roll, useScrollProgress, useTilt, reducedMotion } from '../components/motion.jsx';

export function PublicBar() {
  return (
    <div className="topbar land-bar"><div className="topbar-inner">
      <Brand />
      <nav className="nav public-nav" aria-label="Sections">
        <a href="/#story"><Roll>Lifecycle</Roll></a><a href="/#pipeline"><Roll>Pipeline</Roll></a><a href="/#join"><Roll>Join</Roll></a>
      </nav>
      <div className="who"><Link to="/login" className="pill" style={{ textDecoration: 'none' }}>Sign in <span className="dot">→</span></Link></div>
    </div></div>
  );
}

const STEPS = [
  { n: '01', t: 'Submit', d: 'Founders build a structured profile and upload decks, statements, models and cap tables into a private data room.', shot: 'upload' },
  { n: '02', t: 'Screen', d: 'Every figure is extracted with its sheet, cell or page. Documents are reconciled and differences raised as neutral, sourced questions.', shot: 'finding' },
  { n: '03', t: 'Discover', d: 'Investors swipe through host-approved one-page teasers ranked by an explainable mandate-fit score.', shot: 'swipe' },
  { n: '04', t: 'Introduce', d: 'The host decides every introduction, identity disclosure and document grant — all the way to close.', shot: 'intro' },
];

// The light hero with a cursor-following reveal lens (the helmet reveal in the reference).
function Hero() {
  const ref = useRef();
  const [lens, setLens] = useState({ x: '60%', y: '50%', r: 0 });
  const target = useRef(0);
  useEffect(() => {
    if (reducedMotion()) return;
    let raf, r = 0;
    const loop = () => { r += (target.current - r) * 0.12; setLens(l => ({ ...l, r })); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const move = (e) => {
    const b = ref.current.getBoundingClientRect();
    setLens(l => ({ ...l, x: `${e.clientX - b.left}px`, y: `${e.clientY - b.top}px` }));
    target.current = 150;
  };
  const vars = { '--x': lens.x, '--y': lens.y, '--r': `${lens.r}px` };
  return (
    <section className="hero" ref={ref} onPointerMove={move} onPointerLeave={() => { target.current = 0; }} style={vars} data-cursor="">
      <div className="hero-layer">
        <div className="stack" style={{ gap: 26 }}>
          <span className="label" style={{ color: '#1bc4aa' }}><Scramble text="Fundraising OS · Pre-Seed → Series B" /></span>
          <h1 className="display d-xl">Raise<br />With<br />Conviction</h1>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">▣ Founder portal — data room, teaser</span>
            <span className="label">▣ Investor portal — mandate discovery</span>
            <span className="label">▣ Host control room — screening, intros</span>
          </div>
        </div>
        <div className="hero-center"><Orb /></div>
        <HeroStats />
      </div>
      <div className="hero-layer hero-reveal" aria-hidden="true">
        <div className="stack" style={{ gap: 26 }}>
          <span className="label">Host-controlled disclosure</span>
          <h1 className="display d-xl outline-text">Lead<br />The<br />Round</h1>
          <span className="label">Identities stay hidden until you approve</span>
        </div>
        <div className="hero-center"><Orb dark /></div>
        <div className="stack" style={{ gap: 18 }}>
          <span className="label">Signal</span>
          <span className="display" style={{ fontSize: 46, color: 'var(--accent)' }}>Fit · Proof · Intro</span>
        </div>
      </div>
      <div className="hero-ring" aria-hidden="true" style={{ opacity: lens.r > 4 ? 1 : 0 }} />
      <div className="hero-cta">
        <Link className="btn" to="/register?role=founder" data-cursor="RAISE"><Roll>I'm raising</Roll></Link>
        <Link className="btn ghost" to="/register?role=investor" data-cursor="INVEST"><Roll>I'm investing</Roll></Link>
      </div>
      <a href="#story" className="hero-scroll label" style={{ color: '#555', textDecoration: 'none' }}><i />Scroll</a>
    </section>
  );
}

// Concentric "round" rings that draw themselves and rotate — the platform's stand-in for the portrait.
function Orb({ dark }) {
  const stroke = dark ? '#2ee6c9' : '#0c0c0c';
  const segs = [{ r: 46, len: 0.72, w: 2.2, s: 18 }, { r: 38, len: 0.55, w: 1, s: -26 }, { r: 30, len: 0.86, w: 3.5, s: 34 }, { r: 21, len: 0.4, w: 1, s: -14 }];
  return (
    <div className="orb">
      <svg viewBox="-50 -50 100 100">
        <circle r="48" fill="none" stroke={dark ? 'rgba(46,230,201,0.25)' : 'rgba(0,0,0,0.08)'} strokeWidth="0.3" />
        {segs.map((s, i) => (
          <g key={i} style={{ animation: reducedMotion() ? 'none' : `spin ${Math.abs(s.s)}s linear infinite ${s.s < 0 ? 'reverse' : ''}`, transformOrigin: '0px 0px' }}>
            <circle r={s.r} fill="none" stroke={i === 2 ? (dark ? '#fff' : '#1bc4aa') : stroke} strokeWidth={s.w} pathLength="100" strokeDasharray={`${s.len * 100} 100`} strokeLinecap="butt"
              style={{ animation: reducedMotion() ? 'none' : `draw 1.8s ${0.2 + i * 0.15}s cubic-bezier(.2,.8,.2,1) both` }} />
          </g>
        ))}
        <line x1="-50" x2="50" y1="0" y2="0" stroke={dark ? 'rgba(46,230,201,0.3)' : 'rgba(0,0,0,0.12)'} strokeWidth="0.2" strokeDasharray="1 2" />
        <line y1="-50" y2="50" x1="0" x2="0" stroke={dark ? 'rgba(46,230,201,0.3)' : 'rgba(0,0,0,0.12)'} strokeWidth="0.2" strokeDasharray="1 2" />
        <circle r="2.2" fill={dark ? '#2ee6c9' : '#0c0c0c'} />
        <text y="4" textAnchor="middle" fontFamily="Anton" fontSize="11" fill={dark ? '#fff' : '#0c0c0c'} dy="-9">R01</text>
      </svg>
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}@keyframes draw{from{stroke-dasharray:0 100}}'}</style>
    </div>
  );
}

function HeroStats() {
  return (
    <div className="hero-stats">
      {[['Portals', '03'], ['Lifecycle stages', '16'], ['Fit factors', '06']].map(([k, v], i) => (
        <div key={k} className="stack reveal" style={{ gap: 2, '--d': 300 + i * 120, borderTop: '1px solid #cfcfca', paddingTop: 10 }}>
          <span className="label">{k}</span>
          <span className="display" style={{ fontSize: 52 }}>{v}</span>
        </div>
      ))}
      <svg viewBox="0 0 120 50" style={{ width: 150 }} aria-hidden="true">
        <path d="M5 40 C 25 40, 25 12, 48 14 S 70 38, 88 22 S 108 8, 116 10" fill="none" stroke="#0c0c0c" strokeWidth="1.4" pathLength="100" strokeDasharray="100" style={{ animation: 'trace 2.4s 0.6s ease-out both' }} />
        <style>{'@keyframes trace{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}'}</style>
      </svg>
    </div>
  );
}

function Shot({ kind }) {
  const tilt = useTilt(5);
  const L = (w, c = 'rgba(255,255,255,0.14)') => <div style={{ height: 8, width: w, background: c, marginBottom: 8 }} />;
  return (
    <div className="shot" ref={tilt} data-cursor="VIEW">
      <div className="row between" style={{ marginBottom: 16 }}><span className="label accent">{kind}.view</span><span className="label">● live</span></div>
      {kind === 'upload' && (<>{['pitch-deck.pdf', 'pl-fy24.xlsx', 'cap-table.xlsx'].map((f, i) => (
        <div key={f} className="row between" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}><span className="mono small">{f}</span><span className={`badge ${i === 2 ? 'b-med' : 'b-ok'}`}>{i === 2 ? 'processing' : 'processed'}</span></div>))}
        <div className="bar" style={{ marginTop: 16 }}><i style={{ width: '68%' }} /></div></>)}
      {kind === 'finding' && (<><div className="row"><span className="badge b-crit">critical</span><strong>Cross-document discrepancy</strong></div>
        <div className="grid g2" style={{ marginTop: 14 }}><div className="notice"><span className="label">Deck · slide 6</span><div className="display d-s">$2.40M</div></div><div className="notice"><span className="label">P&L · C4</span><div className="display d-s">$1.50M</div></div></div>
        <p className="small muted" style={{ marginTop: 12 }}>Requires clarification — gap 37.5% beyond rounding tolerance.</p></>)}
      {kind === 'swipe' && (<div className="row between" style={{ alignItems: 'flex-start' }}><div className="stack" style={{ gap: 6 }}><span className="label accent">Seed · Fintech · SaaS</span><span className="display d-m">Project PRJ-0042</span>{L('80%')}{L('60%')}{L('70%')}</div><span className="display" style={{ fontSize: 64, color: 'var(--accent)' }}>92</span></div>)}
      {kind === 'intro' && (<>{[['Northgate Ventures', 'approved'], ['Kite Angels', 'pending'], ['Oro Family Office', 'deferred']].map(([n, s]) => (
        <div key={n} className="row between" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}><span>{n}</span><span className={`badge ${s === 'approved' ? 'b-ok' : s === 'pending' ? 'b-med' : 'b-muted'}`}>{s}</span></div>))}</>)}
    </div>
  );
}

// Dark scroll timeline: the vertical line draws as you scroll, steps slide in from alternate sides.
function Story() {
  const ref = useRef();
  const p = useScrollProgress(ref, { start: 0.6, end: 0.4 });
  return (
    <section className="story" id="story" ref={ref}>
      <div className="story-line"><i style={{ transform: `scaleY(${p})` }} /></div>
      <div style={{ textAlign: 'center', marginBottom: 100, position: 'relative', background: 'var(--bg)', padding: '10px 0' }}>
        <span className="label accent">The lifecycle</span>
        <h2 className="display d-l reveal">From deck <span className="outline-text">to close.</span></h2>
      </div>
      {STEPS.map((s, i) => (
        <div key={s.n} className={`story-step ${i % 2 ? 'alt' : ''}`}>
          <div className="reveal shot-wrap" style={{ '--d': 100 }}><Shot kind={s.shot} /></div>
          <span className="year">{s.n}</span>
          <div className="story-copy reveal" style={{ '--d': 250 }}>
            <span className="label accent">Step {s.n}</span>
            <h3 className="display d-m" style={{ margin: '8px 0 12px' }}>{s.t}</h3>
            <p className="muted" style={{ fontSize: 15 }}>{s.d}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

// "THE SEASON SO FAR" analogue: a pipeline route that draws itself with a marker riding along it.
function PipelineMap() {
  const ref = useRef(), path = useRef();
  const p = useScrollProgress(ref, { start: 0.9, end: 0.2 });
  const [pt, setPt] = useState({ x: 60, y: 330 });
  const [len, setLen] = useState(1);
  useEffect(() => { if (path.current) setLen(path.current.getTotalLength()); }, []);
  useEffect(() => { if (path.current) { const q = path.current.getPointAtLength(len * p); setPt({ x: q.x, y: q.y }); } }, [p, len]);
  const stops = [[0.02, 'Registered'], [0.22, 'Screening'], [0.45, 'Discovery'], [0.66, 'Introduction'], [0.84, 'Diligence'], [0.99, 'Funded']];
  return (
    <section className="trackmap" id="pipeline" ref={ref}>
      <div className="stack" style={{ position: 'relative', zIndex: 1, gap: 14 }}>
        <h2 className="display d-l accent-text reveal" style={{ textShadow: '0 0 30px rgba(46,230,201,0.35)' }}>The pipeline<br />so far.</h2>
        <div style={{ width: 22, height: 2, background: 'var(--accent)' }} />
        <p className="label reveal" style={{ color: 'var(--ink-2)', maxWidth: 260, '--d': 150 }}>Every deal is a route. Here's how a raise moves from registration to a funded close — with the host at every corner.</p>
        <div className="mono small" style={{ marginTop: 20, color: 'var(--accent)' }}>{Math.round(p * 100).toString().padStart(3, '0')}% · {stops.filter(s => p >= s[0]).at(-1)?.[1] || 'Start'}</div>
      </div>
      <svg viewBox="0 0 800 520" aria-hidden="true">
        <line className="cross" x1="0" x2="800" y1="260" y2="260" /><line className="cross" x1="430" x2="430" y1="0" y2="520" />
        <circle cx="430" cy="260" r="16" fill="none" stroke="rgba(255,255,255,0.35)" /><circle cx="430" cy="260" r="3" fill="#fff" />
        <path d="M60 460 C 110 470, 150 430, 170 380 S 200 300, 260 300 S 330 360, 380 330 S 420 220, 480 200 S 600 220, 640 160 S 690 60, 730 80 S 760 160, 720 190" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="14" strokeLinecap="round" />
        <path ref={path} d="M60 460 C 110 470, 150 430, 170 380 S 200 300, 260 300 S 330 360, 380 330 S 420 220, 480 200 S 600 220, 640 160 S 690 60, 730 80 S 760 160, 720 190" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
        {path.current && stops.map(([t, l]) => { const q = path.current.getPointAtLength(len * t); const on = p >= t; return (
          <g key={l} style={{ transition: 'opacity .4s', opacity: on ? 1 : 0.35 }}>
            <rect x={q.x - 4} y={q.y - 4} width="8" height="8" fill={on ? '#2ee6c9' : '#444'} transform={`rotate(45 ${q.x} ${q.y})`} />
            <text x={q.x + 12} y={q.y - 10} fill={on ? '#2ee6c9' : '#666'} fontFamily="JetBrains Mono" fontSize="11" letterSpacing="2">{l.toUpperCase()}</text>
          </g>); })}
        <circle cx={pt.x} cy={pt.y} r="9" fill="#2ee6c9" opacity="0.25"><animate attributeName="r" values="7;16;7" dur="1.6s" repeatCount="indefinite" /></circle>
        <circle cx={pt.x} cy={pt.y} r="5" fill="#2ee6c9" />
      </svg>
    </section>
  );
}

function Marquee() {
  const words = ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Mandate fit', 'Data room', 'Teasers', 'Introductions'];
  return <div className="marquee" aria-hidden="true"><div>{[...words, ...words].map((w, i) => <span key={i}>{w}</span>)}</div></div>;
}

export function Landing() {
  return (
    <>
      <PublicBar />
      <Hero />
      <Story />
      <div className="checker" />
      <PipelineMap />
      <Marquee />
      <section id="join" style={{ padding: '80px 24px' }}>
        <div className="teal-frame" style={{ maxWidth: 1240, margin: '0 auto', padding: 'clamp(28px, 5vw, 64px)', position: 'relative', overflow: 'hidden' }}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <span className="brand" style={{ pointerEvents: 'none' }}><span>RAISE<b>01</b></span><small>CAPITAL · SYSTEMS</small></span>
            <h2 className="display d-l accent-text reveal" style={{ textAlign: 'right' }}>Keep raising<br />forward.</h2>
          </div>
          <div className="grid g2" style={{ marginTop: 48, gap: 32 }}>
            <Link to="/register?role=founder" className="card hover corners reveal" style={{ textDecoration: 'none', padding: 28 }} data-cursor="START">
              <span className="label accent">For founders</span>
              <h3 className="display d-m" style={{ margin: '10px 0' }}>One profile.<br />Every right investor.</h3>
              <p className="muted">Upload once, correct what the analysis extracted, answer clarifications and track your raise. Documents stay private until the host shares them.</p>
              <span className="bracket" style={{ display: 'inline-block', marginTop: 12 }}>Start raising</span>
            </Link>
            <Link to="/register?role=investor" className="card hover corners reveal" style={{ textDecoration: 'none', padding: 28, '--d': 150 }} data-cursor="START">
              <span className="label accent">For investors</span>
              <h3 className="display d-m" style={{ margin: '10px 0' }}>Screened deal flow.<br />On mandate.</h3>
              <p className="muted">Comparable one-page teasers with reported figures, projections and open questions clearly separated — and a fit score that shows its working.</p>
              <span className="bracket" style={{ display: 'inline-block', marginTop: 12 }}>Set your mandate</span>
            </Link>
          </div>
          <div className="row between" style={{ marginTop: 48 }}>
            <span className="label">© {new Date().getFullYear()} RAISE01 Capital Systems</span>
            <Link to="/login" className="bracket">Sign in</Link>
          </div>
        </div>
      </section>
      <div className="checker" style={{ marginBottom: 24 }} />
    </>
  );
}
