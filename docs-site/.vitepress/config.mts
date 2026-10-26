import { defineConfig } from "vitepress";

const groups = [
  {
    text: "功能指南",
    items: [
      {
        text: "功能指南概述",
        link: "/guide/overview",
      },
    ],
  },
  {
    text: "用户指南",
    collapsed: false,
    items: [
      {
        text: "注册与登录",
        link: "/user/auth",
      },
      {
        text: "概览与数据看板",
        link: "/user/dashboard",
      },
      {
        text: "个人资料与安全",
        link: "/user/profile",
      },
      {
        text: "API 密钥",
        link: "/user/keys",
      },
      {
        text: "使用 API 与 Playground",
        link: "/user/playground",
      },
      {
        text: "聊天应用集成",
        link: "/user/clients",
      },
      {
        text: "模型广场与排行榜",
        link: "/user/models",
      },
      {
        text: "日志与异步任务",
        link: "/user/logs",
      },
      {
        text: "配额、钱包与订阅",
        link: "/user/wallet",
      },
      {
        text: "任务管理",
        link: "/user/tasks",
      },
    ],
  },
  {
    text: "管理员指南",
    collapsed: false,
    items: [
      {
        text: "渠道管理",
        link: "/console/channels",
      },
      {
        text: "用户管理",
        link: "/console/users",
      },
      {
        text: "兑换码管理",
        link: "/admin/redemption",
      },
      {
        text: "日志与统计数据",
        link: "/console/logs",
      },
      {
        text: "订阅计划管理",
        link: "/admin/subscriptions",
      },
      {
        text: "模型管理",
        link: "/admin/models",
      },
      {
        text: "分组管理（集团管理）",
        link: "/admin/groups",
      },
      {
        text: "系统设置",
        link: "/console/settings",
      },
      {
        text: "高级系统配置",
        link: "/admin/advanced",
      },
      {
        text: "自定义 OAuth 提供程序",
        link: "/admin/oauth",
      },
      {
        text: "性能监控",
        link: "/operations/monitoring",
      },
      {
        text: "文档与关于页面配置",
        link: "/admin/content",
      },
    ],
  },
  {
    text: "部署与技术参考",
    collapsed: true,
    items: [
      {
        text: "安装部署",
        link: "/deploy/",
      },
      {
        text: "API 接入",
        link: "/api/",
      },
      {
        text: "模型路由与定价",
        link: "/console/routing",
      },
      {
        text: "定价、额度与订阅",
        link: "/console/pricing",
      },
      {
        text: "任务插件维护",
        link: "/console/tasks",
      },
      {
        text: "升级与备份",
        link: "/operations/upgrade",
      },
      {
        text: "故障排查",
        link: "/operations/troubleshooting",
      },
      {
        text: "更多技术文档",
        link: "/reference/technical",
      },
      {
        text: "来源与适用范围",
        link: "/reference/maintenance",
      },
    ],
  },
];

export default defineConfig({
  lang: "zh-CN",
  title: "开明能源 Token 中转站使用指南",
  description:
    "开明能源 Token 中转站使用指南：注册登录、API 密钥、模型调用、钱包订阅和管理员操作。",
  base: process.env.DOCS_BASE || "/",
  cleanUrls: true,
  srcExclude: ["README.md"],
  markdown: { lineNumbers: true },
  themeConfig: {
    siteTitle: "开明能源 · 使用指南",
    nav: [
      { text: "功能概述", link: "/guide/overview", activeMatch: "/guide/overview" },
      { text: "用户指南", link: "/user/auth", activeMatch: "/user/" },
      { text: "管理员指南", link: "/console/channels", activeMatch: "/(admin|console)/" },
      {
        text: "技术参考",
        link: "/reference/technical",
        activeMatch: "/(api|deploy|integrations|operations|reference)/",
      },
    ],
    sidebar: groups,
    outline: { level: [2, 3], label: "本页目录" },
    docFooter: { prev: "上一篇", next: "下一篇" },
    darkModeSwitchLabel: "切换主题",
    lightModeSwitchTitle: "切换到浅色",
    darkModeSwitchTitle: "切换到深色",
    sidebarMenuLabel: "文档导航",
    returnToTopLabel: "返回顶部",
    skipToContentLabel: "跳转到正文",
    externalLinkIcon: true,
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: "搜索文档", buttonAriaLabel: "搜索文档" },
              modal: {
                noResultsText: "没有找到相关内容",
                resetButtonTitle: "清空搜索",
                backButtonTitle: "关闭搜索",
                displayDetails: "显示详细内容",
                footer: {
                  selectText: "选择",
                  navigateText: "切换",
                  closeText: "关闭",
                },
              },
            },
          },
        },
      },
    },
    footer: {
      message: "开明能源 Token 中转站 · 使用指南",
    },
  },
});
