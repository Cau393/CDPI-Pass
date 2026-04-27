-- Run manually in PostgreSQL if the column is missing.
ALTER TABLE print_jobs
  ADD COLUMN IF NOT EXISTS company_line VARCHAR(255);
