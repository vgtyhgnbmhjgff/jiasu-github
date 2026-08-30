const style = document.createElement("link"); style.rel = "stylesheet"; style.href = "settings.css"; document.head.append(style);
const DEFAULTS = { defaultTarget: "github.com/Cute-Dress/Dress", proxyPath: "/api/proxy", cacheLabel: "1 小时", preferredOrigins: [], cloudflareOrigins: [], officialOrigin: "https://github.com", quickPaths: ["", "/releases", "/archive/refs/heads/main.zip", "/raw/main/README.md"], latestCommitPath: "/commits" };
const ALLOWED = /^github\.com\/Cute-Dress\/Dress(?:[/?#].*)?$/i;
const input = document.querySelector("#repo-url");
const validation = document.querySelector("#validation");
const result = document.querySelector("#result");
const form = document.querySelector("#proxy-form");
let settings = { ...DEFAULTS };

function normalized(value) { return value.trim().replace(/^https?:\/\//i, ""); }
function check(value) { return ALLOWED.test(normalized(value)); }
function proxyEndpoint(value) {
  const raw = (value || settings.proxyPath || "/api/proxy").trim();
  if (raw.startsWith("/")) return raw.replace(/\/+$/, "");
  return ( /^https?:\/\//i.test(raw) ? raw : `https://${raw}` ).replace(/\/+$/, "");
}
function setValidation() {
  const ok = check(input.value);
  validation.textContent = ok ? "VALID TARGET" : "TARGET NOT ALLOWED";
  validation.className = `validation ${ok ? "valid" : "invalid"}`;
  return ok;
}
function renderSettings() {
  const section = document.createElement("section");
  section.className = "settings-panel";
  section.innerHTML = `<div class="panel-head"><div><span class="panel-kicker">SETTINGS / JSON</span><h2>参数设置</h2></div><span class="lock-label">本地保存</span></div><p class="settings-hint">变量：preferredOrigins（自定义优选）、cloudflareOrigins（Cloudflare 优选）、officialOrigin（官方回退）。只能访问 github.com/Cute-Dress/Dress。</p><textarea id="settings-json" spellcheck="false"></textarea><div class="settings-actions"><button id="settings-apply" type="button">应用设置</button><button id="settings-reset" type="button">恢复默认</button><span id="settings-status"></span></div>`;
  document.querySelector(".workspace").append(section);
  const editor = section.querySelector("#settings-json");
  const status = section.querySelector("#settings-status");
  const write = () => { editor.value = JSON.stringify(settings, null, 2); };
  write();
  section.querySelector("#settings-apply").onclick = () => {
    try {
      const next = JSON.parse(editor.value);
      settings = { ...DEFAULTS, ...next };
      localStorage.setItem("edgedress-settings", JSON.stringify(settings));
      input.value = settings.defaultTarget; setValidation(); status.textContent = "已应用";
    } catch { status.textContent = "JSON 格式错误"; }
  };
  section.querySelector("#settings-reset").onclick = () => { settings = { ...DEFAULTS }; localStorage.removeItem("edgedress-settings"); write(); input.value = settings.defaultTarget; setValidation(); status.textContent = "已恢复"; };
}
async function showCommitStatus() {
  const status = document.createElement("p"); status.className = "settings-hint"; status.id = "commit-status"; status.textContent = "最新提交：目前无法检索最新的提交"; document.querySelector(".workspace").prepend(status);
  try { const endpoint = new URL(proxyEndpoint(window.EDGEDRESS_PROXY_URL), location.href); endpoint.searchParams.set("url", "https://github.com/Cute-Dress/Dress/commits"); const response = await fetch(endpoint); if (response.ok) status.textContent = "最新提交：已连接 GitHub 提交页面"; } catch {}
}
async function loadSettings() {
  try { settings = { ...settings, ...(await (await fetch("settings.json", { cache: "no-store" })).json()) }; } catch {}
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem("edgedress-settings") || "{}") }; } catch {}
  input.value = settings.defaultTarget; setValidation(); renderSettings(); showCommitStatus();
}

input.addEventListener("input", setValidation);
document.querySelectorAll("[data-path]").forEach((button) => button.addEventListener("click", () => { input.value = `github.com/Cute-Dress/Dress${button.dataset.path}`; setValidation(); input.focus(); }));
form.addEventListener("submit", async (event) => {
  event.preventDefault(); if (!setValidation()) return;
  const target = `https://${normalized(input.value)}`;
  const proxyUrl = new URL(proxyEndpoint(window.EDGEDRESS_PROXY_URL), location.href);
  proxyUrl.searchParams.set("url", target);
  proxyUrl.searchParams.set("config", JSON.stringify({ preferredOrigins: settings.preferredOrigins, cloudflareOrigins: settings.cloudflareOrigins, officialOrigin: settings.officialOrigin }));
  const proxy = proxyUrl.toString();
  result.hidden = false; document.querySelector("#result-title").textContent = "正在连接边缘节点"; document.querySelector("#edge-node").textContent = "CONNECTING..."; document.querySelector("#http-status").textContent = "-"; document.querySelector("#result-link").href = proxy;
  try { const response = await fetch(proxy, { method: "GET", headers: { Range: "bytes=0-0" } }); document.querySelector("#result-title").textContent = response.ok ? "请求已就绪" : "源站返回异常"; document.querySelector("#edge-node").textContent = response.headers.get("cf-ray")?.split("-")[1] || "CLOUDFLARE POP"; document.querySelector("#http-status").textContent = response.status; } catch { document.querySelector("#result-title").textContent = "加速地址已生成"; document.querySelector("#edge-node").textContent = "CLOUDFLARE EDGE"; document.querySelector("#http-status").textContent = "READY"; }
  lucide.createIcons(); result.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
loadSettings(); lucide.createIcons();
