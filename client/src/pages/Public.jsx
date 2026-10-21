import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../components/Shell.jsx';
import { PublicBar } from './Landing.jsx';
import { Scramble } from '../components/motion.jsx';
export { Landing } from './Landing.jsx';
import { Field, ErrorBox, useAction } from '../components/ui.jsx';


function AuthFrame({ title, kicker, children }) {
  return (
    <>
      <PublicBar />
      <main className="auth-split page-enter">
        <div className="stack auth-form" style={{ gap: 24 }}>
          <span className="label accent"><Scramble text={kicker} /></span>
          <h1 className="display d-l glitch" data-text={title}><Scramble text={title} trigger="hover" /></h1>
          {children}
        </div>
        <div className="auth-art teal-frame" aria-hidden="true">
          <span className="label accent">RAISE01 · Capital systems</span>
          <div className="auth-grid">{Array.from({ length: 96 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 37) % 2400}ms` }} />)}</div>
          <h2 className="display d-l accent-text" style={{ textAlign: 'right' }}>Keep<br />raising<br />forward.</h2>
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
