# API 接入概览

应用访问网关的模型转发接口，网关使用渠道中的服务商凭据调用上游。示例中的密钥均指 **Ai-gateway 发放的 API 令牌**。

## 地址怎么填

| 使用方式 | 示例 |
| --- | --- |
| 网关根地址 | `https://gateway.example.com` |
| OpenAI 兼容客户端 Base URL | `https://gateway.example.com/v1` |
| curl 调用完整路径 | `https://gateway.example.com/v1/chat/completions` |
| Anthropic Messages | `https://gateway.example.com/v1/messages` |
| Gemini 原生协议 | `https://gateway.example.com/v1beta/models/{model}:generateContent` |

客户端可能自动追加 `/v1` 或接口路径，配置后检查最终发出的 URL，避免 `/v1/v1/`。域名与模型名都是示例，必须替换成自己的值。

## 通用鉴权

大多数模型请求可使用：

```http
Authorization: Bearer <AI_GATEWAY_KEY>
```

原生协议还支持对应请求头形式，见 [Claude 与 Gemini](/api/native)。避免把密钥放到 URL 查询参数，以减少被访问日志记录的机会。

## 先验证令牌

```bash
export AI_GATEWAY_URL='http://localhost:3000'
export AI_GATEWAY_KEY='replace-with-your-gateway-key'

curl --fail-with-body "$AI_GATEWAY_URL/v1/models" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY"
```

模型列表用于检查当前令牌可见模型，实际生成仍依赖上游权限与可用渠道。

## 选择接口

| 任务 | 接口与教程 |
| --- | --- |
| 聊天、多轮与流式 | [Chat Completions](/api/chat) |
| Responses 格式、工具与输入项 | [Responses](/api/responses) |
| Claude / Gemini 原生格式 | [原生协议](/api/native) |
| 图像、语音生成与转写 | [图像与音频](/api/media) |
| 向量与文档重排 | [向量与重排](/api/embeddings) |
| 图像、视频等任务 | [异步任务](/api/tasks) |
| 实时或 Responses 长连接 | [WebSocket](/api/websocket) |

## 管理 API 与模型 API 分开

`/api/*` 多为控制台管理接口；`/v1/*` 与 `/v1beta/*` 多为模型接口。两者的凭据和权限不能混用。后台管理使用面板 Access Token 或适用 PAT，不能从旧教程推断还需要历史用户编号请求头。

可下载仓库现有 [OpenAPI 规格](/reference/api-index)。规格包含历史与占位接口，不能代替运行时路由与插件能力判断。

## 错误处理

调用方应保存状态码和请求关联信息，处理连接失败、限流和上游错误。不要对所有失败自动重试，尤其是生成任务和已经返回部分内容的流式请求。先查 [故障排查](/operations/troubleshooting) 再决定是否重放。
