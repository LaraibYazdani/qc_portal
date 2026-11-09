-- Undo 006. The SuccessFactors snapshot is dropped; it is refreshed from SuccessFactors on the next sign-in.
ALTER TABLE users
  DROP COLUMN sf_company_code,
  DROP COLUMN sf_business_unit,
  DROP COLUMN sf_division,
  DROP COLUMN sf_job_title,
  DROP COLUMN sf_synced_at,
  DROP COLUMN company_manual;
