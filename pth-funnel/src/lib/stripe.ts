// Server-side Stripe client, mode-aware.
//
// The mode (live vs test) for a given request comes from src/lib/stripeMode.ts.
// At runtime we keep one cached Stripe instance per mode so repeated calls
// within the same warm function instance don't re-instantiate the client.
import Stripe from 'stripe';
import { getStripeKeys, type StripeMode } from './stripeMode';

const cache: Partial<Record<StripeMode, Stripe>> = {};

export function getStripe(mode: StripeMode): Stripe {
  const cached = cache[mode];
  if (cached) return cached;

  const { secret } = getStripeKeys(mode);
  if (!secret || secret.includes('PLACEHOLDER')) {
    console.warn(
      `[stripe] ${mode === 'test' ? 'STRIPE_TEST_SECRET_KEY' : 'STRIPE_SECRET_KEY'} ` +
        'is missing or set to a PLACEHOLDER. Calls will fail until the real key is set in Vercel env.'
    );
  }
  const client = new Stripe(secret || 'sk_test_PLACEHOLDER_REPLACE_ME', {
    apiVersion: '2024-12-18.acacia',
  });
  cache[mode] = client;
  return client;
}

export function isStripeConfigured(mode: StripeMode): boolean {
  return getStripeKeys(mode).configured;
}

// Backwards-compat shim: many callers used to import { stripe } as a singleton
// in live mode. New code should call getStripe(mode) directly.
export const stripe: Stripe = getStripe('live');
