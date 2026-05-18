# Part-Time Hypnotist — Sales Page (Vercel rebuild)

Astro + Tailwind rebuild of the GoHighLevel `theparttimehypnotist.com/v3` sales page. Payments stay in GHL — this page only handles the funnel front-end and pushes name+email opt-ins to GHL via a workflow webhook.

## Local dev

```bash
npm install
cp .env.example .env
# fill in GHL_WEBHOOK_URL and PUBLIC_CHECKOUT_URL
npm run dev
```

Opens at `http://localhost:4321`.

## Deploy

Connected to a fresh Vercel project. Push to `main` → Vercel auto-builds. Set the same env vars in Vercel project settings.

## Env vars

| Name                  | Required | Purpose |
| --------------------- | -------- | ------- |
| `GHL_WEBHOOK_URL`     | yes      | GHL inbound-webhook trigger URL. Create a Workflow in GHL with "Inbound Webhook" as the trigger, copy the URL. |
| `PUBLIC_CHECKOUT_URL` | yes      | Existing GHL checkout page URL. All CTAs route through the popup → here. |
| `GHL_OPTIN_TAG`       | no       | Tag to apply to the contact in GHL on submit. Default: `pth-sales-page-optin`. |

`PUBLIC_*` vars are exposed to the browser (Astro convention). Server-only vars stay server-side.

## Architecture

```
src/
├── layouts/BaseLayout.astro       header bar + footer, fonts, meta
├── pages/
│   ├── index.astro                composes all section components
│   └── api/optin.ts               POST → forwards to GHL webhook
└── components/
    ├── Hero.astro                 cosmic bg + trust badge + VSL placeholder + headline
    ├── WhatsInside.astro          "What's Inside" + checklist + audience photo
    ├── OfferBreakdown.astro       "Here's A Breakdown" + offer-stack image
    ├── BonusStack.astro           3 bonus cards with mockups
    ├── CaseStudies.astro          Kim/Liz/Connie/Erin + Alex J quote
    ├── HowItWorks.astro           comparison table + "Why Now" + market potential
    ├── ProofGrid.astro            press logos + 12 testimonial screenshots
    ├── Guarantee.astro            30-day money-back section
    ├── ForTheScrollers.astro      TLDR repeat ($14.95) + bonuses
    ├── FAQ.astro                  7 Q&As + final purple CTA strip
    ├── PopupOptin.astro           name+email modal, intercepts every [data-cta-checkout]
    └── CtaBlock.astro             reusable CTA button + guarantee disclaimer
```

### Click flow

1. User clicks any element with `data-cta-checkout` (every "Discover Hypnosis Today" / "Secure Your Spot Now" button)
2. `PopupOptin.astro` intercepts → opens the modal
3. User submits name + email → `POST /api/optin`
4. `/api/optin` forwards to `GHL_WEBHOOK_URL` → GHL workflow creates the contact + fires automations
5. On success, browser redirects to `${PUBLIC_CHECKOUT_URL}?email=...&first_name=...` — GHL checkout pre-fills from query string

## Still TODO before launch

These are tracked inline in the codebase with `TODO` comments:

- [ ] **VSL .mp4** — currently `/PTH-FE-VSL.mp4` placeholder. Download from GHL Media Library and drop in `public/`, OR replace `<video>` element in `Hero.astro` with the new player embed (Mux/Bunny/Vidalytics).
- [ ] **Checkout URL** — set `PUBLIC_CHECKOUT_URL` to the real GHL order-form URL.
- [ ] **GHL webhook URL** — create the workflow in GHL and set `GHL_WEBHOOK_URL`.
- [ ] **GHL checkout email prefill** — verify the GHL order-form accepts `?email=` and `?first_name=` query params. If not, adjust `PopupOptin.astro` redirect logic.
- [ ] **Conversion tracking** — Meta Pixel / GA4 / GHL conversion API not wired yet. Currently no pixels on the page.
- [ ] **Terms / Privacy pages** — footer links to `/terms` and `/privacy` which 404. Add as static MDX or link out to existing pages.
- [ ] **Brand colors** — `pth-purple` hex (#4a1a6b) is my guess from screenshots, not extracted. Verify against the live page if exact match matters.
- [ ] **Final stack composite (image 35)** is identical to image 05 — keep both for now, dedupe once the design is locked.
- [ ] **Flagged assets** — `36-decor-blue-stripe-FLAG.png` and `37-meta-og-share-image-FLAG.png` aren't used yet; decide if they belong somewhere.

## Asset inventory

37 images in `public/images/`, named `NN-section-descriptor.ext` matching the original GHL export. See the asset list in `C:\Users\Admin\Documents\PTH Sales Page Assets - GHL Export\` for the canonical version.
