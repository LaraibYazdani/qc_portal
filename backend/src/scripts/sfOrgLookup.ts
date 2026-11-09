/**
 * Read-only SuccessFactors lookup: which business units, divisions and cost
 * centres exist inside one legal entity, with their names and head counts.
 * Used to decide the company_sf_mappings rules for sub-companies
 * (e.g. which businessUnit is BSPL's Corrugated Division).
 *
 *   npm run sf:org-lookup                 # company 1200 (BSPL)
 *   npm run sf:org-lookup -- --company 1100
 *
 * Uses the SuccessFactors settings in .env (see src/lib/successfactors.ts).
 * Writes nothing and prints no personal data, only codes, names and counts.
 */
import dotenv from 'dotenv';
import { sfConfigured, sfGetAll as getAll } from '../lib/successfactors';

dotenv.config();

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const COMPANY = arg('company', '1200');

if (!sfConfigured()) {
  console.error('Set SF_BASE_URL and SF_COMPANY_ID, plus SF_CLIENT_ID/SF_PRIVATE_KEY/SF_ECADMIN_USER_ID (OAuth) in backend/.env.');
  process.exit(1);
}
if (!/^[0-9A-Za-z]{1,10}$/.test(COMPANY)) {
  console.error('--company must be a company code such as 1200');
  process.exit(1);
}

type Row = Record<string, unknown>;

const nameOf = (r: Row) =>
  String(r.name ?? r.name_defaultValue ?? r.name_en_US ?? r.description ?? r.description_defaultValue ?? '').trim() || '(no name)';

/** Code → name for a foundation object. Tries the legacy FO entity, then the MDF one. */
async function names(entities: string[]): Promise<Map<string, string>> {
  for (const entity of entities) {
    try {
      const rows = await getAll(`/odata/v2/${entity}?$format=json`);
      return new Map(rows.map(r => [String(r.externalCode), nameOf(r)]));
    } catch (e) {
      console.warn(`  (${entity} not available: ${(e as Error).message.split(':')[0]})`);
    }
  }
  return new Map();
}

function summarise(title: string, jobs: Row[], field: string, labels: Map<string, string>) {
  const counts = new Map<string, number>();
  for (const j of jobs) {
    const code = j[field] == null ? '(empty)' : String(j[field]);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  console.log(`\n${title}`);
  console.log('  code'.padEnd(20) + 'people'.padStart(7) + '   name');
  for (const [code, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(18)}${String(n).padStart(7)}   ${labels.get(code) ?? ''}`);
  }
}

(async () => {
  console.log(`SuccessFactors org structure for company ${COMPANY}`);
  const jobs = await getAll(
    `/odata/v2/EmpJob?$format=json&$filter=company eq '${COMPANY}'&$select=userId,businessUnit,division,costCenter,location,department`);
  if (!jobs.length) {
    console.log('No current EmpJob records for that company code.');
    return;
  }
  console.log(`${jobs.length} current job records`);

  const [bu, div, cc] = await Promise.all([
    names(['FOBusinessUnit', 'BusinessUnit']),
    names(['FODivision', 'Division']),
    names(['FOCostCenter', 'CostCenter']),
  ]);

  summarise('Business units (EmpJob.businessUnit)', jobs, 'businessUnit', bu);
  summarise('Divisions (EmpJob.division)', jobs, 'division', div);

  // Cost centres grouped by their first 8 characters (e.g. PKGS1211), with one example name each.
  const prefixed = jobs.map(j => ({ ...j, ccPrefix: j.costCenter == null ? null : String(j.costCenter).slice(0, 8) }));
  const prefixNames = new Map<string, string>();
  for (const [code, name] of cc) {
    const p = code.slice(0, 8);
    if (!prefixNames.has(p)) prefixNames.set(p, `e.g. ${code} ${name}`);
  }
  summarise('Cost centre prefixes (first 8 characters)', prefixed, 'ccPrefix', prefixNames);

  // Which business unit each division sits in: shows whether division is nested inside businessUnit.
  const pairs = new Map<string, Set<string>>();
  for (const j of jobs) {
    const d = String(j.division ?? '(empty)');
    if (!pairs.has(d)) pairs.set(d, new Set());
    pairs.get(d)!.add(String(j.businessUnit ?? '(empty)'));
  }
  const spread = [...pairs].filter(([, s]) => s.size > 1);
  console.log(`\nDivisions spread over more than one business unit: ${spread.length ? spread.map(([d, s]) => `${d} → ${[...s].join(', ')}`).join('; ') : 'none (each division sits inside one business unit)'}`);
})().catch(e => { console.error('FAILED:', (e as Error).message); process.exit(1); });
