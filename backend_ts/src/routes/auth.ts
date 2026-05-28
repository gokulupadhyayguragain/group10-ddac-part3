import { Router } from 'express';
import { pool } from '../db';
import { authMiddleware, hashPassword, verifyPassword, signToken } from '../auth';
import { maybeStoreDataUrl } from '../cloud';
import { exposeDevVerificationCode, sendVerificationEmail } from '../email';
import { ipAndEmailKey, rateLimit } from '../rateLimit';
import {
  generateVerificationCode,
  hashVerificationCode,
  verificationExpiryMinutes,
  verificationMaxAttempts,
} from '../verification';

const router = Router();

const registerLimiter = rateLimit({ keyPrefix: 'auth:register', windowMs: 15 * 60 * 1000, max: 5, key: ipAndEmailKey });
const verifyLimiter = rateLimit({ keyPrefix: 'auth:verify', windowMs: 15 * 60 * 1000, max: 10, key: ipAndEmailKey });
const resendLimiter = rateLimit({ keyPrefix: 'auth:resend', windowMs: 15 * 60 * 1000, max: 3, key: ipAndEmailKey });
const loginLimiter = rateLimit({ keyPrefix: 'auth:login', windowMs: 10 * 60 * 1000, max: 10, key: ipAndEmailKey });

function normalizeEmail(email: unknown) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

async function issueVerificationCode(user: { id: number; email: string; name: string }) {
  const code = generateVerificationCode();
  const expiresMinutes = verificationExpiryMinutes();
  const codeHash = hashVerificationCode(user.email, code);
  const idempotencyKey = `verify-${user.id}-${Date.now()}`;
  await pool.query(
    `UPDATE users
     SET verification_code_hash=$1,
         verification_code_expires_at=NOW() + ($2 || ' minutes')::interval,
         verification_attempts=0,
         verification_sent_at=NOW(),
         email_verified=FALSE,
         email_verified_at=NULL
     WHERE id=$3`,
    [codeHash, String(expiresMinutes), user.id]
  );
  const delivery = await sendVerificationEmail({
    email: user.email,
    name: user.name,
    code,
    expiresMinutes,
    idempotencyKey,
  });
  return {
    delivery,
    devVerificationCode: exposeDevVerificationCode() ? code : undefined,
  };
}

router.post('/register', registerLimiter, async (req, res) => {
  const { name, email, password, role, phone } = req.body;
  const normalizedEmail = normalizeEmail(email);
  if (!name || !normalizedEmail || !password) return res.status(400).json({ error: 'name, email, and password are required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
  const allowedRoles = new Set(['family', 'community']);
  const nextRole = allowedRoles.has(role) ? role : 'family';
  const pw = hashPassword(password);
  try {
    const existing = await pool.query(
      'SELECT id, email_verified FROM users WHERE email=$1',
      [normalizedEmail]
    );
    if (existing.rowCount && existing.rows[0].email_verified) {
      return res.status(409).json({ error: 'Email exists' });
    }

    const r = await pool.query(
      `INSERT INTO users(name,email,password_hash,role,phone,email_verified)
       VALUES($1,$2,$3,$4,$5,FALSE)
       ON CONFLICT (email) DO UPDATE
       SET name=EXCLUDED.name,
           password_hash=EXCLUDED.password_hash,
           role=EXCLUDED.role,
           phone=EXCLUDED.phone,
           email_verified=FALSE,
           email_verified_at=NULL
       WHERE users.email_verified = FALSE
       RETURNING id, name, email`,
      [String(name).trim(), normalizedEmail, pw, nextRole, phone || null]
    );
    if (!r.rowCount) return res.status(409).json({ error: 'Email exists' });
    const verification = await issueVerificationCode(r.rows[0]);
    res.status(201).json({
      id: r.rows[0].id,
      email: r.rows[0].email,
      verificationRequired: true,
      delivery: verification.delivery.mode,
      message: 'Verification code sent.',
      ...(verification.devVerificationCode ? { devVerificationCode: verification.devVerificationCode } : {}),
    });
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email exists' });
    console.error('Registration failed:', e);
    const isEmailFailure = typeof e.message === 'string' && e.message.startsWith('Resend email failed');
    res.status(isEmailFailure ? 502 : 500).json({ error: isEmailFailure ? 'Unable to send verification email' : 'Registration failed' });
  }
});

router.post('/verify-email', verifyLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = String(req.body.code || '').trim();
  if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'email and 6-digit code are required' });

  const r = await pool.query(
    `SELECT id, email_verified, verification_code_hash, verification_code_expires_at, verification_attempts
     FROM users
     WHERE email=$1`,
    [email]
  );
  if (!r.rowCount) return res.status(400).json({ error: 'Invalid verification code' });
  const user = r.rows[0];
  if (user.email_verified) return res.json({ verified: true });
  if (!user.verification_code_hash || !user.verification_code_expires_at) {
    return res.status(400).json({ error: 'Verification code is missing. Request a new code.' });
  }
  if (Number(user.verification_attempts || 0) >= verificationMaxAttempts()) {
    return res.status(429).json({ error: 'Too many invalid attempts. Request a new code.' });
  }
  if (new Date(user.verification_code_expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Verification code expired. Request a new code.' });
  }

  const expected = String(user.verification_code_hash);
  const actual = hashVerificationCode(email, code);
  if (actual !== expected) {
    await pool.query('UPDATE users SET verification_attempts = COALESCE(verification_attempts, 0) + 1 WHERE id=$1', [user.id]);
    return res.status(400).json({ error: 'Invalid verification code' });
  }

  await pool.query(
    `UPDATE users
     SET email_verified=TRUE,
         email_verified_at=NOW(),
         verification_code_hash=NULL,
         verification_code_expires_at=NULL,
         verification_attempts=0
     WHERE id=$1`,
    [user.id]
  );
  res.json({ verified: true });
});

