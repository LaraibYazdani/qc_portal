-- 005: place BSPL employees of "Business Unit Corrugated Boxes" in BSPL › Corrugated Division.
--
-- Confirmed from SuccessFactors (npm run sf:org-lookup, 2026-11-09): EmpJob.businessUnit 10000020
-- is "Business Unit Corrugated Boxes" (339 people, divisions BUCP - Production KSR/KHI, Marketing,
-- Maintenance, Logistics, Planning, EHS & QA). Every division sits inside exactly one business unit,
-- so businessUnit is the right field. Cost-centre prefixes do not line up with business units.
--
-- BSPL employees in other business units (Paper & Board, Energy & Productivity, HR, Finance,
-- Sustainability & EHS, Main Office) keep matching the whole-entity BSPL rule from 001.

INSERT INTO company_sf_mappings (company_id, sf_company_code, sf_field, match_type, sf_value, priority, note)
SELECT id, '1200', 'businessUnit', 'equals', '10000020', 0, 'Business Unit Corrugated Boxes (SuccessFactors)'
FROM companies WHERE code = 'BSPL-CORR';

INSERT INTO audit_log (actor_label, company_id, action, entity_type, entity_id, details)
SELECT 'migration 005', c.id, 'company.mapping_create', 'company_sf_mapping', m.id,
       JSON_OBJECT('sf_company_code', '1200', 'sf_field', 'businessUnit', 'sf_value', '10000020',
                   'source', 'SuccessFactors FOBusinessUnit name: Business Unit Corrugated Boxes')
FROM companies c
JOIN company_sf_mappings m ON m.company_id = c.id AND m.sf_field = 'businessUnit' AND m.sf_value = '10000020'
WHERE c.code = 'BSPL-CORR';
