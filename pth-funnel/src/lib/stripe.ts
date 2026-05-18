// Server-side Stripe client. PLACEHOLDER key wired via env until real keys
// are provisioned. See .env.example for the env var name.
import Stripe from 'stripe';

const secret = import.meta.env.STRIPE_SECRET_KEY;

if (!secret || secret.includes('PLACEHOLDER')) {
  // eslint-disable-next-line no-console
  console.warn(
    '[stripe] STRIPE_SECRET_KEY is missing or set to a PLACEHOLDER value. ' +
      'Server-side Stripe calls will fail until the real key is set in Vercel env.'
  );
}

export const stripe = new Stripe(secret || 'sk_test_PLACEHOLDER_REPLACE_ME', {
  apiVersion: '2024-12-18.acacia',
});

export function isStripeConfigured(): boolean {
  return !!secret && !secret.includes('PLACEHOLDER');
}
