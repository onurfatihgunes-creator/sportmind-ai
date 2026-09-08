# The SportMind service image — the one thing Vera/OnurAI is allowed to
# talk to for match analysis (see src/service/server.ts's own comment).
#
# This builds ONLY the service boundary, not the ingestion pipeline
# (src/index.ts, the fetch*/compute* scripts). Those run on their own
# GitHub Actions schedule outside this container and share the same
# Supabase project; they are a separate concern from serving
# GET /analysis to a caller.
#
# Runs with tsx, same as `npm run serve` locally — this repo has no build
# step today (see package.json), and adding one just for the container
# would be a second, divergent way of running the same source.
#
# 22, not 20: @supabase/supabase-js's realtime client requires the native
# `WebSocket` global (Node 22+) to even construct the client — on 20 it
# throws at import time, before the HTTP server ever binds. Found running
# this image for real; supabase-js's own deprecation warning already named
# 22 as the fix.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependency layer first so `docker build` doesn't reinstall on every
# source change.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY tsconfig.json ./

# Not root. Nothing in this service needs to write to the filesystem or
# bind a privileged port.
RUN addgroup -S sportmind && adduser -S sportmind -G sportmind
USER sportmind

EXPOSE 8787

# Proves the process is up and answering HTTP — matches /healthz, which
# deliberately never touches Supabase. wget is already in node:alpine.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8787}/healthz" || exit 1

CMD ["npx", "tsx", "src/service/server.ts"]
