-- Run manually in PostgreSQL (no drizzle-kit push).
-- Creates the two tables needed for the pending-redemption reminder feature.

CREATE TABLE IF NOT EXISTS reminder_templates (
  event_id VARCHAR PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminder_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR NOT NULL REFERENCES events(id),
  status TEXT NOT NULL DEFAULT 'pending',
  attachment_data TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reminder_jobs_status_chk CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);
