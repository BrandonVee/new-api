# 文档站构建与部署

本手册使用 VitePress，源码位于仓库 `docs-site/`，与管理控制台独立。构建产物是静态文件，任何支持 HTML、CSS 和 JavaScript 的静态主机均可托管。

## 本地预览

从仓库根目录开始：

```bash
cd docs-site
bun install --frozen-lockfile
bun run sync
bun run dev
```

开发地址以终端输出为准，默认通常为 `http://localhost:5173`。搜索索引在构建或开发期间由本地内容生成，不需要外部搜索账号。

## 生成生产文件

```bash
bun run typecheck
bun run build
bun run preview
```

构建会自动从主仓库同步 OpenAPI、环境变量示例和项目标志。输出目录为 `docs-site/.vitepress/dist/`。部署该目录的**内容**，不要把源码目录或仓库环境文件上传到公开站点。

## Nginx 静态托管

把产物复制到实际站点根目录，例如 `/srv/ai-gateway-docs`，在已有 HTTPS `server` 内配置：

```nginx
root /srv/ai-gateway-docs;
index index.html;

location / {
    try_files $uri $uri.html $uri/ =404;
}
error_page 404 /404.html;
```

文档启用了无扩展名地址；静态主机需要将 `/guide/quickstart` 解析到相应 `.html` 文件。不要用所有未知路径回退首页的方式掩盖断链。

## 部署在子目录

例如同域名下的 `/manual/`：

```bash
DOCS_BASE=/manual/ bun run build
DOCS_BASE=/manual/ bun run preview
```

将产物放到站点根目录的 `manual/`，并为该路径提供相同的 HTML 文件解析规则。`DOCS_BASE` 必须以 `/` 开头、以 `/` 结尾。与网关共用域名时，把 `/manual/` 静态规则放在网关的通用代理规则之前。

## 发布后检查

打开首页和一篇深层文档；直接刷新深层地址；搜索“渠道”；检查移动导航、主题切换和代码复制；下载 OpenAPI JSON。首次正式发布后再配置真实域名的 sitemap、canonical 与搜索引擎收录，避免使用虚构域名。
