import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function signSession(user, secret) {
  return jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: '7d' });
}

// Loads the user fresh from the DB on every request so suspensions take effect immediately.
export function authenticate(db, secret) {
  const getUser = db.prepare('SELECT id, email, role, name, status, email_verified FROM users WHERE id = ?');
  const touch = db.prepare("UPDATE users SET last_active_at = datetime('now') WHERE id = ?");
  return (req, _res, next) => {
    const token = req.cookies?.session;
    if (token) {
      try {
        const payload = jwt.verify(token, secret);
        const u = getUser.get(payload.sub);
        if (u && u.status === 'active') { req.user = u; touch.run(u.id); }
      } catch { /* invalid token → anonymous */ }
    }
    next();
  };
}

export const requireAuth = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'Sign in required')));
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Sign in required'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have access to this resource'));
  next();
};

export function audit(db, req, action, targetType, targetId, detail) {
  db.prepare('INSERT INTO audit_logs(actor_id, action, target_type, target_id, detail, ip) VALUES (?,?,?,?,?,?)')
    .run(req?.user?.id ?? null, action, targetType ?? null, targetId ?? null, detail ? JSON.stringify(detail) : null, req?.ip ?? null);
}

export function activity(db, companyId, actorId, type, summary, visibleToFounder = false) {
  db.prepare('INSERT INTO activities(company_id, actor_id, type, summary, visible_to_founder) VALUES (?,?,?,?,?)')
    .run(companyId, actorId ?? null, type, summary, visibleToFounder ? 1 : 0);
}

// dedupeKey makes retried jobs/requests idempotent with respect to notifications.
export function notify(db, userId, title, body, link, dedupeKey = null) {
  db.prepare('INSERT OR IGNORE INTO notifications(user_id, dedupe_key, title, body, link) VALUES (?,?,?,?,?)')
    .run(userId, dedupeKey, title, body ?? null, link ?? null);
}
export function notifyHosts(db, title, body, link, dedupeKey) {
  for (const h of db.prepare("SELECT id FROM users WHERE role='host' AND status='active'").all()) notify(db, h.id, title, body, link, dedupeKey ? `${dedupeKey}` : null);
}

export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, _res, next) => {
    const key = `${req.ip}|${req.path}`;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);
    if (arr.length > max) return next(new HttpError(429, 'Too many attempts. Please wait and try again.'));
    next();
  };
}

export function randomToken() { return crypto.randomBytes(32).toString('base64url'); }
export function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

// Time-limited signed URL tokens for private documents.
export function signDocUrl(docId, userId, secret, ttlSec = 300) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = crypto.createHmac('sha256', secret).update(`${docId}.${userId}.${exp}`).digest('base64url');
  return `/api/files/${docId}?u=${userId}&exp=${exp}&sig=${sig}`;
}
export function verifyDocSig(docId, userId, exp, sig, secret) {
  if (!exp || Number(exp) < Date.now() / 1000) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${docId}.${userId}.${exp}`).digest('base64url');
  const a = Buffer.from(expected), b = Buffer.from(String(sig || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const jparse = (v, d = []) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
