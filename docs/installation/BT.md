# 宝塔面板部署教程

本文档提供使用宝塔面板 Docker 功能部署 Ai-gateway 的图文教程。

> 📖 本项目部署入口：[README 部署说明](../../README.zh_CN.md#deployment)和[仓库 Docker Compose 配置](../../docker-compose.yml)。本教程从本仓库源码构建 `ai-gateway:latest`，不依赖宝塔商店上架条目或未经确认的远程镜像。

***

## 前置要求

| 项目    | 要求                                 |
| ----- | ---------------------------------- |
| 宝塔面板  | ≥ 9.2.0 版本                         |
| 推荐系统  | CentOS 7+、Ubuntu 18.04+、Debian 10+ |
| 服务器配置 | 至少 1 核 2G 内存                       |

***

## 步骤一：安装宝塔面板

1. 前往 [宝塔面板官网](https://www.bt.cn/new/download.html) 下载适合您系统的安装脚本
2. 运行安装脚本安装宝塔面板
3. 安装完成后，使用提供的地址、用户名和密码登录宝塔面板

***

## 步骤二：安装 Docker

1. 登录宝塔面板后，在左侧菜单栏找到并点击 **Docker**
2. 首次进入会提示安装 Docker 服务，点击 **立即安装**
3. 按照提示完成 Docker 服务的安装

***

## 步骤三：安装 Ai-gateway

### 使用仓库 Docker Compose 配置

1. 在宝塔面板终端中克隆本仓库到部署目录（需要 Git）：

```bash
git clone https://github.com/BrandonVee/new-api.git /www/wwwroot/ai-gateway
cd /www/wwwroot/ai-gateway
```

2. 编辑仓库自带的 `docker-compose.yml`，按 [README 部署说明](../../README.zh_CN.md#deployment)完成配置。该文件默认启动 **Ai-gateway + PostgreSQL + Redis**；Ai-gateway 服务使用 `build: .` 从本地源码构建，镜像名为 `ai-gateway:latest`，不是需要从 Docker Hub 拉取的镜像。配置项以仓库文件为准。
3. 在同一目录构建并启动服务：

```bash
docker compose up -d --build
docker compose logs -f ai-gateway
```

4. 启动完成后，访问 `http://您的服务器IP:3000` 并按照初始化向导创建管理员账号。默认端口映射为 `3000:3000`；`./data` 和 `./logs` 分别挂载到 `/data` 和 `/app/logs`，PostgreSQL 数据保存在 `pg_data` 卷中。

***

## 配置说明

### 必要环境变量

| 变量名                 | 说明                 | 是否必填   |
| ------------------- | ------------------ | ------ |
| `SESSION_SECRET`    | 会话密钥，多机部署必须一致      | **必填** |
| `CRYPTO_SECRET`     | 加密密钥，使用 Redis 时必填  | 条件必填   |
| `SQL_DSN`           | 数据库连接字符串（使用外部数据库时） | 可选     |
| `REDIS_CONN_STRING` | Redis 连接字符串        | 可选     |

### 生成随机密钥

```bash
# 生成 SESSION_SECRET
openssl rand -hex 16

# 或使用 Linux 命令
head -c 16 /dev/urandom | xxd -p
```

***

## 常见问题

### Q1：无法访问 3000 端口？

1. 检查服务器防火墙是否开放 3000 端口
2. 在宝塔面板 **安全** 中放行 3000 端口
3. 检查云服务器安全组是否开放端口

### Q2：登录后提示会话失效？

确保设置了 `SESSION_SECRET` 环境变量，且值不为空。

### Q3：数据如何持久化？

仓库 Compose 配置将 Ai-gateway 的数据目录挂载到 `./data`，日志目录挂载到 `./logs`，主数据库保存在 PostgreSQL 的 `pg_data` 卷中。备份时应同时包含数据库和应用挂载数据；更新服务时保留这些目录和卷，不要使用 `docker compose down -v` 删除数据库卷。

### Q4：如何更新版本？

本教程使用本地构建的镜像。在部署目录更新源码后重新构建即可；升级前请备份数据并阅读对应版本的发布说明：

```bash
cd /www/wwwroot/ai-gateway
git pull --ff-only
docker compose up -d --build
```

保留现有 `docker-compose.yml` 配置和数据卷；使用固定版本时，按该版本发布说明更新源码。

***

## 相关链接

- [本项目 README](../../README.zh_CN.md)
- [部署配置](../../docker-compose.yml)
- [环境变量示例](../../.env.example)
- [本项目文档目录](../)
- [GitHub 仓库](https://github.com/BrandonVee/new-api)

***

## 截图示例

以下为上游教程的宝塔 Docker 界面参考，截图中的应用商店条目或镜像名称不代表本仓库的发布渠道；本项目按上述源码构建步骤部署。

![上游教程中的宝塔面板 Docker 界面参考](https://github.com/user-attachments/assets/7a6fc03e-c457-45e4-b8f9-184508fc26b0)

> ⚠️ 注意：密钥为环境变量 `SESSION_SECRET`，请务必设置！

