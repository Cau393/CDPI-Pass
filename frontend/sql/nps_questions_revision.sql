-- Run manually in PostgreSQL (no drizzle-kit push).
-- NPS questions revision (Workshops CDPI + Eventos com entidades).
--
-- DESTRUCTIVE: drops nps_cdpi_event_responses and nps_cdpi_apoiando_responses
-- and recreates them with the new survey columns. Existing NPS rows are discarded.
-- Does NOT touch events.nps_type.
--
-- Apply BEFORE deploying the app code that expects the new columns.
-- Re-running wipes NPS responses again (DROP + CREATE).

BEGIN;

DROP TABLE IF EXISTS nps_cdpi_event_responses;
DROP TABLE IF EXISTS nps_cdpi_apoiando_responses;

-- Evento CDPI (Workshops CDPI Pharma / Faculdade CDPI)
CREATE TABLE nps_cdpi_event_responses (
  id                      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 VARCHAR NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id                VARCHAR NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  name                    VARCHAR(255) NOT NULL,
  email                   VARCHAR(255) NOT NULL,
  phone                   VARCHAR(20)  NOT NULL,

  -- Como você se sentiu participando do nosso Workshop?
  workshop_feeling        TEXT NOT NULL,

  -- Os temas apresentados foram relevantes para a sua área de atuação?
  themes_relevant         TEXT NOT NULL,

  -- Como você avalia a didática dos ministrantes?
  instructors_didactics   TEXT NOT NULL,

  -- Teve algum painel ou ministrante que te marcou? Conta pra gente quem e por quê:
  highlight               TEXT NOT NULL,

  -- Você sente que o workshop agregou algo novo para sua carreira?
  career_value            TEXT NOT NULL,

  -- Depois dessa experiência, você tem interesse em participar de outros eventos do CDPI?
  would_attend_again      TEXT NOT NULL,

  -- Como você avalia o suporte da equipe CDPI durante o evento?
  support_rating          TEXT NOT NULL,
  -- Required when support_rating = 'Outro'
  support_other_text      TEXT,

  -- Quer deixar um recado pra equipe CDPI? (optional)
  message_to_team         TEXT,

  privacy_consent         BOOLEAN NOT NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nps_cdpi_event_user_event_unique UNIQUE (user_id, event_id),
  CONSTRAINT nps_cdpi_event_workshop_feeling_chk
    CHECK (workshop_feeling IN (
      'Foi incrível!',
      'Gostei bastante',
      'Foi bom, mas esperava mais',
      'Não atendeu minhas expectativas'
    )),
  CONSTRAINT nps_cdpi_event_themes_relevant_chk
    CHECK (themes_relevant IN ('Sim', 'Não')),
  CONSTRAINT nps_cdpi_event_didactics_chk
    CHECK (instructors_didactics IN ('Excelente', 'Muito boa', 'Boa', 'Regular', 'Ruim')),
  CONSTRAINT nps_cdpi_event_career_value_chk
    CHECK (career_value IN ('Com certeza', 'Em partes', 'Ainda estou processando')),
  CONSTRAINT nps_cdpi_event_attend_again_chk
    CHECK (would_attend_again IN (
      'Sim, com certeza',
      'Talvez, depende do tema',
      'Ainda não sei'
    )),
  CONSTRAINT nps_cdpi_event_support_chk
    CHECK (support_rating IN (
      'Excelente, sempre por perto',
      'Bom, mas pode melhorar',
      'Tive algumas dificuldades',
      'Outro'
    )),
  CONSTRAINT nps_cdpi_event_support_other_chk
    CHECK (
      (support_rating = 'Outro'
        AND support_other_text IS NOT NULL
        AND length(trim(support_other_text)) > 0)
      OR
      (support_rating <> 'Outro'
        AND (support_other_text IS NULL OR length(trim(support_other_text)) = 0))
    ),
  CONSTRAINT nps_cdpi_event_privacy_chk
    CHECK (privacy_consent IS TRUE)
);

CREATE INDEX nps_cdpi_event_event_id_idx
  ON nps_cdpi_event_responses (event_id);
CREATE INDEX nps_cdpi_event_created_at_idx
  ON nps_cdpi_event_responses (created_at DESC);

-- Evento de Terceiros (Workshops com entidades de classe)
CREATE TABLE nps_cdpi_apoiando_responses (
  id                        VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   VARCHAR NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id                  VARCHAR NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  name                      VARCHAR(255) NOT NULL,
  email                     VARCHAR(255) NOT NULL,
  phone                     VARCHAR(20)  NOT NULL,

  -- De 0 a 10, como você avalia sua experiência geral no Workshop?
  overall_score             INTEGER NOT NULL,

  -- Dos temas abordados, quais você gostaria de aprofundar...
  future_topics             TEXT NOT NULL,

  -- Como foi sua experiência com a equipe organizadora (acolhimento, informações, suporte)?
  organization_experience   TEXT NOT NULL,
  -- Required when organization_experience = 'Outro'
  organization_other_text   TEXT,

  -- Caso tenha algum feedback ou sugestão sobre o evento... (optional)
  feedback                  TEXT,

  privacy_consent           BOOLEAN NOT NULL,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nps_cdpi_apoiando_user_event_unique UNIQUE (user_id, event_id),
  CONSTRAINT nps_cdpi_apoiando_overall_chk
    CHECK (overall_score BETWEEN 0 AND 10),
  CONSTRAINT nps_cdpi_apoiando_organization_chk
    CHECK (organization_experience IN (
      'Excelente, sempre por perto',
      'Bom, mas pode melhorar',
      'Tive algumas dificuldades',
      'Outro'
    )),
  CONSTRAINT nps_cdpi_apoiando_organization_other_chk
    CHECK (
      (organization_experience = 'Outro'
        AND organization_other_text IS NOT NULL
        AND length(trim(organization_other_text)) > 0)
      OR
      (organization_experience <> 'Outro'
        AND (organization_other_text IS NULL OR length(trim(organization_other_text)) = 0))
    ),
  CONSTRAINT nps_cdpi_apoiando_privacy_chk
    CHECK (privacy_consent IS TRUE)
);

CREATE INDEX nps_cdpi_apoiando_event_id_idx
  ON nps_cdpi_apoiando_responses (event_id);
CREATE INDEX nps_cdpi_apoiando_created_at_idx
  ON nps_cdpi_apoiando_responses (created_at DESC);

COMMIT;

-- Read-only verification (run separately):
-- \d nps_cdpi_event_responses
-- \d nps_cdpi_apoiando_responses
-- SELECT count(*) FROM nps_cdpi_event_responses;
-- SELECT count(*) FROM nps_cdpi_apoiando_responses;
