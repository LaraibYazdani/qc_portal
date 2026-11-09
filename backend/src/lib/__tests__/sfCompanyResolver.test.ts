import { resolveCompanyId, SfMapping } from '../sfCompanyResolver';

const BSPL = 3, BSPL_CORR = 12, BSPL_OTHER = 13, PL = 1;

const entityRules: SfMapping[] = [
  { id: 1, company_id: PL, sf_company_code: '1000', sf_field: null, match_type: 'equals', sf_value: null, priority: 0 },
  { id: 3, company_id: BSPL, sf_company_code: '1200', sf_field: null, match_type: 'equals', sf_value: null, priority: 0 },
];

// Shapes taken from real EmpJob records (other fields omitted).
// All three BSPL records have company "1200".
const bsplPrePress = { userId: '30000180', company: '1200', division: '20000056', businessUnit: '10000020', costCenter: 'PKGS1211100000', location: '1900-6012', department: '30000099' };
const bsplKeyAccounts = { userId: '30001961', company: '1200', division: '20000058', businessUnit: '10000020', costCenter: 'PKGS1211500000', location: '1900-6001', department: '30000092' };
const bsplWcm = { userId: '30001991', company: '1200', division: '20000070', businessUnit: '10000022', costCenter: 'PKGS1220152003', location: '1900-6012', department: '30000167' };
const plEmployee = { userId: '10009563', company: '1000', division: '20000016', businessUnit: '10000002', costCenter: 'PKGS1001703400' };

describe('resolveCompanyId', () => {
  // Confirmed in SuccessFactors: businessUnit 10000020 = "Business Unit Corrugated Boxes",
  // 10000022 = "Energy & Productivity". Rule 20 is what migration 005 seeds.
  const byBusinessUnit: SfMapping[] = [
    ...entityRules,
    { id: 20, company_id: BSPL_CORR, sf_company_code: '1200', sf_field: 'businessUnit', match_type: 'equals', sf_value: '10000020', priority: 0 },
    { id: 21, company_id: BSPL_OTHER, sf_company_code: '1200', sf_field: 'businessUnit', match_type: 'equals', sf_value: '10000022', priority: 0 },
  ];

  it('Corrugated Boxes employees land in Corrugated whatever their division (Production KSR, Marketing)', () => {
    expect(resolveCompanyId(bsplPrePress, byBusinessUnit)).toBe(BSPL_CORR);
    expect(resolveCompanyId(bsplKeyAccounts, byBusinessUnit)).toBe(BSPL_CORR);
  });

  it('an Energy & Productivity employee does not land in Corrugated', () => {
    expect(resolveCompanyId(bsplWcm, byBusinessUnit)).toBe(BSPL_OTHER);
    expect(resolveCompanyId(bsplWcm, byBusinessUnit.filter(r => r.id !== 21))).toBe(BSPL);
  });

  it('a division rule is too narrow: it splits two Corrugated employees', () => {
    const byDivision: SfMapping[] = [
      ...entityRules,
      { id: 40, company_id: BSPL_CORR, sf_company_code: '1200', sf_field: 'division', match_type: 'equals', sf_value: '20000056', priority: 0 },
    ];
    expect(resolveCompanyId(bsplPrePress, byDivision)).toBe(BSPL_CORR);
    expect(resolveCompanyId(bsplKeyAccounts, byDivision)).toBe(BSPL);
  });

  it('falls back to the legal entity when no sub-company rule matches', () => {
    expect(resolveCompanyId({ ...bsplPrePress, businessUnit: '99999999' }, byBusinessUnit)).toBe(BSPL);
  });

  it('maps other legal entities by company code', () => {
    expect(resolveCompanyId(plEmployee, byBusinessUnit)).toBe(PL);
  });

  it('a higher-priority rule wins between two field rules', () => {
    const rules: SfMapping[] = [
      ...byBusinessUnit,
      { id: 50, company_id: 99, sf_company_code: '1200', sf_field: 'location', match_type: 'equals', sf_value: '1900-6001', priority: 5 },
    ];
    expect(resolveCompanyId(bsplKeyAccounts, rules)).toBe(99);
    expect(resolveCompanyId(bsplPrePress, rules)).toBe(BSPL_CORR);
  });

  it('returns null for an unknown company code', () => {
    expect(resolveCompanyId({ company: '3000' }, byBusinessUnit)).toBeNull();
  });
});
