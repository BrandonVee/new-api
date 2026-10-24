# Claude 与 Gemini 原生协议

原生协议适合已经按服务商格式组织消息与事件的客户端。这里仍然使用网关令牌，由网关完成渠道路由。

## Anthropic Messages

```bash
curl --fail-with-body "$AI_GATEWAY_URL/v1/messages" \
  -H "x-api-key: $AI_GATEWAY_KEY" \
  -H 'anthropic-version: 2023-06-01' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "your-enabled-claude-model",
    "max_tokens": 256,
    "messages": [{"role":"user","content":"你好，请简短介绍自己"}]
  }'
```

`max_tokens` 的取值应符合模型与网关限制。流式时增加 `stream: true` 并按 Anthropic 事件解析；system 与 tool 结构也使用该协议的形式。

当前 `/v1/messages/count_tokens` 没有启用，不能承诺所有客户端的预估 token 请求都能工作。

## Gemini generateContent

```bash
export AI_GATEWAY_MODEL='your-enabled-gemini-model'

curl --fail-with-body \
  "$AI_GATEWAY_URL/v1beta/models/$AI_GATEWAY_MODEL:generateContent" \
  -H "x-goog-api-key: $AI_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"role":"user","parts":[{"text":"介绍一下太阳系"}]}]}'
```

模型名位于路径中，内容放在 `contents[].parts`。Gemini 流式入口使用 `:streamGenerateContent`；客户端需使用与响应格式相符的解析方式。

当前 `:countTokens` 被明确拒绝，不要把它当成已经实现的接口。

## 模型列表的格式

`/v1/models` 可根据原生请求头返回相应格式，`/v1beta/models` 也提供 Gemini 模型列表。列表格式正确与实际模型权限是两个验证步骤。

## 排查兼容性

优先确认客户端发出的完整路径、请求头、模型名称与 JSON 结构，再看网关选择的渠道。工具、图片、推理签名和协议专有字段需要针对真实上游测试；跨协议转换不保证每个细节都无损。
