/**
 * Cloudflare Pages Function — /panel-store
 * Stores panel data (lines + contacted) in Cloudflare KV so it syncs across devices.
 *
 * ONE-TIME SETUP (takes 2 minutes):
 *   1. Go to dash.cloudflare.com → Workers & Pages → momaar-com
 *   2. Settings → Functions → KV namespace bindings
 *   3. Add binding:  Variable name = PANEL_KV  → select or create a KV namespace
 *   4. Save — that's it. All devices now share the same data.
 */
export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (context.request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: cors });

  // KV not bound yet — return setup instructions
  if (!context.env.PANEL_KV) {
    return new Response(JSON.stringify({
      setup_needed: true,
      msg: 'Add PANEL_KV binding in Cloudflare Dashboard → momaar-com → Settings → Functions → KV namespace bindings'
    }), { status: 503, headers: cors });
  }

  // GET — load data
  if (context.request.method === 'GET') {
    const raw = await context.env.PANEL_KV.get('panel_data');
    return new Response(raw || 'null', { headers: cors });
  }

  // POST — save data
  if (context.request.method === 'POST') {
    const body = await context.request.text();
    // Store for 2 years
    await context.env.PANEL_KV.put('panel_data', body, { expirationTtl: 60 * 60 * 24 * 730 });
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  return new Response('Method not allowed', { status: 405, headers: cors });
}
