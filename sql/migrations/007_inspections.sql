-- 007 · Photo checks.
--
-- design_versions: every design version is prepared as an engine reference
--   (dielines removed, panels found, inks measured), then a QC supervisor
--   approves it before photo checks may use it.
--     not_started  → never prepared (phase 1 designs until the backlog is run)
--     queued       → waiting for a worker
--     processing   → being prepared
--     needs_review → prepared, waiting for a supervisor
--     approved / rejected / failed
--
-- inspections: one row per photo checked. Photos and results are never deleted.

ALTER TABLE design_versions
  MODIFY reference_status ENUM('not_started','queued','processing','needs_review','approved','rejected','failed')
    NOT NULL DEFAULT 'not_started',
  ADD COLUMN reference_dir VARCHAR(255) NULL AFTER reference_status,          -- public URL of the reference folder
  ADD COLUMN reference_meta JSON NULL AFTER reference_dir,                    -- panels, compared share, inks
  ADD COLUMN reference_error VARCHAR(500) NULL AFTER reference_meta,
  ADD COLUMN reference_prepared_at TIMESTAMP NULL DEFAULT NULL AFTER reference_error,
  ADD COLUMN reference_review_note VARCHAR(255) NULL AFTER reference_reviewed_at,
  ADD KEY idx_design_versions_reference_status (reference_status);

CREATE TABLE inspections (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  design_version_id INT NOT NULL,                     -- the approved reference the photo was checked against
  company_id INT NOT NULL,
  status ENUM('queued','processing','done','failed') NOT NULL DEFAULT 'queued',
  verdict ENUM('PASS','FAIL','RETAKE') NULL,
  sensitivity ENUM('low','normal','high') NOT NULL DEFAULT 'normal',
  source ENUM('web','mobile','camera') NOT NULL DEFAULT 'web',
  files_dir VARCHAR(255) NOT NULL,                    -- public URL of this check's folder
  photo_path VARCHAR(255) NOT NULL,
  photo_sha256 CHAR(64) NOT NULL,
  defect_count INT NULL,
  result JSON NULL,                                   -- reasons, defects, inks, coverage, images
  error VARCHAR(500) NULL,
  inspected_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL DEFAULT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  KEY idx_inspections_job (job_id, created_at),
  KEY idx_inspections_company (company_id, created_at),
  KEY idx_inspections_status (status),
  CONSTRAINT fk_inspections_job FOREIGN KEY (job_id) REFERENCES jobs (id),
  CONSTRAINT fk_inspections_version FOREIGN KEY (design_version_id) REFERENCES design_versions (id),
  CONSTRAINT fk_inspections_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_inspections_user FOREIGN KEY (inspected_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
