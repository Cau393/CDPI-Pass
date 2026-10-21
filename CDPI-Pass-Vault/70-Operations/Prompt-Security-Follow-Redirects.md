# Prompt: fix the follow-redirects HIGH CVEs (Security Scans red since 2026-10-21)

Written 2026-10-21, after the PR #23 deploy. Paste everything below the line into a new session.

---

Investigate, then fix, the two HIGH advisories that turned the CI **Security Scans** job red. Keep the change minimal: the lockfile, plus docs. Change no app code, no other dependency and no CI config unless I say so.

## Where to start

- Repo: `/Users/cauecasonato/Envs/CDPI-Pass`. The main checkout is stale (`7778208`) and holds my uncommitted work. **Don't touch its tracked files.** Work in a new worktree.
- Prod branch: `hotfix-frontend-update`, head `49b4239` as of 2026-10-21 18:31Z. Pushing or merging to it deploys to prod. `main` is stale; never push there.
- Sync first: `git fetch origin`, then `gh pr list --repo Cau393/CDPI-Pass --author @me --state merged --limit 5`. If the head is no longer `49b4239`, re-check every fact below.
- Read these memory files first, in `~/.claude/projects/-Users-cauecasonato-Envs-CDPI-Pass/memory/`: `MEMORY.md`, `project-cdpi-pass-hardening.md`, `project-cdpi-pass-deploy-branch.md`, `project-cdpi-pass-local-integration-tests.md`, `project-cdpi-pass-ci-docker-rate-limit.md`, `feedback-document-lessons-in-vault-and-rules.md`, `feedback-staging-only-until-approved.md`.
- Read on the prod branch: `.github/workflows/deploy.yml` (job `security`), `.trivyignore.yaml`, `CDPI-Pass-Vault/70-Operations/Security-Backlog.md` (items #19–#26 and the Resolved section).
- This prompt file is untracked in the main checkout. Copy it into the worktree and commit it with the docs.

## What is known (with proof)

- CI run `39652913452` (the merge of #23): Run Tests passed. Deploy to EC2 passed (`Deploy OK. Live /api/events -> 200`, `cdpi-pass` and `cdpi-pass-email-worker` online). **Security Scans failed** at the step "Dependencies and IaC (trivy)":
  - `frontend/pnpm-lock.yaml`: `follow-redirects` 1.16.0
  - `CVE-2026-111755` (HIGH): information disclosure through improper regex escaping of sensitive headers
  - `CVE-2026-111756` (HIGH): information disclosure through array-formatted headers on cross-origin redirects
  - Both are fixed in 1.16.1.
- #23 did not cause this: the scanner's database gained new advisories. Every push and PR stays red until it's fixed. Deploy is deliberately not gated on `security`, but I merge PRs only on green.
- Dependency path on `49b4239`: `@sendgrid/mail` → `@sendgrid/client@8.1.6` → `axios@1.20.0` → `follow-redirects@1.16.0`. `server/services/emailService.ts` sends all mail through SendGrid, so this sits on the runtime e-mail path, and the request carries the SendGrid API key in a header.
- `frontend/package.json` also has a direct `axios: ^1.16.1`, but no runtime code on `49b4239` imports it. It appears only in `e2e/harness/netcheck.mjs` and in a `vi.mock("axios")` in `server/test/utils/finalizeOrderPaidLikeWebhook.test.ts`, which looks like a leftover from the Make.com post removed in batch 2. Verify this.
- `follow-redirects` 1.16.1 has been the npm `latest` since 2026-10-01, so it clears the 3-day `minimumReleaseAge`. The `trustPolicy: no-downgrade` check has not been run yet.
- The osv-scanner and `pnpm audit --prod` cross-checks write only to the job's step summary, not to the log. Re-run them locally.

## Stage 1: dig deeper (read-only)

1. Create a worktree: `git worktree add .claude/worktrees/sec-follow-redirects -b fix/follow-redirects-cves origin/hotfix-frontend-update`, then `git branch --unset-upstream`. `EnterWorktree` branches from the stale `main`, so don't use it.
2. Reproduce the CI gate locally with the exact pinned versions from `deploy.yml`: trivy 0.75.0, osv-scanner 2.7.0, gitleaks 8.30.1, semgrep 1.180.0. Download them into the session scratchpad and check the SHA256 values from the workflow. Run trivy with the same flags, `--ignorefile .trivyignore.yaml` and the same skip-dirs. Also run osv-scanner on the lockfile and `pnpm audit --prod`. Save every output: this is the "before" proof.
3. Find any other new HIGH/CRITICAL, since the scanner database refreshes daily. If one exists, **stop and report it to me before widening scope.** Fix it in this PR only if it's the same kind of change (a lockfile patch bump, no code) and I say yes.
4. Check reachability of each CVE. Read the GHSA/NVD advisories for the exact conditions. Then read the request code in `@sendgrid/client` 8.1.6 and answer: does it follow redirects (`maxRedirects`)? Which headers does it send, and to which host? Is a cross-origin redirect possible? Write the conclusion down. **A fix exists, so fix it whatever reachability says. No `.trivyignore.yaml` entry.**
5. Check the direct `axios` dependency. Confirm that nothing imports it at runtime (server, shared, client and the built `dist/`). Bring me the evidence and one question: remove it in this PR or not. Default: **leave it** and note it under backlog #22.

## Stage 2: fix (minimal diff)

1. Bump only `follow-redirects` to 1.16.1 in `frontend/pnpm-lock.yaml`, with pnpm only. Try `pnpm update follow-redirects` first. If pnpm will not bump a transitive dependency that way, **ask me before adding an override** (it is permanent config). Don't bump `axios`, `@sendgrid/*` or anything else.
2. `git diff --stat` must show only `frontend/pnpm-lock.yaml`, and inside it only the `follow-redirects` lines (plus docs). Anything else means revert and retry.
3. `pnpm install --frozen-lockfile` must pass the supply-chain policies in `pnpm-workspace.yaml` (`minimumReleaseAge`, `trustPolicy`). EC2 runs the same check on deploy.
4. "After" proof: trivy with the CI flags exits 0. osv-scanner and `pnpm audit --prod` no longer list `follow-redirects`. Save both outputs next to the "before" ones.
5. Gates: record a baseline on `49b4239` first, then rerun on the branch. Use the same scripts: `pnpm run check` (tsc must return 0), `pnpm run test:frontend`, `pnpm run test:backend`, `pnpm run test:integration`. If colima is down, use the local Postgres fallback from the memory file. Counts must match the baseline; the last known count is frontend 442 passed / 4 skipped.
6. Have the `reviewer` subagent (Sonnet) review the diff.

## Stage 3: PR and deploy

- Commit (end the message with the attribution line from the session's system reminder). Push the feature branch: `git push origin fix/follow-redirects-cves`. If the auto-mode classifier refuses, give me the exact `!` command; don't work around it.
- Open a PR with `--base hotfix-frontend-update` and a **short** body: what changed, the before/after scanner result and the gate counts. The repo is public, and the classifier refused a detailed security triage in a PR body before ("Excess Sensitive Detail"). Put the reachability analysis in the vault, not the PR.
- The PR's CI must show Run Tests and Security Scans green and Deploy skipped. A red "Initialize containers" is a Docker/ECR rate limit: run `gh run rerun <id> --failed`.
- **I run the merge (merge = deploy).** Give me the exact command: `! gh pr ready N --repo Cau393/CDPI-Pass && gh pr merge N --repo Cau393/CDPI-Pass --merge --subject "MERGE: … (#N)"`. Ask me for the go and check `TZ=America/Sao_Paulo date` first. The 10-18..21 freeze is over.
- After the merge, watch the run. Proof of done: all three jobs green (**Security Scans green is the point**), `Deploy OK. Live /api/events -> 200`, and both pm2 apps `online`.
- E-mail proof: this touches the SendGrid request path, so after the deploy ask me to trigger one e-mail to my own account (e.g. "Esqueci minha senha") and confirm it arrived. You can't send real mail locally.

## Stage 4: docs

Put docs in the same PR so they don't trigger a second deploy.

- `Security-Backlog.md`: add item **#27** (summary row and section): the finding, the dependency path, the reachability conclusion, the fix, and the date and sha. Then move it to Resolved after the deploy, or mark it resolved in a follow-up docs change.
- `00-Overview/Lessons-Learned.md`: a new advisory on an unchanged lockfile turns Security Scans red on any unrelated merge, so read the trivy table before blaming the PR.
- Fold in the pending deploy notes: pre-freeze deps PR `2db9291`, #22 `139dc3e`, #23 `49b4239`.
- Update the memory files (`project-cdpi-pass-hardening.md`, `MEMORY.md`).

## Out of scope (don't touch)

drizzle 0.45 (#19), xlsx from the CDN (#20), csv-parse 7 (#23), nginx (#24), dev-toolchain advisories (#25), pm2 via pnpm on EC2 (#26), any app code, CI config, and my uncommitted files in the main checkout.

## Standing rules

- No prod DB writes and no runtime scans of prod or staging. Static scans of the repo are fine. Staging writes need my OK.
- pnpm only. Verify any package on the registry before changing it.
- Context budget: hand off at about 120K tokens, using a new prompt in this folder.
