# 快速开始

目标是完成一条可验证的链路：启动实例 → 创建渠道 → 配置额度与令牌 → 调用模型 → 找到日志。第一次建议用本地单容器；生产环境再按 [Compose 部署](/deploy/compose) 配置持久化、HTTPS 和外部数据库。

## 1. 准备源码与 Docker

安装 Docker 和 Compose 插件，确认 `docker version` 能连接服务端。在终端执行：

```bash
git clone https://github.com/BrandonVee/new-api.git ai-gateway
cd ai-gateway
docker build -t ai-gateway:local .
```

构建需要访问前端和 Go 依赖源。`ai-gateway:local` 是本地构建的标签，不是承诺存在的公共镜像。

## 2. 启动并保存数据

下面的端口只绑定本机，不直接暴露到公网：

```bash
mkdir -p data
docker run -d --name ai-gateway --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e TZ=Asia/Shanghai \
  -v "$(pwd)/data:/data" \
  ai-gateway:local
```

打开 `http://localhost:3000`，完成初始化向导并创建管理员账户。没有配置 `SQL_DSN` 时使用 SQLite；`data` 目录保存数据库。远程服务器可以通过 SSH 本地端口转发访问，或者先配置 HTTPS 代理。

启动后查看状态：

```bash
docker logs --tail 100 ai-gateway
curl --fail-with-body http://localhost:3000/api/status
```

状态接口成功只表示应用可响应，不代表上游渠道可调用。

## 3. 创建第一个渠道

进入控制台的渠道管理，添加服务商类型、上游地址和服务商密钥，选择一个自己确有权限使用的模型，并分配可用分组。保存后执行渠道测试。

先只配置一个模型，减少排查变量。详细字段和地址规则见 [接入第一个渠道](/console/channels)。

## 4. 准备用户权益与令牌

确认模型已有适用价格，用户有可用额度或有效订阅，再创建一个网关 API 令牌。令牌选择与渠道相容的分组，模型限制包含准备调用的模型。

在当前终端设置变量；输入你刚创建的网关令牌，不要输入上游密钥：

```bash
export AI_GATEWAY_URL='http://localhost:3000'
export AI_GATEWAY_KEY='replace-with-your-gateway-key'
export AI_GATEWAY_MODEL='your-enabled-model'
```

不要把真实密钥提交到仓库、截图或共享终端记录。

## 5. 先读模型，再发请求

```bash
curl --fail-with-body "$AI_GATEWAY_URL/v1/models" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY"
```

从返回结果确认模型名。下面的 JSON 中也必须替换 `your-enabled-model`：

```bash
curl --fail-with-body "$AI_GATEWAY_URL/v1/chat/completions" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"your-enabled-model","messages":[{"role":"user","content":"用一句话介绍你自己"}]}'
```

收到响应后，进入日志页面检查时间、模型、渠道、状态和用量。后续可尝试 [流式请求](/api/chat#流式响应) 或 [接入应用](/integrations/clients)。

## 没有成功时

- 返回 401：重新核对密钥类型、完整内容和令牌状态。
- 没有可用渠道：核对模型拼写、分组、渠道状态与上游权限。
- 额度不足：核对用户权益和令牌限额，不要仅调整其中一个。
- 请求超时：先在服务器上验证上游网络，再检查代理与超时配置。

更多分层排查步骤见 [故障排查](/operations/troubleshooting)。
