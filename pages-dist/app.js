const ALLOWED = /^github\.com\/Cute-Dress\/Dress(?:[/?#].*)?$/i;
function proxyEndpoint(value) {
  const raw = (value || "/api/proxy").trim();
  if (raw === "/api/proxy") return raw;
  const absolute = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return absolute.replace(/\/+$/, "");
}
const proxyBase = proxyEndpoint(window.EDGEDRESS_PROXY_URL);
const input = document.querySelector("#repo-url");
const validation = document.querySelector("#validation");
const result = document.querySelector("#result");
const form = document.querySelector("#proxy-form");

function normalized(value) { return value.trim().replace(/^https?:\/\//i, ""); }
function check(value) { return ALLOWED.test(normalized(value)); }
function setValidation() {
  const ok = check(input.value);
  validation.textContent = ok ? "VALID TARGET" : "TARGET NOT ALLOWED";
  validation.className = `validation ${ok ? "valid" : "invalid"}`;
  return ok;
}

const preset = new URLSearchParams(location.search).get("url");
if (preset && check(preset)) input.value = normalized(preset);
input.addEventListener("input", setValidation);
setValidation();

document.querySelectorAll("[data-path]").forEach((button) => button.addEventListener("click", () => {
  input.value = `github.com/Cute-Dress/Dress${button.dataset.path}`;
  setValidation(); input.focus();
}));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!setValidation()) return;
  const target = `https://${normalized(input.value)}`;
  const proxy = `${proxyBase}?url=${encodeURIComponent(target)}`;
  result.hidden = false;
  document.querySelector("#result-title").textContent = "正在连接边缘节点";
  document.querySelector("#edge-node").textContent = "CONNECTING...";
  document.querySelector("#http-status").textContent = "-";
  document.querySelector("#result-link").href = proxy;
  try {
    const response = await fetch(proxy, { method: "GET", headers: { Range: "bytes=0-0" } });
    document.querySelector("#result-title").textContent = response.ok ? "请求已就绪" : "源站返回异常";
    document.querySelector("#edge-node").textContent = response.headers.get("cf-ray")?.split("-")[1] || "CLOUDFLARE POP";
    document.querySelector("#http-status").textContent = response.status;
  } catch {
    document.querySelector("#result-title").textContent = "加速地址已生成";
    document.querySelector("#edge-node").textContent = "CLOUDFLARE EDGE";
    document.querySelector("#http-status").textContent = "READY";
  }
  lucide.createIcons(); result.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
lucide.createIcons();
