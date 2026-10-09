# e2e (Playwright)

Real-browser suite for the ADR-016 registration flows: 4-field signup, e-mail verification, free / paid
events (online and presencial), BR and foreigner checkout, the form builder, the Excel export, courtesy
redemption and the profile page. Every test runs at 360, 390 and 1280 px, asserts no horizontal scroll
(`scrollWidth <= innerWidth`) and fails on any uncaught `pageerror`.

```bash
cd frontend
pnpm run test:e2e                      # local mode (default)
pnpm run test:e2e -- --project=w390    # one viewport (w360 | w390 | w1280 | guard)
pnpm run test:e2e -- admin             # one file
```

Playwright's `webServer` starts two processes: a fake Asaas/S3 (`harness/fake-asaas.ts`, port 5058) and
the app (`harness/serve.ts`, port 5057). Never use 5060 (Chromium blocks it).

## Modes

`E2E_MODE=local` (default): Postgres 17 at `localhost:55434` (user `postgres`, trust auth). The database
`c3_e2e` (override: `E2E_DB_NAME`, must start with `c3_`) is dropped, recreated and `db:push`ed on every run.

`E2E_MODE=staging`: uses `E2E_DATABASE_URL` (never printed). `harness/config.ts` parses the host and refuses
to run unless it contains `ep-summer-sun-acft18c1` (staging), and always refuses `ep-curly-star-ac4ugpbh`
(prod). The schema is not pushed and nothing is dropped. Every event title and user name is prefixed
`[REHEARSAL]`; every created event id and e-mail is recorded in `e2e/.state/` and the global teardown deletes
exactly those rows. The guard is dry-run tested by `tests/guard.spec.ts` (project `guard`, no connection).

```bash
E2E_MODE=staging E2E_DATABASE_URL='postgresql://...ep-summer-sun-acft18c1...' pnpm run test:e2e
```

## No outside traffic

The server runs with dummy secrets and `--import harness/register.mjs`, which swaps the Neon driver for
node-postgres and rejects every request to a host other than localhost. `ASAAS_API_URL` and
`AWS_ENDPOINT_URL` point at the fake. In the fake, a foreign customer whose e-mail starts with `blocked.`
gets Asaas' "foreign payers not enabled" error, which drives the 503 test.

## Browser

By default `/Applications/Chromium.app` is used when present (`E2E_CHROMIUM_PATH` overrides). Elsewhere
(CI): `pnpm exec playwright install chromium` and leave `E2E_CHROMIUM_PATH` unset.

## Layout

- `fixtures/prod-events.json`: the three live prod events (online free, presencial free, presencial paid);
  extend `registrationForm` there to add questions to every flow.
- `support/`: DB helpers (`createEvent`, `createAccount`), UI flows, the `test` fixture (unique
  `X-Forwarded-For` per test so the 100/15min auth rate limit is not shared, pageerror guard).
- `tests/legacy-questions.spec.ts`: skipped group `legacy questions (pending C1)`.
