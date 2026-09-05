FROM node:22.22.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm/bin:$PATH

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN pnpm run build:server

FROM node:22.22.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PI_TELEMETRY=0 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm/bin:$PATH

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile \
    && pnpm add --global @earendil-works/pi-coding-agent@0.84.4

COPY --from=build /app/dist ./dist
COPY server.mjs ./
COPY server ./server
COPY shared ./shared
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 5173

ENTRYPOINT ["docker-entrypoint.sh"]
