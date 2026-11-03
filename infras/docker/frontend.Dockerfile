# Frontend image, Next.js standalone output: docs/ops/deployment.md
FROM node:26-slim AS deps
ENV PNPM_HOME=/pnpm \
    PATH="/pnpm:$PATH"
RUN npm install -g pnpm@11.17.0
WORKDIR /srv/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:26-slim AS build
ENV PNPM_HOME=/pnpm \
    PATH="/pnpm:$PATH" \
    NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@11.17.0
WORKDIR /srv/frontend
COPY --from=deps /srv/frontend/node_modules node_modules
COPY frontend/ ./
RUN pnpm build

FROM node:26-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
WORKDIR /srv/frontend
# Standalone output carries only the server and the modules it actually uses.
COPY --from=build /srv/frontend/.next/standalone ./
COPY --from=build /srv/frontend/.next/static .next/static
COPY --from=build /srv/frontend/public public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
