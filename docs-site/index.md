---
layout: home
title: 使用手册
hero:
  name: Ai-gateway
  text: 从第一条请求，到自己的 AI 网关
  tagline: 一份面向实际部署与日常使用的手册。连接模型服务、管理访问权限，让应用通过统一入口调用 AI。
  actions:
    - theme: brand
      text: 开始部署
      link: /guide/quickstart
    - theme: alt
      text: 查看 API 接入
      link: /api/
features:
  - title: 部署自己的实例
    details: 从 Docker 单容器开始，逐步配置数据库、HTTPS 和多节点。
    link: /deploy/
    linkText: 选择部署方式
  - title: 配好模型与访问
    details: 理解渠道、分组、模型映射和令牌，把上游能力交给需要的应用。
    link: /console/channels
    linkText: 接入第一个渠道
  - title: 调通应用与 API
    details: 查找 Chat、Responses、原生协议和多媒体请求示例。
    link: /api/
    linkText: 选择接入协议
---

## 先跑通一条完整链路

| 步骤 | 你要完成的事 | 验证方式 |
| --- | --- | --- |
| 1. 启动实例 | 构建镜像、保存数据并完成初始化 | 控制台可以打开 |
| 2. 接入上游 | 添加渠道、模型和可用分组 | 渠道测试通过 |
| 3. 分配访问 | 配置价格与用户额度，创建网关令牌 | 令牌能读取模型列表 |
| 4. 发出请求 | 将应用的 API 地址指向网关 | 返回内容，并能找到对应日志 |

不熟悉这些名词？先阅读 [渠道、模型与令牌的关系](/guide/concepts)。已经部署过？直接进入 [故障排查](/operations/troubleshooting) 或 [升级与备份](/operations/upgrade)。

## 按你现在的任务阅读

- **部署维护者**：[Docker Compose](/deploy/compose) → [反向代理](/deploy/proxy) → [监控](/operations/monitoring)。
- **控制台管理员**：[渠道配置](/console/channels) → [模型路由](/console/routing) → [用户与权限](/console/users)。
- **应用开发者**：[API 概览](/api/) → [请求示例](/api/chat) → [应用集成](/integrations/code)。

## 关于这份手册

本文档对应当前 Ai-gateway 源码，涵盖 React 控制台、独立 RelayKit / TokenKit 模块及任务插件体系。部署后的功能取决于实际版本、渠道和上游权限，协议兼容并不意味着每个模型都支持所有能力。

操作前请准备你有权使用的上游服务凭据。外站教程的适用场景、镜像名和菜单位置不能直接替代本项目配置；本站针对这些差异重新编写。查看 [来源与维护说明](/reference/maintenance)。
