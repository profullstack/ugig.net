# syntax=docker/dockerfile:1
#
# ugig.net on Bun: the dependencies are installed by Bun, Next builds on Bun, and the
# standalone server runs under Bun. Contract with dev2's compose stack is unchanged:
# listens on 8080 inside the container, / answers the deploy health check, secrets
# come from app.env at run time.
#
# The compose file passes NEXT_PUBLIC_* build args; this file (like the Node one
# before it) declares no ARG for them, so they are not baked in here. Unchanged on
# purpose: this commit only swaps the runtime.

FROM oven/bun:1.4.2-slim AS builder
# git: @profullstack/autoblog is a GitHub dependency.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json bun.lock ./
COPY cli/package.json cli/
COPY scripts/postinstall.mjs scripts/postinstall.mjs
RUN bun install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM oven/bun:1.4.2-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
WORKDIR /app
COPY --from=builder --chown=bun:bun /app/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/.next/static ./.next/static
COPY --from=builder --chown=bun:bun /app/public ./public
USER bun
EXPOSE 8080
# 127.0.0.1, not localhost: localhost resolves ::1 first and Next binds IPv4 only.
# /robots.txt is static, so the probe never touches Supabase.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/robots.txt').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "server.js"]
