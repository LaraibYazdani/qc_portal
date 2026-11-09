import crypto from 'crypto';
import { verifyIdToken, IasError } from '../ias';

const ISSUER = 'https://tenant.accounts.ondemand.com';
const CLIENT = 'qc-portal-client';
const NONCE = 'nonce-123';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = (k: crypto.KeyObject, kid: string) => ({ ...k.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' });
const JWKS = { keys: [jwk(publicKey, 'key-1')] };

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(claims: Record<string, unknown>, opts: { kid?: string; key?: crypto.KeyObject; alg?: string } = {}) {
  const head = b64({ alg: opts.alg ?? 'RS256', typ: 'JWT', kid: opts.kid ?? 'key-1' });
  const body = b64(claims);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), opts.key ?? privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}
const now = Math.floor(Date.now() / 1000);
const good = { iss: ISSUER, aud: CLIENT, exp: now + 300, iat: now, nonce: NONCE, employee_number: '30000180' };
const opts = { jwks: JWKS, issuer: ISSUER, clientId: CLIENT, nonce: NONCE };

const rejects = async (token: string, code: string, o = opts) => {
  await expect(verifyIdToken(token, o)).rejects.toBeInstanceOf(IasError);
  await expect(verifyIdToken(token, o)).rejects.toMatchObject({ code });
};

describe('verifyIdToken', () => {
  it('accepts a correctly signed token and returns its claims', async () => {
    expect((await verifyIdToken(sign(good), opts)).employee_number).toBe('30000180');
  });

  it('accepts an audience list that includes the portal', async () => {
    await expect(verifyIdToken(sign({ ...good, aud: ['other', CLIENT] }), opts)).resolves.toBeTruthy();
  });

  it('rejects a token signed by someone else', () => rejects(sign(good, { key: other.privateKey }), 'token_validation_failed'));

  it('rejects edited claims (signature no longer matches)', async () => {
    const [h, , s] = sign(good).split('.');
    await rejects(`${h}.${b64({ ...good, employee_number: '99999999' })}.${s}`, 'token_validation_failed');
  });

  it('rejects unsigned tokens (alg none)', () => rejects(`${b64({ alg: 'none' })}.${b64(good)}.`, 'token_validation_failed'));
  it('rejects the wrong issuer', () => rejects(sign({ ...good, iss: 'https://evil.example.com' }), 'token_validation_failed'));
  it('rejects a token for another application', () => rejects(sign({ ...good, aud: 'other-app' }), 'token_validation_failed'));
  it('rejects an expired token', () => rejects(sign({ ...good, exp: now - 3600 }), 'token_validation_failed'));
  it('rejects a replayed sign-in (nonce mismatch)', () => rejects(sign({ ...good, nonce: 'other' }), 'token_validation_failed'));
  it('rejects malformed tokens', () => rejects('not-a-token', 'invalid_token_claims'));

  it('reloads the keys once when SAP has rotated them', async () => {
    const rotated = sign(good, { kid: 'key-2', key: other.privateKey });
    const refetch = jest.fn(async () => ({ keys: [jwk(other.publicKey, 'key-2')] }));
    await expect(verifyIdToken(rotated, opts, refetch)).resolves.toBeTruthy();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
