-- ADR-016 legacy questions: attach "Cargo que ocupa", "Empresa que trabalha" and
-- "Área de atuação" to the live events so they keep collecting what the old full
-- signup collected. The ids are fixed (shared/eventRegistrationForm.ts,
-- LEGACY_QUESTIONS): the prefill, the server fallback for old bundles and the
-- participants export key on them. Admins must not delete or retype them.
--
-- BEFORE RUNNING: replace the three placeholders in the target CTE with the
-- production event ids (events.id), keeping the quotes.
--
-- Safe to re-run: only events whose registration_form has none of the three ids
-- are touched (0 rows the second time). The questions are APPENDED after any
-- existing admin questions; nothing is overwritten or reordered. One statement,
-- so it applies atomically. An event with 18+ active questions would pass the
-- 20-question admin limit; check the verification query first if in doubt.
--
-- Staging first (neon-prod MCP: staging br-snowy-band-ac4kb1zm), prod only on approval.

WITH target(id) AS (
  VALUES
    ('<EVENT_ID_1>'),
    ('<EVENT_ID_2>'),
    ('<EVENT_ID_3>')
)
UPDATE events e
SET registration_form = COALESCE(e.registration_form, '[]'::jsonb) || jsonb_build_array(
  jsonb_build_object('id', 'legacy-occupation', 'type', 'text', 'label', 'Cargo que ocupa',
                     'options', '[]'::jsonb, 'required', true, 'archived', false),
  jsonb_build_object('id', 'legacy-partner-company', 'type', 'text', 'label', 'Empresa que trabalha',
                     'options', '[]'::jsonb, 'required', true, 'archived', false),
  jsonb_build_object('id', 'legacy-area-of-activity', 'type', 'text', 'label', 'Área de atuação',
                     'options', '[]'::jsonb, 'required', true, 'archived', false)
)
FROM target t
WHERE e.id = t.id
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(e.registration_form, '[]'::jsonb)) AS f
    WHERE f ->> 'id' IN ('legacy-occupation', 'legacy-partner-company', 'legacy-area-of-activity')
  );

-- Read-only verification (run separately; expect 3 per target event after the update):
-- SELECT e.id, e.title,
--        (SELECT count(*) FROM jsonb_array_elements(e.registration_form) AS f
--          WHERE f ->> 'id' IN ('legacy-occupation', 'legacy-partner-company', 'legacy-area-of-activity')) AS legacy_ids_present
--   FROM events e
--  WHERE e.id IN ('<EVENT_ID_1>', '<EVENT_ID_2>', '<EVENT_ID_3>');
