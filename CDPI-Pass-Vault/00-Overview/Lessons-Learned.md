# Lessons Learned (running log)

One entry per mistake or wrong assumption that cost time. Each entry: date · symptom · root cause · prevention (rule or check). Newest first. When a prevention changes how code must be written, it also gets a one-line rule in `frontend/.claude/rules/*.md`.

## 2026-10-07 — foreigners got a 500 on "Criar conta"
- **Symptom:** a Paraguayan attendee (passport, `+595` phone) got `500 {"message":"Erro interno do servidor"}` on registration, right after ADR-014 shipped. Asaas and the `users_foreigner.sql` migration looked like suspects but were not involved.
- **Root cause:** `PhoneInputE164` sends E.164 digits without `+` (`595981123456`), but every server caller ran `normalizePhoneE164(phone, "BR")`, which parsed those digits as a *Brazilian national* number (`+55595…`), found it invalid and threw. The register route called it inline in `createUser({...})`, so the plain `Error` hit the generic 500. Brazilians never noticed because their digits start with `55`. Some foreign numbers were silently corrupted instead: US `12025550100` was stored as BR `5512025550100`. Every test fixture was Brazilian.
- **Prevention:** `normalizePhoneE164` reads digits-only input as E.164 and uses `defaultCountry` only for formatted input. Register maps a bad phone to 400 like the other callers. Identity/phone tests carry a non-BR fixture, and a route-level integration test registers a foreigner. Rules added to `testing.md` and `error-handling.md`.

## 2026-09-03 — old contact info survived in emails after code fix
- **Symptom:** footer was updated but "Informações Importantes" in the email body still showed `99860-6833`.
- **Root cause:** courtesy, reminder, and communicate email bodies are stored in the database (`events.courtesy_template`, `reminder_templates.body`, `communicate_templates.body`). The admin typed old contact info into the TipTap editor and saved it. Changing `shared/contact.ts` only fixed the code-generated footer — the DB body was untouched.
- **Prevention:** `migrateTemplateContactInfo()` runs on every template before `renderTemplate()` as a runtime guard. SQL migration `sql/update_contact_info_in_templates.sql` fixes templates at rest. When contact info changes, grep the DB template columns too, not just code.

## 2026-09-02 — courtesy e-mail showed "Cau�" while the rest of the Portuguese was fine
- **Symptom:** `{nome}` rendered as `Cau�` (U+FFFD) in a courtesy mass e-mail; template copy (`satisfação`, `Farmácia`) was correct.
- **Root cause:** Excel in Brazil saves CSV as Windows-1252. The mass-send route decoded the upload with `buffer.toString("utf-8")`, which replaces the Latin-1 byte for `ê` with �. The template itself is typed in the browser (real UTF-8).
- **Prevention:** always decode CSV uploads with `decodeCsvBuffer` (UTF-8 if valid, otherwise Latin-1). Never `csvBuffer.toString("utf-8")` on an Excel export.

## 2026-09-02 — a reported bug was already fixed in production
- **Symptom:** the home-page cover crop was on the bug list, but production already rendered it correctly; the reporter's screenshot was taken minutes before that morning's deploy.
- **Root cause:** bug reports carry photos, not timestamps, and this branch auto-deploys, so "reported" and "current" can differ by minutes.
- **Prevention:** before planning any UI fix, open production and read the computed style ([[70-Operations/Verifying-UI-Fixes]]). It removed a whole phase of work here.

## 2026-09-02 — "Baixar" buttons did nothing on phones
- **Symptom:** QR download and certificate buttons silent on mobile; the reports themselves arrived through WhatsApp (in-app browser).
- **Root cause:** a detached data-URL anchor and `window.open` — both no-ops in in-app browsers and in iOS Safari with pop-ups blocked. The same defect was also sitting on the boleto button in `PaymentModal`, where it blocked a payment.
- **Prevention:** ADR-008; rule in `frontend.md`; when one instance of a browser-API bug is found, grep for every other call of that API before closing the task.

## 2026-09-02 — ProfilePage test hung forever
- **Symptom:** `vitest run ProfilePage.test.tsx` never finished (killed at 2 min).
- **Root cause:** the `useAuth` mock returned a fresh object literal on every call; `ProfilePage` runs `profileForm.reset(currentUser)` in a `useEffect` keyed on `[currentUser]`, so each render produced a new identity and re-triggered the effect.
- **Prevention:** module-mock return values that feed a `useEffect` dependency must be hoisted to a module-level constant so their identity is stable across renders.

