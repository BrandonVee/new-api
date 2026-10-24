# Python、Node.js 与服务端接入

先使用标准 HTTP 客户端确认接口，再接入你选用的 SDK。这样可以将网关路由问题与 SDK 自动增加路径或参数的问题分开。

以下示例使用服务端环境变量，模型名也由配置传入。不要将它们直接移植到浏览器来持有长期密钥。

## 准备环境变量

```bash
export AI_GATEWAY_URL='http://localhost:3000'
export AI_GATEWAY_KEY='replace-with-your-gateway-key'
export AI_GATEWAY_MODEL='your-enabled-model'
```

## Python 标准库示例

保存为自己的应用脚本后运行，无需额外 HTTP 依赖：

```python
import json
import os
import urllib.error
import urllib.request

base_url = os.environ["AI_GATEWAY_URL"].rstrip("/")
payload = {
    "model": os.environ["AI_GATEWAY_MODEL"],
    "messages": [{"role": "user", "content": "用一句话解释 API 网关"}],
}
request = urllib.request.Request(
    base_url + "/v1/chat/completions",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Authorization": "Bearer " + os.environ["AI_GATEWAY_KEY"],
        "Content-Type": "application/json",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(request, timeout=120) as response:
        result = json.load(response)
    print(result["choices"][0]["message"]["content"])
except urllib.error.HTTPError as error:
    # 对外只展示安全提示；不要记录请求头或密钥。
    raise RuntimeError(f"网关调用失败，HTTP {error.code}") from None
```

网络异常与超时还应由业务层处理，按需要记录脱敏请求关联信息。

## Node.js 原生 fetch

支持原生 `fetch` 的 Node.js 环境可将下面保存为 `.mjs` 文件运行：

```javascript
const baseURL = process.env.AI_GATEWAY_URL?.replace(/\/$/, '')
const key = process.env.AI_GATEWAY_KEY
const model = process.env.AI_GATEWAY_MODEL
if (!baseURL || !key || !model) {
  throw new Error('请设置 AI_GATEWAY_URL、AI_GATEWAY_KEY、AI_GATEWAY_MODEL')
}

const response = await fetch(`${baseURL}/v1/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: '用一句话解释 API 网关' }],
  }),
  signal: AbortSignal.timeout(120_000),
})
if (!response.ok) {
  throw new Error(`网关调用失败，HTTP ${response.status}`)
}
const result = await response.json()
console.log(result.choices[0].message.content)
```

## 换用 SDK 时检查什么

为 OpenAI 兼容 SDK 配置网关 Base URL 和网关令牌，通常 Base URL 带 `/v1`。不同 SDK 的参数名和版本约定不同，按你锁定版本的官方文档配置。

先关闭不必要的自动重试，完成最小请求，再逐步启用超时、重试、工具和流式处理。不要对所有 4xx、流式中断或任务提交无差别重试。

服务端应限制调用者可选模型与资源预算，避免把持有高权限令牌的转发端点公开成不受控代理。
