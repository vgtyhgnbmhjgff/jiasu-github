const REPOSITORY_HOST = /^(?:[a-z0-9-]+\.)*github\.com$|^(?:[a-z0-9-]+\.)*githubusercontent\.com$/i;
const RESOURCE_HOST = /^(?:[a-z0-9-]+\.)*githubassets\.com$|^(?:[a-z0-9-]+\.)*githubusercontent\.com$/i;
const ALLOWED_PATH = /^\/Cute-Dress\/Dress(?:\/.*)?$/i;
const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:$|[?#])/i;
const SESSION_COOKIE = "edgedress_session";
const CACHE_PREFIX = "edgedress:image:";
const DEFAULT_SETTINGS = { preferredOrigins: [], cloudflareOrigins: [], officialOrigin: "https://github.com" };
function allowedTarget(url) { return REPOSITORY_HOST.test(url.hostname) && ALLOWED_PATH.test(url.pathname); }
function allowedResource(url) { return url.protocol === "https:" && RESOURCE_HOST.test(url.hostname); }
function normalizeResource(url) {
  if (url.protocol !== "https:" || !REPOSITORY_HOST.test(url.hostname) || !ALLOWED_PATH.test(url.pathname)) return null;
  const match = url.pathname.match(/^\/Cute-Dress\/Dress\/(?:blob|raw)\/([^/]+)(\/.*)$/i);
  return match ? new URL(`https://raw.githubusercontent.com/Cute-Dress/Dress/${match[1]}${match[2]}${url.search}`) : null;
}
function originUrl(value) { try { const url = new URL(value); return url.protocol === "https:" ? url : null; } catch { return null; } }
function resourceProxy(url, incoming) { return `${incoming.origin}/_gh?url=${encodeURIComponent(url)}`; }
function rewriteSrcset(value, incoming) { return value.split(",").map((part) => { const match = part.trim().match(/^(\S+)(.*)$/); if (!match) return part; try { const url = new URL(match[1], "https://github.com"); const target = allowedResource(url) ? url : normalizeResource(url); return target ? `${resourceProxy(target.href, incoming)}${match[2]}` : part; } catch { return part; } }).join(", "); }
class ResourceElementHandler { constructor(incoming) { this.incoming = incoming; } element(element) { for (const name of ["src", "poster", "data-src", "data-canonical-src", "data-url"]) { const value = element.getAttribute(name); if (!value) continue; try { const url = new URL(value, "https://github.com"); const target = allowedResource(url) ? url : normalizeResource(url); if (target) element.setAttribute(name, resourceProxy(target.href, this.incoming)); } catch {} } const srcset = element.getAttribute("srcset"); if (srcset) element.setAttribute("srcset", rewriteSrcset(srcset, this.incoming)); } }
class PageLifecycleHandler { constructor(incoming) { this.incoming = incoming; } element(element) { element.append(`<script>(function(){var sent=false;function clean(){if(sent)return;sent=true;navigator.sendBeacon(${JSON.stringify(`${this.incoming.origin}/_gh/cleanup`)});}addEventListener("pagehide",clean,{once:true});addEventListener("beforeunload",clean,{once:true});}());</script>`, { html: true }); } }
async function settingsFromAssets(request, env) { try { const response = await env.ASSETS.fetch(new Request(new URL("/settings.json", request.url))); if (response.ok) return { ...DEFAULT_SETTINGS, ...(await response.json()) }; } catch {} return DEFAULT_SETTINGS; }
function readCookie(request, name) { const value = request.headers.get("Cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1]; return value ? decodeURIComponent(value) : null; }
function sessionCookie(session) { return `${SESSION_COOKIE}=${encodeURIComponent(session)}; Path=/; Max-Age=3600; SameSite=Lax; HttpOnly`; }
async function cacheKey(session, url) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url)); return `${CACHE_PREFIX}${session}:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`; }
async function readImageCache(env, key) {
  if (env.IMAGE_CACHE_R2) { const object = await env.IMAGE_CACHE_R2.get(key); if (object) return { body: object.body, metadata: object.httpMetadata || {} }; }
  if (env.IMAGE_CACHE_KV) { const body = await env.IMAGE_CACHE_KV.get(key, "arrayBuffer"); const metadata = await env.IMAGE_CACHE_KV.get(`${key}:meta`, "json"); if (body) return { body, metadata: metadata || {} }; }
  return null;
}
async function writeImageCache(env, key, response, session, url, ctx) {
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/")) return;
  const body = await response.clone().arrayBuffer(); const metadata = { contentType: response.headers.get("content-type") || "application/octet-stream", cacheControl: "private, no-store" }; const tasks = [];
  if (env.IMAGE_CACHE_R2) tasks.push(env.IMAGE_CACHE_R2.put(key, body, { httpMetadata: metadata }));
  if (env.IMAGE_CACHE_KV && body.byteLength <= 24 * 1024 * 1024) { tasks.push(env.IMAGE_CACHE_KV.put(key, body, { expirationTtl: 3600 })); tasks.push(env.IMAGE_CACHE_KV.put(`${key}:meta`, JSON.stringify(metadata), { expirationTtl: 3600 })); }
  if (env.IMAGE_CACHE_DB) tasks.push(env.IMAGE_CACHE_DB.prepare("INSERT OR REPLACE INTO image_cache (cache_key, session_id, source_url, created_at) VALUES (?, ?, ?, unixepoch())").bind(key, session, url).run());
  if (tasks.length) ctx.waitUntil(Promise.allSettled(tasks));
}
async function cleanupExpiredSessions(env) {
  if (!env.IMAGE_CACHE_DB) return;
  try { const result = await env.IMAGE_CACHE_DB.prepare("SELECT DISTINCT session_id FROM image_cache WHERE created_at < unixepoch() - 3600 LIMIT 20").all(); for (const row of result.results || []) await cleanupSession(env, row.session_id); } catch {}
}
async function cleanupSession(env, session) {
  if (!session) return; const prefix = `${CACHE_PREFIX}${session}:`; const keys = new Set();
  if (env.IMAGE_CACHE_DB) { try { const result = await env.IMAGE_CACHE_DB.prepare("SELECT cache_key FROM image_cache WHERE session_id = ?").bind(session).all(); for (const row of result.results || []) keys.add(row.cache_key); } catch {} }
  if (env.IMAGE_CACHE_R2 && keys.size === 0) { try { let cursor; do { const page = await env.IMAGE_CACHE_R2.list({ prefix, cursor }); for (const object of page.objects || []) keys.add(object.key); cursor = page.truncated ? page.cursor : undefined; } while (cursor); } catch {} }
  if (env.IMAGE_CACHE_KV && keys.size === 0) { try { let cursor; do { const page = await env.IMAGE_CACHE_KV.list({ prefix, cursor }); for (const key of page.keys || []) if (!key.name.endsWith(":meta")) keys.add(key.name); cursor = page.list_complete ? undefined : page.cursor; } while (cursor); } catch {} }
  await Promise.allSettled([...keys].flatMap((key) => [env.IMAGE_CACHE_R2?.delete(key), env.IMAGE_CACHE_KV?.delete(key), env.IMAGE_CACHE_KV?.delete(`${key}:meta`)].filter(Boolean)));
  if (env.IMAGE_CACHE_DB) { try { await env.IMAGE_CACHE_DB.prepare("DELETE FROM image_cache WHERE session_id = ?").bind(session).run(); } catch {} }
}
async function fetchResource(request, incoming, env, ctx, cors) {
  const raw = incoming.searchParams.get("url"); let target; try { target = new URL(raw); } catch { return new Response("Invalid resource URL", { status: 400, headers: cors }); }
  if (!allowedResource(target)) return new Response("Resource host not allowed", { status: 403, headers: cors });
  const existingSession = readCookie(request, SESSION_COOKIE); const session = existingSession || crypto.randomUUID(); const imageRequest = request.headers.get("Accept")?.toLowerCase().includes("image/") || IMAGE_EXTENSION.test(target.pathname); const key = imageRequest ? await cacheKey(session, target.href) : null;
  if (key) { const cached = await readImageCache(env, key); if (cached) { const responseHeaders = new Headers({ "Content-Type": cached.metadata.contentType || "application/octet-stream", "Cache-Control": "private, no-store", "X-EdgeDress-Cache": "HIT", "X-Content-Type-Options": "nosniff", ...cors }); if (!existingSession) responseHeaders.set("Set-Cookie", sessionCookie(session)); return new Response(cached.body, { status: 200, headers: responseHeaders }); } }
  const headers = new Headers(request.headers); headers.delete("Host"); headers.delete("Range"); const response = await fetch(new Request(target, { method: request.method === "HEAD" ? "HEAD" : "GET", headers, redirect: "follow" }));
  const responseHeaders = new Headers(response.headers); responseHeaders.set("Cache-Control", "private, no-store"); responseHeaders.set("X-Content-Type-Options", "nosniff"); responseHeaders.delete("Content-Disposition"); if (key) { responseHeaders.set("X-EdgeDress-Cache", "MISS"); ctx.waitUntil(writeImageCache(env, key, response, session, target.href, ctx)); } if (!existingSession) responseHeaders.set("Set-Cookie", sessionCookie(session)); Object.entries(cors).forEach(([key, value]) => responseHeaders.set(key, value)); return new Response(response.body, { status: response.status, headers: responseHeaders });
}
export default { async fetch(request, env, ctx) {
  const incoming = new URL(request.url); ctx.waitUntil(cleanupExpiredSessions(env)); const directPath = ALLOWED_PATH.test(incoming.pathname); const apiPath = incoming.pathname === "/api/proxy"; const cleanupPath = incoming.pathname === "/_gh/cleanup"; const resourcePath = incoming.pathname === "/_gh";
  if (!directPath && !apiPath && !cleanupPath && !resourcePath) return env.ASSETS.fetch(request);
  const cors = { "Access-Control-Allow-Origin": request.headers.get("Origin") || "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Allow-Headers": "*" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (cleanupPath) { ctx.waitUntil(cleanupSession(env, readCookie(request, SESSION_COOKIE))); return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly` } }); }
  if (resourcePath) return fetchResource(request, incoming, env, ctx, cors);
  let target;
  if (directPath) { const query = new URLSearchParams(incoming.search); query.delete("config"); target = new URL(incoming.pathname + (query.toString() ? `?${query}` : ""), "https://github.com"); }
  else { const raw = incoming.searchParams.get("url"); if (!raw) return Response.json({ error: "Missing url" }, { status: 400, headers: cors }); try { target = new URL(raw); } catch { return Response.json({ error: "Invalid url" }, { status: 400, headers: cors }); } }
  if (target.protocol !== "https:" || !allowedTarget(target)) return Response.json({ error: "Only GitHub Dress repository paths are allowed" }, { status: 403, headers: cors });
  const config = await settingsFromAssets(request, env); try { Object.assign(config, JSON.parse(incoming.searchParams.get("config") || "{}")); } catch {}
  const origins = [target.origin, ...(Array.isArray(config.preferredOrigins) ? config.preferredOrigins : []), ...(Array.isArray(config.cloudflareOrigins) ? config.cloudflareOrigins : []), config.officialOrigin].map(originUrl).filter(Boolean); const tried = new Set(); const headers = new Headers(request.headers); headers.delete("Host"); headers.set("User-Agent", "EdgeDress/1.0"); let upstream;
  for (const origin of origins) { if (tried.has(origin.origin)) continue; tried.add(origin.origin); const candidate = new URL(target.pathname + target.search, origin); try { const candidateHeaders = new Headers(headers); candidateHeaders.set("Host", target.host); candidateHeaders.delete("Range"); upstream = await fetch(new Request(candidate, { method: request.method === "HEAD" ? "HEAD" : "GET", headers: candidateHeaders, redirect: "follow" })); if (upstream.status >= 200 && upstream.status < 400) break; } catch {} }
  if (!upstream) return Response.json({ error: "All configured origins unavailable" }, { status: 502, headers: cors });
  const responseHeaders = new Headers(upstream.headers); responseHeaders.set("Cache-Control", "private, no-store"); responseHeaders.set("Set-Cookie", sessionCookie(readCookie(request, SESSION_COOKIE) || crypto.randomUUID())); Object.entries(cors).forEach(([key, value]) => responseHeaders.set(key, value)); const response = new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  if (responseHeaders.get("content-type")?.includes("text/html")) return new HTMLRewriter().on("img[src], img[srcset], source[src], source[srcset], video[poster]", new ResourceElementHandler(incoming)).on("body", new PageLifecycleHandler(incoming)).transform(response);
  return response;
} };