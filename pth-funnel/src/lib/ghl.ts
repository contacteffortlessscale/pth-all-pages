// Tiny helper for firing GHL Inbound Webhooks.
// Each event (buyer, upsell, downsell) has its own webhook URL configured in
// env. The receiving GHL Workflow handles tagging the contact and triggering
// the matching fulfillment automation.

export type GhlEvent = 'buyer' | 'upsell' | 'downsell';

const URLS: Record<GhlEvent, string | undefined> = {
  buyer: import.meta.env.GHL_BUYER_WEBHOOK_URL,
  upsell: import.meta.env.GHL_UPSELL_WEBHOOK_URL,
  downsell: import.meta.env.GHL_DOWNSELL_WEBHOOK_URL,
};

export interface GhlPurchasePayload {
  email: string;
  first_name?: string;
  product: string;
  amount_cents: number;
  stripe_customer_id?: string;
  stripe_payment_intent_id?: string;
  source?: string;
}

/**
 * Fire a webhook into GHL. Never throws — failures are logged but do not block
 * the customer-facing flow. The upstream caller is responsible for deciding
 * whether to retry on its own.
 */
export async function notifyGhl(event: GhlEvent, payload: GhlPurchasePayload): Promise<{ ok: boolean; error?: string }> {
  const url = URLS[event];
  if (!url || url.includes('REPLACE_ME')) {
    console.warn(`[ghl] ${event} webhook URL not configured — skipping`);
    return { ok: false, error: 'webhook URL not configured' };
  }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        event,
        submitted_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      console.warn(`[ghl] ${event} webhook responded ${r.status}: ${text.slice(0, 200)}`);
      return { ok: false, error: `GHL responded ${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[ghl] ${event} webhook failed: ${msg}`);
    return { ok: false, error: msg };
  }
}
