import { defineConfig } from 'vitepress'

const groups = [
  {
    text: '开始使用',
    items: [
      { text: '项目介绍', link: '/guide/introduction' },
      { text: '快速开始', link: '/guide/quickstart' },
      { text: '理解渠道、模型与令牌', link: '/guide/concepts' },
    ],
  },
  {
    text: '安装部署',
    collapsed: false,
    items: [
      { text: '选择部署方式', link: '/deploy/' },
      { text: 'Docker 单容器', link: '/deploy/docker' },
      { text: 'Docker Compose', link: '/deploy/compose' },
      { text: '1Panel 与宝塔面板', link: '/deploy/panels' },
      { text: 'HTTPS 与反向代理', link: '/deploy/proxy' },
      { text: '多节点部署', link: '/deploy/cluster' },
      { text: '本地开发', link: '/deploy/development' },
      { text: '文档站部署', link: '/deploy/documentation' },
    ],
  },
  {
    text: '控制台使用',
    collapsed: false,
    items: [
      { text: '接入第一个渠道', link: '/console/channels' },
      { text: '模型映射与路由', link: '/console/routing' },
      { text: '创建与管理 API 令牌', link: '/console/tokens' },
      { text: '用户、分组与权限', link: '/console/users' },
      { text: '定价、额度与订阅', link: '/console/pricing' },
      { text: '日志与用量分析', link: '/console/logs' },
      { text: '任务与插件', link: '/console/tasks' },
      { text: '站点与系统设置', link: '/console/settings' },
    ],
  },
  {
    text: 'API 接入',
    collapsed: true,
    items: [
      { text: '接口与鉴权概览', link: '/api/' },
      { text: 'Chat Completions', link: '/api/chat' },
      { text: 'Responses', link: '/api/responses' },
      { text: 'Claude 与 Gemini', link: '/api/native' },
      { text: '图像与音频', link: '/api/media' },
      { text: '向量与重排', link: '/api/embeddings' },
      { text: '异步任务', link: '/api/tasks' },
      { text: 'WebSocket', link: '/api/websocket' },
      { text: '接口索引与 OpenAPI', link: '/reference/api-index' },
    ],
  },
  {
    text: '应用集成',
    collapsed: true,
    items: [
      { text: '通用客户端配置', link: '/integrations/clients' },
      { text: 'Python、Node.js 与服务端', link: '/integrations/code' },
    ],
  },
  {
    text: '运维与参考',
    collapsed: true,
    items: [
      { text: '升级与备份', link: '/operations/upgrade' },
      { text: '监控与健康检查', link: '/operations/monitoring' },
      { text: '故障排查', link: '/operations/troubleshooting' },
      { text: '环境变量速查', link: '/reference/environment' },
      { text: '完整环境变量示例', link: '/reference/environment-source' },
      { text: '能力边界与常见问题', link: '/reference/faq' },
      { text: '内容来源与维护', link: '/reference/maintenance' },
    ],
  },
]

export default defineConfig({
  lang: 'zh-CN',
  title: 'Ai-gateway 文档',
  description:
    'Ai-gateway 自托管 AI 网关使用手册：安装部署、渠道与模型管理、API 接入和运维排障。',
  base: process.env.DOCS_BASE || '/',
  cleanUrls: true,
  srcExclude: ['README.md'],
  head: [
    ['link', { rel: 'icon', href: `${process.env.DOCS_BASE || '/'}logo.png` }],
  ],
  markdown: { lineNumbers: true },
  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'Ai-gateway',
    nav: [
      {
        text: '使用指南',
        link: '/guide/quickstart',
        activeMatch: '/(guide|console)/',
      },
      { text: '安装部署', link: '/deploy/', activeMatch: '/deploy/' },
      { text: 'API 接入', link: '/api/', activeMatch: '/api/' },
      {
        text: '运维参考',
        link: '/operations/troubleshooting',
        activeMatch: '/(operations|reference)/',
      },
    ],
    sidebar: groups,
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    darkModeSwitchLabel: '切换主题',
    lightModeSwitchTitle: '切换到浅色',
    darkModeSwitchTitle: '切换到深色',
    sidebarMenuLabel: '文档导航',
    returnToTopLabel: '返回顶部',
    skipToContentLabel: '跳转到正文',
    externalLinkIcon: true,
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/BrandonVee/new-api',
        ariaLabel: 'Ai-gateway 源代码',
      },
    ],
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                noResultsText: '没有找到相关内容',
                resetButtonTitle: '清空搜索',
                backButtonTitle: '关闭搜索',
                displayDetails: '显示详细内容',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭',
                },
              },
            },
          },
        },
      },
    },
    footer: {
      message:
        'Ai-gateway · 基于当前项目编写的使用手册<br>Frontend design and development by New API contributors. · <a href="https://github.com/QuantumNous/new-api">上游项目 New API</a>',
      copyright: '遵循项目 AGPL-3.0 许可与署名要求',
    },
  },
})
