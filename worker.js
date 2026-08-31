const REPOSITORY_HOST = /^(?:[a-z0-9-]+\.)*github\.com$|^(?:[a-z0-9-]+\.)*githubusercontent\.com$/i;
const RESOURCE_HOST = /^(?:[a-z0-9-]+\.)*githubassets\.com$|^(?:[a-z0-9-]+\.)*githubusercontent\.com$/i;
const ALLOWED_PATH = /^\/Cute-Dress\/Dress(?:\/.*)?$/i;
const DEFAULT_SETTINGS = { preferredOrigins: [], cloudflareOrigins: [], officialOrigin: "https://github.com" };
function allowedTarget(url) { return REPOSITORY_HOST.test(url.hostname) && ALLOWED_PATH.test(url.pathname); }
function allowedResource(url) { return url.protocol === "https:" && RESOURCE_HOST.test(url.hostname); }
function originUrl(value) { try { const url = new URL(value); return url.protocol === "https:" ? url : null; } catch { return null; } }
function resourceProxy(url, incoming) { return `${incoming.origin}/_gh?url=${encodeURIComponent(url)}`; }
function rewriteSrcset(value, incoming) { return value.split(",").map((part) => { const match = part.trim().match(/^(\S+)(.*)$/); if (!match) return part; try { const url = new URL(match[1]); return allowedResource(url) ? `${resourceProxy(url.href, incoming)}${match[2]}` : part; } catch { return part; } }).join(", "); }
class ResourceElementHandler { constructor(incoming) { this.incoming = incoming; } element(element) { for (const name of ["src", "poster"]) { const value = element.getAttribute(name); if (!value) continue; try { const url = new URL(value); if (allowedResource(url)) element.setAttribute(name, resourceProxy(url.href, this.incoming)); } catch {} } const srcset = element.getAttribute("srcset"); if (srcset) element.setAttribute("srcset", rewriteSrcset(srcset, this.incoming)); } }
async function settingsFromAssets(request, env) { try { const response = await env.ASSETS.fetch(new Request(new URL("/settings.json", request.url))); if (response.ok) return { ...DEFAULT_SETTINGS, ...(await response.json()) }; } catch {} return DEFAULT_SETTINGS; }
async function fetchResource(request, incoming, cors) { const raw = incoming.searchParams.get("url"); let target; try { target = new URL(raw); } catch { return new Response("Invalid resource URL", { status: 400, headers: cors }); } if (!allowedResource(target)) return new Response("Resource host not allowed", { status: 403, headers: cors }); const headers = new Headers(request.headers); headers.delete("Host"); headers.delete("Range"); const response = await fetch(new Request(target, { method: request.method === "HEAD" ? "HEAD" : "GET", headers, redirect: "follow" }), { cf: { cacheEverything: true, cacheTtl: 86400 } }); const responseHeaders = new Headers(response.headers); responseHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=86400"); Object.entries(cors).forEach(([key, value]) => responseHeaders.set(key, value)); return new Response(response.body, { status: response.status, headers: responseHeaders }); }
export default { async fetch(request, env) {
  const incoming = new URL(request.url);
  const directPath = ALLOWED_PATH.test(incoming.pathname);
  const apiPath = incoming.pathname === "/api/proxy";
  const resourcePath = incoming.pathname === "/_gh";
  if (!directPath && !apiPath && !resourcePath) return env.ASSETS.fetch(request);
  const cors = { "Access-Control-Allow-Origin": request.headers.get("Origin") || "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Allow-Headers": "*" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (resourcePath) return fetchResource(request, incoming, cors);
  let target;
  if (directPath) { const query = new URLSearchParams(incoming.search); query.delete("config"); target = new URL(incoming.pathname + (query.toString() ? `?${query}` : ""), "https://github.com"); }
  else { const raw = incoming.searchParams.get("url"); if (!raw) return Response.json({ error: "Missing url" }, { status: 400, headers: cors }); try { target = new URL(raw); } catch { return Response.json({ error: "Invalid url" }, { status: 400, headers: cors }); } }
  if (target.protocol !== "https:" || !allowedTarget(target)) return Response.json({ error: "Only GitHub Dress repository paths are allowed" }, { status: 403, headers: cors });
  const config = await settingsFromAssets(request, env); try { Object.assign(config, JSON.parse(incoming.searchParams.get("config") || "{}")); } catch {}
  const origins = [target.origin, ...(Array.isArray(config.preferredOrigins) ? config.preferredOrigins : []), ...(Array.isArray(config.cloudflareOrigins) ? config.cloudflareOrigins : []), config.officialOrigin].map(originUrl).filter(Boolean);
  const tried = new Set(); const headers = new Headers(request.headers); headers.delete("Host"); headers.set("User-Agent", "EdgeDress/1.0"); let upstream;
  for (const origin of origins) { if (tried.has(origin.origin)) continue; tried.add(origin.origin); const candidate = new URL(target.pathname + target.search, origin); try { const candidateHeaders = new Headers(headers); candidateHeaders.set("Host", target.host); candidateHeaders.delete("Range"); upstream = await fetch(new Request(candidate, { method: request.method === "HEAD" ? "HEAD" : "GET", headers: candidateHeaders, redirect: "follow" }), { cf: { cacheEverything: true, cacheTtl: 3600 } }); if (upstream.status >= 200 && upstream.status < 400) break; } catch {} }
  if (!upstream) return Response.json({ error: "All configured origins unavailable" }, { status: 502, headers: cors });
  const responseHeaders = new Headers(upstream.headers); responseHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=3600"); Object.entries(cors).forEach(([key, value]) => responseHeaders.set(key, value)); const response = new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  return responseHeaders.get("content-type")?.includes("text/html") ? new HTMLRewriter().on("img[src], img[srcset], source[src], source[srcset], video[poster]", new ResourceElementHandler(incoming)).transform(response) : response;
} };