-- Run manually in PostgreSQL (no drizzle-kit push).
-- Drops the legacy certificates.nps_responses jsonb column.
--
-- !!! RUN ONLY AFTER THE NEW APP CODE IS DEPLOYED AND STABLE.
-- The new code writes to nps_cdpi_event_responses / nps_cdpi_apoiando_responses
-- and no longer reads or writes certificates.nps_responses.
--
-- Existing certificates remain valid; their old NPS data is simply discarded.

ALTER TABLE certificates DROP COLUMN IF EXISTS nps_responses;
