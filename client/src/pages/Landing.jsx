import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useScrollProgress, reducedMotion } from '../components/motion.jsx';
import { Orb, ParticleSwirl, Words, Wordmark, useMagnetic, useSceneVars, useTyping } from '../components/cosmos.jsx';
import { Icon } from '../components/icons.jsx';

// Centered-logo header. On the landing page the logo fades in once the hero title has scrolled away.
export function PublicBar() {
  const loc = useLocation();
  const home = loc.pathname === '/';
  const [shown, setShown] = useState(!home);
  useEffect(() => {
    if (!home) { setShown(true); return; }
    const on = () => setShown(scrollY > innerHeight * 0.32);
    on(); addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, [home]);
  return (
    <header className={`sky-bar ${shown ? 'logo-in' : ''} ${home ? 'home' : ''}`}>
      <nav className="sky-nav" aria-label="Sections">
        <a href="/#interactive">Platform</a><a href="/#discovery">Discovery</a><a href="/#portals">Portals</a>
      </nav>
      <Link to="/" className="sky-logo" aria-label="RAISE home" tabIndex={shown ? 0 : -1}><Wordmark /></Link>
      <div className="sky-right"><Link to="/login" className="btn ghost sm">Sign in</Link></div>
    </header>
  );
}

function Magnetic({ to, className, children }) {
  const ref = useMagnetic(0.25);
  return <Link ref={ref} to={to} className={className}>{children}</Link>;
}

function Hero() {
  const ref = useRef();
  useSceneVars(ref);
  return (
    <section className="sky-hero" ref={ref}>
      <Orb tone="pearl" size={64} spin={60} className="float f1 hero-moon-a" />
      <Orb tone="garnet" size={26} spin={30} className="float f2 hero-moon-b" />
      <Orb tone="emerald" size={18} spin={24} className="float f3 hero-moon-c" />
      <Orb tone="pearl" size={42} spin={50} className="float f2 hero-moon-d" />
      <div className="hero-title">
        <h1><Wordmark size="xl" /></h1>
        <p className="hero-sub">Screened deal flow for founders and investors.<br />From the first deck to a funded close.</p>
        <div className="hero-ctas">
          <Magnetic to="/register?role=founder" className="btn">I'm raising</Magnetic>
          <Magnetic to="/register?role=investor" className="btn ghost night">I'm investing</Magnetic>
        </div>
      </div>
      <div className="hero-planet"><Orb tone="sapphire" size={900} spin={140} /></div>
      <a href="#interactive" className="hero-hint" aria-label="Scroll to explore"><i /></a>
    </section>
  );
}

function Interactive() {
  return (
    <section className="sky-sec" id="interactive">
      <div className="split-head">
        <Words text={'Your raise,\ninteractive'} accent="interactive" className="serif-xl" />
        <div className="reveal" style={{ '--d': 200 }}>
          <p className="lead">Upload once and watch every figure land with its source. Investors move through approved teasers card by card, and every introduction goes through the host.</p>
          <a href="#discovery" className="arrow-link">See how discovery works <Icon name="external" size={13} /></a>
        </div>
      </div>
      <div className="grid g2 sky-cards">
        <Link to="/register?role=founder" className="sky-card swirl-host reveal">
          <ParticleSwirl />
          <div><h3>Build once</h3><p>Decks, statements, models and cap tables become one structured profile, with each extracted figure tied to its sheet, cell or page.</p></div>
        </Link>
        <Link to="/register?role=investor" className="sky-card swirl-host reveal" style={{ '--d': 150 }}>
          <ParticleSwirl count={120} />
          <div><h3>Swipe on mandate</h3><p>One-page teasers ranked by a fit score that shows its working, with reported figures, projections and open questions kept apart.</p></div>
        </Link>
      </div>
    </section>
  );
}

const SECTORS = ['Fintech', 'Climate', 'Healthcare', 'Enterprise Software', 'Consumer', 'Deeptech', 'Logistics', 'Edtech'];

function Discovery() {
  const ref = useRef();
  const p = useScrollProgress(ref, { start: 1, end: 0.1 });
  const [picked, setPicked] = useState(['Fintech', 'Climate']);
  const toggle = (s) => setPicked(x => (x.includes(s) ? x.filter(y => y !== s) : [...x, s]));
  return (
    <section className="sky-sec discovery" id="discovery" ref={ref}>
      <div className="side-planet left" style={{ transform: `translate(${-55 + p * 45}%, ${(0.5 - p) * 30}%) rotate(${p * 25}deg)` }}><Orb tone="sapphire" size={420} ring spin={90} /></div>
      <div className="side-planet right" style={{ transform: `translate(${55 - p * 45}%, ${(p - 0.5) * 30}%)` }}><Orb tone="pearl" size={360} spin={120} /></div>
      <div className="disc-inner">
        <Words text="Mandate match" as="h2" className="serif-l" />
        <p className="reveal" style={{ '--d': 150 }}>Tell us what you back. Every company in your deck is scored against it, factor by factor.</p>
        <div className="disc-chips reveal" style={{ '--d': 250 }} role="group" aria-label="Sectors you invest in">
          {SECTORS.map(s => <button key={s} type="button" className="chip" aria-pressed={picked.includes(s)} onClick={() => toggle(s)}>{s}</button>)}
        </div>
        <Magnetic to="/register?role=investor" className="btn wide">{picked.length ? `See deal flow in ${picked.length} sector${picked.length === 1 ? '' : 's'}` : 'Set your mandate'}</Magnetic>
      </div>
    </section>
  );
}

const EXCHANGES = [
  { q: 'Why does revenue differ between the deck and the P&L?', a: 'The deck shows annualised run-rate (slide 6); the P&L (cell C4) shows recognised FY revenue. Both are now labelled with their basis.' },
  { q: 'What changes if runway drops below twelve months?', a: 'The teaser flags it as an open question, and the host sees it in the screening queue before the company reaches discovery.' },
];

function AskCard() {
  const ref = useRef();
  const [seen, setSeen] = useState(false);
  const [k, setK] = useState(0);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.4 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const ex = EXCHANGES[k];
  const ans = useTyping(ex.a, { start: seen, speed: 18 });
  useEffect(() => {
    if (!seen || reducedMotion() || ans.length < ex.a.length) return;
    const t = setTimeout(() => setK(i => (i + 1) % EXCHANGES.length), 3200);
    return () => clearTimeout(t);
  }, [ans, ex.a.length, seen]);
  return (
    <div className="sky-card ask reveal" ref={ref}>
      <span className="kicker">Clarify with the founder · example</span>
      <div className="bubble q" key={`q${k}`}>{ex.q}</div>
      <p className="bubble a">{ans}<i className="caret" /></p>
      <div className="ask-input"><span>Ask about a finding</span><button type="button" onClick={() => setK(i => (i + 1) % EXCHANGES.length)} aria-label="Next example"><Icon name="trend" size={13} /></button></div>
    </div>
  );
}

const STAGES = ['Registered', 'Documents received', 'AI processing', 'Screening', 'Teaser pending approval', 'Approved for discovery', 'Investor interest received', 'Introduction pending', 'Introduction completed', 'Due diligence', 'Term sheet', 'Closed — funded'];

function ProgressCard() {
  const [playing, setPlaying] = useState(!reducedMotion());
  const [t, setT] = useState(0.38);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT(v => (v >= 1 ? 0 : v + 0.004)), 40);
    return () => clearInterval(id);
  }, [playing]);
  const idx = Math.min(STAGES.length - 1, Math.floor(t * STAGES.length));
  return (
    <div className="sky-card progress swirl-host reveal" style={{ '--d': 150 }}>
      <span className="kicker">A raise, start to close</span>
      <ParticleSwirl count={110} />
      <div className="prog-bars">{STAGES.map((s, i) => <i key={s} className={i < idx ? 'done' : i === idx ? 'now' : ''} style={i === idx ? { '--f': `${(t * STAGES.length - idx) * 100}%` } : undefined} />)}</div>
      <div className="prog-row">
        <button type="button" onClick={() => setPlaying(v => !v)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <b>❚❚</b> : <b>▶</b>}</button>
        <span className="mono">{String(idx + 1).padStart(2, '0')} / {STAGES.length}</span>
        <span>{STAGES[idx]}</span>
      </div>
    </div>
  );
}

