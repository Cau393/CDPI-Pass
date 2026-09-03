#!/usr/bin/env bash
set -euo pipefail

#
# Run the integration tests against a throwaway PostgreSQL.
#
# If VERIFY_DATABASE_URL is already set (e.g. CI service container),
# just run the tests directly. Otherwise, spin up a Docker container,
# push the Drizzle schema, run the suite, and tear down on exit.
#
# Usage:
#   ./scripts/run-integration-tests.sh
#   pnpm run test:integration
#

# If VERIFY_DATABASE_URL is already set, use it directly (CI path).
if [ -n "${VERIFY_DATABASE_URL:-}" ]; then
  echo "VERIFY_DATABASE_URL is set — running integration tests directly."
  npx vitest run --config vitest.server.config.ts server/test/integration
  exit $?
fi

# Local path: manage a Docker container lifecycle.
CONTAINER_NAME="cdpi-verify"
DB_NAME="cdpi"
DB_USER="postgres"
DB_PASS="verify"
DB_PORT="55433"
VERIFY_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${DB_NAME}"

cleanup() {
  if [ -n "${CONTAINER_ID:-}" ]; then
    echo "Stopping container ${CONTAINER_NAME}..."
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

# Check Docker is available
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running. Start Colima or Docker Desktop first." >&2
  exit 1
fi

# Remove any stale container from a previous aborted run
docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

echo "Starting throwaway PostgreSQL (${DB_PORT})..."
CONTAINER_ID=$(docker run -d --name "${CONTAINER_NAME}" \
  -e POSTGRES_PASSWORD="${DB_PASS}" \
  -e POSTGRES_DB="${DB_NAME}" \
  -p "${DB_PORT}:5432" \
  postgres:16-alpine)

# Wait for Postgres to accept connections
echo "Waiting for Postgres to be ready..."
for i in $(seq 1 30); do
  if docker exec "${CONTAINER_NAME}" pg_isready -U "${DB_USER}" >/dev/null 2>&1; then
    echo "Postgres is ready."
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Postgres did not become ready in 30s." >&2
    exit 1
  fi
done

echo "Pushing Drizzle schema to throwaway DB..."
DATABASE_URL="${VERIFY_URL}" pnpm run db:push

echo "Running integration tests..."
VERIFY_DATABASE_URL="${VERIFY_URL}" npx vitest run --config vitest.server.config.ts server/test/integration
