# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --ignore-scripts
COPY . .

FROM base AS client-build
# VITE_API_URL is baked into the bundle at build time; leave it empty (origin-relative) behind Caddy.
# AUTH_MODE is baked too: production compose forces password auth on the server, so the client
# must render the password login (register/sign-in) instead of the dev "Vào kingdom" form.
ARG VITE_API_URL=""
ARG VITE_AUTH_MODE="password"
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_AUTH_MODE=$VITE_AUTH_MODE
RUN npm run build -w @kingdoms/shared && npm run build -w @kingdoms/client

FROM client-build AS client
RUN mkdir -p /srv/client && cp -r apps/client/dist-web/. /srv/client/

FROM base AS server-build
RUN npm run build -w @kingdoms/shared && npm run build -w @kingdoms/server

FROM node:22-alpine AS server
WORKDIR /app
ENV NODE_ENV=production
COPY --from=server-build /app/package.json package.json
COPY --from=server-build /app/node_modules node_modules
COPY --from=server-build /app/apps/server apps/server
COPY --from=server-build /app/apps/client apps/client
COPY --from=server-build /app/packages packages
COPY --from=server-build /app/infra/migrations infra/migrations
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]