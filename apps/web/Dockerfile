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
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3100
# If ADMIN_EMAIL and ADMIN_PASSWORD are set (Railway secrets), ensure that control-room admin exists before starting.
CMD ["sh", "-c", "cd apps/web && if [ -n \"$ADMIN_EMAIL\" ] && [ -n \"$ADMIN_PASSWORD\" ]; then npx tsx scripts/create-admin.mts \"$ADMIN_EMAIL\" admin; fi && if [ -n \"$JUDGE_EMAIL\" ] && [ -n \"$JUDGE_PASSWORD\" ]; then ADMIN_PASSWORD=\"$JUDGE_PASSWORD\" npx tsx scripts/create-admin.mts \"$JUDGE_EMAIL\" admin; fi && npx next start --port ${PORT:-3100} --hostname 0.0.0.0"]
