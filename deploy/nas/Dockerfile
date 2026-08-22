FROM node:22.19-bookworm-slim

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

ENV DSH_HOME=/home/node/.dsh
WORKDIR /workspace

COPY --chown=node:node . .
RUN mkdir -p /home/node/.dsh /workspace \
  && chown -R node:node /home/node/.dsh /workspace

USER node
RUN pnpm install --frozen-lockfile
RUN pnpm run build

ENV NODE_ENV=production

EXPOSE 3080

CMD ["pnpm", "dsh", "web", "--patch", "/workspace/deploy/nas/cordis.patch.yml"]