function Unique() {
  return (
    <section className="sky-sec unique">
      <div className="uniq-grid">
        <div className="stack" style={{ gap: 18 }}><AskCard /><ProgressCard /></div>
        <div className="uniq-center">
          <Words text={'Every deal\nis unique'} accent="unique" className="serif-xl" />
          <p className="reveal" style={{ '--d': 200 }}>Figures carry their source. Differences become neutral questions. Teasers are approved by a person before an investor sees them.</p>
          <Magnetic to="/register" className="btn">Create your profile</Magnetic>
        </div>
        <div className="sky-card sun-card reveal" style={{ '--d': 300 }}>
          <div className="sun-wrap"><Orb tone="sun" size={170} spin={50} /></div>
          <h3>One-page teaser</h3>
          <p>The company in a page, reviewed by the host</p>
          <span className="mono small muted">1 page · 6 fit factors · every figure sourced</span>
        </div>
      </div>
    </section>
  );
}

const PORTALS = [
  { tone: 'amber', t: 'Founder portal', d: 'Profile, data room and teaser, with every analysis finding answered in one place.', to: '/register?role=founder', ring: false },
  { tone: 'sun', t: 'Investor portal', d: 'Set a mandate, swipe through approved teasers and compare a shortlist side by side.', to: '/register?role=investor', ring: false },
  { tone: 'emerald', t: 'Host control room', d: 'Screening, approvals, introductions and disclosure — every step decided by the host.', to: '/login', ring: true },
];

