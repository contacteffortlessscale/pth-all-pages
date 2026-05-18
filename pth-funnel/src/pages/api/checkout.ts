// POST /api/checkout
//
// Body: { first_name, email, payment_method_id }
//
// 1. Creates (or reuses) a Stripe Customer.
// 2. Attaches the PaymentMethod to the customer.
// 3. Confirms a PaymentIntent with off_session=false, setup_future_usage='off_session'
//    so the card is saved for one-click upsells.
// 4. Fires the GHL "buyer" Inbound Webhook so the contact is tagged + fulfilled.
// 5. Returns a signed order token the client uses to navigate to /upsell.
//
// NOTE: Stripe keys are PLACEHOLDERS until real keys are provisioned. The route
// will return a 500 with a clear message if the key is still a placeholder.

import type { APIRoute } from 'astro';
import { stripe, isStripeConfigured } from '../../lib/stripe';
import { createOrderToken } from '../../lib/orderToken';
import { notifyGhl } from '../../lib/ghl';

export const prerender = false;

const PRODUCT_NAME = import.meta.env.PRODUCT_MAIN_NAME || 'The Part-Time Hypnotist';
const PRODUCT_AMOUNT = Number(import.meta.env.PRODUCT_MAIN_AMOUNT_CENTS || 1495);

export const POST: APIRoute = async ({ request }) => {
  if (!isStripeConfigured()) {
    return json(
      {
        error:
          'Stripe is not configured yet. Replace the placeholder STRIPE_SECRET_KEY ' +
          '(and PUBLIC_STRIPE_PUBLISHABLE_KEY) in the Vercel project env, then redeploy.',
      },
      500
    );
  }

  let body: { first_name?: string; email?: string; payment_method_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const first_name = (body.first_name || '').trim();
  const email = (body.email || '').trim();
  const payment_method_id = (body.payment_method_id || '').trim();

  if (!first_name || !email || !payment_method_id) {
    return json({ error: 'first_name, email, and payment_method_id are required' }, 400);
  }

  try {
    // 1. Reuse an existing Stripe Customer for this email if present, else create one.
    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer =
      existing.data[0] ||
      (await stripe.customers.create({
        email,
        name: first_name,
        metadata: { source: 'pth-funnel-checkout' },
      }));

    // 2. Attach the new PaymentMethod and set as default for future off-session charges.
    await stripe.paymentMethods.attach(payment_method_id, { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: payment_method_id },
    });

    // 3. Confirm a PaymentIntent for the main product, saving the card for upsells.
    const intent = await stripe.paymentIntents.create({
      amount: PRODUCT_AMOUNT,
      currency: 'usd',
      customer: customer.id,
      payment_method: payment_method_id,
      confirm: true,
      off_session: false,
      setup_future_usage: 'off_session',
      description: PRODUCT_NAME,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: {
        product: 'main',
        product_name: PRODUCT_NAME,
        funnel: 'pth-funnel',
      },
    });

    // Handle 3DS / additional auth.
    if (intent.status === 'requires_action' && intent.client_secret) {
      return json({
        requires_action: true,
        payment_intent_client_secret: intent.client_secret,
      });
    }

    if (intent.status !== 'succeeded') {
      return json({ error: `Payment did not succeed (status: ${intent.status})` }, 402);
    }

    // 4. Fire the GHL "buyer" Inbound Webhook (fire-and-forget — never blocks the redirect).
    notifyGhl('buyer', {
      email,
      first_name,
      product: PRODUCT_NAME,
      amount_cents: PRODUCT_AMOUNT,
      stripe_customer_id: customer.id,
      stripe_payment_intent_id: intent.id,
      source: 'pth-funnel-checkout',
    }).catch(() => undefined);

    // 5. Issue a signed order token carrying the customer + payment method ID
    //    so the upsell page can do a one-click off-session charge.
    const order_token = createOrderToken({
      cid: customer.id,
      pmid: payment_method_id,
      email,
      firstName: first_name,
      mainOrderAmount: PRODUCT_AMOUNT,
    });

    return json({ ok: true, order_token });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[checkout] error', msg);
    return json({ error: msg || 'Checkout failed' }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
