# 环境变量速查

以下按用途整理常用设置，完整模板见 [仓库环境变量示例](/reference/environment-source)。当前进程真正收到的环境值决定行为；修改文件后要确认启动方式已加载。

## 数据库与缓存

| 变量 | 用途与注意事项 |
| --- | --- |
| `SQL_DSN` | 主库连接；未设置使用 SQLite |
| `SQLITE_PATH` | 显式指定 SQLite 文件位置 |
| `LOG_SQL_DSN` | 独立日志库，支持的类型含 ClickHouse |
| `REDIS_CONN_STRING` | Redis 连接串；不要公开其中的密码 |
| `SYNC_FREQUENCY` | 缓存同步/会话缓存相关周期；会影响多节点状态收敛 |
| `SQL_MAX_IDLE_CONNS` | 最大空闲连接数 |
| `SQL_MAX_OPEN_CONNS` | 最大打开连接数；按数据库连接预算设置 |
| `SQL_MAX_LIFETIME` | 连接最大生命周期，秒 |
| `SQL_SLOW_THRESHOLD_MS` | 慢查询阈值，毫秒；0 关闭 |

示意连接格式：

```dotenv
# 替换用户名、密码、主机与库名；不要直接使用示例凭据
SQL_DSN=postgresql://user:password@postgres:5432/ai-gateway
REDIS_CONN_STRING=redis://:password@redis:6379
```

MySQL 形式见完整模板。修改数据库类型或名字不会自动迁移旧数据。

## 认证与代理

| 变量 | 用途与注意事项 |
| --- | --- |
| `SESSION_SECRET` | 持久化随机密钥；所有节点一致，修改会使登录等失效 |
| `CRYPTO_SECRET` | 未设置时默认跟随会话密钥；共享 Redis 时有效值应一致 |
| `SESSION_COOKIE_SECURE` | 正式 HTTPS 控制台设为 true |
| `SESSION_COOKIE_TRUSTED_URL` | Secure 模式必需的精确 HTTPS Origin 列表 |
| `TRUSTED_PROXIES` | 可信代理 IP/CIDR；`none` 表示不信任代理且需单独使用 |
| `USER_SESSION_ACTIVE_LIMIT` | 单用户活跃登录会话上限 |
| `USER_SESSION_ISSUANCE_LIMIT` | 单用户签发窗口内允许创建的会话总数 |

本地 HTTP 不配置可信 URL，并保持 Secure 关闭。生产配置见 [反向代理](/deploy/proxy)。登录请求体加密不能替代 HTTPS，也不应在未理解密钥管理与兼容性的情况下作为通用开关启用。

## 请求与任务超时

| 变量 | 单位与作用 |
| --- | --- |
| `RELAY_TIMEOUT` | 秒；转发整体超时，0 不限制 |
| `RELAY_IDLE_CONN_TIMEOUT` | 秒；上游 HTTP 空闲连接保活超时 |
| `RELAY_RESPONSE_HEADER_TIMEOUT` | 秒；等待上游响应头，默认 1800 |
| `STREAMING_TIMEOUT` | 秒；流式无响应超时，当前初始化代码默认 300 |
| `TASK_TIMEOUT_MINUTES` | 分钟；异步任务外层期限，默认 1440，0 禁用 |
| `TASK_POLL_MAX_FAILURES` | 连续轮询失败阈值，默认 20 |

非流式生成可能长时间不返回响应头，因此响应头超时需要与模型耗时协调。调大网关超时不会改变 CDN、Nginx 和客户端的限制。

## 运行与日志

| 变量 | 用途 |
| --- | --- |
| `PORT` | 监听端口，常见默认 3000 |
| `TZ` | 运行时区，例如 Asia/Shanghai |
| `NODE_NAME` | 节点名称，帮助关联审计与系统日志 |
| `NODE_TYPE` | 从节点用 `slave`；主节点相关行为按代码判断 |
| `DEFAULT_LANGUAGE` | 后端默认输出语言：en、zh-CN、zh-TW |
| `ERROR_LOG_ENABLED` | 错误日志开关 |
| `ENABLE_PPROF`、`DEBUG` | 调试能力；不要直接向公网开放 |

前端七种界面语言与 `DEFAULT_LANGUAGE` 是不同设置。本站文档为中文，不会修改控制台或服务端语言。
