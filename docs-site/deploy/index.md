# 选择部署方式

先决定实例用于本地评估还是长期运行。所有方式都需要保存数据库；生产实例还需要持久化密钥、HTTPS、备份和可追踪的版本。

| 方式 | 适用场景 | 主要准备 |
| --- | --- | --- |
| [Docker 单容器](/deploy/docker) | 本地评估、小规模单节点 | 源码、Docker、持久化目录 |
| [Docker Compose](/deploy/compose) | 同时编排网关、数据库和 Redis | 服务密码、连接串、命名卷 |
| [面板部署](/deploy/panels) | 已使用 1Panel 或宝塔管理服务器 | Compose 支持、反向代理和证书 |
| [多节点](/deploy/cluster) | 已有容量或可用性需求 | 共享主库、Redis 拓扑、统一密钥 |
| [本地开发](/deploy/development) | 修改源码与联调 | Go、Bun、前端构建 |

## 当前仓库的默认组合

仓库根目录 `docker-compose.yml` 默认是 **Ai-gateway + PostgreSQL + Redis**。MySQL 和 ClickHouse 日志库是注释示例，需要你显式切换。不要直接套用上游教程中的默认数据库组合或公共镜像名。

主数据库支持 SQLite、MySQL 和 PostgreSQL；ClickHouse 只用于单独的日志库，不能替代主库。

## 上线前先做这些决定

1. 数据放在哪里，谁负责备份和恢复验证。
2. 使用哪个正式域名，是否已能签发 HTTPS 证书。
3. 代理来自哪些 IP/CIDR，如何配置 `TRUSTED_PROXIES`。
4. 凭据如何保存，以及多个实例是否共享相同密钥。
5. 使用哪个代码版本或镜像标签，怎样回滚。

完成选择后，从对应部署教程开始。文档站本身的构建与托管见 [文档站部署](/deploy/documentation)。