## 2026-09-02 — profile tabs overlapped on phones
- **Symptom:** four tab labels drawn on top of each other at 390px.
- **Root cause:** `TabsList grid-cols-4` + shadcn `TabsTrigger whitespace-nowrap`, no mobile breakpoint. Measured at a 358px card: "Informações Pessoais" needed 117px inside an 88px cell.
- **Prevention:** any `TabsList` with more than three labelled tabs needs a `<sm` layout (2-column grid or scroll), a 44px touch target, and a jsdom class test; rule in `frontend.md`.

## 2026-09-02 — three different support numbers hard-coded
- **Symptom:** e-mails showed two old numbers, the site a third.
- **Root cause:** copy duplicated in five places, no shared constant.
- **Prevention:** customer-facing contact data only via `shared/contact.ts`; rule in `code-quality.md`.

## 2026-09-02 — free/courtesy tickets said "pagamento confirmado"
- **Symptom:** free-event and courtesy attendees received a payment confirmation for something they never paid.
- **Root cause:** one inline template for three flows; no field distinguished them.
- **Prevention:** transactional e-mail bodies live in `server/utils/*Template.ts` with unit tests; flow-specific copy is selected by an explicit **required** field (`confirmationKind`) so `tsc` flags every caller when a new flow appears.

## 2026-09-02 — editor blank lines missing on the public event page
- **Symptom:** admin sees blank lines in the description editor; `/event/:id` shows none.
- **Root cause:** a trailing `<br>` inside `<p>` renders as nothing in browsers but ProseMirror shows it; the display component only handled empty `<p></p>`. Existing `[&_br]:block [&_br]:mb-[0.65em]` styling did not help, because a trailing `<br>` still collapses.
- **Prevention:** description HTML always goes through `prepareDescriptionHtmlForDisplay`; when the editor and the page disagree, diff the stored HTML against what ProseMirror renders (`ProseMirror-trailingBreak`) and measure the real gap in a browser before touching CSS.

## 2026-09-02 — event poster cropped on `/event/:id`
- **Symptom:** sponsor row cut at desktop, sides cut on phones.
- **Root cause:** fixed-height frame (`h-64 md:h-96`) + `object-cover`; ADR-007 fixed the home card only, and its "detail page unchanged" line was read as a decision rather than a scope note.
- **Prevention:** uploaded artwork is never cropped: any event poster goes through `EventCoverImage` in an `aspect-video` frame. Rule added to `frontend/.claude/rules/frontend.md`.

## 2026-09-02 — `.claude/rules` is gitignored, vault is only untracked
- **Symptom:** `git add frontend/.claude/rules/documentation.md` refused: "paths are ignored by one of your .gitignore files".
- **Root cause:** `frontend/.gitignore:3` ignores `.claude/`. The rules are local-only, so they never reach CI, teammates or a fresh clone. `CDPI-Pass-Vault/` is *not* ignored, merely untracked, so it can be committed if we choose to.
- **Prevention:** do not plan commits for `frontend/.claude/**`; write rules there for the local agent and put anything a teammate needs into the vault instead. Check `git check-ignore -v <path>` before planning a docs commit.

## 2026-09-02 — push to `hotfix-frontend-update` deploys to production
- **Symptom:** the deploy note described a manual Docker flow; the CI workflow actually deploys on push to `hotfix-frontend-update`.
- **Root cause:** `Deployment.md` was never updated after `da67741 CI: deploy via git+PM2`.
- **Prevention:** infra/CI change → update `50-Infrastructure/Deployment.md` in the same commit (rule already in `documentation.md`; now also listed here).

## 2026-10-07 — `drizzle-kit push` "had bugs" and wanted to TRUNCATE users
- **Symptom:** pushing schema changes to Neon with Drizzle did not work; the push prompt offered 74 statements, including `TRUNCATE users CASCADE` and `TRUNCATE orders CASCADE`.
- **Root cause:** years of hand-written `sql/` files created checks, indexes, FK names, types and NOT NULLs that `shared/schema.ts` never declared. Push treats the schema as truth, so it tried to undo all of it. drizzle-kit 0.30 also turns any type change on a non-empty table into `TRUNCATE ... CASCADE`, and it misreads empty-array defaults (patched). Forbidding push hid the drift instead of fixing it.
- **Prevention:** `schema.ts` declares every DB object; `pnpm db:diff` must be 0 before and after a change; backfills and type changes go in a transactional `sql/` file applied before the push. See [[60-Decisions/ADR-015-drizzle-kit-push]] and `frontend/.claude/rules/database.md`.
