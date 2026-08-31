# EdgeDress

Cloudflare Pages 静态前端 + Worker 白名单代理，只允许访问 `github.com/Cute-Dress/Dress` 及其路径。

## 部署

### Cloudflare Pages（纯静态）

使用 Pages 的“直接上传”时，只上传 `pages-dist` 文件夹内的文件（不要上传项目根目录），不需要构建过程，也不需要 Pages Functions。
部署独立 Worker 后，编辑 `pages-dist/config.js` 中的 `EDGE_DRESS_WORKER`，填入真实的 Worker 地址，不能保留 `YOUR-WORKER` 或 `your-worker` 占位符。

### 单独部署 Worker

推荐直接在项目根目录执行默认部署命令（Worker 会同时托管静态页面和代理）：

```bash
npx wrangler deploy
```

部署命令输出的 workers.dev URL 可直接打开，代理地址为该域名的 `/api/proxy`。如使用 Pages 单独托管页面，再将该地址填入 `pages-dist/config.js`。

代理请求示例：`/api/proxy?url=https%3A%2F%2Fgithub.com%2FCute-Dress%2FDress%2Freleases`。也支持直接访问仓库路径：`/Cute-Dress/Dress/tree/master/A`，Worker 会自动转发到 GitHub。

### 优选地址设置

编辑 `pages-dist/settings.json`，或在网页“参数设置”中填写：

```json
{
  "preferredOrigins": ["https://你的优选域名或IP"],
  "cloudflareOrigins": ["https://另一个优选域名"],
  "officialOrigin": "https://github.com"
}
```

Worker 按自定义优选、Cloudflare 优选、官方 GitHub 顺序尝试；连接失败或返回 4xx/5xx 会自动回退。IP 必须能通过 HTTPS 握手并接受 `Host: github.com`，普通 Cloudflare 共享 IP 可能无法直接作为源站地址，建议填写可用的优选域名。

## 按访问临时缓存图片

Worker 只在 `/_gh` 收到图片请求时缓存图片，不会预热或缓存仓库中的全部资源。缓存按浏览器会话隔离：R2 保存图片正文，KV 镜像 24 MB 以内的小图片，D1 保存会话到缓存键的索引。代理 HTML 会设置短期 HttpOnly 会话 Cookie，并在页面退出时发送清理请求，清除该会话的 R2/KV/D1 数据；如果浏览器未发送退出事件，缓存仍会在会话 Cookie 到期后由生命周期策略回收。

在 Cloudflare Dashboard 的 Worker 绑定页面直接添加以下资源。资源的显示名称可以自定义，但变量名称必须完全一致：

| Cloudflare 资源 | 建议资源名 | Worker 变量名 |
|---|---|---|
| R2 Bucket | `edgedress-image-cache` | `IMAGE_CACHE_R2` |
| KV Namespace | `edgedress-image-cache-kv` | `IMAGE_CACHE_KV` |
| D1 Database | `edgedress-cache` | `IMAGE_CACHE_DB` |

R2 保存图片正文，KV 保存 24 MB 以内的小图片副本，D1 只保存会话索引。图形化绑定完成后，不需要把 ID 写进代码。首次创建 D1 后执行一次初始化：

```bash
npx wrangler d1 execute edgedress-cache --remote --file=schema.sql
npx wrangler deploy
```

如果暂时未配置这些绑定，图片仍会直接从 GitHub 转发，但不会写入持久缓存。