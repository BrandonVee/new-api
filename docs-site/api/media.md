# 图像与音频

生成媒体前，确认模型能力、请求格式和定价。图像入口可以由任务插件接管，音频接口也需要渠道和上游支持。

## 图像生成

```bash
curl --fail-with-body "$AI_GATEWAY_URL/v1/images/generations" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"your-image-model","prompt":"一座清晨的海边灯塔","n":1}'
```

按模型要求添加尺寸、质量等参数，不要假定所有图像模型接受同一套枚举。返回内容可能包含 URL 或 base64 图片；不要把带访问权限的产物 URL 公开粘贴到问题报告。

图像编辑使用 `POST /v1/images/edits`，通常涉及 multipart 文件上传，具体字段以渠道或插件要求为准。当前 `/v1/images/variations` 是未实现占位接口。

## 音频转写

将路径和模型替换为实际值：

```bash
curl --fail-with-body "$AI_GATEWAY_URL/v1/audio/transcriptions" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  -F 'model=your-transcription-model' \
  -F 'file=@./sample.wav'
```

上传时不要手动填写缺少 boundary 的 `Content-Type: multipart/form-data`，让 HTTP 客户端生成它。转写与音频翻译不是同一种能力；`/v1/audio/translations` 是否可用由上游决定。

## 语音合成

以下使用 JSON 响应请求、将成功音频写入文件的方式：

```bash
curl --fail --show-error "$AI_GATEWAY_URL/v1/audio/speech" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"your-tts-model","input":"欢迎使用 Ai-gateway","voice":"your-supported-voice"}' \
  -o speech.mp3
```

选择真实支持的 voice 与输出格式。先检查 HTTP 状态和响应类型，再把文件交给音频播放器；错误 JSON 不是音频。

## 长请求和任务完成

检查反向代理上传上限、读取超时及网关相关超时。插件图像任务可能在客户端连接内等待；504 或客户端断开后，后台任务仍可能继续并结算。查询任务后再决定重试。

视频等异步生成见 [任务 API](/api/tasks)，不建议为绕过等待而无限增大所有超时。
