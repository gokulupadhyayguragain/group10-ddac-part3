import crypto from 'crypto';

const DEFAULT_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export function verificationExpiryMinutes() {
  const value = Number(process.env.AUTH_VERIFICATION_TTL_MINUTES || DEFAULT_EXPIRY_MINUTES);
  if (!Number.isFinite(value) || value < 1 || value > 60) return DEFAULT_EXPIRY_MINUTES;
  return Math.floor(value);
}

export function generateVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashVerificationCode(email: string, code: string) {
  const secret = process.env.JWT_SECRET || 'local-dev-only-change-before-cloud';
  return crypto
    .createHash('sha256')
    .update(`${email.trim().toLowerCase()}:${code.trim()}:${secret}`)
    .digest('hex');
}

export function verificationMaxAttempts() {
  return MAX_ATTEMPTS;
}
