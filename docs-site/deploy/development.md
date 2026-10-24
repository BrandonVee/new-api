# 本地开发

网关后端嵌入 `web/dist`，因此首次运行 Go 服务前需要先构建前端。开发模式再额外启动 Rsbuild，以获得前端热更新。

## 环境要求

- Git、Bun 和各 `go.mod` 要求的 Go 工具链。
- 当前根模块与 TokenKit 使用 Go 1.26；RelayKit 的语言基线为 Go 1.25.1。以你检出的文件为准。
- 如需 Redis 或外部数据库，可以自行启动，或参考仓库 `docker-compose.dev.yml`。

## 首次启动

在仓库根目录执行：

```bash
cd web
bun install --frozen-lockfile
bun run build
cd ..
go run .
```

另开终端运行前端：

```bash
cd web
bun run dev -- --port 5173
```

打开 `http://localhost:5173`。前端开发服务器会代理后端请求到 3000 端口。遇到 API 失败时分别查看 Rsbuild 与 Go 终端，不要只看浏览器页面。

## 各目录分别验证

```bash
# 根模块
go test ./...

# 独立模块不依赖根工作区
cd relaykit
GOWORK=off go build ./...
cd ../tokenkit
GOWORK=off go build ./...
```

控制台修改按 `web/AGENTS.md` 执行类型检查、受影响测试、lint 和构建。涉及数据库行为时必须验证真实 SQLite、MySQL、PostgreSQL，不能只靠单元测试推断兼容。

## 文档开发

独立文档站不需要 Go 后端：

```bash
cd docs-site
bun install --frozen-lockfile
bun run sync
bun run dev
```

注意在仓库根目录重新进入 `docs-site`，不要从 `tokenkit` 目录直接执行最后一段。更多构建说明见 [文档站部署](/deploy/documentation)。
