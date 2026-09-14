# Normalization History

Derived from the `frontend/sql/` files (each was run manually on Neon). This is the record of how the schema evolved and was cleaned up.

## Order status normalization
`normalize_order_status_courtesy_to_paid.sql` — legacy rows used `status='courtesy'`. Now the app only uses `pending | paid | cancelled`. Courtesy is represented by `orders.payment_method = 'courtesy'` (plus `courtesy_link_id` / `courtesy_attendee_id`). One-time UPDATE converted legacy rows.

**Rule going forward**: never reintroduce status values beyond the three. Payment origin belongs in `payment_method`.

## Phone normalization (E.164)
`phone_e164_backfill.sql` — phones in `users` and `courtesy_attendees` were BR-formatted `"(00) 00000-0000"`. Backfilled to E.164 digits **without** `+` (e.g. `5511999998888`). App validation now enforces `^\d{8,15}$`.

## NPS restructuring
1. `nps_tables_and_event_type.sql` — added `events.nps_type` + two type-specific response tables (additive, idempotent).
2. `nps_legacy_from_certificates.sql` — optional backfill: copied historical certificate JSON answers into `nps_cdpi_event_responses`.
3. `cleanup_legacy_nps_responses.sql` — dropped the legacy `certificates.nps_responses` jsonb column. **Applied to Neon prod on 2026-09-04** (had been written but never run; until then every `POST /api/certificates/generate` failed after the Lambda with `null value in column "nps_responses" ... violates not-null constraint`, see [[20-Backend/Certificates]]).
4. `nps_questions_revision.sql` — **destructive** DROP + recreate of both NPS tables for the Workshops CDPI / entidades question set (Outro follow-up, `privacy_consent`). Existing NPS rows discarded. Apply before deploying the matching app code. Does not touch `events.nps_type`.

**Lesson**: survey answers moved from a jsonb blob on certificates to typed, per-survey-type tables with unique (user,event). Question columns are versioned by replacing the tables (manual SQL), not by jsonb.

## Feature additions (additive SQL)
- `communicate_tables.sql` — communicate templates + jobs.
- `reminder_templates_and_jobs.sql` — reminder feature tables.
- `manual_event_print_and_print_jobs.sql` — print settings + print jobs.
- `add_print_jobs_company_line.sql` — `company_line` column for badge second line.
- `email_template_subjects.sql` — per-event courtesy/reminder subject columns + widened queue subject.
- `event_modality.sql` — `events.modality` (`presencial`\|`online`, existing rows default presencial) + `events.meeting_url` (required when online; confirmation e-mail and confirmed Meus Ingressos). **Applied to Neon staging on 2026-09-14.** Prod still pending before the matching app deploy. See [[20-Backend/Event-Modality]].
- `event_online_access_extras.sql` — `events.whatsapp_group_url` (optional online WhatsApp group invite; public APIs omit it; confirmed Meus Ingressos) + `events.confirmation_email_html` (optional TipTap HTML injected into the purchase confirmation e-mail; empty = default template).

## Conventions observed in every SQL file
- Header comment: "Run manually in PostgreSQL (no drizzle-kit push)".
- `IF NOT EXISTS` guards, idempotent where possible, `TIMESTAMPTZ` for new tables, inline CHECK constraints.
- Apply order documented in-file when it matters (e.g. NPS sequence).

See [[40-Database/Migration-Workflow]] for the process.
