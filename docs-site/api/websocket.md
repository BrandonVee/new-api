# WebSocket 接入

当前项目有 Realtime 与 Responses WebSocket 两类入口。它们不是普通 HTTP 流式 SSE 的另一个 URL，事件结构与上游能力要求不同。

## 路径

| 接口 | 路径 | 条件 |
| --- | --- | --- |
| Realtime | `GET /v1/realtime`，WebSocket Upgrade | 需要支持实时协议的上游与模型 |
| Responses | `GET /v1/responses`，WebSocket Upgrade | 需要支持该路径的上游及渠道配置 |

服务端客户端使用网关令牌按协议鉴权，连接目标一般为 `wss://gateway.example.com/...`。模型及其他参数按对应协议要求提供。

## 反向代理

代理必须转发 Upgrade 与 Connection 头，使用 HTTP/1.1，并设置合理的长连接超时。普通 curl 请求 `/api/status` 成功不代表 WebSocket 握手已经正确。

如果前面还有 CDN 或企业网关，也要确认它们支持该路径的 WebSocket 与连接时长。配置示例见 [反向代理](/deploy/proxy)。

## 浏览器与服务端的区别

原生浏览器 WebSocket 无法像服务端 HTTP 客户端一样任意设置鉴权请求头。不要为了绕开限制将长期网关令牌放进网页、URL 或公开 JavaScript；应按受支持的客户端协议和服务端架构设计接入。

## 按协议验证

1. 检查握手是否返回 101，确认连到正确路径。
2. 发送对应协议要求的第一条事件。
3. 观察模型选择、响应事件与终止行为。
4. 验证断连重建，避免默认重放已经开始执行的任务。

Responses WebSocket 在收到首条 `response.create` 后选择渠道；连接建立并不意味着已经成功调用模型。需要查看事件级错误与日志。
