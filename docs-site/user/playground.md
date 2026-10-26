# 使用 API 与 Playground

完成第一次调用需要三项信息：管理员提供的平台 API 地址、自己的 API 密钥，以及当前账户可用的模型名称。

## 准备接入信息

| 项目 | 从哪里获取 |
| --- | --- |
| API 地址 | 平台公告、概览接入信息或管理员 |
| API 密钥 | 控制台“API 密钥”，不是上游密钥 |
| 模型名称 | 平台模型广场或模型列表，按实际名称填写 |

OpenAI 兼容客户端通常把 Base URL 设置为平台地址加 `/v1`，但有些客户端会自己拼接路径。检查最终请求，避免出现 `/v1/v1`。Claude、Gemini 等原生协议见 [协议参考](/api/native)。

## 发出第一次请求

以下使用终端环境变量。将地址和模型名替换为实际值，通过可信的环境配置提供 `AI_GATEWAY_API_KEY`，不要把真实密钥粘贴到公开示例。

```bash
export AI_GATEWAY_BASE_URL="https://your-gateway.example"
export AI_GATEWAY_MODEL="your-enabled-model"

curl "$AI_GATEWAY_BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $AI_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$AI_GATEWAY_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"你好，请简短介绍你自己\"}]}"
```

`your-gateway.example` 和 `your-enabled-model` 是占位值。调用前设置好密钥变量；成功后应收到模型回复，再进入“使用日志”核对记录。

## Playground 与聊天调试

如果平台提供聊天预设或在线调试入口，选择已授权模型，先发送简短文本，再尝试该模型支持的其他能力。在线调试也可能产生实际消耗。

当前项目通过聊天入口和管理员配置的聊天应用提供相关体验，不应假定一定存在独立的 `/playground` 页面。没有入口时，可直接使用上面的 API 请求，或配置 [聊天客户端](/user/clients)。

## 失败时怎样定位

| 现象 | 优先检查 |
| --- | --- |
| 认证失败 | 密钥是否完整、有效，是否用了错误凭据 |
| 没有可用模型或渠道 | 模型名称、分组与模型限制，联系管理员检查渠道 |
| 额度不足 | 钱包、订阅权益及密钥限额 |
| 请求超时 | 先查日志或任务状态，再决定是否重试 |

完整请求示例见 [Chat Completions](/api/chat)、[Responses](/api/responses) 和 [多媒体接口](/api/media)。