router.post('/resend-verification', resendLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) return res.status(400).json({ error: 'email is required' });
  const r = await pool.query('SELECT id, name, email, email_verified FROM users WHERE email=$1', [email]);
  if (!r.rowCount) return res.json({ sent: true });
  if (r.rows[0].email_verified) return res.json({ verified: true });
  try {
    const verification = await issueVerificationCode(r.rows[0]);
    res.json({
      sent: true,
      delivery: verification.delivery.mode,
      message: 'Verification code sent.',
      ...(verification.devVerificationCode ? { devVerificationCode: verification.devVerificationCode } : {}),
    });
  } catch (error: any) {
    console.error('Verification resend failed:', error);
    res.status(502).json({ error: 'Unable to send verification email' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  const r = await pool.query('SELECT id,password_hash,email_verified FROM users WHERE email = $1', [email]);
  if (!r.rowCount) return res.status(401).json({ error: 'Invalid credentials' });
  const { id, password_hash, email_verified } = r.rows[0];
  if (!verifyPassword(password, password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  if (!email_verified) {
    return res.status(403).json({ error: 'Please verify your email before logging in.', verificationRequired: true });
  }
  const token = signToken(id);
  res.json({ token });
});

router.get('/profile', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing auth' });
  const parts = auth.split(' ');
  if (parts[0].toLowerCase() !== 'bearer') return res.status(401).json({ error: 'Invalid auth' });
  try {
    const payload: any = require('jsonwebtoken').verify(parts[1], process.env.JWT_SECRET || 'local-dev-only-change-before-cloud');
    const r = await pool.query('SELECT id,name,email,role,phone,avatar_url,notification_prefs FROM users WHERE id=$1', [Number(payload.sub)]);
    if (!r.rowCount) return res.status(401).json({ error: 'User not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
});

router.put('/profile', authMiddleware, async (req, res) => {
  const { name, phone, avatar_url, current_password, new_password, notification_prefs } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
  const user = (req as any).user;
  if (new_password) {
    if (!current_password) return res.status(400).json({ error: 'current_password is required' });
    const current = await pool.query('SELECT password_hash FROM users WHERE id=$1', [user.id]);
    if (!current.rowCount) return res.status(404).json({ error: 'User not found' });
    if (!verifyPassword(current_password, current.rows[0].password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
  }
  const prefs = typeof notification_prefs === 'string' ? notification_prefs : JSON.stringify(notification_prefs || {});
  const storedAvatar = await maybeStoreDataUrl(avatar_url || null, 'avatars');
  const r = await pool.query(
    'UPDATE users SET name=$1, phone=$2, avatar_url=$3, notification_prefs=$4 WHERE id=$5 RETURNING id,name,email,role,phone,avatar_url,notification_prefs',
    [name, phone || null, storedAvatar, prefs, user.id]
  );
  if (!r.rowCount) return res.status(404).json({ error: 'User not found' });
  if (new_password) {
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hashPassword(new_password), user.id]);
  }
  res.json(r.rows[0]);
});

export default router;
