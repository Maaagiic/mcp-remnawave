# Build stage: compile TypeScript, then keep only runtime dependencies.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Runtime stage. This is a stdio MCP server: the client starts one container
# per session and talks to it over stdin/stdout, no port is exposed.
#   docker run -i --rm --env-file .env remnawave-mcp
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
ENTRYPOINT ["node", "dist/index.js"]
