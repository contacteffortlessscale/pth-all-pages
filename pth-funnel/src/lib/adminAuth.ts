// Admin authentication helpers.
//
// Flow:
//   1. User submits email at /admin/stripe-mode → /api/admin/request-otp
//   2. We check the email is in ADMIN_EMAILS; if yes, generate a 6-digit OTP,
//      hash it, store { email, otpHash, expiresAt } in a signed HTTP-only
//      cookie ("pth_otp_chal"), and send the plaintext OTP to the user via
//      a GHL Inbound Webhook (ADMIN_OTP_WEBHOOK_URL).
//   3. User enters OTP → /api/admin/verify-otp
//   4. We verify the cookie signature + OTP hash + expiration, then set a
//      signed admin session cookie ("pth_admin_sess") good for 24h.
//   5. Subsequent admin endpoints accept any caller carrying a valid session
//      cookie.

import { createHmac, randomInt, timingSafeEqual, createHash } from 'node:crypto';

const SECRET =
  process.env.ADMIN_COOKIE_SECRET ||
  'CHANGE_ME_INSECURE_DEFAULT_DO_NOT_USE_IN_PROD';

const OTP_TTL_MS = 1000 * 60 * 10;       // 10 minutes
const SESSION_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export const OTP_CHALLENGE_COOKIE = 'pth_otp_chal';
export const ADMIN_SESSION_COOKIE = 'pth_admin_sess';

// ---------- email allowlist ----------
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  const list = getAdminEmails();
  return list.includes(email.trim().toLowerCase());
}

// ---------- OTP code ----------
export function generateOtp(): string {
  // 6 digits, 000000-999999, padded.
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

// ---------- signed cookie payload helpers ----------
function b64urlEncode(s: string): string {
  return Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const norm = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(norm, 'base64').toString('utf8');
}

function sign(payload: string): string {
  return createHmac('sha256', SECRET)
    .update(payload)
    .digest('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signedPayload(payloadJson: string): string {
  const payloadB64 = b64urlEncode(payloadJson);
  return `${payloadB64}.${sign(payloadB64)}`;
}

function verifySignedPayload<T>(token: string): T | null {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.', 2);
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(b64urlDecode(payloadB64)) as T;
  } catch {
    return null;
  }
}

// ---------- OTP challenge cookie ----------
export interface OtpChallenge {
  email: string;
  otpHash: string;
  expiresAt: number; // ms epoch
}

export function createOtpChallengeCookie(c: Omit<OtpChallenge, 'expiresAt'>): string {
  const full: OtpChallenge = { ...c, expiresAt: Date.now() + OTP_TTL_MS };
  return signedPayload(JSON.stringify(full));
}

export function verifyOtpChallengeCookie(token: string, otp: string): OtpChallenge | null {
  const parsed = verifySignedPayload<OtpChallenge>(token);
  if (!parsed) return null;
  if (typeof parsed.expiresAt !== 'number' || Date.now() > parsed.expiresAt) return null;
  if (!parsed.email || !parsed.otpHash) return null;
  if (hashOtp(otp) !== parsed.otpHash) return null;
  return parsed;
}

// ---------- admin session cookie ----------
export interface AdminSession {
  email: string;
  iat: number;        // issued at, ms
  expiresAt: number;  // ms
}

export function createAdminSessionCookie(email: string): string {
  const now = Date.now();
  const full: AdminSession = { email, iat: now, expiresAt: now + SESSION_TTL_MS };
  return signedPayload(JSON.stringify(full));
}

export function verifyAdminSessionCookie(token: string): AdminSession | null {
  const parsed = verifySignedPayload<AdminSession>(token);
  if (!parsed) return null;
  if (typeof parsed.expiresAt !== 'number' || Date.now() > parsed.expiresAt) return null;
  if (!parsed.email || !isAdminEmail(parsed.email)) return null;
  return parsed;
}

// ---------- cookie serialization (Set-Cookie header) ----------
export function serializeCookie(
  name: string,
  value: string,
  opts: { maxAgeMs?: number; httpOnly?: boolean; secure?: boolean; sameSite?: 'Strict' | 'Lax' | 'None'; path?: string } = {}
): string {
  const parts: string[] = [`${name}=${value}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (typeof opts.maxAgeMs === 'number') {
    parts.push(`Max-Age=${Math.floor(opts.maxAgeMs / 1000)}`);
  }
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  return parts.join('; ');
}

export function clearCookieSerialized(name: string, path = '/'): string {
  return `${name}=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// ---------- GHL OTP email dispatch ----------
export async function sendOtpEmail(email: string, otp: string): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.ADMIN_OTP_WEBHOOK_URL;
  if (!url || url.includes('REPLACE_ME')) {
    return { ok: false, error: 'ADMIN_OTP_WEBHOOK_URL not configured' };
  }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        otp_code: otp,
        purpose: 'admin-stripe-mode-login',
        sent_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return { ok: false, error: `GHL responded ${r.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
