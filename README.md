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
