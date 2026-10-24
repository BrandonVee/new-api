# Docker 单容器

此方式使用 SQLite，不依赖外部数据库。适合先确认应用能够启动，再逐步迁移到长期运维方案。

## 构建镜像

在仓库根目录执行：

```bash
docker build -t ai-gateway:local .
```

Dockerfile 分阶段构建 React 前端和 Go 程序。构建基线以仓库 Dockerfile 与各模块 `go.mod` 为准；不需要先在宿主机安装 Go 或 Bun。

## 创建环境文件

新建一个不提交到仓库的环境文件，例如 `.env.gateway.local`。填入以下配置，`SESSION_SECRET` 使用 `openssl rand -hex 32` 的输出替换：

```dotenv
TZ=Asia/Shanghai
SESSION_SECRET=replace-with-a-persistent-random-secret
TRUSTED_PROXIES=none
```

将文件权限设为仅自己可读写：

```bash
chmod 600 .env.gateway.local
```

这是本地 HTTP 场景。正式 HTTPS 的会话与代理设置见 [反向代理](/deploy/proxy)。

## 运行容器

```bash
mkdir -p data logs
docker run -d --name ai-gateway --restart unless-stopped \
  --env-file .env.gateway.local \
  -p 127.0.0.1:3000:3000 \
  -v "$(pwd)/data:/data" \
  -v "$(pwd)/logs:/app/logs" \
  ai-gateway:local --log-dir /app/logs
```

访问 `http://localhost:3000` 完成初始化。`/data` 是容器工作目录，新安装 SQLite 数据库通常位于其中；升级时可能发现并沿用历史数据库文件名，不能只根据新名称判断数据是否丢失。

## 检查与管理

```bash
docker ps --filter name=ai-gateway
docker logs --tail 100 ai-gateway
curl --fail-with-body http://localhost:3000/api/status
docker restart ai-gateway
```

容器可以重建，但挂载的数据不能随意删除。SQLite 的安全备份方式见 [升级与备份](/operations/upgrade)。不要在应用运行时仅复制主 `.db` 文件而遗漏 WAL 数据。

## 端口与网络

`127.0.0.1:3000:3000` 只允许宿主机访问。如果反向代理也在容器内，它自己的 `127.0.0.1` 不是宿主机；应加入同一 Docker 网络，使用服务名和内部端口连接。不要为绕过网络配置而直接把数据库和 Redis 端口暴露到公网。
