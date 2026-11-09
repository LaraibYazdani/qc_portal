/**
 * SAP Identity Authentication Service (IAS) sign-in: OpenID Connect authorization
 * code flow with PKCE.
 *
 * Compared with the reference portal this also:
 *  - verifies the ID token's signature against the tenant's published keys (JWKS);
 *  - never puts the portal session token in a URL: the callback hands the browser a
 *    one-time code (valid 60 s) that the login page trades for the token.
 *
 * Pending sign-ins and one-time codes live in memory. The API runs as one process;
 * if it ever runs as several, move them to the database.
 */
import crypto from 'crypto';

const env = (k: string) => (process.env[k] ?? '').trim();
const issuer = () => env('IAS_ISSUER').replace(/\/$/, '');

export function iasEnabled(): boolean {
  return env('IAS_ENABLED') === 'true' && !!(issuer() && env('IAS_CLIENT_ID') && env('IAS_CLIENT_SECRET') && env('IAS_REDIRECT_URI'));
}

export const employeeIdClaim = () => env('IAS_EMPLOYEE_ID_CLAIM') || 'employee_number';

export class IasError extends Error {
  /** `code` is shown to the user as ?ias_error=<code> on the login page. */
  constructor(public code: string, message: string) { super(message); }
}

// ---------------------------------------------------------------------------
// Tenant endpoints (OpenID discovery, cached for an hour; .env values win)
// ---------------------------------------------------------------------------
interface Endpoints { authorize: string; token: string; jwks: string }
let discovered: { at: number; endpoints: Endpoints } | null = null;

async function endpoints(): Promise<Endpoints> {
  if (discovered && Date.now() - discovered.at < 3_600_000) return discovered.endpoints;
  let doc: any = {};
  try {
    const res = await fetch(`${issuer()}/.well-known/openid-configuration`);
    if (res.ok) doc = await res.json();
  } catch { /* fall back to .env / IAS defaults */ }
  const e: Endpoints = {
    authorize: env('IAS_AUTHORIZE_URL') || doc.authorization_endpoint || `${issuer()}/oauth2/authorize`,
    token: env('IAS_TOKEN_URL') || doc.token_endpoint || `${issuer()}/oauth2/token`,
    jwks: env('IAS_JWKS_URL') || doc.jwks_uri || `${issuer()}/oauth2/certs`,
  };
  discovered = { at: Date.now(), endpoints: e };
  return e;
}

// ---------------------------------------------------------------------------
// Short-lived state
// ---------------------------------------------------------------------------
const PENDING_TTL = 10 * 60_000;
const CODE_TTL = 60_000;
const pending = new Map<string, { nonce: string; verifier: string; at: number }>();
const handoff = new Map<string, { userId: number; at: number }>();

function sweep() {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.at > PENDING_TTL) pending.delete(k);
  for (const [k, v] of handoff) if (now - v.at > CODE_TTL) handoff.delete(k);
}

const random = () => crypto.randomBytes(32).toString('base64url');

/** Start a sign-in: the SAP URL to send the browser to, and the state to pin in a cookie. */
export async function startSignIn(): Promise<{ url: string; state: string }> {
  sweep();
  if (pending.size > 5000) throw new IasError('busy', 'Too many sign-ins in progress');
  const state = random(), nonce = random(), verifier = random();
  pending.set(state, { nonce, verifier, at: Date.now() });
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const url = new URL((await endpoints()).authorize);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: env('IAS_CLIENT_ID'),
    redirect_uri: env('IAS_REDIRECT_URI'),
    scope: 'openid profile email',
    state, nonce,
    code_challenge: challenge, code_challenge_method: 'S256',
  }).toString();
  return { url: url.toString(), state };
}

/**
 * Finish a sign-in: check the state, trade the code for an ID token and verify it.
 * Returns the token's claims.
 */
