/**
 * SuccessFactors OData client (read-only).
 *
 * Auth: OAuth 2.0 SAML bearer (SF_CLIENT_ID, SF_PRIVATE_KEY, SF_ECADMIN_USER_ID), the same
 * flow the Employee Clearance Portal uses. Falls back to basic auth (SF_API_USER/SF_API_PASS)
 * only when the OAuth settings are missing. SF_MOCK_MODE=true serves fixtures instead.
 */

export interface SfEmployee {
  userId: string;
  name: string;
  email: string | null;
  company: string | null;        // EmpJob.company, e.g. "1200" = BSPL
  businessUnit: string | null;   // EmpJob.businessUnit, e.g. "10000020" = Corrugated Boxes
  division: string | null;
  department: string | null;
  costCenter: string | null;
  location: string | null;
  jobTitle: string | null;
}

const env = (k: string) => process.env[k] ?? '';
const base = () => (env('SF_BASE_URL') || 'https://api44.sapsf.com').replace(/\/$/, '');
const isMock = () => env('SF_MOCK_MODE') === 'true';
const hasOAuth = () => !!(env('SF_CLIENT_ID') && env('SF_PRIVATE_KEY') && env('SF_ECADMIN_USER_ID'));
const hasBasic = () => !!(env('SF_API_USER') && env('SF_API_PASS'));

export function sfConfigured(): boolean {
  return isMock() || (!!env('SF_COMPANY_ID') && (hasOAuth() || hasBasic()));
}

export class SfError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
let tokenCache: { header: string; expiresAt: number } | null = null;

async function oauthHeader(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.header;
  const tokenUrl = `${base()}/oauth/token`;
  const idp = await fetch(`${base()}/oauth/idp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('SF_CLIENT_ID'), user_id: env('SF_ECADMIN_USER_ID'),
      token_url: tokenUrl, private_key: env('SF_PRIVATE_KEY'),
    }),
  });
  const assertion = await idp.text();
  if (!idp.ok) throw new SfError(`SuccessFactors refused the SAML assertion request (${idp.status})`, idp.status);

  const tok = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:saml2-bearer',
      client_id: env('SF_CLIENT_ID'), company_id: env('SF_COMPANY_ID'), assertion,
    }),
  });
  const body = await tok.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
  if (!tok.ok || !body.access_token) throw new SfError(`SuccessFactors refused the token request (${tok.status})`, tok.status);
  tokenCache = { header: `Bearer ${body.access_token}`, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return tokenCache.header;
}

async function authHeader(): Promise<string> {
  if (hasOAuth()) return oauthHeader();
  return 'Basic ' + Buffer.from(`${env('SF_API_USER')}@${env('SF_COMPANY_ID')}:${env('SF_API_PASS')}`).toString('base64');
}

/** GET an OData path, following server-side paging. */
export async function sfGetAll(path: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let url: string | null = base() + path;
  let retried = false;
  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: await authHeader(), Accept: 'application/json' } });
    if (res.status === 401 && hasOAuth() && !retried) { tokenCache = null; retried = true; continue; }
    if (!res.ok) throw new SfError(`SuccessFactors request failed (${res.status}) for ${path.split('?')[0]}`, res.status);
    const body = await res.json() as { d: { results: Record<string, unknown>[]; __next?: string } };
    rows.push(...body.d.results);
    url = body.d.__next ?? null;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------
/** Employee IDs go into OData filters, so only plain IDs are accepted. */
export function isValidEmployeeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,50}$/.test(id);
}

const str = (v: unknown) => (v == null || v === '' ? null : String(v));

/**
 * The employee's current profile and job, or null when SuccessFactors has no
 * active employee with that ID (left, never existed). Network and auth problems throw.
 */
export async function getEmployee(userId: string): Promise<SfEmployee | null> {
  if (!isValidEmployeeId(userId)) throw new SfError('Employee ID may only contain letters, digits, - and _');
  if (isMock()) return MOCK_EMPLOYEES.find(e => e.userId === userId) ?? null;

  // Active = status 'f' or 't', as in the Employee Clearance Portal.
  const [user] = await sfGetAll(
    `/odata/v2/User?$format=json&$filter=userId eq '${userId}' and (status eq 'f' or status eq 't')`
    + '&$select=userId,displayName,firstName,lastName,email');
  if (!user) return null;

  const [job] = await sfGetAll(
    `/odata/v2/EmpJob?$format=json&$filter=userId eq '${userId}'`
    + '&$select=userId,company,businessUnit,division,department,costCenter,location,jobTitle,localJobTitle');

  const name = str(user.displayName) ?? [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return {
    userId,
    name: name || userId,
    email: str(user.email),
    company: str(job?.company),
    businessUnit: str(job?.businessUnit),
    division: str(job?.division),
    department: str(job?.department),
    costCenter: str(job?.costCenter),
    location: str(job?.location),
    jobTitle: str(job?.jobTitle) ?? str(job?.localJobTitle),
  };
}

const unitNames = new Map<string, string | null>();

/** Display name of a business unit (e.g. "Business Unit Corrugated Boxes"); null if unknown. */
export async function getBusinessUnitName(code: string | null): Promise<string | null> {
  if (!code || !/^[A-Za-z0-9_-]{1,50}$/.test(code)) return null;
  if (isMock()) return MOCK_UNITS[code] ?? null;
  if (unitNames.has(code)) return unitNames.get(code)!;
  try {
    const [row] = await sfGetAll(`/odata/v2/FOBusinessUnit?$format=json&$filter=externalCode eq '${code}'&$select=externalCode,name`);
    const name = str(row?.name);
    unitNames.set(code, name);
    return name;
  } catch {
    return null; // a missing name never blocks anything
  }
}

/** Test hook: forget the cached OAuth token. */
export function resetSfTokenCache(): void { tokenCache = null; }

// ---------------------------------------------------------------------------
// Mock data (SF_MOCK_MODE=true): job fields copied from real EmpJob records, names invented.
// ---------------------------------------------------------------------------
const MOCK_UNITS: Record<string, string> = {
  '10000020': 'Business Unit Corrugated Boxes',
  '10000021': 'Business Unit Paper & Board',
  '10000022': 'Energy & Productivity',
};

const MOCK_EMPLOYEES: SfEmployee[] = [
  { userId: '30000180', name: 'Mock Pre-Press Supervisor', email: 'mock.prepress@example.com', company: '1200', businessUnit: '10000020',
    division: '20000056', department: '30000099', costCenter: 'PKGS1211100000', location: '1900-6012', jobTitle: 'Pre-Press Supervisor' },
  { userId: '30001961', name: 'Mock Key Accounts Manager', email: 'mock.keyaccounts@example.com', company: '1200', businessUnit: '10000020',
    division: '20000058', department: '30000092', costCenter: 'PKGS1211500000', location: '1900-6001', jobTitle: 'Key Accounts Manager' },
  { userId: '30001991', name: 'Mock WCM Manager', email: 'mock.wcm@example.com', company: '1200', businessUnit: '10000022',
    division: '20000070', department: '30000167', costCenter: 'PKGS1220152003', location: '1900-6012', jobTitle: 'WCM Manager' },
  { userId: '10009563', name: 'Mock Internal Audit Manager', email: 'mock.audit@example.com', company: '1000', businessUnit: '10000002',
    division: '20000016', department: null, costCenter: 'PKGS1001703400', location: '1100-6001', jobTitle: 'Manager Internal Audit' },
];
