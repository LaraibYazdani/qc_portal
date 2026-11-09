/**
 * Decide which company (or sub-company) a SuccessFactors employee belongs to.
 *
 * EmpJob.company gives the legal entity (e.g. "1200" = BSPL). Sub-companies
 * such as BSPL's Corrugated Division are told apart by another EmpJob field
 * (division, businessUnit, costCenter, location, ...). Admins configure that as
 * rows in company_sf_mappings; the most specific matching rule wins.
 */
export interface SfMapping {
  id: number;
  company_id: number;
  sf_company_code: string;
  sf_field: string | null;
  match_type: 'equals' | 'prefix';
  sf_value: string | null;
  priority: number;
}

export function resolveCompanyId(empJob: Record<string, unknown>, mappings: SfMapping[]): number | null {
  const companyCode = empJob.company == null ? '' : String(empJob.company);

  const matches = mappings.filter(m => {
    if (m.sf_company_code !== companyCode) return false;
    if (!m.sf_field) return true;                       // whole legal entity
    const raw = empJob[m.sf_field];
    if (raw == null || m.sf_value == null) return false;
    const value = String(raw);
    return m.match_type === 'prefix' ? value.startsWith(m.sf_value) : value === m.sf_value;
  });

  matches.sort((a, b) =>
    Number(!!b.sf_field) - Number(!!a.sf_field)        // field rules before whole-entity rules
    || b.priority - a.priority
    || a.id - b.id);

  return matches[0]?.company_id ?? null;
}
