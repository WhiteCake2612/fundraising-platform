import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { HttpError, asyncH, signSession, audit, randomToken, sha256, rateLimit, notifyHosts, activity } from '../lib/core.js';
import { tx } from '../db.js';

const RegisterSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
  name: z.string().trim().min(2).max(120),
  role: z.enum(['founder', 'investor']),
  company_name: z.string().trim().max(200).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'You must accept the privacy notice and terms' }) }),
});

export default function authRoutes({ db, secret, secureCookies }) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 15 * 60_000, max: 20 });
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 7 * 24 * 3600 * 1000, path: '/' };

  function issueToken(userId, purpose, hours) {
    const token = randomToken();
    db.prepare("INSERT INTO auth_tokens(token_hash, user_id, purpose, expires_at) VALUES (?,?,?, datetime('now', ?))").run(sha256(token), userId, purpose, `+${hours} hours`);
    return token;
  }
  function sendMail(to, subject, body) {
    db.prepare('INSERT INTO email_outbox(to_email, subject, body) VALUES (?,?,?)').run(to, subject, body);
  }

  r.post('/register', limiter, asyncH(async (req, res) => {
    const body = RegisterSchema.parse(req.body);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) throw new HttpError(409, 'An account with this email already exists');
    const hash = await bcrypt.hash(body.password, 12);
    const user = tx(db, () => {
      const id = Number(db.prepare('INSERT INTO users(email, password_hash, role, name) VALUES (?,?,?,?)').run(body.email, hash, body.role, body.name).lastInsertRowid);
      if (body.role === 'founder') {
        const code = `PRJ-${String(id).padStart(4, '0')}-${randomToken().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
        const cid = Number(db.prepare('INSERT INTO companies(owner_user_id, code, brand_name) VALUES (?,?,?)').run(id, code, body.company_name || null).lastInsertRowid);
        db.prepare("INSERT INTO deals(company_id, stage) VALUES (?, 'registered')").run(cid);
        activity(db, cid, id, 'registered', 'Founder registered', true);
      } else {
        db.prepare('INSERT INTO investor_profiles(user_id) VALUES (?)').run(id);
      }
      return { id, role: body.role, email: body.email, name: body.name };
    });
    const token = issueToken(user.id, 'verify', 48);
    sendMail(user.email, 'Verify your email', `Verify your account: /verify?token=${token}`);
    notifyHosts(db, `New ${user.role} registration`, `${user.name} (${user.email})`, `/host/users`);
    req.user = user;
    audit(db, req, 'user.register', 'user', user.id, { role: user.role });
    res.cookie('session', signSession(user, secret), cookieOpts);
    res.status(201).json({ user: { ...user, email_verified: 0, status: 'active' } });
  }));

  r.post('/login', limiter, asyncH(async (req, res) => {
    const { email, password } = z.object({ email: z.string(), password: z.string() }).parse(req.body);
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const ok = u && await bcrypt.compare(password, u.password_hash);
    db.prepare('INSERT INTO login_events(user_id, email, success, ip, user_agent) VALUES (?,?,?,?,?)').run(u?.id ?? null, email, ok ? 1 : 0, req.ip, String(req.headers['user-agent'] || '').slice(0, 200));
    if (!ok) throw new HttpError(401, 'Incorrect email or password');
    if (u.status !== 'active') throw new HttpError(403, `This account is ${u.status}. Contact the platform administrator.`);
    db.prepare("UPDATE users SET last_login_at = datetime('now'), last_active_at = datetime('now') WHERE id = ?").run(u.id);
    req.user = u;
    audit(db, req, 'user.login', 'user', u.id);
    res.cookie('session', signSession(u, secret), cookieOpts);
    res.json({ user: { id: u.id, email: u.email, role: u.role, name: u.name, status: u.status, email_verified: u.email_verified } });
  }));

  r.post('/logout', (req, res) => {
    if (req.user) audit(db, req, 'user.logout', 'user', req.user.id);
    res.clearCookie('session', { path: '/' });
    res.json({ ok: true });
  });

  r.get('/me', (req, res) => res.json({ user: req.user || null }));

  r.post('/verify', asyncH(async (req, res) => {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    const row = db.prepare("SELECT * FROM auth_tokens WHERE token_hash=? AND purpose='verify' AND used_at IS NULL AND expires_at > datetime('now')").get(sha256(token));
    if (!row) throw new HttpError(400, 'This verification link is invalid or has expired');
    tx(db, () => {
      db.prepare("UPDATE auth_tokens SET used_at=datetime('now') WHERE token_hash=?").run(row.token_hash);
      db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(row.user_id);
    });
    res.json({ ok: true });
  }));

  r.post('/forgot', limiter, asyncH(async (req, res) => {
    const { email } = z.object({ email: z.string() }).parse(req.body);
    const u = db.prepare("SELECT id, email FROM users WHERE email=? AND status='active'").get(email);
    if (u) {
      const token = issueToken(u.id, 'reset', 1);
      sendMail(u.email, 'Reset your password', `Reset your password: /reset?token=${token}`);
    }
    res.json({ ok: true }); // same response either way: no account enumeration
  }));

  r.post('/reset', limiter, asyncH(async (req, res) => {
    const { token, password } = z.object({ token: z.string(), password: z.string().min(10).max(200) }).parse(req.body);
    const row = db.prepare("SELECT * FROM auth_tokens WHERE token_hash=? AND purpose='reset' AND used_at IS NULL AND expires_at > datetime('now')").get(sha256(token));
    if (!row) throw new HttpError(400, 'This reset link is invalid or has expired');
    const hash = await bcrypt.hash(password, 12);
    tx(db, () => {
      db.prepare("UPDATE auth_tokens SET used_at=datetime('now') WHERE token_hash=?").run(row.token_hash);
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, row.user_id);
    });
    audit(db, { user: { id: row.user_id }, ip: req.ip }, 'user.password_reset', 'user', row.user_id);
    res.json({ ok: true });
  }));

  return r;
}
