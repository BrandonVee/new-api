# 开明能源 Token 中转站独立文档站

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

- 手写教程在 `user/`、`admin/`、`guide/`、`deploy/`、`console/`、`api/`、`integrations/`、`operations/`、`reference/`。
- 导航在 `.vitepress/config.mts`；主题仅扩展默认主题和 CSS，没有自建搜索、复制按钮或抽屉组件。
- `scripts/sync-reference.mjs` 维护接口索引、下载规格和完整环境变量示例。不要直接修改生成文件。
- 搜索、移动导航、暗色模式和代码复制复用 VitePress 默认组件。已检查 `web/src/components/copy-button.tsx`、`ui/markdown.tsx` 等候选：它们依赖 React 和控制台运行环境，不能直接用于独立 Vue 静态文档站；因此采用文档框架已有能力，未复制业务组件实现。
- 本站的中文是文档内容语言；未修改控制台 UI 文案或其七语言 locale 文件。后续文档多语言使用 VitePress locales 按页面组织。
- 来源、与上游差异和覆盖范围见 `reference/maintenance.md`。正文以仓库代码编写，没有批量抓取、转换或复制外站教程、截图、商标与第三方文案。
- 保留项目许可与上游署名。发布前按部署版本复核命令、模型能力、价格和 API 规格；示例模型名为占位符。

网关部署命令与 API 示例按仓库核对，本站构建检查不等于在真实服务商、数据库集群或面板上执行了这些操作。

## 本轮调整（2026-10-26）

- 按附件建设开明能源使用指南，新增功能概述、10 篇用户指南、7 篇管理专题及技术文档目录；合并钱包／配额／订阅，复用原有渠道、用户、日志、设置和监控页面。
- 采用 VitePress 原生导航、搜索、主题、复制与提示组件；未引入 React 控制台组件或额外 UI 依赖。文本品牌不冒用上游 Logo，保留项目版权与许可署名。
- 新增三张可缩放操作流程图。未提供线上实例和可用账户，图示不作为真实控制台截图，业务流程未在开明能源线上实例验证。
- 本地运行仍可使用 `npx --yes bun run dev`；生产构建使用 `npx --yes bun run build`。

### 验证结果

- `npx --yes bun run typecheck`、`npx --yes bun run build`：通过。
- `web/node_modules/.bin/oxlint docs-site/.vitepress/config.mts docs-site/scripts/sync-reference.mjs`：通过。
- `web/node_modules/.bin/oxfmt --check docs-site/.vitepress/config.mts docs-site/.vitepress/theme/custom.css docs-site/scripts/sync-reference.mjs`、`git diff --check`：通过。
- 检查 58 个构建 HTML 的 3,085 处本地链接、资源和锚点：无断链。
- 浏览器验证桌面 1440px 和手机 390px 视口，检查首页、注册登录正文、概述与任务流程图；手机首页和正文无页面级横向溢出。
- 中文搜索“兑换码”可命中新增管理指南；手机文档目录可打开、跳转并关闭；浅色与深色主题可切换；检查时未记录到浏览器错误。
- 修复手机首页标题与固定导航重叠，重新检查后间距正常；流程图文字在手机可读。
