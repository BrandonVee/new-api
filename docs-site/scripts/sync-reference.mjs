import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Build-time snapshots stay usable when the static output is hosted on its own.
const site = fileURLToPath(new URL('../', import.meta.url))
const repository = path.resolve(site, '..')
await mkdir(path.join(site, 'public/openapi'), { recursive: true })
await mkdir(path.join(site, 'reference'), { recursive: true })
await copyFile(
  path.join(repository, 'web/public/ai-gateway-logo.png'),
  path.join(site, 'public/logo.png')
)

const methods = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
])
const lines = [
  '# 接口索引与 OpenAPI',
  '',
  '本页由 `bun run sync` 从仓库的 OpenAPI 文件生成，列出已有规格中的操作；它不是对所有运行时路由的自动扫描。规格可能落后于代码，实际注册的路由、权限和启用的插件决定接口是否可用。',
  '',
  '常用接口的可执行示例见 [API 接入](/api/)。通用任务接口 `/v1/tasks/*`、部分插件动态路由与 WebSocket 行为应结合对应教程和路由代码查看。文件与微调等占位接口不能因出现在规格中就视为已实现。',
  '',
  '::: warning 凭据类型',
  '模型转发使用 Ai-gateway API 令牌；后台管理使用面板 Access Token 或允许的 PAT。不要把上游服务商密钥填入管理接口。规格中历史组合鉴权扩展不代表当前要求，鉴权以项目实现为准。',
  ':::',
  '',
]

for (const [name, title] of [
  ['relay', '模型转发接口'],
  ['api', '后台管理接口'],
]) {
  const raw = await readFile(
    path.join(repository, `docs/openapi/${name}.json`),
    'utf8'
  )
  const spec = JSON.parse(raw)
  await writeFile(path.join(site, `public/openapi/${name}.json`), raw)
  lines.push(
    `## ${title}`,
    '',
    `[查看或另存 ${title} OpenAPI JSON](/openapi/${name}.json)`,
    '',
    '| 方法 | 路径 | 规格中的名称 |',
    '| --- | --- | --- |'
  )
  for (const [route, operations] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      if (!methods.has(method)) continue
      const summary = String(operation.summary || operation.operationId || '—')
        .replaceAll('|', '\\|')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('\n', ' ')
      lines.push(`| ${method.toUpperCase()} | \`${route}\` | ${summary} |`)
    }
  }
  lines.push('')
}
await writeFile(path.join(site, 'reference/api-index.md'), lines.join('\n'))

const environment = await readFile(
  path.join(repository, '.env.example'),
  'utf8'
)
await writeFile(
  path.join(site, 'reference/environment-source.md'),
  [
    '# 完整环境变量示例',
    '',
    '以下内容在构建时直接同步自仓库 `.env.example`，保留原注释。它是配置模板，不是容器已经加载的环境。常用配置的解释见 [环境变量速查](/reference/environment)。',
    '',
    '同一配置在示例、旧注释与代码中出现差异时，以部署版本的代码和启动输出为准。不要直接启用模板中的调试或安全例外设置。',
    '',
    '```dotenv',
    environment.trimEnd(),
    '```',
    '',
  ].join('\n')
)
console.log('已同步 OpenAPI 索引、规格文件、环境变量示例和项目标志')
