-- Undo 005. The audit log is append-only, so the removal is recorded rather than the entry erased.

INSERT INTO audit_log (actor_label, company_id, action, entity_type, entity_id, details)
SELECT 'migration 005 rollback', m.company_id, 'company.mapping_delete', 'company_sf_mapping', m.id,
       JSON_OBJECT('sf_company_code', '1200', 'sf_field', 'businessUnit', 'sf_value', '10000020')
FROM company_sf_mappings m
JOIN companies c ON c.id = m.company_id AND c.code = 'BSPL-CORR'
WHERE m.sf_company_code = '1200' AND m.sf_field = 'businessUnit' AND m.sf_value = '10000020';

DELETE m FROM company_sf_mappings m
JOIN companies c ON c.id = m.company_id AND c.code = 'BSPL-CORR'
WHERE m.sf_company_code = '1200' AND m.sf_field = 'businessUnit' AND m.sf_value = '10000020';
