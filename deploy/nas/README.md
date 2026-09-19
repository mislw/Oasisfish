# NAS Harness Image

English | [中文](README.zh.md)

This directory packages the current local `0.1.0-rc.5` dirty source snapshot as a NAS-targeted DeepSeek Harness image. Build it from the repository root so the image includes the current uncommitted Harness source, including `packages/client/ui-oasis-workflow`.

```powershell
docker build -f .\deploy\nas\Dockerfile -t deepseek-harness-local:0.1.0-rc.5 .
```

The image builds the source workspace and verifies a production CLI deploy under `/opt/dsh`. Runtime starts the built workspace CLI at `/app/apps/cli/lib/bin.js` because the current legacy `pnpm deploy` output prunes workspace peer packages that profile plugins load dynamically. The Web dist is made read-only-accessible to the runtime `node` user. The container uses `DSH_HOME=/home/node/.dsh` and listens on `0.0.0.0:3080`. Runtime `process.cwd()` is `/workspace`, which is the default workspace mount point and is separate from the source and built application under `/app`.

Use persistent storage for Harness state and the default workspace:

```powershell
docker volume create dsh-home
docker volume create dsh-workspace
docker run --rm --name deepseek-harness `
  -v dsh-home:/home/node/.dsh `
  -v dsh-workspace:/workspace `
  deepseek-harness-local:0.1.0-rc.5
```

Connect this service only through a private Compose network that the gateway can reach. Do not map container port `3080` to the host or expose it outside that private network.

The AI Workspace deployment supplies `AI_WORKSPACE_MCP_URL=http://harness-gateway:8787/mcp` and the shared server-only `HARNESS_TOOL_SECRET`. The standard preset mounts the Workbench MCP client only when that URL is present. The gateway then forwards tool calls to `AI_WORKSPACE_TOOL_URL=http://app:3000/api/harness/tools`; Harness receives neither Supabase credentials nor NAS storage paths.

The deployment patch trusts only `agent.mislw.cn`:

```powershell
pnpm dsh web --patch .\deploy\nas\cordis.patch.yml --dump-config
```
