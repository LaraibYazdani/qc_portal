-- 002 · Users: company, SuccessFactors link, account status, new roles.
-- Existing roles keep their stored values (sales = uploader, operator = quality
-- checker, admin = group admin) so current accounts keep working unchanged.

ALTER TABLE users
  MODIFY password VARCHAR(255) NULL,                 -- IAS users have no local password
  MODIFY role ENUM('sales','admin','operator','qc_supervisor','company_admin') NOT NULL DEFAULT 'sales',
  ADD COLUMN company_id INT NULL AFTER role,
  ADD COLUMN sf_employee_id VARCHAR(50) NULL AFTER company_id,
  ADD COLUMN status ENUM('active','pending','disabled') NOT NULL DEFAULT 'active' AFTER sf_employee_id,
  ADD COLUMN auth_source ENUM('local','ias') NOT NULL DEFAULT 'local' AFTER status,
  ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  ADD UNIQUE KEY uq_users_sf_employee (sf_employee_id),
  ADD KEY idx_users_company (company_id),
  ADD CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies (id);

-- Phase 1 users work for BSPL's Corrugated Division. Admins stay group-wide (no company).
UPDATE users
SET company_id = (SELECT id FROM companies WHERE code = 'BSPL-CORR')
WHERE role <> 'admin';
