-- Rollback of 002. Fails if any user has a new role or no password (IAS user);
-- change or remove those users first.

ALTER TABLE users
  DROP FOREIGN KEY fk_users_company;

ALTER TABLE users
  DROP INDEX uq_users_sf_employee,
  DROP INDEX idx_users_company,
  DROP COLUMN company_id,
  DROP COLUMN sf_employee_id,
  DROP COLUMN status,
  DROP COLUMN auth_source,
  DROP COLUMN last_login_at,
  DROP COLUMN updated_at,
  MODIFY role ENUM('sales','admin','operator') NOT NULL DEFAULT 'sales',
  MODIFY password VARCHAR(255) NOT NULL;
