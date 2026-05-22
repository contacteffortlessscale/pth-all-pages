// POST /api/upsell  — off-session one-click charge for the upsell product.
import type { APIRoute } from 'astro';
import { getStripe, isStripeConfigured } from '../../lib/stripe';
import { verifyOrderToken } from '../../lib/orderToken';
import { notifyGhl } from '../../lib/ghl';
import type { StripeMode } from '../../lib/stripeMode';

export const prerender = false;

const UPSELL_NAME = process.env.PRODUCT_UPSELL_NAME || 'Instant Flow States';
const UPSELL_AMOUNT = Number(process.env.PRODUCT_UPSELL_AMOUNT_CENTS || 2200);

export const POST: APIRoute = async ({ request }) => {
  let body: { order_token?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const payload = verifyOrderToken(body.order_token || '');
  if (!payload) return json({ error: 'Invalid or expired order token' }, 401);

  // Always use the same Stripe mode the customer was created in — the order
  // token carries it, and old tokens (pre-mode field) are treated as 'live'.
  const mode: StripeMode = payload.mode === 'test' ? 'test' : 'live';
  if (!isStripeConfigured(mode)) {
    return json({ error: `Stripe ${mode.toUpperCase()} keys are not configured.` }, 500);
  }
  const stripe = getStripe(mode);

  try {
    const intent = await stripe.paymentIntents.create({
      amount: UPSELL_AMOUNT,
      currency: 'usd',
      customer: payload.cid,
      payment_method: payload.pmid,
      off_session: true,
      confirm: true,
      description: UPSELL_NAME,
      metadata: { product: 'upsell', product_name: UPSELL_NAME, funnel: 'pth-funnel' },
    });

    if (intent.status !== 'succeeded') {
      return json({ error: `Upsell charge did not succeed (status: ${intent.status})` }, 402);
    }

    notifyGhl('upsell', {
      email: payload.email,
      first_name: payload.firstName,
      product: UPSELL_NAME,
      amount_cents: UPSELL_AMOUNT,
      stripe_customer_id: payload.cid,
      stripe_payment_intent_id: intent.id,
      source: 'pth-funnel-upsell',
    }).catch(() => undefined);

    return json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[upsell] error', msg);
    return json({ error: msg || 'Upsell charge failed' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
