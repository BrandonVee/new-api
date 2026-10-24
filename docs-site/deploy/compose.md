# Docker Compose 部署

本项目的 Compose 默认启动网关、PostgreSQL 15 和 Redis。网关从本地源码构建，数据通过宿主机挂载与命名卷保存。

## 1. 检查并修改配置

在仓库根目录打开 `docker-compose.yml`，逐项完成：

- 替换 PostgreSQL 服务的示例密码，同时更新 `SQL_DSN` 中的密码。
- 替换 Redis 的 `--requirepass`，同时更新 `REDIS_CONN_STRING`。
- 取消注释并设置持久化随机 `SESSION_SECRET`。
- 正式 HTTPS 环境设置 `SESSION_COOKIE_SECURE=true` 与准确的 `SESSION_COOKIE_TRUSTED_URL`。
- 明确 `TRUSTED_PROXIES`，按实际网络填写代理 IP/CIDR。
- 只通过本机反向代理访问时，将端口改为 `127.0.0.1:3000:3000`。

生成随机值：

```bash
openssl rand -hex 32
```

每个密码应独立生成。连接串中的保留字符需要按对应 DSN 格式转义，不要直接拼接包含 `@`、`:` 等字符的密码。

::: warning .env 不会自动变成容器环境
Compose 的 `.env` 主要参与变量插值。仓库的 `environment` 写的是显式值；仅复制 `.env.example` 不会替换这些值。请直接修改配置，或明确通过 `env_file` / `${变量名}` 传入。
:::

## 2. 校验并启动

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail 100 ai-gateway
```

默认 `depends_on` 只声明启动顺序，不证明数据库已经就绪。如果初次启动连接失败，查看数据库日志，等待就绪后检查网关是否恢复。

## 3. 确认持久化位置

| 数据 | 默认位置 |
| --- | --- |
| 网关数据目录 | `./data` 挂载到 `/data` |
| 文件日志 | `./logs` 挂载到 `/app/logs` |
| PostgreSQL 数据 | `pg_data` 命名卷 |

长期运行时保留 Compose 项目名；改变目录名或 `-p` 参数可能使用新的命名卷。维护命令可显式指定原项目名：

```bash
docker compose -p your-existing-project ps
```

## 改用 MySQL

按配置文件注释切换：关闭 PostgreSQL 服务与连接串，启用 MySQL 服务、MySQL `SQL_DSN`、对应 `depends_on` 和 `mysql_data` 卷。网关支持 MySQL ≥ 5.7.8，但新部署应按组织支持策略选取仍维护的版本。

已有数据库不能通过更改 `MYSQL_DATABASE` 或 `POSTGRES_DB` 直接改名。先备份和迁移数据、验证后再切换连接串；不要为了让服务启动而新建空库替换现有库。

## 单独的日志库

`LOG_SQL_DSN` 可以把日志保存到独立数据库，也支持 ClickHouse。启用前先创建目标库，按实际类型配置连接串，并评估历史日志迁移与保留策略。只改连接串不会迁移旧日志。

升级时不要执行 `docker compose down -v`。完整操作见 [升级与备份](/operations/upgrade)。
