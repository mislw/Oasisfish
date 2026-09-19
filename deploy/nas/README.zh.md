# NAS Harness 镜像

[English](README.md) | 中文

此目录将当前本地 `0.1.0-rc.5` 脏源码快照打包为面向 NAS 的 DeepSeek Harness 镜像。请从仓库根目录构建，使镜像包含当前尚未提交的 Harness 源码，包括 `packages/client/ui-oasis-workflow`。

```powershell
docker build -f .\deploy\nas\Dockerfile -t deepseek-harness-local:0.1.0-rc.5 .
```

该镜像会构建源码工作区，并验证 `/opt/dsh` 下的生产 CLI 部署。运行时从 `/app/apps/cli/lib/bin.js` 启动已构建的工作区 CLI，因为当前旧版 `pnpm deploy` 输出会裁剪 profile 插件动态加载的工作区对等依赖（peer dependency）包。Web dist 会以只读方式供运行时 `node` 用户访问。容器使用 `DSH_HOME=/home/node/.dsh`，并监听 `0.0.0.0:3080`。运行时 `process.cwd()` 为 `/workspace`；这是默认工作区挂载点，与 `/app` 下的源码和已构建应用分离。

请为 Harness 状态和默认工作区使用持久化存储：

```powershell
docker volume create dsh-home
docker volume create dsh-workspace
docker run --rm --name deepseek-harness `
  -v dsh-home:/home/node/.dsh `
  -v dsh-workspace:/workspace `
  deepseek-harness-local:0.1.0-rc.5
```

仅通过网关可访问的私有 Compose 网络连接此服务。不要将容器端口 `3080` 映射到宿主机，也不要在该私有网络之外暴露它。

AI Workspace 部署提供 `AI_WORKSPACE_MCP_URL=http://harness-gateway:8787/mcp` 和仅限服务器使用的共享 `HARNESS_TOOL_SECRET`。standard preset 仅在该 URL 存在时挂载 Workbench MCP 客户端。网关随后将工具调用转发到 `AI_WORKSPACE_TOOL_URL=http://app:3000/api/harness/tools`；Harness 不会接收 Supabase 凭据或 NAS 存储路径。

部署 patch 仅信任 `agent.mislw.cn`：

```powershell
pnpm dsh web --patch .\deploy\nas\cordis.patch.yml --dump-config
```
