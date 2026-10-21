import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Link, Outlet, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { api, useApi } from '../lib/api.js';
import { ago } from '../lib/format.js';
import { Roll } from './motion.jsx';

export const AuthCtx = createContext(null);
export const MetaCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);
export const useMeta = () => useContext(MetaCtx);

const NAV = {
  founder: [['/founder', 'Overview', true], ['/founder/company', 'Company'], ['/founder/documents', 'Documents'], ['/founder/analysis', 'Analysis'], ['/founder/teaser', 'Teaser'], ['/founder/interest', 'Investors'], ['/founder/requests', 'Requests']],
  investor: [['/investor', 'Overview', true], ['/investor/discover', 'Discover'], ['/investor/shortlist', 'Shortlist'], ['/investor/introductions', 'Introductions'], ['/investor/mandate', 'Mandate']],
  host: [['/host', 'Control room', true], ['/host/pipeline', 'Pipeline'], ['/host/interest', 'Interest'], ['/host/introductions', 'Introductions'], ['/host/teasers', 'Approvals'], ['/host/users', 'Users'], ['/host/settings', 'Settings'], ['/host/audit', 'Audit']],
};

export function Brand() {
  return <Link to="/" className="brand" aria-label="RAISE01 home"><span>RAISE<b>01</b></span><small>CAPITAL · SYSTEMS</small></Link>;
}

export function RequireRole({ role }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined) return null;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  return <AppShell />;
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const q = useApi('/notifications');
  const nav = useNavigate();
  useEffect(() => { const t = setInterval(() => q.reload(true), 20000); return () => clearInterval(t); }, [q.reload]);
  const unread = q.data?.unread || 0;
  const toggle = async () => {
    setOpen(!open);
    if (!open && unread) { await api('/notifications/read', { method: 'POST' }).catch(() => {}); q.reload(true); }
  };
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn ghost sm" onClick={toggle} aria-expanded={open} aria-label={`Notifications, ${unread} unread`}>
        Alerts{unread ? <span style={{ color: 'var(--accent)' }}>●{unread}</span> : ''}
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 44, width: 340, animation: 'dropIn 0.3s var(--ease)', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', maxHeight: 420, overflow: 'auto', zIndex: 30, padding: 0 }}>
          {!q.data?.notifications.length && <div className="muted" style={{ padding: 16 }}>No notifications.</div>}
          {q.data?.notifications.map(n => (
            <button key={n.id} onClick={() => { setOpen(false); if (n.link) nav(n.link); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 0, borderBottom: '1px solid var(--line)', background: n.read_at ? 'transparent' : 'rgba(46,230,201,0.06)', boxShadow: n.read_at ? 'none' : 'inset 2px 0 0 var(--accent)', color: 'inherit', cursor: 'pointer' }}>
              <div style={{ fontWeight: 600 }}>{n.title}</div>
              {n.body && <div className="small muted">{n.body}</div>}
              <div className="label">{ago(n.created_at)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AppShell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <Brand />
          <button className="btn ghost sm menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>Menu</button>
          <nav className={`nav ${open ? 'open' : ''}`} aria-label="Primary">
            {NAV[user.role].map(([to, label, end]) => <NavLink key={to} to={to} end={end}><Roll>{label}</Roll></NavLink>)}
          </nav>
          <div className="who">
            <Notifications />
            <button className="pill" onClick={logout} title="Sign out">{user.role} · Sign out <span className="dot">{user.name.slice(0, 1).toUpperCase()}</span></button>
          </div>
        </div>
      </div>
      {!user.email_verified && user.role !== 'host' && (
        <div className="notice" style={{ textAlign: 'center', borderLeft: 0, borderRight: 0 }}>
          Your email address is not yet verified. Check your inbox for the verification link.
        </div>
      )}
      <main className="page page-enter" key={loc.pathname}><Outlet /></main>
    </>
  );
}
