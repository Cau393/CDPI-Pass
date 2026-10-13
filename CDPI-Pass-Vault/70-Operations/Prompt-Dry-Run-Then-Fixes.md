# Prompt: pre-freeze deps PR deploy, then the QR/printer dry run, then the post-event fixes

How to use it: open a new Claude Code session at `/Users/cauecasonato/Envs/CDPI-Pass` and say: "Read `CDPI-Pass-Vault/70-Operations/Prompt-Dry-Run-Then-Fixes.md` on branch `fix/pre-freeze-deps` (worktree `.claude/worktrees/b3-prefreeze`) and continue."

Written 2026-10-13 ~19:45 BRT, updated ~20:40 BRT at the end of the dry-run/fixes session.

## Read first
- Memory `project-cdpi-pass-hardening.md` (last paragraphs, "State 2026-10-13 ~20:10" and "~20:40"), `project-cdpi-pass-deploy-branch.md`, `reference-cdpi-pass-neon-mcp.md`, `project-cdpi-pass-local-integration-tests.md`, `feedback-staging-only-until-approved.md`.
- [[70-Operations/Security-Backlog]] #18–#26 and [[20-Backend/Print-Coordinator]] (the "Printing is off per event" section).
- The report doc: https://claude.ai/code/artifact/7eaacbac-16d6-4a9c-8f0f-f5bfe0378a36.

