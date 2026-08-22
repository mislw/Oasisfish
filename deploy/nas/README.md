# NAS Harness Image

This directory packages the current local `0.1.0-rc.5` dirty source snapshot as a NAS-targeted DeepSeek Harness image. Build it from the repository root so the image includes the current uncommitted Harness source, including `packages/client/ui-oasis-workflow`.

```powershell
docker build -f .\deploy\nas\Dockerfile -t deepseek-harness-local:0.1.0-rc.5 .
```

The image uses `DSH_HOME=/home/node/.dsh`, runs as the `node` user, and listens inside the container on `0.0.0.0:3080`.

Use persistent storage for Harness state:

```powershell
docker volume create dsh-home
docker run --rm --name deepseek-harness `
  -v dsh-home:/home/node/.dsh `
  deepseek-harness-local:0.1.0-rc.5
```

Only connect this service to the gateway from a private network segment. Do not publish port `3080` to the public internet; if host access is required, bind it only to a private interface or keep it behind the private gateway.

The deployment patch trusts only `agent.mislw.cn`:

```powershell
pnpm dsh web --patch .\deploy\nas\cordis.patch.yml --dump-config
```
