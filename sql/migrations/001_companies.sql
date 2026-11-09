-- 001 · Companies as a tree (legal entities from SuccessFactors, sub-companies under them)
-- and the rules that map a SuccessFactors employee record to a company.
-- Works on MariaDB 10.4+ and MySQL 8.

CREATE TABLE companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(150) NOT NULL,
  sf_company_code VARCHAR(20) NULL,          -- EmpJob.company, set on legal entities only
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_companies_code (code),
  KEY idx_companies_parent (parent_id),
  KEY idx_companies_sf_code (sf_company_code),
  CONSTRAINT fk_companies_parent FOREIGN KEY (parent_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A user is placed in the company of the most specific matching rule:
--   sf_field NULL                 -> any employee of that legal entity
--   sf_field = 'division' etc.    -> employees whose EmpJob field equals / starts with sf_value
CREATE TABLE company_sf_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  sf_company_code VARCHAR(20) NOT NULL,
  sf_field VARCHAR(50) NULL,
  match_type ENUM('equals','prefix') NOT NULL DEFAULT 'equals',
  sf_value VARCHAR(100) NULL,
  priority INT NOT NULL DEFAULT 0,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sf_mappings_code (sf_company_code),
  CONSTRAINT fk_sf_mappings_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Legal entities, from EmpJob.company (same codes as the Employee Clearance Portal)
INSERT INTO companies (code, name, sf_company_code) VALUES
  ('PL',         'PL',          '1000'),
  ('PCL',        'PCL',         '1100'),
  ('BSPL',       'BSPL',        '1200'),
  ('DIC',        'DIC',         '1300'),
  ('TRIPACK',    'Tripack',     '1400'),
  ('STARCHPACK', 'StarchPack',  '1500'),
  ('PREL',       'PREL',        '1600'),
  ('OMYA',       'OMYA',        '1700'),
  ('IGI-GEN',    'IGI General', '5100'),
  ('IGI-LIFE',   'IGI Life',    '5200'),
  ('IGI-FINEX',  'IGI Finex',   '5300');

-- Known sub-company: owns all artwork uploaded in phase 1
INSERT INTO companies (parent_id, code, name)
SELECT id, 'BSPL-CORR', 'Corrugated Division' FROM companies WHERE code = 'BSPL';

-- Default rule per legal entity: its employees land at the legal-entity level.
-- Sub-company rules (e.g. BSPL division -> BSPL-CORR) are added from the admin
-- dashboard once the distinguishing SuccessFactors field is confirmed.
INSERT INTO company_sf_mappings (company_id, sf_company_code, note)
SELECT id, sf_company_code, 'Default: whole legal entity' FROM companies WHERE sf_company_code IS NOT NULL;
