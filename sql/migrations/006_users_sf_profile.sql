-- 006 · Users: snapshot of the SuccessFactors fields that place them in a company.
-- Refreshed on every SAP sign-in and on "Sync from SuccessFactors" in user management,
-- so admins can see why someone landed in a company.
--
-- company_manual = 1 when an admin placed the user in a company by hand; sync then
-- keeps that company instead of applying the SuccessFactors rules.

ALTER TABLE users
  ADD COLUMN sf_company_code VARCHAR(20) NULL AFTER sf_employee_id,
  ADD COLUMN sf_business_unit VARCHAR(50) NULL AFTER sf_company_code,
  ADD COLUMN sf_division VARCHAR(50) NULL AFTER sf_business_unit,
  ADD COLUMN sf_job_title VARCHAR(150) NULL AFTER sf_division,
  ADD COLUMN sf_synced_at TIMESTAMP NULL DEFAULT NULL AFTER sf_job_title,
  ADD COLUMN company_manual TINYINT(1) NOT NULL DEFAULT 0 AFTER company_id;

-- Phase 1 users were placed in Corrugated by migration 002, not by SuccessFactors:
-- keep them there until an admin says otherwise.
UPDATE users SET company_manual = 1 WHERE company_id IS NOT NULL;
