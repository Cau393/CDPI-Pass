# Deployment (EC2 + Docker + PM2)

Prod: **https://cdpipass.com.br** on an AWS EC2 instance.

## Build & runtime
- No Docker image. The old `frontend/Dockerfile` was never built for production and was deleted on 2026-10-13 (Security-Backlog #21). Production is a git checkout on EC2: `pnpm install --frozen-lockfile`, `pnpm run build`, PM2 (see `.github/workflows/deploy.yml`).
- `npm run build` = `tsup` (server → `dist/index.js`, worker → `dist/run-email-worker.js`) + `vite build` (SPA → `dist/`).
- Express serves the built SPA in production (single origin, no separate static host).

## PM2 processes (`ecosystem.config.cjs`)
| App | Script | Notes |
|---|---|---|
| `cdpi-pass-server` | `./dist/index.js` | API + SPA + WebSocket, 1 instance, `max_memory_restart: 1G` |
| `cdpi-pass-email-worker` | `./dist/run-email-worker.js` | Queue consumer, 1 instance |

Both run `NODE_ENV=production`. Note: `ecosystem.config.js` (non-cjs) is a stale duplicate; the `.cjs` one is the PM2 config.

## Port
App listens on **5003** (env `PORT`). Fronted by whatever proxy/ALB terminates TLS for cdpipass.com.br (`app.set('trust proxy', true)`).

## Deploy flow (current, CI)
`.github/workflows/deploy.yml` runs `pnpm run check` + `pnpm run test` and then deploys via git + PM2 **on every push to `hotfix-frontend-update`**. That branch is the production branch; `main` is stale (100+ commits behind as of 2026-09-02).

**Rules that follow from this**
- **`hotfix-frontend-update` is the only branch that triggers CI/CD.** This is codified in `.claude/rules/deployment.md` (always-applied rule). To deploy: commit and `git push origin hotfix-frontend-update` (or `git push origin HEAD` if on that branch). Never push `main` or feature branches to trigger a deploy.
- Never push directly to `hotfix-frontend-update`; branch off it and merge through a PR whose base is `hotfix-frontend-update`.
- Merging the PR *is* the deploy. Apply pending `sql/` files first ([[40-Database/Migration-Workflow]]).
- `frontend/dist/` is not tracked (ignored via `frontend/dist/` in the root `.gitignore`): the box builds it in place on every deploy. The deploy snapshots the live `dist` to `~/dist-rollback-$TS`, pulls, then copies the snapshot back so the app keeps serving the live build until the new one replaces it. It still runs `git checkout -- frontend/dist` (tolerant, a no-op now) for the first deploy after untracking. See [[70-Operations/Security-Backlog#27. `follow-redirects` 1.16.0: credential headers on cross-origin redirects (CVE-2026-111755, CVE-2026-111756, HIGH)|backlog #27]].
- After pushing, verify with `gh run list --branch hotfix-frontend-update --limit 1`.

Verify after deploy: `/api/events` responds, PM2 logs of `cdpi-pass-server` and `cdpi-pass-email-worker` are clean, and the page/e-mail touched by the change behaves on a phone.

## Related
- [[50-Infrastructure/AWS-Services]]
- [[50-Infrastructure/Environment-Variables]]
