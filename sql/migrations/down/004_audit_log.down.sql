-- Rollback of 004. Removes the audit log (only for undoing a failed release).
DROP TRIGGER IF EXISTS audit_log_no_update;
DROP TRIGGER IF EXISTS audit_log_no_delete;
DROP TABLE IF EXISTS audit_log;
