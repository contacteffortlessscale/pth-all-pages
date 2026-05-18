# Part-Time Hypnotist — Funnel (Vercel)

Astro + Tailwind multi-page funnel. All customer-facing pages live on Vercel; Stripe handles payments end-to-end; GoHighLevel handles CRM via Inbound Webhooks only.

## Pages

| Route         | Layout              | Purpose                                                           |
| ------------- | ------------------- | ----------------------------------------------------------------- |
| `/`           | `BaseLayout.astro`  | Sales page (legacy Inter / purple header — copied from pth-sales-page-main) |
| `/checkout`   | `FunnelLayout.astro`| Custom Stripe Elements checkout (PTH Design System)               |
| `/upsell`     | `FunnelLayout.astro`| One-click upsell (off-session Stripe charge)                      |
| `/downsell`   | `FunnelLayout.astro`| Last-chance offer (off-session Stripe charge)                     |
| `/thank-you`  | `FunnelLayout.astro`| Order confirmation                                                |

## Architecture (locked)

```
Visitor → / (sales page) → CTA → popup (GHL form) → /checkout (Stripe Elements)
       → /upsell (one-click) → /downsell (one-click) → /thank-you
```

- Vercel hosts every page. No GHL-hosted pages in the customer flow.
- Stripe is the only payment system. Card is saved at checkout with `setup_future_usage='off_session'` so the upsell/downsell pages can charge it in one click.
- GHL is CRM only. After each successful Stripe charge, the server pings the matching GHL Inbound Webhook so a workflow tags the contact and triggers fulfillment.

## Local dev

```bash
npm install
cp .env.example .env
# fill in env values
npm run dev
```

Opens at http://localhost:4321.

## Deploy

Push to `main`. Vercel auto-builds via the Astro Vercel adapter (`output: 'server'`). Set the same env vars in Vercel project settings.

## Env vars

See `.env.example` for the full list. Highlights:

- `GHL_WEBHOOK_URL` — popup opt-in webhook
- `STRIPE_SECRET_KEY` + `PUBLIC_STRIPE_PUBLISHABLE_KEY` — PLACEHOLDERS until real keys are provisioned
- `ORDER_TOKEN_SECRET` — `openssl rand -hex 32`
- `GHL_BUYER_WEBHOOK_URL`, `GHL_UPSELL_WEBHOOK_URL`, `GHL_DOWNSELL_WEBHOOK_URL` — one per purchase event

## File layout

```
src/
├── layouts/
│   ├── BaseLayout.astro       sales-page layout (legacy)
│   └── FunnelLayout.astro     dark PTH Design System layout
├── lib/
│   ├── stripe.ts              Stripe SDK init
│   ├── orderToken.ts          HMAC-signed order tokens (no DB needed)
│   └── ghl.ts                 fire-and-forget Inbound Webhook helper
├── styles/
│   ├── global.css             sales-page styles
│   └── pth-design.css         PTH Design System tokens
├── pages/
│   ├── index.astro            sales page
│   ├── checkout.astro         Stripe Elements + order summary
│   ├── upsell.astro           one-click upsell
│   ├── downsell.astro         one-click downsell
│   ├── thank-you.astro        confirmation
│   └── api/
│       ├── optin.ts           popup form → GHL Inbound Webhook
│       ├── checkout.ts        Stripe charge + buyer webhook + signed order token
│       ├── upsell.ts          off-session charge using saved PM
│       └── downsell.ts        off-session charge using saved PM
└── components/                sales-page components (unchanged)
public/
├── brand/                     PTH Design System logo PNGs
├── favicon.png                from design system
└── images/                    37 sales-page assets
```

## Still TODO before launch

- Stripe keys (replace placeholders in env)
- GHL webhook URLs (create 4 Inbound Webhook workflows in GHL)
- `ORDER_TOKEN_SECRET` (`openssl rand -hex 32`)
- 3DS handling (expand client-side handler for EU/UK cards)
- Conversion tracking (Meta Pixel / GA4)
- `/terms` and `/privacy` pages (currently 404)
- Tighten upsell/downsell copy with @zachansen
- Optional: restyle the sales page to match the PTH Design System (current sales page uses legacy Inter / purple)

## Notes

- Order tokens expire 1 hour after issue.
- `notifyGhl()` never throws — webhook failures are logged but don't block the customer flow.
- The sales-page popup is a custom form (not a GHL form embed) that POSTs to `/api/optin`, which forwards to `GHL_WEBHOOK_URL`. The contact still lands in GHL via the Inbound Webhook.
