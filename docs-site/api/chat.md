# Chat Completions

使用 `POST /v1/chat/completions`，请求体包含模型与消息列表。它适合已采用 OpenAI Chat 格式的应用；模型是否支持工具、图片和推理参数仍需检查对应渠道。

## 最小请求

先按 [API 概览](/api/) 设置 `AI_GATEWAY_URL` 和 `AI_GATEWAY_KEY`，将请求中的模型名替换为已启用模型：

```bash
curl --fail-with-body "$AI_GATEWAY_URL/v1/chat/completions" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "your-enabled-model",
    "messages": [
      {"role": "system", "content": "请用简洁中文回答"},
      {"role": "user", "content": "什么是 API 网关？"}
    ]
  }'
```

典型非流式文本位于 `choices[0].message.content`。工具调用、多模态或不同转换路径可能产生其他字段，客户端应按实际响应解析。

## 多轮对话

将需要保留的 `user` 与 `assistant` 消息按时间顺序放入 `messages`。普通 Chat 调用不会凭空记住前一次 HTTP 请求。注意模型上下文限制与发送历史带来的输入用量。

## 流式响应

增加 `stream: true`，并使用 `curl -N` 关闭客户端输出缓冲：

```bash
curl -N --fail-with-body "$AI_GATEWAY_URL/v1/chat/completions" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"your-enabled-model","messages":[{"role":"user","content":"解释流式响应"}],"stream":true}'
```

返回为 SSE，常见文本增量在 `choices[].delta` 中。不能把整个响应当成一个 JSON；单个网络 chunk 也不一定等于一条完整事件。需要正确缓存、按事件分隔解析，再解析事件内 JSON。

若上游与渠道支持 `stream_options`，可以按其协议要求请求 usage。不要假定所有渠道都接受该字段，或所有流在客户端断开时都能返回完整 usage。

## 工具与多模态

工具调用需要客户端执行工具，再把结果按协议回传；网关不会替应用执行任意本地函数。图像输入需要模型支持对应 content 格式，也要确认上游能够访问图片 URL。

先验证纯文本，再逐步加工具、图片或推理参数。发生字段不兼容时，记录具体字段、渠道与转换路径，而不是一概改为不受验证的透传。
