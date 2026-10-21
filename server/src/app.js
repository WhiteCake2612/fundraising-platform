import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { ZodError } from 'zod';
import multer from 'multer';
import { openDb } from './db.js';
import { HttpError, authenticate, requireAuth, verifyDocSig, audit } from './lib/core.js';
import { createPipeline } from './services/pipeline.js';
import { llmConfig } from './services/llm.js';
import * as C from './lib/constants.js';
import authRoutes from './routes/auth.js';
import founderRoutes from './routes/founder.js';
import investorRoutes from './routes/investor.js';
import hostRoutes from './routes/host.js';

export function createApp({ dbFile, uploadDir, secret, env = process.env, inlineJobs = false, staticDir } = {}) {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  fs.mkdirSync(uploadDir, { recursive: true });
  const db = openDb(dbFile);
  const pipeline = createPipeline({ db, uploadDir, env, inline: inlineJobs });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(authenticate(db, secret));

  // CSRF defence for cookie auth: state-changing API calls must come from our own origin via fetch.
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('x-requested-with') !== 'fetch') return next(new HttpError(403, 'Missing request header'));
    next();
  });

  const ctx = { db, uploadDir, secret, pipeline, secureCookies: env.NODE_ENV === 'production' };
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/founder', founderRoutes(ctx));
  app.use('/api/investor', investorRoutes(ctx));
  app.use('/api/host', hostRoutes(ctx));

  app.get('/api/meta', (_req, res) => {
    const llm = llmConfig(env);
    res.json({
      stages: C.STAGES, stageLabels: C.STAGE_LABELS, sectors: C.SECTORS, businessModels: C.BUSINESS_MODELS, geographies: C.GEOGRAPHIES,
      investorTypes: C.INVESTOR_TYPES, leadPrefs: C.LEAD_PREFS, docCategories: C.DOC_CATEGORIES, allowedExt: C.ALLOWED_EXT, maxUpload: C.MAX_UPLOAD_BYTES,
      integrations: {
        llm: llm.configured ? { status: 'configured', provider: llm.provider, model: llm.model, documentText: llm.allowDocumentText } : { status: 'not_configured' },
        email: { status: env.SMTP_URL ? 'configured' : 'not_configured' },
        ocr: { status: 'not_configured' },
        malware_scan: { status: 'not_configured' },
      },
    });
  });

  app.get('/api/notifications', requireAuth, (req, res) => {
    res.json({
      notifications: db.prepare('SELECT id, title, body, link, read_at, created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50').all(req.user.id),
      unread: db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL').get(req.user.id).n,
    });
  });
  app.post('/api/notifications/read', requireAuth, (req, res) => {
    db.prepare("UPDATE notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL").run(req.user.id);
    res.json({ ok: true });
  });

  // Private file delivery: signed, short-lived URL *and* a matching live session, re-checked against current permissions.
  app.get('/api/files/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const { u, exp, sig } = req.query;
    if (Number(u) !== req.user.id || !verifyDocSig(id, req.user.id, exp, sig, secret)) throw new HttpError(403, 'This link is invalid or has expired');
    const d = db.prepare('SELECT d.*, c.owner_user_id FROM documents d JOIN companies c ON c.id=d.company_id WHERE d.id=?').get(id);
    if (!d) throw new HttpError(404, 'Document not found');
    const allowed = req.user.role === 'host' || (req.user.role === 'founder' && d.owner_user_id === req.user.id) ||
      (req.user.role === 'investor' && db.prepare('SELECT 1 FROM document_grants WHERE document_id=? AND investor_id=? AND revoked_at IS NULL').get(id, req.user.id));
    if (!allowed) throw new HttpError(403, 'You do not have access to this document');
    db.prepare('INSERT INTO document_access_log(document_id, user_id, action) VALUES (?,?,?)').run(id, req.user.id, 'download');
    audit(db, req, 'document.download', 'document', id);
    res.setHeader('content-disposition', `attachment; filename="${d.filename.replace(/[^\w.\- ]/g, '_')}"`);
    res.setHeader('cache-control', 'private, no-store');
    res.sendFile(path.resolve(uploadDir, d.stored_name));
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'Please check the highlighted fields', fields: err.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `File exceeds the ${C.MAX_UPLOAD_BYTES / 1024 / 1024} MB limit` : err.message });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    // Never echo internals (or financial data) back to clients or logs.
    console.error(`[error] ${req.method} ${req.path}: ${err?.message}`);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return { app, db, pipeline };
}
