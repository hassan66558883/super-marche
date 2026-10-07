# TECHNOVA POS API — build from the repository root:
#   docker build -f server/Dockerfile -t technova-api .
# NODE_IMAGE may point at a mirror or at node:22-bookworm (which already ships OpenSSL).
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Prisma's query engine needs OpenSSL
RUN command -v openssl >/dev/null || (apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*)
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --include-workspace-root=false
COPY server server
RUN cd server && npx prisma generate && npm run build
# Keep only runtime dependencies (prisma CLI stays: it applies migrations at start-up)
RUN npm prune --omit=dev --workspace server --include-workspace-root=false && mkdir -p server/node_modules \
 && cd server && npx prisma generate

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production TZ=Africa/Ndjamena
RUN command -v openssl >/dev/null || (apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*)
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/node_modules ./server/node_modules
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/server/prisma ./server/prisma
COPY --from=build --chown=node:node /app/server/assets ./server/assets
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --chown=node:node server/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
WORKDIR /app/server
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Run with an init process (compose: init: true) so signals reach Node and zombies are reaped
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
