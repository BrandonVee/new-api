# 接口索引与 OpenAPI

本页由 `bun run sync` 从仓库的 OpenAPI 文件生成，列出已有规格中的操作；它不是对所有运行时路由的自动扫描。规格可能落后于代码，实际注册的路由、权限和启用的插件决定接口是否可用。

常用接口的可执行示例见 [API 接入](/api/)。通用任务接口 `/v1/tasks/*`、部分插件动态路由与 WebSocket 行为应结合对应教程和路由代码查看。文件与微调等占位接口不能因出现在规格中就视为已实现。

::: warning 凭据类型
模型转发使用 Ai-gateway API 令牌；后台管理使用面板 Access Token 或允许的 PAT。不要把上游服务商密钥填入管理接口。规格中历史组合鉴权扩展不代表当前要求，鉴权以项目实现为准。
:::

## 模型转发接口

[查看或另存 模型转发接口 OpenAPI JSON](/openapi/relay.json)

| 方法 | 路径 | 规格中的名称 |
| --- | --- | --- |
| GET | `/v1/models` | 获取模型列表 |
| GET | `/v1beta/models` | Gemini 格式获取 |
| POST | `/v1/chat/completions` | 创建聊天对话 |
| POST | `/v1/responses` | 创建响应 (OpenAI Responses API) |
| POST | `/v1/responses/compact` | 压缩对话 (OpenAI Responses API) |
| POST | `/v1/images/generations` | 生成图像(qwen-image) |
| POST | `/v1/images/edits` | 编辑图像(qwen-image-edit) |
| POST | `/v1/videos` | 创建视频  |
| GET | `/v1/videos/{task_id}` | 获取视频任务状态  |
| GET | `/v1/videos/{task_id}/content` | 获取视频内容 |
| POST | `/kling/v1/videos/text2video` | Kling 文生视频 |
| GET | `/kling/v1/videos/text2video/{task_id}` | 获取 Kling 文生视频任务状态 |
| POST | `/kling/v1/videos/image2video` | Kling 图生视频 |
| GET | `/kling/v1/videos/image2video/{task_id}` | 获取 Kling 图生视频任务状态 |
| POST | `/jimeng/` | 即梦视频生成 |
| POST | `/v1/video/generations` | 创建视频生成任务 |
| GET | `/v1/video/generations/{task_id}` | 获取视频生成任务状态 |
| POST | `/v1/messages` | Claude 聊天 |
| POST | `/v1beta/models/{model}:generateContent` | Gemini 图片(Nano Banana) |
| POST | `/v1/engines/{model}/embeddings` | Gemini 嵌入(Embeddings) |
| POST | `/v1/embeddings` | 创建文本嵌入 |
| POST | `/v1/completions` | 创建文本补全 |
| POST | `/v1/audio/transcriptions` | 音频转录 |
| POST | `/v1/audio/translations` | 音频翻译 |
| POST | `/v1/audio/speech` | 文本转语音 |
| POST | `/v1/rerank` | 文档重排序 |
| POST | `/v1/moderations` | 内容审核 |
| GET | `/v1/realtime` | 实时 WebSocket 连接 |
| GET | `/v1/fine-tunes` | 列出微调任务 (未实现) |
| POST | `/v1/fine-tunes` | 创建微调任务 (未实现) |
| GET | `/v1/fine-tunes/{fine_tune_id}` | 获取微调任务详情 (未实现) |
| POST | `/v1/fine-tunes/{fine_tune_id}/cancel` | 取消微调任务 (未实现) |
| GET | `/v1/fine-tunes/{fine_tune_id}/events` | 获取微调任务事件 (未实现) |
| GET | `/v1/files` | 列出文件 (未实现) |
| POST | `/v1/files` | 上传文件 (未实现) |
| GET | `/v1/files/{file_id}` | 获取文件信息 (未实现) |
| DELETE | `/v1/files/{file_id}` | 删除文件 (未实现) |
| GET | `/v1/files/{file_id}/content` | 获取文件内容 (未实现) |

## 后台管理接口

[查看或另存 后台管理接口 OpenAPI JSON](/openapi/api.json)

