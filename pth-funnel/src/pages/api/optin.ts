import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: { first_name?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const first_name = (body.first_name || '').trim();
  const email = (body.email || '').trim();

  if (!first_name || !email) return json({ error: 'first_name and email are required' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Invalid email address' }, 400);

  const webhookUrl = process.env.GHL_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.includes('REPLACE_ME')) {
    return json({ error: 'GHL_WEBHOOK_URL not configured on server' }, 500);
  }

  const tag = process.env.GHL_OPTIN_TAG || 'pth-sales-page-optin';

  try {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name,
        email,
        tag,
        source: 'pth-sales-page-vercel',
        submitted_at: new Date().toISOString(),
        user_agent: request.headers.get('user-agent') || undefined,
        referer: request.headers.get('referer') || undefined,
      }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return json({ error: `GHL webhook responded ${r.status}`, detail: text.slice(0, 200) }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: 'Failed to reach GHL webhook', detail: msg }, 502);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
