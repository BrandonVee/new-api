# HTTPS 与反向代理

正式控制台应通过 HTTPS 访问。代理还需要正确处理流式响应和 WebSocket，否则普通请求可能成功，而聊天流或实时连接失败。

## Nginx 代理示例

下面是放在现有 HTTPS `server` 内的代理片段，证书与域名需由部署者配置。`map` 必须放在 Nginx 的 `http` 上下文，不能放在 `server` 或 `location` 内。

```nginx
# http 上下文
map $http_upgrade $gateway_connection {
    default upgrade;
    '' close;
}

# 已配置 TLS 证书的 server 内
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $gateway_connection;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1800s;
    proxy_send_timeout 1800s;
    client_max_body_size 50m;
}
```

`50m` 与 `1800s` 只是示例，应按上传文件大小、模型生成耗时与资源预算调整。还有 CDN、负载均衡器时，它们的上传限制和超时也必须检查。代理运行在容器内时，改用对应服务名与网络地址。

## 控制台会话配置

以 `https://gateway.example.com` 为例：

```dotenv
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_TRUSTED_URL=https://gateway.example.com
```

填真实的完整 HTTPS Origin；不含路径、通配符或末尾斜杠，多个 Origin 以英文逗号分隔。本地 HTTP 测试时保持 `SESSION_COOKIE_SECURE=false` 并不配置可信 URL。这组参数控制刷新与退出的 Origin 校验，不是模型 API 的 CORS 白名单。

设置持久化随机 `SESSION_SECRET`；更换它会使现有登录与临时鉴权流程失效。

## 可信代理

将 `TRUSTED_PROXIES` 设为真实代理源 IP/CIDR。显式列表会替代默认列表。完全不经代理时可设为 `none`；它不能与其他地址混用。不要填写所有公网地址，否则客户端来源信息可能不可信。

## 验证配置

```bash
nginx -t
curl --fail-with-body https://gateway.example.com/api/status
```

配置检查通过后按你的服务管理方式重载 Nginx。然后完成三项人工检查：登录并刷新页面、调用 [流式 Chat](/api/chat#流式响应)、测试实际使用的 WebSocket 功能。只验证 `/api/status` 不足以证明这些路径正常。
