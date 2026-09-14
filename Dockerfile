FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run typecheck:libs
RUN PORT=3000 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/content-desk run build
RUN pnpm --filter @workspace/api-server run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000

# The bundled server (esbuild, bundle:true) is self-contained except for
# pino's worker-thread transport files, which it loads dynamically from
# alongside index.mjs at runtime -- copy the whole dist dir, not one file.
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build /app/artifacts/content-desk/dist/public ./artifacts/content-desk/dist/public

EXPOSE 10000
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
