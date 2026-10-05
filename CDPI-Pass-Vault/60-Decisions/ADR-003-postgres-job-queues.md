# ADR-003: Postgres tables as job queues (no Redis/Celery)

- **Date**: recorded 2026-09-01 (decision predates)
- **Status**: accepted

## Context
`.env` contains `REDIS_URL` / `CELERY_*` from an earlier plan, but the Node app never adopted them. Async work (emails, mass sends, reminders, communicates, badge prints) needs queuing with retries and visibility.

## Decision
Every queue is a Postgres table (`email_queue`, `mass_send_jobs`, `reminder_jobs`, `communicate_jobs`, `print_jobs`) with `status pending|processing|completed|failed` + `attempts`. Consumers: the dedicated email worker process (20s poll, 5 concurrent) and the WebSocket print coordinator.

## Alternatives considered
- Redis + BullMQ / Celery: extra infrastructure to run and monitor on a single EC2 box; DB queues are transactional with the domain data and inspectable via SQL.

## Consequences
- Zero extra infra; job state joins naturally with domain tables (e.g. print history per event).
- Polling latency (up to 20s for email) is acceptable for this product.
- If volume grows, revisit with LISTEN/NOTIFY or a real queue. Keep the status enum convention if so.
