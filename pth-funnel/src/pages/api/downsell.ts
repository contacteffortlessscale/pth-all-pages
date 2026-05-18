// POST /api/downsell — off-session one-click charge for the downsell product.
import type { APIRoute } from 'astro';
import { stripe, isStripeConfigured } from '../../lib/stripe';
import { verifyOrderToken } from '../../lib/orderToken';
import { notifyGhl } from '../../lib/ghl';

export const prerender = false;

const DOWNSELL_NAME = import.meta.env.PRODUCT_DOWNSELL_NAME || 'Live Client Recordings';
const DOWNSELL_AMOUNT = Number(import.meta.env.PRODUCT_DOWNSELL_AMOUNT_CENTS || 2700);

export const POST: APIRoute = async ({ request }) => {
  if (!isStripeConfigured()) {
    return json({ error: 'Stripe is not configured — replace the placeholder keys.' }, 500);
  }

  let body: { order_token?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const payload = verifyOrderToken(body.order_token || '');
  if (!payload) return json({ error: 'Invalid or expired order token' }, 401);

  try {
    const intent = await stripe.paymentIntents.create({
      amount: DOWNSELL_AMOUNT,
      currency: 'usd',
      customer: payload.cid,
      payment_method: payload.pmid,
      off_session: true,
      confirm: true,
      description: DOWNSELL_NAME,
      metadata: { product: 'downsell', product_name: DOWNSELL_NAME, funnel: 'pth-funnel' },
    });

    if (intent.status !== 'succeeded') {
      return json({ error: `Downsell charge did not succeed (status: ${intent.status})` }, 402);
    }

    notifyGhl('downsell', {
      email: payload.email,
      first_name: payload.firstName,
      product: DOWNSELL_NAME,
      amount_cents: DOWNSELL_AMOUNT,
      stripe_customer_id: payload.cid,
      stripe_payment_intent_id: intent.id,
      source: 'pth-funnel-downsell',
    }).catch(() => undefined);

    return json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[downsell] error', msg);
    return json({ error: msg || 'Downsell charge failed' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