export async function finishSignIn(state: string, code: string): Promise<Record<string, any>> {
  sweep();
  const p = pending.get(state);
  if (!p) throw new IasError('invalid_state', 'Unknown or expired sign-in');
  pending.delete(state);

  const e = await endpoints();
  let res: Response;
  try {
    res = await fetch(e.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${env('IAS_CLIENT_ID')}:${env('IAS_CLIENT_SECRET')}`).toString('base64'),
        Accept: 'application/json',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: env('IAS_REDIRECT_URI'), code_verifier: p.verifier }),
    });
  } catch {
    throw new IasError('token_request_error', 'Could not reach SAP IAS');
  }
  const body = await res.json().catch(() => ({})) as { id_token?: string };
  if (!res.ok) throw new IasError('token_exchange_failed', `SAP IAS refused the code (${res.status})`);
  if (!body.id_token) throw new IasError('no_id_token', 'SAP IAS returned no ID token');

  return verifyIdToken(body.id_token, { jwks: await getJwks(e.jwks), issuer: issuer(), clientId: env('IAS_CLIENT_ID'), nonce: p.nonce },
    async () => getJwks(e.jwks, true));
}

/** One-time code the login page trades for a session. */
export function createHandoffCode(userId: number): string {
  sweep();
  const code = random();
  handoff.set(code, { userId, at: Date.now() });
  return code;
}

export function redeemHandoffCode(code: string): number | null {
  sweep();
  const h = handoff.get(code);
  if (!h) return null;
  handoff.delete(code);
  return h.userId;
}

// ---------------------------------------------------------------------------
// ID token verification
// ---------------------------------------------------------------------------
type Jwks = { keys: Array<Record<string, any>> };
let jwksCache: { at: number; url: string; jwks: Jwks } | null = null;

async function getJwks(url: string, force = false): Promise<Jwks> {
  if (!force && jwksCache && jwksCache.url === url && Date.now() - jwksCache.at < 3_600_000) return jwksCache.jwks;
  const res = await fetch(url);
  if (!res.ok) throw new IasError('token_validation_failed', `Could not load SAP IAS signing keys (${res.status})`);
  const jwks = await res.json() as Jwks;
  jwksCache = { at: Date.now(), url, jwks };
  return jwks;
}

const ALGS: Record<string, string> = { RS256: 'RSA-SHA256', RS384: 'RSA-SHA384', RS512: 'RSA-SHA512' };

/**
 * Verify a signed ID token: RS256/384/512 signature by a key in `jwks`, issuer,
 * audience, expiry and nonce. `refetch` is called once when the key id is unknown
 * (SAP rotated its keys).
 */
export async function verifyIdToken(
  token: string,
  opts: { jwks: Jwks; issuer: string; clientId: string; nonce: string; now?: number },
  refetch?: () => Promise<Jwks>,
): Promise<Record<string, any>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new IasError('invalid_token_claims', 'Malformed ID token');
  const [h, p, s] = parts;
  let header: any, claims: any;
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    throw new IasError('invalid_token_claims', 'Malformed ID token');
  }

  const alg = ALGS[header.alg];
  if (!alg) throw new IasError('token_validation_failed', `Unsupported token algorithm ${header.alg}`);

  const pick = (jwks: Jwks) => {
    const rsa = jwks.keys.filter(k => k.kty === 'RSA' && (!k.use || k.use === 'sig'));
    return header.kid ? rsa.find(k => k.kid === header.kid) : (rsa.length === 1 ? rsa[0] : undefined);
  };
  let jwk = pick(opts.jwks);
  if (!jwk && refetch) jwk = pick(await refetch());
  if (!jwk) throw new IasError('token_validation_failed', 'ID token signed by an unknown key');

  const key = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
  if (!crypto.verify(alg, Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) {
    throw new IasError('token_validation_failed', 'ID token signature is invalid');
  }

  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const skew = 60;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (String(claims.iss ?? '').replace(/\/$/, '') !== opts.issuer.replace(/\/$/, '')) throw new IasError('token_validation_failed', 'Wrong issuer');
  if (!aud.includes(opts.clientId)) throw new IasError('token_validation_failed', 'Token is for another application');
  if (typeof claims.exp !== 'number' || claims.exp < now - skew) throw new IasError('token_validation_failed', 'Token expired');
  if (typeof claims.nbf === 'number' && claims.nbf > now + skew) throw new IasError('token_validation_failed', 'Token not valid yet');
  if (claims.nonce !== opts.nonce) throw new IasError('token_validation_failed', 'Nonce mismatch');
  return claims;
}
