// POST /api/admin/verify-otp
// Body: { otp: string }
// Reads the pth_otp_chal cookie, verifies the OTP against the stored hash,
// and on success replaces it with a 24h signed admin session cookie
// (pth_admin_sess) carrying { email, iat, expiresAt }.

import type { APIRoute } from 'astro';
import {
  ADMIN_SESSION_COOKIE,
  OTP_CHALLENGE_COOKIE,
  clearCookieSerialized,
  createAdminSessionCookie,
  serializeCookie,
  verifyOtpChallengeCookie,
} from '../../../lib/adminAuth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: { otp?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const otp = (body.otp || '').trim();
  if (!/^\d{6}$/.test(otp)) {
    return json({ error: 'Please enter the 6-digit code.' }, 400);
  }

  const chal = cookies.get(OTP_CHALLENGE_COOKIE)?.value;
  if (!chal) {
    return json(
      { error: 'No active code. Request a new code and try again.' },
      400,
    );
  }

  const verified = verifyOtpChallengeCookie(chal, otp);
  if (!verified) {
    return json({ error: 'Invalid or expired code. Request a new one.' }, 401);
  }

  const session = createAdminSessionCookie(verified.email);

  return new Response(
    JSON.stringify({ ok: true, email: verified.email }),
    {
      status: 200,
      headers: [
        ['Content-Type', 'application/json'],
        // Replace challenge cookie with the session.
        ['Set-Cookie', clearCookieSerialized(OTP_CHALLENGE_COOKIE)],
        ['Set-Cookie', serializeCookie(ADMIN_SESSION_COOKIE, session, {
          maxAgeMs: 24 * 60 * 60 * 1000,
        })],
      ],
    },
  );
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
