// HMAC-signed order tokens.
// The checkout flow charges the customer once, then redirects to /upsell with
// a signed token carrying the Stripe customer + payment method IDs. The upsell
// page can verify the token and trigger an off-session charge without a DB.
//
// Token format: <base64url(payload)>.<base64url(hmac-sha256)>
// Payload: { cid, pmid, email, firstName, mainOrderAmount, iat }
//
// TODO: rotate ORDER_TOKEN_SECRET periodically. Tokens expire after EXPIRY_MS.

import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET =
  process.env.ORDER_TOKEN_SECRET ||
  'CHANGE_ME_INSECURE_DEFAULT_DO_NOT_USE_IN_PROD';

const EXPIRY_MS = 1000 * 60 * 60; // 1 hour

export interface OrderTokenPayload {
  cid: string;             // Stripe customer ID
  pmid: string;            // Stripe payment method ID (saved off-session)
  email: string;
  firstName: string;
  mainOrderAmount: number; // cents, for the receipt summary
  iat: number;             // issued at, ms epoch
  mode?: 'live' | 'test';  // which Stripe mode the customer was created in
                           //   — optional for backward compat with old tokens
                           //   (treated as 'live' if absent).
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const norm = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(norm, 'base64');
}

function sign(payload: string): string {
  return b64urlEncode(createHmac('sha256', SECRET).update(payload).digest());
}

export function createOrderToken(p: Omit<OrderTokenPayload, 'iat'>): string {
  const full: OrderTokenPayload = { ...p, iat: Date.now() };
  const payloadJson = JSON.stringify(full);
  const payloadB64 = b64urlEncode(payloadJson);
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifyOrderToken(token: string): OrderTokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.', 2);
  if (!payloadB64 || !sig) return null;

  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: OrderTokenPayload;
  try {
    parsed = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }

  if (typeof parsed.iat !== 'number' || Date.now() - parsed.iat > EXPIRY_MS) return null;
  if (!parsed.cid || !parsed.pmid || !parsed.email) return null;
  return parsed;
}
