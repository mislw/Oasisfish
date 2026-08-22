FROM node:22.19-bookworm-slim

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
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
