# 内容来源与维护

本手册面向 Ai-gateway 当前源码使用者，按任务重新组织并编写。参考站 [New API 文档](https://docs.newapi.pro/) 的部署、使用与 API 等主题用于了解教程范围，没有把外站正文批量抓取、同义词替换或替换品牌后发布。

## 事实依据

| 内容 | 主要核对位置 |
| --- | --- |
| 名称、仓库与基本使用 | 根目录 README、VERSION |
| 镜像与默认部署组合 | Dockerfile、docker-compose.yml、.env.example |
| 模型 HTTP 路由与占位接口 | router/relay-router.go |
| 任务路由与宿主协议 | router/task-router.go、router/task-plugin-protocol-router.go |
| 模型映射与渠道字段 | web/src/features/channels/、model/channel_cache.go |
| 控制台鉴权与多节点传播 | docs/authentication.md |
| API 规格与环境示例 | docs/openapi/、.env.example |
| 插件契约 | docs/plugin-api/v1.md |
| 计费约定 | .agents/rules/billing.md |

本轮内容核对日期为 2026-10-25，起始代码提交为 `0d4d3e754`。这些信息用于追踪编写依据，不表示往后每次构建自动重新审查了全部行为。

## 当前覆盖范围

- 上手路径与核心概念。
- Docker、Compose、面板、HTTPS、多节点和本地开发。
- 渠道、映射、令牌、权限、价格、日志、任务与系统设置。
- Chat、Responses、Claude、Gemini、媒体、向量、任务和 WebSocket 接入。
- 通用客户端与标准 HTTP 代码示例。
- 升级、备份、监控、故障排查与配置参考。
- 仓库现有两份 OpenAPI 的接口索引与下载。

它不是所有服务商字段的逐项百科，也不包含外站完整商业、社区和生态内容。对未验证的客户端或上游能力，正文明确说明依赖条件，不编造兼容保证。

## 哪些内容自动同步

`bun run sync` 与每次生产构建更新：接口索引、两份原始 OpenAPI 下载、完整 `.env.example` 页面及项目标志。接口索引只反映规格文件，没有扫描运行中的插件路由，也没有替规格修复历史鉴权扩展。

教程正文需要人工维护。改变路由、环境变量、控制台入口、认证行为、插件模式或价格语义时，应同步核对对应教程。

## 内容与许可

品牌使用 Ai-gateway；保留历史协议、存储字段和必要上游来源。原项目与依赖的许可证不因文档改写而变化，发布时保留仓库 LICENSE、NOTICE 与第三方许可要求。

前端署名：Frontend design and development by New API contributors.

上游项目：[QuantumNous/new-api](https://github.com/QuantumNous/new-api)。本项目源码：[BrandonVee/new-api](https://github.com/BrandonVee/new-api)。

## 发布前复核

确认部署版本与教程对应，检查深层链接、搜索、代码复制、移动导航和下载文件。涉及真实服务商、面板、数据库迁移的操作，还要在目标环境独立验证；文档静态构建通过不能证明部署方案已经实测。
