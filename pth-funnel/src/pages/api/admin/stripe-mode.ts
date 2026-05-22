// GET  /api/admin/stripe-mode → { mode, source, meta }
// POST /api/admin/stripe-mode → { mode: 'live' | 'test' }
//
// All requests require a valid pth_admin_sess cookie.

import type { APIRoute } from 'astro';
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionCookie,
} from '../../../lib/adminAuth';
import { getStripeMode, setStripeMode, type StripeMode } from '../../../lib/stripeMode';
import { isStripeConfigured } from '../../../lib/stripe';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  const session = readSession(cookies);
  if (!session) return json({ error: 'Not authorized.' }, 401);

  const { mode, source, meta } = await getStripeMode({ bypassCache: true });
  return json({
    mode,
    source,                  // 'env' | 'kv' | 'default'
    meta,                    // { changedAt, changedBy } | null
    liveConfigured: isStripeConfigured('live'),
    testConfigured: isStripeConfigured('test'),
    email: session.email,
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = readSession(cookies);
  if (!session) return json({ error: 'Not authorized.' }, 401);

  let body: { mode?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const mode = String(body.mode || '').trim().toLowerCase() as StripeMode;
  if (mode !== 'live' && mode !== 'test') {
    return json({ error: 'mode must be "live" or "test"' }, 400);
  }

  // Refuse to flip into a mode that has no configured keys — otherwise the
  // public site instantly breaks.
  if (!isStripeConfigured(mode)) {
    return json(
      {
        error:
          mode === 'test'
            ? 'STRIPE_TEST_SECRET_KEY / STRIPE_TEST_PUBLISHABLE_KEY are not set in Vercel. Add them before switching to test mode.'
            : 'STRIPE_SECRET_KEY / PUBLIC_STRIPE_PUBLISHABLE_KEY are not set in Vercel. Add them before switching to live mode.',
      },
      400,
    );
  }

  const r = await setStripeMode(mode, session.email);
  if (!r.ok) return json({ error: r.error }, 400);

  const { mode: now, source, meta } = await getStripeMode({ bypassCache: true });
  return json({ ok: true, mode: now, source, meta });
};

function readSession(cookies: { get(name: string): { value: string } | undefined }) {
  const c = cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!c) return null;
  return verifyAdminSessionCookie(c);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
