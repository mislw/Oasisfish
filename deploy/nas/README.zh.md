# NAS Harness 镜像

[English](README.md) | 中文

此目录将当前本地 `0.1.0-rc.5` 脏源码快照打包为面向 NAS 的 DeepSeek Harness 镜像。请从仓库根目录构建，使镜像包含当前尚未提交的 Harness 源码，包括 `packages/client/ui-oasis-workflow`。

```powershell
docker build -f .\deploy\nas\Dockerfile -t deepseek-harness-local:0.1.0-rc.5 .
```

镜像使用 `DSH_HOME=/home/node/.dsh`，以 `node` 用户运行，并在容器内监听 `0.0.0.0:3080`。运行时 `process.cwd()` 为 `/workspace`；该目录是默认工作区挂载点，与 `/app` 下已构建的应用分离。

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

部署 patch 仅信任 `agent.mislw.cn`：

```powershell
pnpm dsh web --patch .\deploy\nas\cordis.patch.yml --dump-config
```
