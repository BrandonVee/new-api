---
layout: home
title: 使用指南
hero:
  name: 开明能源
  text: Token 中转站使用指南
  tagline: 从创建 API 密钥到管理模型服务，按角色查找操作方法，让每一次调用有据可查。
  actions:
    - theme: brand
      text: 用户使用指南
      link: /user/auth
    - theme: alt
      text: 管理员操作指南
      link: /console/channels
features:
  - title: 开始使用
    details: 登录账户、了解控制台，完成首次模型调用。
    link: /guide/overview
    linkText: 查看功能概述
  - title: 管好访问与用量
    details: 配置 API 密钥，查询日志、额度和订阅权益。
    link: /user/keys
    linkText: 创建 API 密钥
  - title: 维护模型服务
    details: 配置渠道、用户、模型与分组，定位服务异常。
    link: /console/channels
    linkText: 接入模型渠道
---

## 第一次使用，从这里开始

![从登录到账户调用的四步操作流程](/images/first-request.svg)

| 你要完成的事 | 阅读位置 | 完成标志 |
| --- | --- | --- |
| 登录并保护账户 | [注册与登录](/user/auth) · [个人资料与安全](/user/profile) | 可以进入控制台并检查登录设备 |
| 让应用调用模型 | [API 密钥](/user/keys) · [使用 API](/user/playground) | 请求成功，能找到对应使用日志 |
| 查询费用与权益 | [钱包与订阅](/user/wallet) · [日志与任务](/user/logs) | 能核对余额、权益和单次调用记录 |
| 为团队开放服务 | [渠道管理](/console/channels) · [用户管理](/console/users) | 普通用户能用授权模型完成调用 |

## 按角色阅读

**普通用户**：从左侧用户指南了解日常操作。无需了解上游密钥或部署细节，也无需管理员权限。

**管理员**：从渠道和用户配置开始，继续阅读兑换码、订阅计划、模型及分组管理。系统级设置由 Root 或具备对应授权的人员维护。

**部署维护者与开发者**：原有 [部署与技术文档](/reference/technical) 保留，包括 API 示例、Docker 部署、监控和故障排查。

::: info 适用范围
本指南依据当前项目整理。功能入口受平台配置、部署版本及账户权限影响；未显示某项功能时，请联系平台管理员确认。图示用于说明操作关系，不代表线上页面截图。
:::
