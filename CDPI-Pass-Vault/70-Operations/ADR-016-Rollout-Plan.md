# ADR-016 rollout plan (Phase B, 2026-10-09)

How [[60-Decisions/ADR-016-event-registration-forms-and-minimal-signup]] reaches prod without breaking the 3 live events. Inputs: owner decisions in [[70-Operations/Prompt-ADR-016-Rollout]] §2, refuter verdicts in [[70-Operations/ADR-016-Refuter-Findings]]. The step-by-step deploy order lives in [[70-Operations/Plan-Event-Registration-Forms]] (Phase F).

## Prod facts (read-only snapshot, 2026-10-09, no PII)

| Event | id | Date | Modality / price | Sales | Paid orders | Buyers with real Cargo / Empresa / Área |
|---|---|---|---|---|---|---|
| Jornada Analítica & Regulatória | `13e253d6-14a2-496d-be4d-8a3ca4b0f8df` | 2026-10-13 | online, free | open | 92 (69 free, 23 courtesy) | 88 / 88 / 88 of 92 |
| Workshop Peptídeos | `168193f7-1aa2-45d6-b6e8-ba0ea355efaa` | 2026-10-20 | in-person, free | **closed**; courtesy limit 220 | 191 (179 courtesy, 12 free); 2 foreigners | 41 / 43 / 35 of 190 |
| Workshop Emagrecimento | `f2ded6cd-1d45-4cb1-ba6a-7bf8616fda60` | 2026-10-22 | in-person, R$ 632 | open | 1 (2 pending, 2 cancelled) | — |

- All three: `registration_form = []`, `interest_areas = {}`.
- **Schema drift: none.** users, orders, events, courtesy_attendees and courtesy_links are identical on prod, staging and `shared/schema.ts`. The three `*_identity_document_chk` match `sql/registration_forms_loosen_identity_checks.sql`. **No prod schema delta is needed.**
- Every paid buyer on these events has a document and an address, so no existing buyer is re-asked for them.
- **Duplicates:** 7 `(user_id, event_id)` groups already have more than one paid own order (max 6). A unique index is therefore impossible without a data cleanup. The race guard stays in application code.
- **Phones** are stored as E.164 digits without `+`. The exceptions, all created 2026-05-14 (old data, no live writer):
  - 1 user and 3 courtesy attendees in the `(00) 00000-0000` format;
  - 1 user and 1 attendee with a 12-digit non-BR number (foreigners, correct).

## Backfill: `frontend/sql/adr016_attach_legacy_questions.sql`
- It appends `legacy-occupation` "Cargo que ocupa", `legacy-partner-company` "Empresa que trabalha" and `legacy-area-of-activity` "Área de atuação" (text, required) to the three ids above.
- It runs as one statement, so it is atomic.
- It touches only events whose form has none of those ids, so a second run changes 0 rows. It appends after any admin questions and never overwrites.
- Verification query (counts only) is at the end of the file: expect `legacy_ids_present = 3` per event.

## Mixed-version analysis

| Window | Who | Behaviour |
|---|---|---|
| Backfill applied, old code still live | everyone | **No change.** The old code (`b0a6359`) has no `registration_form` / `registration_answers` in `schema.ts` and no `SELECT *` on events (checked with `git grep`). The staging rehearsal (Phase D) checks this at runtime. |
| New code live, tab on the old bundle | full-profile account: free subscribe or paid checkout | **Works.** The server fills missing `legacy-*` answers from the account's real profile values. |
| same | 4-field account | Not possible: the old bundle cannot create one, because the new server returns 409 to the old signup body. |
| same | old signup tab | 409 "Atualize a página para concluir o cadastro" (refuter #5). No account is created without its data. |
| same | old courtesy tab | Cargo and Empresa come from the attendee's own fields. "Área de atuação" has no source, so the request gets 400 until the page is reloaded. Accepted risk: rare, and fixed by a reload. Deploy off-peak. |
| New code, new bundle | everyone | **Full-profile accounts:** the dialog prefills the 3 questions. **4-field accounts:** they answer them. **Courtesy:** the page hides Cargo and Empresa and asks for the area. |

**Timing:** the Jornada (online, 92 inscriptions) is on **2026-10-13**. Don't deploy on an event day. Any quiet window before or after works, because the fallback keeps old tabs working.

## Prepared prod statements (none executed; each needs the owner's approval of the exact text)
1. **Backfill:** `frontend/sql/adr016_attach_legacy_questions.sql`. Expect 3 rows; the verification query shows 3/3/3.
2. **Phone normalisation:** re-run the existing idempotent `frontend/sql/phone_e164_backfill.sql`. Expect 1 `users` and 3 `courtesy_attendees` rows. The foreign numbers are 12 digits, so the 10–11-digit rule leaves them alone. Its sanity gate rolls everything back on any bad row.
3. **No unique index:** prod has 7 duplicate groups (see above).

## Deploy order (summary; full checklist in the runbook)
1. EC2 check: `grep -c '^COURTESY_WEBHOOK_URL=' <app>/.env`.
2. The owner approves statements 1 and 2.
3. Neon backup branch of prod.
4. Statement 1, then the verification query.
5. Statement 2.
6. The owner merges PR #4 off-peak.
7. Post-deploy smoke test.
8. Rollback: revert the merge commit. The backfill is additive, and old code ignores it.
