FROM node:22.19-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    g++ \
    git \
    make \
    python3 \
  && rm -rf /var/lib/apt/lists/*

ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN corepack enable \
  && corepack prepare pnpm@11.7.0 --activate \
  && pnpm config set registry "${NPM_REGISTRY}" \
  && pnpm config set fetch-retries 5 \
  && pnpm config set fetch-retry-mintimeout 20000 \
  && pnpm config set fetch-retry-maxtimeout 120000 \
  && pnpm config set fetch-timeout 300000

WORKDIR /app

COPY . .
RUN test -f apps/web/tests/scaffold.ts \
  && test -f apps/web/tests/support.ts
RUN --mount=type=cache,id=deepseek-harness-pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile
RUN pnpm run build
RUN mkdir -p /home/node/.dsh /workspace \
  && chown -R node:node /home/node/.dsh /workspace

ENV DSH_HOME=/home/node/.dsh
ENV NODE_ENV=production

USER node
WORKDIR /workspace

EXPOSE 3080

HEALTHCHECK CMD ["node", "-e", "fetch('http://127.0.0.1:3080').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "/app/apps/cli/lib/bin.js", "web", "--patch", "/app/deploy/nas/cordis.patch.yml"]
