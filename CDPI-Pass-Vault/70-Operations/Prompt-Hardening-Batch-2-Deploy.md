# Prompt: deploy hardening batch 2 (PR #17), then the docs

> **Executed 2026-10-13: batch 2 deployed.** PR #17 merged as `ffdb2c4` at 13:16 BRT on the owner's explicit go (launch day). CI run 38429128533 went green on rerun (attempt 1 hit an unrelated integration deadlock, fixed in the docs PR). EC2 `9e104d9..ffdb2c4`, the worker restarted `online`, `prod-smoke.mjs` clean. The 35 unverified accounts were grandfathered before the merge. Next: `Prompt-Hardening-Batch-3.md`.

How to use it: open a new Claude Code session at `/Users/cauecasonato/Envs/CDPI-Pass` and say: "Read `CDPI-Pass-Vault/70-Operations/Prompt-Hardening-Batch-2-Deploy.md` in the worktree `.claude/worktrees/b2-security`, deploy batch 2 and write its docs."

Written 2026-10-13 ~13:30 BRT. Supersedes `Prompt-Hardening-Batch-2-Resume.md`, which sits next to it and is stale. Neither file is committed: they belong in the post-deploy docs PR.

## Read first
- Memory `project-cdpi-pass-hardening.md`, `project-cdpi-pass-deploy-branch.md` and `reference-cdpi-pass-neon-mcp.md`.
- The PR #17 description: the items, the proof, the gates and the reviewer pass.
- The rules section of `Prompt-Hardening-Batch-2.md` (on branch `docs/hardening-batch1-deployed`, worktree `.claude/worktrees/b1-payments`, until PR #16 merges).

## Where to start
- Worktree `.claude/worktrees/b2-security`, branch `fix/security-batch-2`, tracking `origin/fix/security-batch-2`. Head `22c50a3`, off `9e104d9`.
- Draft **PR #17**, `--base hotfix-frontend-update`: https://github.com/Cau393/CDPI-Pass/pull/17
- Sync first:
  - `git fetch origin`, then `gh pr list --author @me --state all --limit 5`.
  - If `hotfix-frontend-update` moved past `9e104d9`, merge it into the branch, re-run the gates and push.
  - If PR #16 (docs) merged meanwhile, that merge itself triggered a deploy run. Check that it went green.

## Done, with proof (don't redo)
- **C1–C5, e2e and deploy.yml are implemented and pushed.** The proof for each item is in the PR body. The key observations:
  - C5 run alone: 0/10 passed before the change, 10/10 after.
  - The C3 courtesy client test was red with the `onError` line removed and green with it.
- **Gates at head (local):**
  - tsc 0 errors.
  - frontend 389, backend 419, integration 128 (Homebrew Postgres 17, port 55434).
  - e2e local 95 passed / 9 skipped.
- **Reviewer (Sonnet): no blocking findings.**
  - Verified: nginx appends XFF (`infra/nginx/cdpipass.com.br.conf:63`), DNS points straight at EC2, and `ecosystem.config.cjs` sets `NODE_ENV` production for both processes.
  - The worker restart stays fatal under `set -e`. That was a decision: a red run is the signal.
- **Owner decisions, don't re-ask:**
  - The worker restart is in `deploy.yml`.
  - The refund-awaiting-authorization signal goes to the backlog only.
  - EC2 `.env` has `JWT_SECRET` and `QR_CODE_SECRET`.
- **Not done:** deploy, docs, the `COURTESY_WEBHOOK_URL` removal on EC2 (the owner does it), and `Prompt-Hardening-Batch-3.md`.

## Stage 1: deploy (needs a window or the owner's explicit go)
1. Run `TZ=America/Sao_Paulo date`. The windows are 22h–23:59 or 01–05h BRT, or the owner's explicit go for this PR.
2. **Pre-flight**, aggregate only, Neon `br-lucky-rice-acakvihn`, db `neondb`, query from `Prompt-Hardening-Batch-1-Deploy.md`. It passes with fewer than 3 orders in 15 min, 0 pending in 60 min, and the 3 legacy ids present.
   - Ask for the permission prompt while the owner is at the keyboard. In attempt 1 the prompt sat for 11 h and missed the window.
3. **Merge.** The agent cannot merge, so hand the owner this to paste:
   `! gh pr ready 17 --repo Cau393/CDPI-Pass && gh pr merge 17 --repo Cau393/CDPI-Pass --merge --subject "MERGE: security batch 2: no third-party posts, real-IP auth limit, verified e-mail, required secrets, locked courtesy checks (#17)"`
4. **Watch the run:** `gh run list --branch hotfix-frontend-update --limit 1`, then `gh run watch <id> --exit-status`.
   - If "Initialize containers" fails with `toomanyrequests`, rerun the job. That is the registry, not the code.
5. **Deploy log** (`gh run view <id> --log | grep -E 'Smoke test|Deploy OK|LIVE CHECK|cdpi-pass-email-worker|Fast-forward|\.\.'`):
   - EC2 fast-forwards `9e104d9..<merge sha>`;
   - "Smoke test OK" (this also proves C4 booted with the EC2 secrets);
   - "Deploy OK";
   - the worker restart line, with no error after it.
6. **Smoke:** run `node .claude/worktrees/_e2e-reference/sandbox-check/prod-smoke.mjs` from the main checkout root. Expect 6 event pages at 200 with the right CTA, and 409 for the old-shape register.
7. **Revert** only if the site is down or answers 5xx.
8. **Tell the owner:**
   - remove `COURTESY_WEBHOOK_URL` from `~/CDPI-Pass/frontend/.env` on EC2 (no restart needed: the code no longer reads it);
   - the C3 residual from the PR body (the redirect sends no new code; "Reenviar" waits 30 s).

## Stage 2: docs (new branch off the merge sha, e.g. `docs/hardening-batch2-deployed`; a vault-only PR into `hotfix-frontend-update`, whose merge triggers a harmless deploy run)
- `70-Operations/Security-Backlog.md`: move #6, #14, #15 and #16 to Resolved, each with its proof (PR #17, merge sha, CI run id, the test names above).
- **Add a backlog item:** an admin-visible signal for refunds held at `AWAITING_CRITICAL_ACTION_AUTHORIZATION`. The owner decided it is not in batch 2.
- `00-Overview/Lessons-Learned.md`, with a matching rule line in `frontend/.claude/rules/` (see memory `feedback-document-lessons-in-vault-and-rules`):
  1. **Integration fixtures writing timestamps with raw `pg`:** pass `date.toISOString()`, never a `Date`. node-postgres sends a `Date` in the machine's zone, a `timestamp without time zone` column stores that wall time, and Drizzle reads it back as UTC. On a BRT machine a fresh code read as expired (3 h off); CI on UTC never sees it.
  2. **Integration test files run in parallel on one database:** each file needs its own CPF prefix. `888.` collided between `eventOnlineAccess` and `securityBatch2` (`users_cpf_unique`); batch 2 now uses `777.`, and 999/888/111/123/222 are taken.
  3. **A race test can pass by luck in a full run:** run it alone in a loop before and after the fix. C5 passed in the full file on unfixed code, but failed 10/10 when run alone.
  4. **Removing an outbound call breaks any e2e test that asserted the guard blocked it.** Rewrite it as "no outbound call", and wait for a later log marker before asserting absence.
- Update memory `project-cdpi-pass-hardening.md` with the batch-2 deployed state.
- Write `70-Operations/Prompt-Hardening-Batch-3.md`, from the plan section "Batch 3" (`~/.claude/plans/pasted-content-id-a811-read-cdpi-pass-v-twinkly-ladybug.md`):
  - security assessment against OWASP WSTG / Top 10 / ASVS L1;
  - active scans (ZAP, nuclei) only on a local prod build and staging;
  - prod passive only, at a quiet hour, after the owner's go;
  - a permanent CI security job;
  - the owner runs Prowler (never the local root AWS key).
- Delete the two uncommitted batch-2 prompt files from the worktree, or commit them in the docs PR.

## Rules
- No prod writes and no real charges without the owner's go for that exact action. Prod reads are aggregates or schema only, never PII.
- Never push to `hotfix-frontend-update` or `main`.
- Every subagent declares its model.
- Soft context limit ~120K. Deploy and docs fit in one session; the Batch-3 execution does not.
