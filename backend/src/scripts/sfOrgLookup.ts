/**
 * Read-only SuccessFactors lookup: which business units, divisions and cost
 * centres exist inside one legal entity, with their names and head counts.
 * Used to decide the company_sf_mappings rules for sub-companies
 * (e.g. which businessUnit is BSPL's Corrugated Division).
 *
 *   npm run sf:org-lookup                 # company 1200 (BSPL)
 *   npm run sf:org-lookup -- --company 1100
 *
 * Needs SF_BASE_URL and SF_COMPANY_ID in .env, plus OAuth (SF_CLIENT_ID, SF_PRIVATE_KEY,
 * SF_ECADMIN_USER_ID; used when present) or basic auth (SF_API_USER, SF_API_PASS).
 * Force one with --auth oauth | --auth basic.
 * Writes nothing and prints no personal data, only codes, names and counts.
 */
import dotenv from 'dotenv';

dotenv.config();

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const COMPANY = arg('company', '1200');

const {
  SF_BASE_URL, SF_COMPANY_ID, SF_API_USER, SF_API_PASS,
  SF_CLIENT_ID, SF_PRIVATE_KEY, SF_ECADMIN_USER_ID,
} = process.env;
const BASE = (SF_BASE_URL ?? '').replace(/\/$/, '');
const hasOAuth = !!(SF_CLIENT_ID && SF_PRIVATE_KEY && SF_ECADMIN_USER_ID);
const hasBasic = !!(SF_API_USER && SF_API_PASS);
const MODE = arg('auth', hasOAuth ? 'oauth' : 'basic');
if (!BASE || !SF_COMPANY_ID || (MODE === 'oauth' ? !hasOAuth : !hasBasic)) {
  console.error('Set SF_BASE_URL and SF_COMPANY_ID, plus either SF_CLIENT_ID/SF_PRIVATE_KEY/SF_ECADMIN_USER_ID (OAuth) '
    + 'or SF_API_USER/SF_API_PASS (basic) in backend/.env.');
  process.exit(1);
}

/** OAuth 2.0 SAML bearer: SuccessFactors issues an assertion for the service user, then trades it for a token. */
async function oauthHeader(): Promise<string> {
  const tokenUrl = `${BASE}/oauth/token`;
  const idp = await fetch(`${BASE}/oauth/idp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: SF_CLIENT_ID!, user_id: SF_ECADMIN_USER_ID!, token_url: tokenUrl, private_key: SF_PRIVATE_KEY! }),
  });
  const assertion = await idp.text();
  if (!idp.ok) throw new Error(`${idp.status} from /oauth/idp: ${assertion.slice(0, 300)}`);
  const tok = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:saml2-bearer',
      client_id: SF_CLIENT_ID!, company_id: SF_COMPANY_ID!, assertion,
    }),
  });
  const body = await tok.json().catch(() => ({})) as { access_token?: string; error_description?: string };
  if (!tok.ok || !body.access_token) throw new Error(`${tok.status} from /oauth/token: ${body.error_description ?? 'no access_token'}`);
  return `Bearer ${body.access_token}`;
}

let AUTH = 'Basic ' + Buffer.from(`${SF_API_USER}@${SF_COMPANY_ID}:${SF_API_PASS}`).toString('base64');

type Row = Record<string, unknown>;

async function getAll(path: string): Promise<Row[]> {
  const rows: Row[] = [];
  let url: string | null = BASE + path;
  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: AUTH, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path.split('?')[0]}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json() as { d: { results: Row[]; __next?: string } };
    rows.push(...body.d.results);
    url = body.d.__next ?? null;
  }
  return rows;
}

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
  console.log(`SuccessFactors org structure for company ${COMPANY} (auth: ${MODE})`);
  if (MODE === 'oauth') AUTH = await oauthHeader();
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