## Where things stand
- Prod runs `f9ea167` (PRs #19 + #20, deployed 2026-10-13 19:33 BRT).
- **Branch `fix/pre-freeze-deps`** (worktree `.claude/worktrees/b3-prefreeze`, off `f9ea167`, no upstream) holds the pre-freeze fixes and these docs. Check `gh pr list --head fix/pre-freeze-deps` for its PR number. Commits:
  1. pnpm supply-chain policies in `frontend/pnpm-workspace.yaml`: `minimumReleaseAge: 4320`, `trustPolicy: no-downgrade`, `trustPolicyIgnoreAfter: 43200`. pnpm 11 checks these on frozen installs too; the lockfile passes (993 entries).
  2. `multer` 2.4.0, express 4.22.3 → `qs` 6.16.0 (via body-parser 1.20.8) + `path-to-regexp` 0.1.13, `ip-address` 10.7.3 (#23).
  3. `frontend/Dockerfile` + `.dockerignore` deleted, DS-0002 ignore and semgrep exclude removed (#21, owner OK'd).
  4. Build-only tools → devDependencies, `sequelize-cli` dropped, `braces` ignore removed (#22). Server bundles byte-identical.
  5. Docs: backlog #18/#21/#22/#23 statuses, new #25 (dev-only toolchain advisories) and #26 (pm2 via npm on EC2), Deployment.md, Print-Coordinator.md, Lessons-Learned, this prompt.
- Gates on the branch: tsc 0 / fe 389 / be 419 / int 129 (4 skip) / e2e (see memory for the count). Sonnet reviewer: no blocking findings. `pnpm audit --prod`: 7 moderate → 1 (`csv-parse`); HIGHs left are drizzle-orm and xlsx x2 (accepted).
- **Stage 1 (dry run) was postponed by the owner on 2026-10-13** ("I can't test it today"). It now runs after this PR deploys, so it covers it.

## Owner decisions (do not re-ask)
- The owner runs the dry run: scan the ticket with the QR reader, print one label. The agent only prepares and verifies.
- Test ticket path (chosen 2026-10-13): turn on printing for the 10-20 event, create a **new courtesy link with 1 ticket**, redeem it with the owner's own data, scan + print, owner cancels the order, then the agent fixes the two counters with a prod SQL that gets **its own go**.
- `frontend/Dockerfile`: delete (done in the branch). pm2 on EC2 was installed with `npm install -g pm2`; move it to pnpm **after 2026-10-21** (backlog #26).
- **No deploys and no scans of prod or staging from 2026-10-18 to 2026-10-21.** The only exception is a fix for check-in or printing.
- Merging deploys, so merge at 22h–23:59 or 01–05h BRT, or on the owner's explicit go. The owner runs the merge: `! gh pr ready N --repo Cau393/CDPI-Pass && gh pr merge N --repo Cau393/CDPI-Pass --merge --subject "MERGE: … (#N)"`.

## Next steps
1. Sync: `git fetch`, `gh pr list --author @me --state all --limit 5`, confirm prod is still `f9ea167` (or the merge sha if the PR landed).
2. If the PR is not open: push is done; the owner opens it (the classifier refused `gh pr create` before) with base `hotfix-frontend-update`. Wait for its CI (Run Tests + Security Scans green, Deploy skipped).
3. Merge window 22h on 10-14..10-17 (owner runs it). After the deploy: CI green, "Deploy OK. Live /api/events -> 200", worker `online`, `prod-smoke.mjs` (in `.claude/worktrees/_e2e-reference/sandbox-check/`) clean.
4. **Dry run, by 10-17 at the latest.** Facts (verified 2026-10-13 against `f9ea167` code and prod aggregates):
   - 10-20 event `168193f7-1aa2-45d6-b6e8-ba0ea355efaa` "Workshop - Peptídeos: Biológicos e Sintéticos": free, `sales_closed=true`, `current_attendees` 197 (185 courtesy + 12 free), `courtesy_limit` 220, 6 active links / 33 tickets left. **Printing OFF** (no `event_print_settings` row). `print_jobs` 0 rows for any event, ever.
   - Free subscribe answers 409 (`sales_closed`); courtesy redeem ignores `sales_closed` (`routes.ts` `/api/courtesy/redeem`, needs login + verified e-mail, duplicate check by attendee CPF).
   - Check-in: admin QR scanner page → `POST /api/verify-ticket` (admin JWT) → `qr_code_used`, `amnt_used+1`, then `enqueueEventPrintIfEnabled` → `print_jobs` row → WebSocket `/api/ws/print?token=<admin JWT>&eventId=` → `/admin/print-terminal` (Chrome, WebUSB Zebra).
   - Owner steps: (0) edit event → switch on "Impressão no credenciamento"; (1) Cortesias → new link, 1 ticket, no override price; (2) redeem it with own data; (3) print terminal open in Chrome on the Zebra machine, event selected; (4) scan the e-mailed QR, one label prints.
   - Agent: before and after, read-only aggregates only (print setting on, 1 new courtesy order with QR, `current_attendees` 198, e-mail left the queue, 1 `print_jobs` row `completed`). Never select PII.
   - If check-in or printing fails: exact error/screenshot, systematic-debugging, red test, fix; that fix may deploy inside the freeze.
   - Undo, with the owner's go: owner cancels the order in the admin (clears QR, deletes S3 file, sends a cancellation e-mail). Cancel does **not** give back `events.current_attendees` or `courtesy_links.used_count` (the courtesy cap counts paid orders, so it self-heals). Show the owner this exact statement for a separate go, then run it on `br-lucky-rice-acakvihn`:
     ```sql
     BEGIN;
     UPDATE events SET current_attendees = current_attendees - 1 WHERE id = '168193f7-1aa2-45d6-b6e8-ba0ea355efaa';
     UPDATE courtesy_links SET used_count = used_count - 1, is_active = false, updated_at = now() WHERE id = '<test link id>' AND used_count = 1;
     COMMIT;
     ```
     Look up the test link id by `event_id`, `ticket_count = 1` and creation time (no PII columns). Leave printing ON for the event.
5. Update the report doc's status column (it still says "draft").

## After 2026-10-21 (bigger changes; not in event week)
- `drizzle-orm` 0.39 → ≥0.45.2 with `drizzle-kit` and `drizzle-zod` (#19). Drop CVE-2026-39356 from `.trivyignore.yaml`.
- `xlsx` → the SheetJS CDN tarball (≥0.20.2) with a pinned integrity hash, or a maintained writer (#20). Drop the 2 xlsx entries.
- `csv-parse` 7 (major; check `columns: true` in `server/workers/emailWorker.ts`) (#23).
- Dev toolchain: vite 5 → 6.4.3+, vitest 3 → 4.1.11+, jsdom/undici, drizzle-kit/gel/shell-quote (#25).
- pm2 to pnpm on EC2 (#26): `pnpm add -g pm2`, `pm2 update`, `npm rm -g pm2`; confirm both apps `online` and `pm2 save`.
- nginx (#24): after the prod passive scan confirms the live headers.
- Then the runtime scans: `CDPI-Pass-Vault/70-Operations/Prompt-Hardening-Batch-3-Runtime.md`.

## Rules
No prod writes or charges without the owner's go for that exact action. Prod reads are aggregates or schema only. Never push to `hotfix-frontend-update` or `main`. Work in a worktree off `origin/hotfix-frontend-update` with `git branch --unset-upstream`. Every subagent declares its model. Verify every new or changed dependency (registry, version age, maintenance, license) and run `pnpm install --frozen-lockfile` locally after any `pnpm-workspace.yaml` policy change. Soft context limit ~120K.
