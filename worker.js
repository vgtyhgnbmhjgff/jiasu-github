const ALLOWED_HOST = /^(?:[a-z0-9-]+\.)*github\.com$|^(?:[a-z0-9-]+\.)*githubusercontent\.com$/i;
const ALLOWED_PATH = /^\/Cute-Dress\/Dress(?:\/.*)?$/i;
const DEFAULT_SETTINGS = { preferredOrigins: [], cloudflareOrigins: [], officialOrigin: "https://github.com" };
function allowedTarget(url) { return ALLOWED_HOST.test(url.hostname) && ALLOWED_PATH.test(url.pathname); }
function originUrl(value) { try { const url = new URL(value); return url.protocol === "https:" ? url : null; } catch { return null; } }
async function settingsFromAssets(request, env) { try { const response = await env.ASSETS.fetch(new Request(new URL("/settings.json", request.url))); if (response.ok) return { ...DEFAULT_SETTINGS, ...(await response.json()) }; } catch {} return DEFAULT_SETTINGS; }
export default { async fetch(request, env) {
  const incoming = new URL(request.url);
  const directPath = ALLOWED_PATH.test(incoming.pathname);
  const apiPath = incoming.pathname === "/api/proxy";
  if (!directPath && !apiPath) return env.ASSETS.fetch(request);
  const cors = { "Access-Control-Allow-Origin": request.headers.get("Origin") || "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Allow-Headers": "*" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  let target;
  if (directPath) {
    const query = new URLSearchParams(incoming.search); query.delete("config");
    target = new URL(incoming.pathname + (query.toString() ? `?${query}` : ""), "https://github.com");
  } else {
    const raw = incoming.searchParams.get("url");
    if (!raw) return Response.json({ error: "Missing url" }, { status: 400, headers: cors });
    try { target = new URL(raw); } catch { return Response.json({ error: "Invalid url" }, { status: 400, headers: cors }); }
  }
  if (target.protocol !== "https:" || !allowedTarget(target)) return Response.json({ error: "Only GitHub Dress repository paths are allowed" }, { status: 403, headers: cors });
  const config = await settingsFromAssets(request, env);
  try { Object.assign(config, JSON.parse(incoming.searchParams.get("config") || "{}")); } catch {}
  const origins = [target.origin, ...(Array.isArray(config.preferredOrigins) ? config.preferredOrigins : []), ...(Array.isArray(config.cloudflareOrigins) ? config.cloudflareOrigins : []), config.officialOrigin].map(originUrl).filter(Boolean);
  const tried = new Set(); const headers = new Headers(request.headers); headers.delete("Host"); headers.set("User-Agent", "EdgeDress/1.0"); let upstream;
  for (const origin of origins) {
    if (tried.has(origin.origin)) continue; tried.add(origin.origin);
    const candidate = new URL(target.pathname + target.search, origin);
    try { const candidateHeaders = new Headers(headers); candidateHeaders.set("Host", target.host); candidateHeaders.delete("Range"); upstream = await fetch(new Request(candidate, { method: request.method === "HEAD" ? "HEAD" : "GET", headers: candidateHeaders, redirect: "follow" }), { cf: { cacheEverything: true, cacheTtl: 3600 } }); if (upstream.status >= 200 && upstream.status < 400) break; } catch {}
  }
  if (!upstream) return Response.json({ error: "All configured origins unavailable" }, { status: 502, headers: cors });
  const responseHeaders = new Headers(upstream.headers); responseHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=3600"); Object.entries(cors).forEach(([key, value]) => responseHeaders.set(key, value)); return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
} };