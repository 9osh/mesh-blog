# 部署 MESH

MESH 的部署产物是 `dist/` 中的纯静态文件，不需要 Node.js 服务端。生产构建需要 Node.js 20.19.0 或更高版本。

## 构建生产产物

```bash
npm ci
SITE_URL=https://blog.example.com npm run build
npm test
```

`SITE_URL` 必须是公开站点的 HTTPS origin。构建器只使用它的 origin，并据此生成：

- canonical URL；
- Open Graph URL；
- RSS 中的文章 URL；
- `sitemap.xml`；
- `robots.txt` 中的 Sitemap 地址。

构建后应部署整个 `dist/`，不要只上传 HTML。目录中还包含 CSS、客户端脚本、按需加载的 Mermaid chunk、静态资源、`articles.json`、RSS、Sitemap 和 robots 文件。

## 路径要求

MESH 当前使用 `/styles.css`、`/articles/...` 等根路径，并且 `SITE_URL` 只接受 origin，不保留子路径。因此站点必须部署在域名根路径：

- 支持：`https://blog.example.com/`
- 支持：`https://owner.github.io/`
- 不支持：`https://owner.github.io/repository/`

使用 GitHub Pages 时，请选择用户/组织站点仓库（`owner.github.io`），或为 Pages 配置自定义域名。不要直接部署到普通仓库的 project-site 子路径。

## GitHub Pages

在仓库的 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**，然后创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy MESH

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.19.0
          cache: npm
      - run: npm ci
      - run: npm test
        env:
          SITE_URL: https://blog.example.com
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

将 `https://blog.example.com` 替换为最终 origin。`npm test` 已包含生产构建，因此工作流无需再运行一次 `npm run build`。

## Cloudflare Pages、Netlify 或其他静态平台

使用以下项目设置：

| 设置 | 值 |
| :--- | :--- |
| Node.js | `>=20.19.0` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variable | `SITE_URL=https://blog.example.com` |

平台必须支持目录索引：请求 `/tags/` 时返回 `dist/tags/index.html`，请求 `/articles/<slug>/` 时返回相应文章的 `index.html`。MESH 不是 SPA，不需要把未知路径重写到首页；未知路径应保留 404。

## 自托管静态服务器

任何能直接提供目录索引和正确 MIME 类型的静态服务器都可以发布 `dist/`。例如 Nginx：

```nginx
server {
    listen 443 ssl;
    server_name blog.example.com;
    root /srv/mesh/dist;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

TLS 证书配置取决于部署环境，此处省略。不要使用 SPA fallback。

## 发布检查

部署后检查：

```text
/
/tags/
/articles/<slug>/
/articles.json
/feed.xml
/sitemap.xml
/robots.txt
```

同时确认：

1. HTML 中的 canonical URL 使用生产域名；
2. `sitemap.xml` 与 `robots.txt` 使用相同 origin；
3. 文章代码样式和客户端脚本返回 200；
4. Mermaid 文章能加载 `dist/chunks/` 中的本地 chunk；
5. 不存在把 404 重写为首页的 SPA 规则。