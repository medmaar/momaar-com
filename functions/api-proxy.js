/**
 * Cloudflare Pages Function — /api-proxy
 * Server-side proxy for IPTV panel APIs. No CORS issues, keys never in browser.
 * Usage: GET /api-proxy?p=PANEL_ID
 */

const PANEL_VERSION = 2;

// ── PANELS (add new ones here + bump PANEL_VERSION) ────────────────────────
const PANELS = {
  tvplus_1: { name: 'Dino #1', url: 'https://tvpluspanel.ru', key: '308ba31e2a3bee95fcd098e2dba126c0' },
  tvplus_2: { name: 'Dino #2', url: 'https://tvpluspanel.ru', key: '8c989bd3cb1f01c6898178d1d8b997e0' },
};

// ── API PATH FORMATS (tried in order, first valid JSON wins) ───────────────
const API_PATHS = [
  '/api?api_key={KEY}&action=get_lines&limit=5000',
  '/api?api_key={KEY}&action=get_all_users&limit=5000',
  '/api?api_key={KEY}&action=get_reseller_clients',
  '/api/reseller/lines?api_key={KEY}&limit=5000',
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept':     'application/json, text/plain, */*',
};

// Fetch with hard timeout so the Worker never hangs
async function fetchTimeout(url, ms) {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { headers: HEADERS, redirect: 'follow', signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function onRequest(context) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (context.request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: cors });

  const { searchParams } = new URL(context.request.url);
  const id = searchParams.get('p');

  // Panel list (no secrets)
  if (id === '_list')
    return new Response(
      JSON.stringify({ panels: Object.entries(PANELS).map(([k,v]) => ({ id:k, name:v.name })), version: PANEL_VERSION }),
      { headers: cors }
    );

  const panel = PANELS[id];
  if (!panel)
    return new Response(JSON.stringify({ error: `Unknown panel "${id}"` }), { status: 400, headers: cors });

  const debug = [];

  for (const tpl of API_PATHS) {
    const path   = tpl.replace('{KEY}', panel.key);
    const apiUrl = panel.url.replace(/\/+$/, '') + path;
    const safe   = tpl.replace('{KEY}', '***');

    try {
      const res  = await fetchTimeout(apiUrl, 6000);
      const text = await res.text();
      const preview = text.slice(0, 150);

      let data;
      try { data = JSON.parse(text); } catch(_) {
        debug.push({ path: safe, status: res.status, preview });
        continue;
      }

      if (data?.success === false || (data?.error && !Array.isArray(data))) {
        debug.push({ path: safe, status: res.status, preview: JSON.stringify(data).slice(0, 150) });
        continue;
      }

      // Success
      return new Response(JSON.stringify(data), {
        headers: { ...cors, 'X-Winning-Path': safe },
      });

    } catch (e) {
      debug.push({ path: safe, error: e.name === 'AbortError' ? 'Timeout (6s)' : e.message });
    }
  }

  return new Response(
    JSON.stringify({ error: `All ${API_PATHS.length} formats failed for "${panel.name}"`, debug }),
    { status: 502, headers: cors }
  );
}
