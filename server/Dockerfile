# syntax=docker/dockerfile:1.6

# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Copy root manifests and the two workspaces we need
COPY package.json package-lock.json* tsconfig.base.json ./
COPY shared ./shared
COPY server ./server

# Install all workspace deps via npm workspaces, then build
RUN npm install --workspaces --include-workspace-root --no-audit --no-fund
RUN npm run build:shared
RUN npm run build:server

# ---- runtime stage ----
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=2567

# Copy compiled output + workspace manifests so npm can resolve @blackout/shared
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist

# Production deps only, with workspaces respected so @blackout/shared symlinks correctly
RUN npm install --workspaces --include-workspace-root --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force

# Drop privileges
USER node

EXPOSE 2567

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["node", "server/dist/index.js"]
