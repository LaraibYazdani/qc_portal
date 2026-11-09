-- 004 · Append-only audit log. No foreign keys, so entries survive any later change.
-- Triggers refuse UPDATE and DELETE, so entries cannot be altered through the database either.

CREATE TABLE audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actor_user_id INT NULL,
  actor_label VARCHAR(191) NULL,             -- name/email at the time, or 'system'
  company_id INT NULL,
  action VARCHAR(64) NOT NULL,               -- e.g. job.create, job.archive, user.role_change
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(64) NULL,
  details JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_company_time (company_id, occurred_at),
  KEY idx_audit_actor_time (actor_user_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log is append-only';

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log is append-only';

INSERT INTO audit_log (actor_label, company_id, action, entity_type, details)
SELECT 'system', c.id, 'migration.import_phase1', 'jobs',
       JSON_OBJECT('jobs', (SELECT COUNT(*) FROM jobs),
                   'users', (SELECT COUNT(*) FROM users),
                   'assigned_company', 'BSPL-CORR')
FROM companies c WHERE c.code = 'BSPL-CORR';
