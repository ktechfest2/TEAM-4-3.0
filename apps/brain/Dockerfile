# Build context: repository root.  Railway: RAILWAY_DOCKERFILE_PATH=apps/brain/Dockerfile
FROM node:24-slim
ENV NODE_ENV=production NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY apps/brain/package.json apps/brain/
COPY apps/web/package.json apps/web/
RUN npm ci --include=dev --include-workspace-root -w @confam/db -w @confam/brain
COPY tsconfig.base.json ./
COPY packages/db packages/db
COPY apps/brain apps/brain
USER node
EXPOSE 8787
# Migrations and the idempotent demo seed run on every boot, then the server (HTTP + workers).
CMD ["sh", "-c", "npm run migrate -w @confam/db && npm run seed -w @confam/db && npm start -w @confam/brain"]
