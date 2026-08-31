FROM node:22.22.0-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22.22.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PI_TELEMETRY=0

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm install --global --no-fund --no-update-notifier @earendil-works/pi-coding-agent@0.84.4 \
    && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server.mjs ./
COPY server ./server
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 5173

ENTRYPOINT ["docker-entrypoint.sh"]
