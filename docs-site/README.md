# Ai-gateway 独立文档站

中文使用手册，使用 VitePress 1.6.4 静态生成。它有独立的依赖、导航和构建产物，不接入 `web/` 的 React 路由，不需要启动 Go 后端或连接数据库。

## 本地运行

在仓库根目录执行：

```bash
cd docs-site
bun install --frozen-lockfile
bun run sync
bun run dev
```

默认地址见终端输出（通常为 `http://localhost:5173`）。机器未安装 Bun 时先安装 Bun；当前开发验证使用 `npx --yes bun` 调用 Bun，也可以用同样方式运行上述命令。

## 验证与构建

```bash
bun run typecheck
bun run build
bun run preview
```

`build` 自动同步仓库中的两份 OpenAPI、环境变量示例和标志，再生成 `.vitepress/dist/`。部署该目录即可，静态主机需要支持无扩展名 URL（如 `/guide/quickstart` 对应 `/guide/quickstart.html`）；Nginx 示例见站内“文档站部署”。无需运行 Node.js 生产服务。

部署到 `/manual/` 等子目录时，构建和本地预览使用相同的 base：

```bash
DOCS_BASE=/manual/ bun run build
DOCS_BASE=/manual/ bun run preview
```

`DOCS_BASE` 必须以 `/` 开头和结尾。无需配置真实域名即可构建；如需 sitemap/canonical，请在确定正式文档域名后配置，避免发布占位域名。

## 内容维护

- 手写教程在 `guide/`、`deploy/`、`console/`、`api/`、`integrations/`、`operations/`、`reference/`。
- 导航在 `.vitepress/config.mts`；主题仅扩展默认主题和 CSS，没有自建搜索、复制按钮或抽屉组件。
- `scripts/sync-reference.mjs` 维护接口索引、下载规格和完整环境变量示例。不要直接修改生成文件。
- 搜索、移动导航、暗色模式和代码复制复用 VitePress 默认组件。已检查 `web/src/components/copy-button.tsx`、`ui/markdown.tsx` 等候选：它们依赖 React 和控制台运行环境，不能直接用于独立 Vue 静态文档站；因此采用文档框架已有能力，未复制业务组件实现。
- 本站的中文是文档内容语言；未修改控制台 UI 文案或其七语言 locale 文件。后续文档多语言使用 VitePress locales 按页面组织。
- 来源、与上游差异和覆盖范围见 `reference/maintenance.md`。正文以仓库代码编写，没有批量抓取、转换或复制外站教程、截图、商标与第三方文案。
- 保留项目许可与上游署名。发布前按部署版本复核命令、模型能力、价格和 API 规格；示例模型名为占位符。

网关部署命令与 API 示例按仓库核对，本站构建检查不等于在真实服务商、数据库集群或面板上执行了这些操作。

## 本轮验证（2026-10-25）

- `npx --yes bun run typecheck`、`npx --yes bun run build`：通过。
- `DOCS_BASE=/manual/ npx --yes bun run build`：通过；子目录首页、深层文档、标志与 OpenAPI JSON 均返回 HTTP 200，下载链接包含正确前缀。
- 使用项目已有 oxlint 检查配置与同步脚本，使用项目 oxfmt 配置检查 6 个源码/配置文件：通过；`git diff --check` 通过。
- 构建的 39 个 HTML（38 个内容页面及 404）共 2,284 个站内链接、资源和锚点引用：未发现断链。
- 浏览器检查 1440px 桌面与 390px 手机布局；正文无页面级横向溢出。中文搜索、主题切换、代码复制、手机导航跳转与关闭均验证通过，未记录到浏览器错误。
- 未运行真实上游模型调用、面板安装、数据库升级或多节点部署；这些教程依据仓库编写，需在实际部署环境再次验证。
