FROM node:22.19-bookworm-slim

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

ENV DSH_HOME=/home/node/.dsh
ENV DSH_CWD=/workspace
WORKDIR /app

COPY --chown=node:node . .
RUN mkdir -p /home/node/.dsh /workspace \
  && chown -R node:node /home/node/.dsh /workspace

USER node
RUN pnpm install --frozen-lockfile
RUN pnpm run build

ENV NODE_ENV=production

EXPOSE 3080

HEALTHCHECK CMD ["node", "-e", "fetch('http://127.0.0.1:3080').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["pnpm", "dsh", "web", "--patch", "/app/deploy/nas/cordis.patch.yml"]
