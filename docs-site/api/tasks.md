# 异步任务 API

任务调用分为提交、查询和获取产物。客户端应保存**网关返回的任务 ID**；上游私有 ID 不应当作网关查询 ID 使用。

## 通用接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/v1/tasks/{pluginKey}` | 提交指定插件的任务 |
| GET | `/v1/tasks/{taskId}` | 查询当前用户可访问的任务 |
| GET | `/v1/tasks/{taskId}/artifacts` | 查询任务产物 |
| GET / HEAD | `/v1/tasks/{taskId}/artifacts/{artifactKey}/content` | 获取或检查产物内容 |

通用接口使用网关令牌。产物内容接口还存在受控的访问授权方式，但客户端应按实际返回结果使用，不要猜测签名参数或假设链接永不过期。

## 提交流程

先在控制台确认插件 key、支持模型、动作以及具体请求体。下面仅展示 HTTP 结构，`request.json` 必须按插件定义准备：

```bash
export AI_GATEWAY_PLUGIN='your-installed-plugin-key'

curl --fail-with-body "$AI_GATEWAY_URL/v1/tasks/$AI_GATEWAY_PLUGIN" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @request.json
```

不要把统一提交路由误解成所有插件具有相同参数；必填字段、动作和多模态输入由插件声明。

## 查询与产物

```bash
export AI_GATEWAY_TASK='replace-with-returned-task-id'

curl --fail-with-body "$AI_GATEWAY_URL/v1/tasks/$AI_GATEWAY_TASK" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY"

curl --fail-with-body "$AI_GATEWAY_URL/v1/tasks/$AI_GATEWAY_TASK/artifacts" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY"
```

按返回状态安排有间隔、次数有限的轮询；成功或失败后停止。不同插件原生响应的封装可能不同，解析时依据实际契约。

## OpenAI 兼容视频入口

支持相应协议的插件可使用 `POST /v1/videos` 提交，使用 `GET /v1/videos/{task_id}` 查询，使用 `/content` 获取内容。原生 Kling、即梦等路径由插件声明，不一定与统一任务 JSON 完全相同。

## 超时与重试

`TASK_TIMEOUT_MINUTES` 是后台任务的外层期限；`TASK_POLL_MAX_FAILURES` 控制连续查询失败阈值。任务已被上游接受后，盲目重提可能生成两份任务并产生两次费用。

检查控制台任务状态和错误记录，再决定是否重试。客户端 HTTP 超时、后台任务终态与退款是三件需要分别确认的事。
