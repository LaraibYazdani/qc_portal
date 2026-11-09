-- 003 · Jobs belong to a company; designs are versioned; jobs are archived, not deleted.
-- Phase 1 artwork files stay exactly where they are: each existing job gets a
-- "version 1" record pointing at its current /uploads/<JOB>.jpg file.

ALTER TABLE jobs
  ADD COLUMN company_id INT NULL AFTER job_number,
  ADD COLUMN legal_entity_id INT NULL AFTER company_id,
  ADD COLUMN status ENUM('active','archived') NOT NULL DEFAULT 'active' AFTER image_path,
  ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER status,
  ADD COLUMN archived_by INT NULL AFTER archived_at,
  ADD COLUMN archive_reason VARCHAR(255) NULL AFTER archived_by,
  ADD COLUMN current_version_id INT NULL AFTER archive_reason,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP;

-- All phase 1 artwork is owned by BSPL, Corrugated Division
UPDATE jobs
SET company_id      = (SELECT id FROM companies WHERE code = 'BSPL-CORR'),
    legal_entity_id = (SELECT id FROM companies WHERE code = 'BSPL');

-- Job numbers are unique per legal entity (strictest option until confirmed;
-- relaxing to per-company later is a one-line change, tightening is not).
ALTER TABLE jobs
  DROP INDEX job_number,
  ADD UNIQUE KEY uq_jobs_entity_job (legal_entity_id, job_number),
  ADD KEY idx_jobs_job_number (job_number),
  ADD KEY idx_jobs_company_status (company_id, status),
  ADD CONSTRAINT fk_jobs_company FOREIGN KEY (company_id) REFERENCES companies (id),
  ADD CONSTRAINT fk_jobs_legal_entity FOREIGN KEY (legal_entity_id) REFERENCES companies (id),
  ADD CONSTRAINT fk_jobs_archived_by FOREIGN KEY (archived_by) REFERENCES users (id);

-- Transition safety: if the phase 1 code is still (or again) running against this
-- database, its inserts carry no company. Fill the phase 1 owner so they still work.
-- Removed in a later release once phase 1 code is retired.
CREATE TRIGGER jobs_legacy_default_company BEFORE INSERT ON jobs FOR EACH ROW
  SET NEW.company_id      = COALESCE(NEW.company_id,      (SELECT id FROM companies WHERE code = 'BSPL-CORR')),
      NEW.legal_entity_id = COALESCE(NEW.legal_entity_id, (SELECT id FROM companies WHERE code = 'BSPL'));

CREATE TABLE design_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  version_no INT NOT NULL,
  file_path VARCHAR(255) NOT NULL,          -- display copy, served under /uploads
  original_path VARCHAR(255) NULL,          -- untouched upload (new uploads only)
  original_filename VARCHAR(255) NULL,
  mime_type VARCHAR(100) NULL,
  file_size INT NULL,
  sha256 CHAR(64) NULL,
  uploaded_by INT NOT NULL,
  change_note VARCHAR(255) NULL,
  reference_status ENUM('not_started','processing','needs_review','approved','rejected','failed')
    NOT NULL DEFAULT 'not_started',          -- QC engine reference preparation (phase 3)
  reference_reviewed_by INT NULL,
  reference_reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_design_versions_job_version (job_id, version_no),
  CONSTRAINT fk_design_versions_job FOREIGN KEY (job_id) REFERENCES jobs (id),
  CONSTRAINT fk_design_versions_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id),
  CONSTRAINT fk_design_versions_reviewer FOREIGN KEY (reference_reviewed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO design_versions (job_id, version_no, file_path, mime_type, uploaded_by, change_note, created_at)
SELECT id, 1, image_path,
       CASE WHEN LOWER(image_path) LIKE '%.png' THEN 'image/png'
            WHEN LOWER(image_path) LIKE '%.pdf' THEN 'application/pdf'
            ELSE 'image/jpeg' END,
       uploaded_by, 'Imported from QC Portal phase 1', created_at
FROM jobs;

UPDATE jobs j
JOIN design_versions v ON v.job_id = j.id AND v.version_no = 1
SET j.current_version_id = v.id;

ALTER TABLE jobs
  ADD CONSTRAINT fk_jobs_current_version FOREIGN KEY (current_version_id) REFERENCES design_versions (id);
