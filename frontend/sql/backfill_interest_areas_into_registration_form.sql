-- ADR-016 Phase 2: copy each event's "Área de interesse" labels into its new
-- per-event registration form as one required dropdown question.
--
-- Run AFTER `pnpm db:push` has added events.registration_form (jsonb, default
-- '[]'). Touches only events whose form is still empty and that have labels,
-- so it never overwrites a form an admin built and re-running is a no-op.
-- Run it ONCE per environment, right after the Phase 2 push: once Phase 3
-- lets admins edit forms, a form emptied on purpose on an event that still
-- has interest_areas would get the question back on a re-run.
-- events.interest_areas and orders.interest_area are kept (read-only,
-- deprecated); dropping them is a separate, approved step.
--
-- Staging: applied with the Phase 2 PR. Production: the developer runs it in
-- the Neon SQL editor right after the production push.

BEGIN;

UPDATE events
SET registration_form = jsonb_build_array(jsonb_build_object(
  'id', 'interest-area',
  'type', 'select',
  'label', 'Área de interesse',
  'options', to_jsonb(interest_areas),
  'required', true,
  'archived', false))
WHERE registration_form = '[]'::jsonb
  AND cardinality(interest_areas) > 0;

COMMIT;

-- Read-only verification (run separately):
-- SELECT count(*) FILTER (WHERE cardinality(interest_areas) > 0) AS with_labels,
--        count(*) FILTER (WHERE registration_form <> '[]'::jsonb) AS with_form
--   FROM events;
