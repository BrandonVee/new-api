# Responses

使用 `POST /v1/responses`，请求体使用 `input`。它与 Chat Completions 的消息结构和事件名称不同，不能只把 URL 改掉而保留全部旧解析逻辑。

## 最小文本请求

```bash
curl --fail-with-body "$AI_GATEWAY_URL/v1/responses" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"your-enabled-model","input":"写一份三点式的会议准备清单"}'
```

替换为你自己的网关地址、令牌与支持该接口的模型。响应内容位于 `output` 项中，不是 Chat 的 `choices`。文本、工具调用和其他输出项应分别处理。

## 流式调用

```bash
curl -N --fail-with-body "$AI_GATEWAY_URL/v1/responses" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"your-enabled-model","input":"解释反向代理","stream":true}'
```

按照 Responses 事件类型解析增量和完成状态。不要只等待 Chat 的 `[DONE]` 或仅处理 `choices[].delta`。

## 原生、转换与任务插件

当前宿主的 Responses 接口可按模型绑定由任务插件处理；没有插件接管的情况走普通转发路径。两者对后台模式、检索、工具与产物支持可能不同。

对话续接、`previous_response_id`、内置工具和检索并不是所有转换渠道都支持。需要明确选择有对应能力的上游或插件，并验证完整调用链。

`POST /v1/responses/compact` 是单独路由，也需要上游支持；它不是对任何模型都可用的通用压缩服务。

## 后台任务的检索

任务插件支持的后台模式可以返回待完成对象，然后通过对应检索接口获取结果。是否允许 `background`、`stream` 或同步调用由插件声明决定；不支持的模式可能直接拒绝。

不应根据某个上游平台支持全套 Responses 功能，就假设网关上的每个模型都支持同样的状态存储与工具语义。
