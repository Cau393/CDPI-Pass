-- OPTIONAL: Run AFTER nps_tables_and_event_type.sql if you want historical certificate JSON
-- copied into nps_cdpi_event_responses. Run BEFORE cleanup_legacy_nps_responses.sql.
-- Inserts one row per certificate that does not yet exist in nps_cdpi_event_responses.
--
-- Legacy JSON shape: { overallRating: number, wouldRecommend: boolean, highlights?: string, improvements?: string }

BEGIN;

INSERT INTO nps_cdpi_event_responses (
  user_id,
  event_id,
  name,
  email,
  phone,
  overall_rating,
  themes_relevance,
  speakers_rating,
  applicability,
  highlight,
  organization_rating,
  would_attend_again,
  improvements,
  interest_in_topics,
  interest_topic_text,
  recommendation_score
)
SELECT
  c.user_id,
  c.event_id,
  c.full_name,
  u.email,
  u.phone,
  CASE
    WHEN (c.nps_responses->>'overallRating') IS NULL OR (c.nps_responses->>'overallRating') = '' THEN 'Boa'
    WHEN (c.nps_responses->>'overallRating')::int >= 9 THEN 'Excelente'
    WHEN (c.nps_responses->>'overallRating')::int >= 7 THEN 'Muito boa'
    WHEN (c.nps_responses->>'overallRating')::int >= 5 THEN 'Boa'
    WHEN (c.nps_responses->>'overallRating')::int >= 3 THEN 'Regular'
    ELSE 'Ruim'
  END,
  'Relevantes',
  'Boa',
  'Parcialmente aplicável',
  COALESCE(NULLIF(trim(c.nps_responses->>'highlights'), ''), '(legado)'),
  'Boa',
  CASE
    WHEN (c.nps_responses->>'wouldRecommend')::text = 'true' THEN 'Sim, com certeza'
    ELSE 'Não'
  END,
  COALESCE(NULLIF(trim(c.nps_responses->>'improvements'), ''), '(legado)'),
  'Não',
  NULL,
  LEAST(
    GREATEST(
      COALESCE(NULLIF((c.nps_responses->>'overallRating')::text, '')::int, 0),
      0
    ),
    10
  )
FROM certificates c
JOIN users u ON u.id = c.user_id
WHERE c.nps_responses IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM nps_cdpi_event_responses n
    WHERE n.user_id = c.user_id AND n.event_id = c.event_id
  );

COMMIT;
