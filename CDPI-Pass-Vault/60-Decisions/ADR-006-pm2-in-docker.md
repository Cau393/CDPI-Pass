# ADR-006: PM2 inside Docker on a single EC2 instance

- **Date**: recorded 2026-09-01 (decision predates)
- **Status**: accepted

## Context
Two long-running processes (API server + email worker) need supervision, restarts and memory caps, on one EC2 box, with minimal ops overhead.

## Decision
One Docker image runs `pm2-runtime ecosystem.config.cjs` managing both apps (`cdpi-pass-server`, `cdpi-pass-email-worker`). Port 5003 exposed; TLS terminated upstream (`trust proxy` enabled).

## Alternatives considered
- Two containers + docker-compose/ECS: cleaner isolation but more moving parts than needed today.
- systemd on the host: loses the reproducible image.

## Consequences
- Single artifact to build/ship; `max_memory_restart: 1G` guards the server.
- Worker and server share one image/deploy: restarting the container restarts both.
- Watch out: `ecosystem.config.js` is a stale duplicate; only `ecosystem.config.cjs` is used.
