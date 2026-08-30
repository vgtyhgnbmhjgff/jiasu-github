const ALLOWED_HOST = /^github\.com$/i;
const ALLOWED_PATH = /^\/Cute-Dress\/Dress(?:\/.*)?$/i;
function allowed(url) { return ALLOWED_HOST.test(url.hostname) && ALLOWED_PATH.test(url.pathname); }
export default { async fetch(request) {
  const incoming = new URL(request.url);
  if (incoming.pathname !== "/api/proxy") return new Response("Not found", { status: 404 });
  const cors = { "Access-Control-Allow-Origin": request.headers.get("Origin") || "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Allow-Headers": "*" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const raw = incoming.searchParams.get("url");
  if (!raw) return Response.json({ error: "Missing url" }, { status: 400, headers: cors });
  let target; try { target = new URL(raw); } catch { return Response.json({ error: "Invalid url" }, { status: 400, headers: cors }); }
  if (target.protocol !== "https:" || !allowed(target)) return Response.json({ error: "Only github.com/Cute-Dress/Dress is allowed" }, { status: 403, headers: cors });
  const headers = new Headers(request.headers); headers.delete("Host"); headers.set("User-Agent", "EdgeDress/1.0");
  let upstream; try { upstream = await fetch(new Request(target, { method: "GET", headers, redirect: "follow" }), { cf: { cacheEverything: true, cacheTtl: 3600 } }); } catch { return Response.json({ error: "GitHub upstream unavailable" }, { status: 502, headers: cors }); }
  const responseHeaders = new Headers(upstream.headers); responseHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=3600"); Object.entries(cors).forEach(([key, value]) => responseHeaders.set(key, value));
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
} };