| 方法 | 路径 | 规格中的名称 |
| --- | --- | --- |
| GET | `/api/setup` | 获取初始化状态 |
| POST | `/api/setup` | 初始化系统 |
| GET | `/api/status` | 获取系统状态 |
| GET | `/api/status/test` | 测试系统状态 |
| GET | `/api/uptime/status` | 获取Uptime Kuma状态 |
| GET | `/api/notice` | 获取公告 |
| GET | `/api/user-agreement` | 获取用户协议 |
| GET | `/api/privacy-policy` | 获取隐私政策 |
| GET | `/api/about` | 获取关于信息 |
| GET | `/api/home_page_content` | 获取首页内容 |
| GET | `/api/pricing` | 获取定价信息 |
| GET | `/api/models` | 获取模型列表 |
| GET | `/api/ratio_config` | 获取倍率配置 |
| GET | `/api/verification` | 发送邮箱验证码 |
| GET | `/api/reset_password` | 发送密码重置邮件 |
| POST | `/api/user/reset` | 重置密码 |
| POST | `/api/user/register` | 用户注册 |
| POST | `/api/user/login` | 用户登录 |
| POST | `/api/user/login/2fa` | 两步验证登录 |
| POST | `/api/user/auth/refresh` | 刷新面板登录 |
| POST | `/api/user/auth/logout` | 撤销当前登录会话 |
| GET | `/api/user/sessions` | 查看登录会话 |
| DELETE | `/api/user/sessions/{sid}` | 撤销指定登录会话 |
| POST | `/api/user/sessions/revoke-others` | 撤销其他登录会话 |
| GET | `/api/user/groups` | 获取用户分组列表 |
| POST | `/api/user/passkey/login/begin` | 开始Passkey登录 |
| POST | `/api/user/passkey/login/finish` | 完成Passkey登录 |
| GET | `/api/oauth/github` | GitHub OAuth登录 |
| GET | `/api/oauth/discord` | Discord OAuth登录 |
| GET | `/api/oauth/oidc` | OIDC登录 |
| GET | `/api/oauth/linuxdo` | LinuxDO OAuth登录 |
| POST | `/api/oauth/state` | 生成OAuth State |
| GET | `/api/oauth/wechat` | 微信OAuth登录 |
| POST | `/api/oauth/wechat/bind` | 绑定微信 |
| POST | `/api/oauth/email/bind` | 绑定邮箱 |
| GET | `/api/oauth/telegram/login` | Telegram登录 |
| POST | `/api/oauth/telegram/bind/start` | 创建 Telegram 绑定流程 |
| GET | `/api/oauth/telegram/bind/{flow_token}` | 完成 Telegram 绑定 |
| GET | `/api/user/self/groups` | 获取当前用户分组 |
| GET | `/api/user/self` | 获取当前用户信息 |
| PUT | `/api/user/self` | 更新当前用户信息 |
| DELETE | `/api/user/self` | 注销当前用户 |
| GET | `/api/user/models` | 获取用户可用模型 |
| GET | `/api/user/token` | 生成访问令牌 |
| GET | `/api/user/passkey` | 获取Passkey状态 |
| DELETE | `/api/user/passkey` | 删除Passkey |
| POST | `/api/user/passkey/register/begin` | 开始注册Passkey |
| POST | `/api/user/passkey/register/finish` | 完成注册Passkey |
| POST | `/api/user/passkey/verify/begin` | 开始验证Passkey |
| POST | `/api/user/passkey/verify/finish` | 完成验证Passkey |
| GET | `/api/user/aff` | 获取邀请码 |
| POST | `/api/user/aff_transfer` | 转换邀请额度 |
| PUT | `/api/user/setting` | 更新用户设置 |
| GET | `/api/user/topup` | 获取所有充值记录 |
| GET | `/api/user/` | 获取所有用户 |
| POST | `/api/user/` | 创建用户 |
| PUT | `/api/user/` | 更新用户 |
| POST | `/api/user/topup/complete` | 管理员完成充值 |
| GET | `/api/user/search` | 搜索用户 |
| GET | `/api/user/{id}` | 获取指定用户 |
| DELETE | `/api/user/{id}` | 删除用户 |
| DELETE | `/api/user/{id}/reset_passkey` | 管理员重置用户Passkey |
| DELETE | `/api/user/{id}/2fa` | 管理员禁用用户2FA |
| POST | `/api/user/manage` | 管理用户状态 |
| GET | `/api/user/topup/info` | 获取充值信息 |
| GET | `/api/user/topup/self` | 获取用户充值记录 |
| POST | `/api/user/pay` | 发起易支付 |
| POST | `/api/user/amount` | 获取支付金额 |
| POST | `/api/user/stripe/pay` | 发起Stripe支付 |
| POST | `/api/user/stripe/amount` | 获取Stripe支付金额 |
| POST | `/api/user/creem/pay` | 发起Creem支付 |
| GET | `/api/user/epay/notify` | 易支付回调 |
| POST | `/api/stripe/webhook` | Stripe Webhook |
| POST | `/api/creem/webhook` | Creem Webhook |
| GET | `/api/user/2fa/status` | 获取2FA状态 |
| POST | `/api/user/2fa/setup` | 设置2FA |
| POST | `/api/user/2fa/enable` | 启用2FA |
| POST | `/api/user/2fa/disable` | 禁用2FA |
| POST | `/api/user/2fa/backup_codes` | 重新生成备用码 |
| GET | `/api/user/2fa/stats` | 获取2FA统计 |
| POST | `/api/verify` | 通用安全验证 |
| GET | `/api/verify/status` | 获取验证状态 |
| GET | `/api/channel/` | 获取所有渠道 |
| POST | `/api/channel/` | 添加渠道 |
| PUT | `/api/channel/` | 更新渠道 |
| GET | `/api/channel/search` | 搜索渠道 |
| GET | `/api/channel/models` | 获取渠道模型列表 |
| GET | `/api/channel/models_enabled` | 获取已启用模型列表 |
| GET | `/api/channel/{id}` | 获取指定渠道 |
| DELETE | `/api/channel/{id}` | 删除渠道 |
| POST | `/api/channel/{id}/key` | 获取渠道密钥 |
| GET | `/api/channel/test` | 测试所有渠道 |
| GET | `/api/channel/test/{id}` | 测试指定渠道 |
| GET | `/api/channel/update_balance` | 更新所有渠道余额 |
| GET | `/api/channel/update_balance/{id}` | 更新指定渠道余额 |
| DELETE | `/api/channel/disabled` | 删除已禁用渠道 |
| POST | `/api/channel/batch` | 批量删除渠道 |
| POST | `/api/channel/fix` | 修复渠道能力 |
| GET | `/api/channel/fetch_models/{id}` | 获取上游模型列表 |
| POST | `/api/channel/fetch_models` | 获取模型列表 |
| POST | `/api/channel/batch/tag` | 批量设置渠道标签 |
| GET | `/api/channel/tag/models` | 获取标签模型 |
| POST | `/api/channel/tag/disabled` | 禁用标签渠道 |
| POST | `/api/channel/tag/enabled` | 启用标签渠道 |
| PUT | `/api/channel/tag` | 编辑标签渠道 |
| POST | `/api/channel/copy/{id}` | 复制渠道 |
| POST | `/api/channel/multi_key/manage` | 管理多密钥 |
| GET | `/api/token/` | 获取所有令牌 |
| POST | `/api/token/` | 创建令牌 |
| PUT | `/api/token/` | 更新令牌 |
| GET | `/api/token/search` | 搜索令牌 |
| GET | `/api/token/{id}` | 获取指定令牌 |
| DELETE | `/api/token/{id}` | 删除令牌 |
| POST | `/api/token/batch` | 批量删除令牌 |
| GET | `/api/usage/token/` | 获取令牌使用情况 |
| GET | `/api/redemption/` | 获取所有兑换码 |
| POST | `/api/redemption/` | 创建兑换码 |
| PUT | `/api/redemption/` | 更新兑换码 |
| GET | `/api/redemption/search` | 搜索兑换码 |
| GET | `/api/redemption/{id}` | 获取指定兑换码 |
| DELETE | `/api/redemption/{id}` | 删除兑换码 |
| DELETE | `/api/redemption/invalid` | 删除无效兑换码 |
| GET | `/api/log/` | 获取所有日志 |
| POST | `/api/system-task/log-cleanup` | 创建日志清理任务 |
| GET | `/api/log/stat` | 获取日志统计 |
| GET | `/api/log/self/stat` | 获取个人日志统计 |
| GET | `/api/log/search` | 搜索日志 |
| GET | `/api/log/self` | 获取个人日志 |
| GET | `/api/log/self/search` | 搜索个人日志 |
| GET | `/api/log/token` | 通过令牌获取日志 |
| GET | `/api/data/` | 获取所有额度数据 |
| GET | `/api/data/self` | 获取个人额度数据 |
| GET | `/api/group/` | 获取所有分组 |
| GET | `/api/prefill_group/` | 获取预填分组 |
| POST | `/api/prefill_group/` | 创建预填分组 |
| PUT | `/api/prefill_group/` | 更新预填分组 |
| DELETE | `/api/prefill_group/{id}` | 删除预填分组 |
| GET | `/api/mj/` | 获取所有Midjourney任务 |
| GET | `/api/mj/self` | 获取个人Midjourney任务 |
| GET | `/api/task/` | 获取所有任务 |
| GET | `/api/task/self` | 获取个人任务 |
| GET | `/api/vendors/` | 获取所有供应商 |
| POST | `/api/vendors/` | 创建供应商 |
| PUT | `/api/vendors/` | 更新供应商 |
| GET | `/api/vendors/search` | 搜索供应商 |
| GET | `/api/vendors/{id}` | 获取指定供应商 |
| DELETE | `/api/vendors/{id}` | 删除供应商 |
| GET | `/api/models/` | 获取所有模型元数据 |
| POST | `/api/models/` | 创建模型元数据 |
| PUT | `/api/models/` | 更新模型元数据 |
| GET | `/api/models/search` | 搜索模型 |
| GET | `/api/models/{id}` | 获取指定模型 |
| DELETE | `/api/models/{id}` | 删除模型 |
| GET | `/api/models/sync_upstream/preview` | 预览上游模型同步 |
| POST | `/api/models/sync_upstream` | 同步上游模型 |
| GET | `/api/models/missing` | 获取缺失模型 |
| GET | `/api/option/` | 获取系统选项 |
| PUT | `/api/option/` | 更新系统选项 |
| POST | `/api/option/rest_model_ratio` | 重置模型倍率 |
| GET | `/api/ratio_sync/channels` | 获取可同步渠道 |
| POST | `/api/ratio_sync/fetch` | 获取上游倍率 |
