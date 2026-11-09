-- Rollback of 003. Returns jobs to the phase 1 shape.
-- Archived jobs become visible again (phase 1 has no archive). Restoring the global
-- UNIQUE(job_number) fails if two companies created the same job number since the
-- upgrade; resolve those rows first.
-- Files uploaded as new versions stay on disk; jobs.image_path already points at
-- each job's current version, which phase 1 serves as-is.

DROP TRIGGER IF EXISTS jobs_legacy_default_company;

ALTER TABLE jobs DROP FOREIGN KEY fk_jobs_current_version;
DROP TABLE design_versions;

ALTER TABLE jobs
  DROP FOREIGN KEY fk_jobs_company,
  DROP FOREIGN KEY fk_jobs_legal_entity,
  DROP FOREIGN KEY fk_jobs_archived_by;

ALTER TABLE jobs
  DROP INDEX uq_jobs_entity_job,
  DROP INDEX idx_jobs_job_number,
  DROP INDEX idx_jobs_company_status,
  DROP COLUMN company_id,
  DROP COLUMN legal_entity_id,
  DROP COLUMN status,
  DROP COLUMN archived_at,
  DROP COLUMN archived_by,
  DROP COLUMN archive_reason,
  DROP COLUMN current_version_id,
  DROP COLUMN updated_at,
  ADD UNIQUE KEY job_number (job_number);
