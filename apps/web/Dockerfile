# Build context: repository root.  Railway: RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile
FROM node:24-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1 NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY apps/brain/package.json apps/brain/
COPY apps/web/package.json apps/web/
RUN npm ci --include=dev --include-workspace-root -w @confam/db -w @confam/web
COPY tsconfig.base.json ./
COPY packages/db packages/db
COPY apps/web apps/web
RUN npm run build -w @confam/web

FROM node:24-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY --from=build /app /app
USER node
EXPOSE 3100
CMD ["sh", "-c", "cd apps/web && npx next start --port ${PORT:-3100} --hostname 0.0.0.0"]