function Portals() {
  return (
    <section className="sky-sec" id="portals">
      <div className="split-head">
        <Words text="Three portals, one raise" accent="portals" className="serif-l" />
        <p className="reveal lead" style={{ '--d': 150 }}>Each side sees exactly what it should — and nothing it shouldn't.</p>
      </div>
      <div className="grid g3 portal-grid">
        {PORTALS.map((x, i) => (
          <Link key={x.t} to={x.to} className="sky-card portal reveal" style={{ '--d': i * 120 }}>
            <span className="tagline">Portal</span>
            <div className="portal-orb"><Orb tone={x.tone} size={150} ring={x.ring} spin={x.tone === 'sun' ? 40 : 70} /></div>
            <div className="portal-foot">
              <div><h3>{x.t}</h3><p>{x.d}</p></div>
              <span className="arrow-btn"><Icon name="external" size={14} /></span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Finale() {
  const ref = useRef();
  const p = useScrollProgress(ref, { start: 1, end: 0.2 });
  return (
    <section className="sky-sec finale" ref={ref}>
      <span className="kicker accent reveal">Explainable matching</span>
      <div className="big-num reveal" style={{ '--d': 100 }}><span>06</span></div>
      <p className="reveal" style={{ '--d': 200 }}>fit factors, each with its weight and reason on every card</p>
      <Magnetic to="/register" className="btn">Get started</Magnetic>
      <div className="finale-cols">
        <div className="reveal"><h3>Everything sourced</h3><p>Every figure keeps its document, sheet, cell or page — and whether it is historical, a projection or founder-stated.</p></div>
        <div className="reveal" style={{ '--d': 150, textAlign: 'right' }}><h3>Host-controlled disclosure</h3><p>Founder and investor identities, documents and introductions are released only when the host approves them.</p></div>
      </div>
      <div className="finale-planet" style={{ transform: `translate(-50%, ${(1 - p) * 30}%)` }}><Orb tone="sapphire" size={1100} spin={160} /></div>
      <footer className="sky-foot">
        <div className="row"><Link to="/login">Sign in</Link><Link to="/register?role=founder">For founders</Link><Link to="/register?role=investor">For investors</Link></div>
        <span>© {new Date().getFullYear()} RAISE01 Capital Systems</span>
      </footer>
    </section>
  );
}

export function Landing() {
  // A soft gold spotlight follows the pointer across any card.
  useEffect(() => {
    const move = (e) => {
      const card = e.target.closest?.('.sky-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--hx', `${e.clientX - r.left}px`);
      card.style.setProperty('--hy', `${e.clientY - r.top}px`);
    };
    addEventListener('pointermove', move, { passive: true });
    return () => removeEventListener('pointermove', move);
  }, []);
  return (
    <div className="sky">
      <PublicBar />
      <Hero />
      <Interactive />
      <Discovery />
      <Unique />
      <Portals />
      <Finale />
    </div>
  );
}
