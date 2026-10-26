# GitLab 发布

项目：`http://gitlab.localhost:8929/stjhub/ai-gateway`。本机 GitLab 与 Runner 必须运行，Mac 需要保持开机、联网且不休眠。

## 日常流程

1. 将代码推送到 GitLab。分支和合并请求会按改动范围验证；`main` 为受保护默认分支。
2. 打开 **Build → Pipelines**。网关改动执行前端检查、测试、构建，以及三个 Go 模块的 vet、build、test；教程改动独立构建静态站点。发布脚本改动同时执行其回归测试。
3. 对应构建成功后，在 `main` 流水线点击 `deploy:gateway` 或 `deploy:docs`。两个生产环境分别串行发布，发布按钮不会在普通分支出现。
4. 回退上一版时点击相应 `rollback:*` job；回滚不依赖新构建成功。回滚切换程序镜像或静态文件，不逆转数据库迁移。

手动新建流水线可选择 `TARGET=all/docs/gateway`。构建产物保留 30 天，发布使用该流水线的完整提交 SHA，禁止将本地任意目录作为已验证产物。

## 服务器

- 网关：`https://token.kaimingenergy.com`，保留 `/opt/ai-gateway/compose.yml` 的原项目、数据库、Redis、密钥与挂载，只重建 `ai-gateway` 服务。Runner 交叉编译 Linux AMD64 二进制，服务器 Docker 只装运行库和封装镜像。
- 教程：`https://docs.kaimingenergy.com`，新版本写入站点同级 `releases/<SHA>`，通过相对符号链接切换 `index`。首次接入时保留旧目录。现有 OpenResty 路由、证书继续由 1Panel 管理。
- 发布后检查实际版本与健康状态，失败恢复上一版。历史版本和镜像不会自动删除。
- 网关启动可能执行数据库迁移。涉及数据库的版本仍需按仓库要求完成真实数据库验证和备份；镜像回滚不能替代数据库恢复。

## 发布凭据

GitLab 项目变量：`DEPLOY_HOST`、`DEPLOY_PORT`、`DEPLOY_USER`，以及 file 类型的 `SSH_PRIVATE_KEY`、`SSH_KNOWN_HOSTS`。全部设为 **Protected**，环境范围 `production/*`。私钥不得进入仓库、构建产物或日志。多行 SSH 文件变量不能用 GitLab 的普通字符串 masking 规则，应依赖受保护分支、环境范围和无调试输出。

专用公钥采用 `restrict` 与固定命令，仅允许服务器上的 root-owned `deploy.py` 执行发布、回滚及状态查询，不能用作交互 SSH、SCP 或端口转发。主机公钥固定在 `SSH_KNOWN_HOSTS`，不在 job 内临时信任扫描结果。

首次安装由现有管理员 SSH 完成：将 `server/deploy.py`、`server/config.example.json`、`server/install.sh` 和部署公钥放在临时目录，检查配置后运行 `sudo bash install.sh <公钥文件> ubuntu`。安装脚本不修改 SSH/Sudo 配置、不替换已有公钥；已有服务器配置也不会被覆盖。更改 server 脚本必须由管理员重新安装，发布产物不能更新该受限入口。

服务器状态：使用专用密钥执行 `ssh ubuntu@<服务器> status`。状态文件位于 `/opt/kaiming-cicd/state/`。运行时 Dockerfile 固定在受限入口内；仓库运行时基础镜像或依赖发生变化时，需同步审核并更新该入口。
