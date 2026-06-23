# syntax=docker/dockerfile:1.7

# @group Dependencies : Install reproducible build dependencies for server and client
FROM node:22.16.0-bookworm-slim AS dependencies

WORKDIR /app

ENV npm_config_update_notifier=false
ENV npm_config_fund=false
ENV npm_config_legacy_peer_deps=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
  && npm rebuild better-sqlite3

COPY src/client/package.json src/client/package-lock.json ./src/client/
RUN cd src/client && npm ci

# @group Build : Compile the TypeScript server, CLI files, and React client
FROM dependencies AS build

COPY tsconfig.json tsconfig.bin.json ./
COPY bin ./bin
COPY scripts ./scripts
COPY src ./src

RUN npm run build
RUN npm prune --omit=dev --ignore-scripts \
  && rm -rf src/client/node_modules

# @group Runtime : Run the compiled app with only production dependencies
FROM node:22.16.0-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3101
ENV PM2_HOME=/app/.pm2

RUN groupadd --system --gid 1001 ezpm2gui \
  && useradd --system --uid 1001 --gid ezpm2gui --home-dir /app --shell /usr/sbin/nologin ezpm2gui

COPY --from=build --chown=ezpm2gui:ezpm2gui /app/package.json /app/package-lock.json ./
COPY --from=build --chown=ezpm2gui:ezpm2gui /app/node_modules ./node_modules
COPY --from=build --chown=ezpm2gui:ezpm2gui /app/dist ./dist
COPY --from=build --chown=ezpm2gui:ezpm2gui /app/bin ./bin
COPY --from=build --chown=ezpm2gui:ezpm2gui /app/src/client/build ./src/client/build

RUN mkdir -p /app/.pm2 /app/dist/server/config /app/uploads \
  && chown -R ezpm2gui:ezpm2gui /app

USER ezpm2gui

EXPOSE 3101

VOLUME ["/app/.pm2", "/app/dist/server/config", "/app/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const http=require('http');const port=process.env.PORT||3101;const req=http.get({host:'127.0.0.1',port,path:'/'},res=>process.exit(res.statusCode<500?0:1));req.on('error',()=>process.exit(1));req.setTimeout(4000,()=>req.destroy());"

CMD ["node", "dist/server/index.js"]
