# Contexto de build: a raiz do repositório (a API usa ../shared e ../db).
FROM node:22-alpine AS build
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY shared /app/shared
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app/api
ENV NODE_ENV=production PORT=3001 MIGRATIONS_DIR=/app/db/migrations
COPY --from=build /app/api/node_modules ./node_modules
COPY --from=build /app/api/dist ./dist
COPY api/package.json ./
COPY api/scripts ./scripts
COPY db /app/db
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1
CMD ["node", "dist/api/src/main.js"]
