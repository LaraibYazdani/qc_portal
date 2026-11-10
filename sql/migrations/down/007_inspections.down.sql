-- Undo 007. Drops the photo check records: take a backup first if any checks were done.
-- The reference and photo files stay on disk (uploads/_engine) and can be removed by hand.

DROP TABLE inspections;

UPDATE design_versions SET reference_status = 'not_started' WHERE reference_status = 'queued';

ALTER TABLE design_versions
  DROP KEY idx_design_versions_reference_status,
  DROP COLUMN reference_review_note,
  DROP COLUMN reference_prepared_at,
  DROP COLUMN reference_error,
  DROP COLUMN reference_meta,
  DROP COLUMN reference_dir,
  MODIFY reference_status ENUM('not_started','processing','needs_review','approved','rejected','failed')
    NOT NULL DEFAULT 'not_started';
