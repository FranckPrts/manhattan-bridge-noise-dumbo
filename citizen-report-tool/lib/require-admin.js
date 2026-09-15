import crypto from 'crypto';

export const ADMIN_COOKIE_NAME = 'admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export class UnauthorizedError extends Error {}

function getSecret() {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error('ADMIN_PASSWORD not set in environment');
  return secret;
}

// Fixed-length HMAC digest before comparing, so a wrong-length guess doesn't
// short-circuit before the constant-time comparison (and so the comparison
// itself is always constant-time regardless of input length).
export function verifyPassword(candidate) {
  const secret = getSecret();
  const hash = (s) => crypto.createHmac('sha256', 'admin-password-check').update(String(s ?? '')).digest();
  return crypto.timingSafeEqual(hash(candidate), hash(secret));
}

export function signAdminToken() {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;

  const [payload, signature] = token.split('.');
  const expectedSignature = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

export function requireAdmin(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (!verifyAdminToken(cookies[ADMIN_COOKIE_NAME])) {
    throw new UnauthorizedError('Admin session missing or expired');
  }
}
