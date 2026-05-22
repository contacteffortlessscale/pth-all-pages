// Stripe mode resolution (live vs test) for the whole site.
//
// Priority (first match wins):
//   1. STRIPE_MODE env var, if set to 'live' or 'test' — emergency override.
//      Useful when KV is unavailable or you need to lock the mode for a deploy.
//   2. Vercel KV value at key 'stripe_mode', if KV is configured and reachable.
//      Set by the /admin/stripe-mode toggle.
//   3. Fallback default: 'live'.
//
// To run in test mode for the whole site without setting up KV, just set
// STRIPE_MODE=test in Vercel and redeploy. With KV the admin page can flip it
// without a redeploy.

export type StripeMode = 'live' | 'test';

const KV_KEY = 'stripe_mode';
const KV_METADATA_KEY = 'stripe_mode_meta';

export interface StripeModeMeta {
  changedAt: string;
  changedBy: string;
}

// Cached read so we don't hammer KV from inside a single request lifecycle.
let cachedMode: { mode: StripeMode; meta: StripeModeMeta | null; at: number } | null = null;
const CACHE_TTL_MS = 2_000; // 2s — long enough to be useful within a request, short enough to feel live

function envOverride(): StripeMode | null {
  const v = (process.env.STRIPE_MODE || '').trim().toLowerCase();
  if (v === 'live' || v === 'test') return v;
  return null;
}

function kvCreds(): { url: string; token: string } | null {
  // Vercel KV (Upstash-backed) injects these names:
  let url = process.env.KV_REST_API_URL;
  let token = process.env.KV_REST_API_TOKEN;
  // Direct Upstash integration uses these names:
  if (!url || !token) {
    url = process.env.UPSTASH_REDIS_REST_URL;
    token = process.env.UPSTASH_REDIS_REST_TOKEN;
  }
  if (!url || !token) return null;
  return { url, token };
}

// Direct REST calls — no @vercel/kv package needed (so the bundle builds even
// when KV isn't connected yet). Upstash REST API: GET /get/{key}, POST /set/{key}.
async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const creds = kvCreds();
  if (!creds) return null;
  try {
    const r = await fetch(`${creds.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${creds.token}` },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { result: unknown };
    if (data.result === null || typeof data.result === 'undefined') return null;
    // Values were stored as JSON strings via /set; parse on read.
    if (typeof data.result === 'string') {
      try { return JSON.parse(data.result) as T; } catch { return data.result as unknown as T; }
    }
    return data.result as T;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: unknown): Promise<boolean> {
  const creds = kvCreds();
  if (!creds) return false;
  try {
    const r = await fetch(`${creds.url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function getStripeMode(opts: { bypassCache?: boolean } = {}): Promise<{ mode: StripeMode; source: 'env' | 'kv' | 'default'; meta: StripeModeMeta | null }> {
  // 1. Env override always wins.
  const fromEnv = envOverride();
  if (fromEnv) return { mode: fromEnv, source: 'env', meta: null };

  // Cache hit?
  if (!opts.bypassCache && cachedMode && Date.now() - cachedMode.at < CACHE_TTL_MS) {
    return { mode: cachedMode.mode, source: 'kv', meta: cachedMode.meta };
  }

  // 2. KV.
  if (kvCreds()) {
    const stored = await kvGet<StripeMode>(KV_KEY);
    if (stored === 'live' || stored === 'test') {
      const meta = await kvGet<StripeModeMeta>(KV_METADATA_KEY);
      cachedMode = { mode: stored, meta, at: Date.now() };
      return { mode: stored, source: 'kv', meta };
    }
  }

  // 3. Default.
  return { mode: 'live', source: 'default', meta: null };
}

export async function setStripeMode(mode: StripeMode, changedBy: string): Promise<{ ok: boolean; error?: string }> {
  if (mode !== 'live' && mode !== 'test') {
    return { ok: false, error: 'Invalid mode' };
  }
  // If an env override is in place, the toggle won't have effect — be honest.
  if (envOverride()) {
    return {
      ok: false,
      error: 'STRIPE_MODE env var is set and overrides KV. Unset it in Vercel to use the toggle.',
    };
  }
  if (!kvCreds()) {
    return {
      ok: false,
      error: 'Vercel KV not connected. Connect a KV store in the Vercel dashboard (Storage tab) or set STRIPE_MODE env var instead.',
    };
  }
  const meta: StripeModeMeta = { changedAt: new Date().toISOString(), changedBy };
  const ok1 = await kvSet(KV_KEY, mode);
  const ok2 = await kvSet(KV_METADATA_KEY, meta);
  if (!ok1 || !ok2) {
    return { ok: false, error: 'KV write failed.' };
  }
  cachedMode = { mode, meta, at: Date.now() };
  return { ok: true };
}

export interface StripeKeyPair {
  secret: string | undefined;
  publishable: string | undefined;
  configured: boolean;
}

export function getStripeKeys(mode: StripeMode): StripeKeyPair {
  if (mode === 'test') {
    const secret = process.env.STRIPE_TEST_SECRET_KEY;
    const publishable = process.env.STRIPE_TEST_PUBLISHABLE_KEY;
    return {
      secret,
      publishable,
      configured:
        Boolean(secret && !secret.includes('PLACEHOLDER')) &&
        Boolean(publishable && !publishable.includes('PLACEHOLDER')),
    };
  }
  // live
  const secret = process.env.STRIPE_SECRET_KEY;
  const publishable = process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return {
    secret,
    publishable,
    configured:
      Boolean(secret && !secret.includes('PLACEHOLDER')) &&
      Boolean(publishable && !publishable.includes('PLACEHOLDER')),
  };
}
