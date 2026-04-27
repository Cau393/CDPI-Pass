-- Run manually in PostgreSQL (no drizzle-kit push).
-- Adjust if your schema/table names differ.

CREATE TABLE IF NOT EXISTS event_print_settings (
  event_id VARCHAR PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS print_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  order_id VARCHAR NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  display_name VARCHAR(255) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_by_socket_id VARCHAR(64),
  last_error_code VARCHAR(50),
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT print_jobs_status_chk CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS print_jobs_event_status_created_idx
  ON print_jobs (event_id, status, created_at);

CREATE INDEX IF NOT EXISTS print_jobs_order_id_idx ON print_jobs (order_id);
