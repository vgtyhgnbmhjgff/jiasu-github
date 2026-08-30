// Set this to the deployed Worker endpoint, including /api/proxy.
const EDGE_DRESS_WORKER = "";
let edgeDressProxyUrl = EDGE_DRESS_WORKER;
Object.defineProperty(window, "EDGEDRESS_PROXY_URL", {
  configurable: true,
  get: () => edgeDressProxyUrl,
  set: (value) => {
    if (typeof value === "string" && !/YOUR-WORKER|your-worker/i.test(value)) {
      edgeDressProxyUrl = value;
    }
  }
});
