# Build with:  docker build -f frontend/Dockerfile -t cdpi-pass .
# Context is the REPO ROOT (needs frontend/ and ecosystem.config.cjs).

# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

# corepack ships with Node 22 and pins the exact pnpm version from
# package.json's "packageManager" field, so CI, Docker and laptops all use the
# same package manager build.
RUN corepack enable

# Copy only manifest + lockfile first so dependency installs stay cached when
# application source changes. pnpm-workspace.yaml carries the allowBuilds
# allowlist and must be present, or install-time scripts get skipped and the
# native modules (bcrypt, esbuild) silently fail to build.
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./

# --frozen-lockfile fails the build if the lockfile and package.json disagree,
# which is what makes the dependency set reproducible instead of drifting.
RUN pnpm install --frozen-lockfile

COPY frontend/ .
RUN NODE_OPTIONS="--max-old-space-size=3072" pnpm run build

# NOTE: dev dependencies are deliberately NOT pruned.
#
# `server/vite.ts` imports `vite` at module top level, and `server/index.ts`
# imports `log` from that same module, so the production bundle resolves `vite`
# at startup even though it only calls `serveStatic`. Running
# `pnpm prune --prod` here produces an image that builds fine and then crashes
# at runtime with ERR_MODULE_NOT_FOUND: Cannot find package 'vite'.
#
# To prune safely, first move `log`/`serveStatic` into a vite-free module (e.g.
# server/log.ts) so nothing in the production path imports vite.

# Stage 2: Runtime
FROM node:22-alpine
WORKDIR /app
RUN corepack enable && npm install -g pm2

# pnpm's node_modules is a tree of symlinks into .pnpm/. Copying just
# node_modules would leave dangling links, so .pnpm must come along with it.
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY ecosystem.config.cjs ./

EXPOSE 5003
CMD ["pm2-runtime", "ecosystem.config.cjs"]
