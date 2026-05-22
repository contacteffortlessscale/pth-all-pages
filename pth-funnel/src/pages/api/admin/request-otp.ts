// POST /api/admin/request-otp
// Body: { email: string }
// On success: sets pth_otp_chal cookie and dispatches an email containing the
// 6-digit OTP via the configured GHL Inbound Webhook. The cookie holds a
// signed payload { email, otpHash, expiresAt } — verify with /verify-otp.
//
// Email is rate-limited softly via the cookie itself (one challenge at a time
// per browser). For real abuse protection a per-IP rate limit in Vercel KV
// would be the next step, but this is a 2-admin allowlist so the surface is
// already tiny.

import type { APIRoute } from 'astro';
import {
  OTP_CHALLENGE_COOKIE,
  createOtpChallengeCookie,
  generateOtp,
  hashOtp,
  isAdminEmail,
  sendOtpEmail,
  serializeCookie,
} from '../../../lib/adminAuth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Please enter a valid email.' }, 400);
  }

  // Always return the same generic response shape regardless of whether the
  // email is on the allowlist — keeps the allowlist from being probed.
  if (!isAdminEmail(email)) {
    // Sleep a beat so timing doesn't leak whether the email was on the list.
    await new Promise((r) => setTimeout(r, 200));
    return json({ ok: true, message: 'If that email is authorized, a code is on the way.' });
  }

  const otp = generateOtp();
  const challenge = createOtpChallengeCookie({ email, otpHash: hashOtp(otp) });

  const send = await sendOtpEmail(email, otp);
  if (!send.ok) {
    return json(
      { error: 'Could not send the code. Please contact the site owner.', detail: send.error },
      502,
    );
  }

  return new Response(
    JSON.stringify({ ok: true, message: 'A 6-digit code has been emailed to you.' }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': serializeCookie(OTP_CHALLENGE_COOKIE, challenge, {
          maxAgeMs: 10 * 60 * 1000,
        }),
      },
    },
  );
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
