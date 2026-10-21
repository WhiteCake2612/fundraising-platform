import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;

const { app, db } = createApp({
  dbFile: env.DB_FILE || path.join(root, 'data', 'app.db'),
  uploadDir: env.UPLOAD_DIR || path.join(root, 'data', 'uploads'),
  secret: env.SESSION_SECRET,
  staticDir: path.join(root, '..', 'client', 'dist'),
});

// Bootstrap the first host administrator from environment variables (only if none exists).
if (!db.prepare("SELECT 1 FROM users WHERE role='host'").get()) {
  if (env.HOST_EMAIL && env.HOST_PASSWORD) {
    db.prepare("INSERT INTO users(email, password_hash, role, name, email_verified) VALUES (?,?, 'host', ?, 1)")
      .run(env.HOST_EMAIL, bcrypt.hashSync(env.HOST_PASSWORD, 12), env.HOST_NAME || 'Host Administrator');
    console.log(`Created host account ${env.HOST_EMAIL}`);
  } else {
    console.warn('No host account exists. Set HOST_EMAIL and HOST_PASSWORD in server/.env and restart.');
  }
}

const port = Number(env.PORT) || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
