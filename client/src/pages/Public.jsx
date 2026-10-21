import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth, Brand } from '../components/Shell.jsx';
import { Field, ErrorBox, useAction } from '../components/ui.jsx';

function PublicBar() {
  return (
    <div className="topbar"><div className="topbar-inner">
      <Brand />
      <nav className="nav" style={{ display: 'flex' }}><a href="#how">How it works</a><a href="#founders">Founders</a><a href="#investors">Investors</a></nav>
      <div className="who"><Link to="/login" className="pill" style={{ textDecoration: 'none' }}>Sign in <span className="dot">→</span></Link></div>
    </div></div>
  );
}

const STEPS = [
  ['01', 'Submit', 'Founders build a structured company profile and upload decks, statements, models and cap tables into a private data room.'],
  ['02', 'Screen', 'Figures are extracted with source references and reconciled across documents. Discrepancies are raised as neutral, sourced findings.'],
  ['03', 'Discover', 'Investors review host-approved, one-page teasers ranked by explainable mandate fit — and swipe.'],
  ['04', 'Introduce', 'The host controls every introduction, identity disclosure and document grant through to close.'],
];

export function Landing() {
  return (
    <>
      <PublicBar />
      <main className="page" style={{ paddingTop: 0 }}>
        <section className="hero">
          <div className="stack" style={{ gap: 28 }}>
            <span className="label accent">Fundraising operating system · Pre-Seed → Series B</span>
            <h1 className="display d-xl">Raise<br />With<br />Conviction</h1>
            <div className="stack small" style={{ gap: 6, color: 'var(--ink-2)' }}>
              <span className="label">◼ Founder portal — profile, data room, teaser</span>
              <span className="label">◼ Investor portal — mandate-ranked discovery</span>
              <span className="label">◼ Host control room — screening, intros, pipeline</span>
            </div>
            <div className="row">
              <Link className="btn" to="/register?role=founder">I'm raising</Link>
              <Link className="btn ghost" to="/register?role=investor">I'm investing</Link>
            </div>
          </div>
          <div className="hero-figure" aria-hidden="true">
            <div className="line" />
            <span className="label accent">Deal lifecycle</span>
            <div className="stack" style={{ gap: 40, position: 'relative' }}>
              {STEPS.map(([n, t], i) => (
                <div key={n} style={{ display: 'flex', justifyContent: i % 2 ? 'flex-end' : 'flex-start' }}>
                  <div style={{ width: '44%', textAlign: i % 2 ? 'left' : 'right' }}>
                    <div className="display" style={{ fontSize: 44, color: i === 2 ? 'var(--accent)' : '#eee' }}>{n}</div>
                    <div className="label">{t}</div>
                  </div>
                </div>
              ))}
            </div>
            <span className="label">Host-controlled disclosure</span>
          </div>
        </section>
      </main>
      <section className="dark" id="how">
        <div className="page">
          <span className="label accent">How it works</span>
          <div className="grid g4" style={{ marginTop: 24 }}>
            {STEPS.map(([n, t, d]) => (
              <div key={n} className="stack" style={{ borderTop: '1px solid var(--dark-line)', paddingTop: 16 }}>
                <span className="display d-m" style={{ color: 'var(--accent)' }}>{n}</span>
                <span className="display d-s">{t}</span>
                <p style={{ color: '#a9adb2' }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="page grid g2" id="founders">
        <div className="stack"><span className="label accent">For founders</span><h2 className="display d-m">One profile. Every right investor.</h2><p className="muted">Upload once, correct what the analysis extracted, answer clarifications and track your raise. Your documents stay private until the host shares them with an approved introduction.</p></div>
        <div className="stack" id="investors"><span className="label accent">For investors</span><h2 className="display d-m">Screened deal flow, on mandate.</h2><p className="muted">Comparable one-page teasers with reported figures, projections and open questions clearly separated. Fit scores explain exactly which parts of your mandate are met.</p></div>
      </section>
    </>
  );
}

function AuthFrame({ title, kicker, children }) {
  return (
    <>
      <PublicBar />
      <main className="page" style={{ maxWidth: 520 }}>
        <div className="stack" style={{ gap: 24, paddingTop: 32 }}>
          <span className="label accent">{kicker}</span>
          <h1 className="display d-l">{title}</h1>
          {children}
        </div>
      </main>
    </>
  );
}

export function Login() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [f, setF] = useState({ email: '', password: '' });
  const a = useAction();
  const submit = async (e) => {
    e.preventDefault();
    const r = await a.run(() => api('/auth/login', { method: 'POST', body: f })).catch(() => null);
    if (r) { setUser(r.user); nav(sp.get('next') || `/${r.user.role}`); }
  };
  return (
    <AuthFrame title="Sign in" kicker="Welcome back">
      <form className="stack" onSubmit={submit} style={{ gap: 16 }}>
        <Field label="Email"><input className="input" type="email" autoComplete="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password"><input className="input" type="password" autoComplete="current-password" required value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
        <ErrorBox error={a.error} />
        <button className="btn" disabled={a.busy}>{a.busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="row between small"><Link to="/forgot">Forgot password?</Link><Link to="/register">Create an account</Link></div>
      </form>
    </AuthFrame>
  );
}

export function Register() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [f, setF] = useState({ role: sp.get('role') === 'investor' ? 'investor' : 'founder', name: '', email: '', password: '', company_name: '', consent: false });
  const a = useAction();
  const fieldErr = (p) => a.error?.fields?.find(x => x.path === p)?.message;
  const submit = async (e) => {
    e.preventDefault();
    const r = await a.run(() => api('/auth/register', { method: 'POST', body: { ...f, company_name: f.role === 'founder' ? f.company_name : undefined } })).catch(() => null);
    if (r) { setUser(r.user); nav(r.user.role === 'founder' ? '/founder/company' : '/investor/mandate'); }
  };
  return (
    <AuthFrame title="Create account" kicker="Join the platform">
      <form className="stack" onSubmit={submit} style={{ gap: 16 }}>
        <div className="tabs" role="tablist" aria-label="Account type">
          {['founder', 'investor'].map(r => <button type="button" key={r} role="tab" aria-selected={f.role === r} onClick={() => setF({ ...f, role: r })}>{r === 'founder' ? "I'm a founder" : "I'm an investor"}</button>)}
        </div>
        <Field label="Full name" error={fieldErr('name')}><input className="input" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        {f.role === 'founder' && <Field label="Company name"><input className="input" value={f.company_name} onChange={e => setF({ ...f, company_name: e.target.value })} /></Field>}
        <Field label="Work email" error={fieldErr('email')}><input className="input" type="email" autoComplete="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password" hint="At least 10 characters" error={fieldErr('password')}><input className="input" type="password" autoComplete="new-password" required minLength={10} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
        <label className="row small" style={{ alignItems: 'flex-start', gap: 10 }}>
          <input type="checkbox" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} style={{ marginTop: 3 }} />
          <span>I agree to the processing of the information I submit for screening and investor matching, and understand that confidential documents are shared with investors only when the host approves an introduction.</span>
        </label>
        {fieldErr('consent') && <small className="err">{fieldErr('consent')}</small>}
        <ErrorBox error={a.error && !a.error.fields?.length ? a.error : null} />
        <button className="btn" disabled={a.busy}>{a.busy ? 'Creating…' : 'Create account'}</button>
        <div className="small">Already registered? <Link to="/login">Sign in</Link></div>
      </form>
    </AuthFrame>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const a = useAction();
  return (
    <AuthFrame title="Reset password" kicker="Account recovery">
      <form className="stack" style={{ gap: 16 }} onSubmit={e => { e.preventDefault(); a.run(() => api('/auth/forgot', { method: 'POST', body: { email } }), 'If an account exists for that address, a reset link has been issued.').catch(() => {}); }}>
        <Field label="Email"><input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <ErrorBox error={a.error} />{a.ok && <div className="success">{a.ok}</div>}
        <button className="btn" disabled={a.busy}>Send reset link</button>
      </form>
    </AuthFrame>
  );
}

export function Reset() {
  const [sp] = useSearchParams();
  const [password, setPassword] = useState('');
  const a = useAction();
  return (
    <AuthFrame title="New password" kicker="Account recovery">
      <form className="stack" style={{ gap: 16 }} onSubmit={e => { e.preventDefault(); a.run(() => api('/auth/reset', { method: 'POST', body: { token: sp.get('token') || '', password } }), 'Password updated. You can now sign in.').catch(() => {}); }}>
        <Field label="New password" hint="At least 10 characters"><input className="input" type="password" minLength={10} required value={password} onChange={e => setPassword(e.target.value)} /></Field>
        <ErrorBox error={a.error} />{a.ok && <div className="success">{a.ok} <Link to="/login">Sign in</Link></div>}
        <button className="btn" disabled={a.busy}>Update password</button>
      </form>
    </AuthFrame>
  );
}

export function Verify() {
  const [sp] = useSearchParams();
  const a = useAction();
  return (
    <AuthFrame title="Verify email" kicker="Account">
      <ErrorBox error={a.error} />{a.ok && <div className="success">{a.ok} <Link to="/login">Continue</Link></div>}
      {!a.ok && <button className="btn" disabled={a.busy} onClick={() => a.run(() => api('/auth/verify', { method: 'POST', body: { token: sp.get('token') || '' } }), 'Email verified.').catch(() => {})}>Confirm my email</button>}
    </AuthFrame>
  );
}
