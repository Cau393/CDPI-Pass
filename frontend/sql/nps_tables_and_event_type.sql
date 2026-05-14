-- Run manually in PostgreSQL (no drizzle-kit push).
-- NPS feature: per-event nps_type field + two type-specific response tables.
-- Additive & idempotent — safe to re-run. Apply BEFORE deploying the new app code.

BEGIN;

-- 1. Add nps_type column to events ('cdpi_event' | 'cdpi_apoiando').
--    All existing events default to 'cdpi_event' ("Evento do CDPI").
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS nps_type TEXT NOT NULL DEFAULT 'cdpi_event';

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_nps_type_chk;
ALTER TABLE events
  ADD CONSTRAINT events_nps_type_chk
  CHECK (nps_type IN ('cdpi_event', 'cdpi_apoiando'));

-- 2. NPS table for "Evento do CDPI" (11 questions).
CREATE TABLE IF NOT EXISTS nps_cdpi_event_responses (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               VARCHAR NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id              VARCHAR NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  -- Q1. Identificação (3 columns)
  name                  VARCHAR(255) NOT NULL,
  email                 VARCHAR(255) NOT NULL,
  phone                 VARCHAR(20)  NOT NULL,

  -- Q2. Como você avalia sua experiência geral no evento?
  overall_rating        TEXT NOT NULL,

  -- Q3. Os temas abordados foram relevantes para você?
  themes_relevance      TEXT NOT NULL,

  -- Q4. Como você avalia os palestrantes no geral?
  speakers_rating       TEXT NOT NULL,

  -- Q5. O conteúdo apresentado é aplicável à sua realidade profissional?
  applicability         TEXT NOT NULL,

  -- Q6. Teve algum momento, painel ou palestrante que se destacou? Qual e por quê?
  highlight             TEXT NOT NULL,

  -- Q7. Como você avalia a organização do evento?
  organization_rating   TEXT NOT NULL,

  -- Q8. Você participaria de outros eventos do CDPI?
  would_attend_again    TEXT NOT NULL,

  -- Q9. O que poderíamos melhorar para os próximos eventos?
  improvements          TEXT NOT NULL,

  -- Q10. Você teria interesse em se aprofundar em algum dos temas abordados?
  interest_in_topics    TEXT NOT NULL,
  -- Q10 conditional follow-up (required when interest_in_topics = 'Sim')
  interest_topic_text   TEXT,

  -- Q11. De 0 a 10, o quanto você recomendaria esse evento para um colega?
  recommendation_score  INTEGER NOT NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nps_cdpi_event_user_event_unique UNIQUE (user_id, event_id),
  CONSTRAINT nps_cdpi_event_overall_rating_chk
    CHECK (overall_rating IN ('Excelente','Muito boa','Boa','Regular','Ruim')),
  CONSTRAINT nps_cdpi_event_themes_relevance_chk
    CHECK (themes_relevance IN ('Muito relevantes','Relevantes','Pouco relevantes','Não foram relevantes')),
  CONSTRAINT nps_cdpi_event_speakers_chk
    CHECK (speakers_rating IN ('Excelente','Muito boa','Boa','Regular','Ruim')),
  CONSTRAINT nps_cdpi_event_applicability_chk
    CHECK (applicability IN ('Totalmente aplicável','Parcialmente aplicável','Pouco aplicável','Não aplicável')),
  CONSTRAINT nps_cdpi_event_organization_chk
    CHECK (organization_rating IN ('Excelente','Muito boa','Boa','Regular','Ruim')),
  CONSTRAINT nps_cdpi_event_attend_again_chk
    CHECK (would_attend_again IN ('Sim, com certeza','Talvez, dependendo do tema','Não')),
  CONSTRAINT nps_cdpi_event_interest_chk
    CHECK (interest_in_topics IN ('Sim','Não')),
  CONSTRAINT nps_cdpi_event_interest_text_chk
    CHECK (
      (interest_in_topics = 'Sim'
        AND interest_topic_text IS NOT NULL
        AND length(trim(interest_topic_text)) > 0)
      OR
      (interest_in_topics = 'Não'
        AND (interest_topic_text IS NULL OR length(trim(interest_topic_text)) = 0))
    ),
  CONSTRAINT nps_cdpi_event_recommendation_chk
    CHECK (recommendation_score BETWEEN 0 AND 10)
);

CREATE INDEX IF NOT EXISTS nps_cdpi_event_event_id_idx
  ON nps_cdpi_event_responses (event_id);
CREATE INDEX IF NOT EXISTS nps_cdpi_event_created_at_idx
  ON nps_cdpi_event_responses (created_at DESC);

-- 3. NPS table for "CDPI Apoiando Evento" (8 questions).
CREATE TABLE IF NOT EXISTS nps_cdpi_apoiando_responses (
  id                      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 VARCHAR NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id                VARCHAR NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  -- Q1. Identificação (3 columns)
  name                    VARCHAR(255) NOT NULL,
  email                   VARCHAR(255) NOT NULL,
  phone                   VARCHAR(20)  NOT NULL,

  -- Q2. De 0 a 10, como você avalia sua experiência geral no evento?
  overall_score           INTEGER NOT NULL,

  -- Q3. O quão relevantes os temas abordados foram para você?
  themes_relevance        TEXT NOT NULL,

  -- Q4. O quão aplicável à sua realidade profissional o conteúdo do evento foi para você?
  applicability           TEXT NOT NULL,

  -- Q5. Quais temas você gostaria de aprofundar em futuros conteúdos, cursos ou programas?
  future_topics           TEXT NOT NULL,

  -- Q6. Como foi sua experiência com a organização do evento (acolhimento, informações, suporte)?
  organization_experience TEXT NOT NULL,

  -- Q7. O que poderia ser melhorado em próximas edições do evento?
  improvements            TEXT NOT NULL,

  -- Q8. Você gostaria de receber conteúdos ou novidades sobre os temas abordados neste evento?
  wants_updates           TEXT NOT NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nps_cdpi_apoiando_user_event_unique UNIQUE (user_id, event_id),
  CONSTRAINT nps_cdpi_apoiando_overall_chk
    CHECK (overall_score BETWEEN 0 AND 10),
  CONSTRAINT nps_cdpi_apoiando_themes_chk
    CHECK (themes_relevance IN ('Muito relevantes','Relevantes','Pouco relevantes','Não foram relevantes')),
  CONSTRAINT nps_cdpi_apoiando_applicability_chk
    CHECK (applicability IN ('Totalmente aplicável','Parcialmente aplicável','Pouco aplicável','Não aplicável')),
  CONSTRAINT nps_cdpi_apoiando_organization_chk
    CHECK (organization_experience IN ('Excelente','Muito boa','Boa','Regular','Ruim')),
  CONSTRAINT nps_cdpi_apoiando_updates_chk
    CHECK (wants_updates IN ('Sim','Não'))
);

CREATE INDEX IF NOT EXISTS nps_cdpi_apoiando_event_id_idx
  ON nps_cdpi_apoiando_responses (event_id);
CREATE INDEX IF NOT EXISTS nps_cdpi_apoiando_created_at_idx
  ON nps_cdpi_apoiando_responses (created_at DESC);

COMMIT;

-- Read-only verification (run separately):
-- SELECT nps_type, count(*) FROM events GROUP BY nps_type;
-- \d nps_cdpi_event_responses
-- \d nps_cdpi_apoiando_responses
