# 向量与文档重排

检索应用通常先用 embedding 构建向量，再用 rerank 对候选文档重新排序。两类接口需要分别配置支持的模型。

## 生成向量

```bash
curl --fail-with-body "$AI_GATEWAY_URL/v1/embeddings" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"your-embedding-model","input":["第一段待检索文本","第二段待检索文本"]}'
```

按响应中的索引与向量字段保存结果。数据库索引维度必须与模型输出一致；切换 embedding 模型或维度后，通常需要重建相应向量数据，不能只修改网关映射名称。

## 文档重排

```bash
curl --fail-with-body "$AI_GATEWAY_URL/v1/rerank" \
  -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "your-rerank-model",
    "query": "如何备份网关数据库？",
    "documents": ["备份和恢复流程说明", "语音合成接口介绍"]
  }'
```

额外字段、文档形式与结果结构可能因渠道而异。先用两条短文本验证基本协议，再接入批量索引或检索链路。

## 与聊天模型分开管理

不同类型的模型需要分别配置路由、访问限制与价格。聊天模型可用不意味着同一个渠道自动支持 embedding 或 rerank。出现 404 或不支持模型时，应检查渠道适配与上游权限，而不是只增加用户额度。
