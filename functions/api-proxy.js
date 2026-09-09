/**
 * Cloudflare Pages Function — /api-proxy
 * Minimal diagnostic version — proves the function runs.
 * Add ?p=_health to test: returns {"ok":true}
 */

const PANELS = {
  tvplus_1: { name: 'Dino #1', url: 'https://tvpluspanel.ru', key: '308ba31e2a3bee95fcd098e2dba126c0' },
  tvplus_2: { name: 'Dino #2', url: 'https://tvpluspanel.ru', key: '8c989bd3cb1f01c6898178d1d8b997e0' },
};

const API_PATHS = [
  '/api?api_key={KEY}&action=get_lines&limit=5000',
  '/api?api_key={KEY}&action=get_all_users&limit=5000',
  '/api?api_key={KEY}&action=get_reseller_clients',
  '/api/reseller/lines?api_key={KEY}&limit=5000',
];

export async function onRequest(context) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (context.request.method === 'OPTIONS')
    return new Response('{}', { status: 200, headers: cors });

  const url = new URL(context.request.url);
  const id  = url.searchParams.get('p') || '';

  // Health check — no external calls
  if (id === '_health') {
    return new Response(JSON.stringify({ ok: true, ts: Date.now() }), { headers: cors });
  }

  const panel = PANELS[id];
  if (!panel) {
    return new Response(
      JSON.stringify({ error: 'Unknown panel: ' + id, available: Object.keys(PANELS) }),
      { status: 400, headers: cors }
    );
  }

  const debug = [];

  for (const tpl of API_PATHS) {
    const apiUrl = panel.url.replace(/\/+$/, '') + tpl.replace('{KEY}', panel.key);
    const safe   = tpl.replace('{KEY}', '***');

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      let res, text;
      try {
        res  = await fetch(apiUrl, {
          signal:   ctrl.signal,
          headers:  { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json, */*' },
          redirect: 'follow',
        });
        text = await res.text();
      } finally {
        clearTimeout(timer);
      }

      let data;
      try { data = JSON.parse(text); } catch(_) {
        debug.push({ path: safe, status: res.status, preview: text.slice(0, 80) });
        continue;
      }

      if (data?.success === false || (data?.error && !Array.isArray(data))) {
        debug.push({ path: safe, status: res.status, api_error: JSON.stringify(data).slice(0, 80) });
        continue;
      }

      return new Response(JSON.stringify(data), {
        headers: { ...cors, 'X-Winning-Path': safe },
      });

    } catch (e) {
      debug.push({ path: safe, error: e.name === 'AbortError' ? 'timeout' : e.message });
    }
  }

  return new Response(
    JSON.stringify({ error: 'all_failed', panel: panel.name, debug }),
    { status: 502, headers: cors }
  );
}
