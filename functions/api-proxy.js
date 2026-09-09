/**
 * Cloudflare Pages Function — /api-proxy
 * Proxies IPTV panel API calls server-side (no CORS issues).
 * API keys and URLs are NEVER exposed to the browser.
 *
 * Usage: GET /api-proxy?p=PANEL_ID
 * Returns: JSON array of lines, or { error, debug } on failure.
 *
 * To add a new panel: add an entry to PANELS below and bump PANEL_VERSION.
 */

// ── ADD NEW PANELS HERE ─────────────────────────────────────────────────────
const PANEL_VERSION = 1;

const PANELS = {
  tvplus_1: {
    name: 'Dino #1',
    url:  'https://tvpluspanel.ru',
    key:  '308ba31e2a3bee95fcd098e2dba126c0',
  },
  tvplus_2: {
    name: 'Dino #2',
    url:  'https://tvpluspanel.ru',
    key:  '8c989bd3cb1f01c6898178d1d8b997e0',
  },
  // Next panels go here, e.g.:
  // activationpanel: { name: '...', url: 'https://activationpanel.ru', key: '...' },
};

// ── API ACTION FORMATS TO TRY (in order) ───────────────────────────────────
const API_PATHS = [
  '/api?api_key={KEY}&action=get_lines&limit=5000',
  '/api?api_key={KEY}&action=get_all_users&limit=5000',
  '/api?api_key={KEY}&action=get_reseller_clients&limit=5000',
  '/api?api_key={KEY}&action=get_my_lines&limit=5000',
  '/api?api_key={KEY}&action=get_users&limit=5000',
  '/api/reseller/lines?api_key={KEY}&limit=5000',
  '/api/reseller/users?api_key={KEY}&limit=5000',
  '/reseller/api?api_key={KEY}&action=get_users',
];

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':     'application/json, text/plain, */*',
  'Referer':    'https://momaar.com/',
};

// ── HANDLER ────────────────────────────────────────────────────────────────
export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type':                 'application/json',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url      = new URL(context.request.url);
  const panelId  = url.searchParams.get('p');

  // ── Expose panel list (no secrets) ────────────────────────────────────────
  if (panelId === '_list') {
    const list = Object.entries(PANELS).map(([id, p]) => ({ id, name: p.name }));
    return json({ panels: list, version: PANEL_VERSION }, corsHeaders);
  }

  const panel = PANELS[panelId];
  if (!panel) {
    return json({ error: `Unknown panel "${panelId}". Available: ${Object.keys(PANELS).join(', ')}` }, corsHeaders, 400);
  }

  const debug = [];

  for (const tpl of API_PATHS) {
    const path   = tpl.replace('{KEY}', panel.key);
    const apiUrl = panel.url.replace(/\/+$/, '') + path;
    const safePath = tpl.replace('{KEY}', '***');

    try {
      const res  = await fetch(apiUrl, { headers: FETCH_HEADERS, redirect: 'follow' });
      const text = await res.text();

      // Try to parse as JSON
      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        debug.push({ path: safePath, status: res.status, preview: text.slice(0, 120) });
        continue;
      }

      // Some panels return { success: false } or { error: '...' } — skip those
      if (data && data.success === false) {
        debug.push({ path: safePath, status: res.status, preview: JSON.stringify(data).slice(0, 120) });
        continue;
      }

      // Valid JSON response — return it with the winning path for debugging
      const resp = Array.isArray(data) ? data : data;
      const result = new Response(JSON.stringify(resp), { headers: corsHeaders });
      result.headers.set('X-Winning-Path', safePath);
      return result;

    } catch (e) {
      debug.push({ path: safePath, error: e.message });
    }
  }

  // All formats failed
  return json({
    error: `All ${API_PATHS.length} API formats failed for panel "${panel.name}" (${panel.url})`,
    debug,
  }, corsHeaders, 502);
}

function json(body, headers, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}
