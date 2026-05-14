-- Communicate (announcement) email templates and job queue
-- Run manually against your Neon/Postgres database when deploying.

CREATE TABLE IF NOT EXISTS communicate_templates (
  event_id VARCHAR PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communicate_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  event_id VARCHAR NOT NULL REFERENCES events(id),
  recipient_mode TEXT NOT NULL CHECK (recipient_mode IN ('participants', 'participants_and_unredeemed', 'unredeemed_only')),
  attachment_data TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS communicate_jobs_status_created_at_idx
  ON communicate_jobs (status, created_at);
