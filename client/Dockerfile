# TECHNOVA POS web front-end + reverse proxy — build from the repository root:
#   docker build -f client/Dockerfile -t technova-web .
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace client --include-workspace-root=false
COPY client client
RUN cd client && npm run build

FROM nginx:1.27-alpine
# OpenSSL creates a temporary self-signed certificate when none is mounted.
# Build with --build-arg SELF_SIGNED=0 when certificates are always mounted (no package download).
ARG SELF_SIGNED=1
RUN if [ "$SELF_SIGNED" = 1 ]; then apk add --no-cache openssl; fi
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/proxy_params.conf /etc/nginx/proxy_params.conf
COPY nginx/security_headers.conf /etc/nginx/security_headers.conf
COPY nginx/technova.conf.template /etc/nginx/templates/technova.conf.template
COPY nginx/00-certs.sh /docker-entrypoint.d/00-certs.sh
COPY --from=build /app/client/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/00-certs.sh && rm -f /etc/nginx/conf.d/default.conf
EXPOSE 80 443
