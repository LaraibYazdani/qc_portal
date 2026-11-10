/**
 * PKCE (RFC 7636) for the SAP sign-in: a random secret stays in the app, only its SHA-256
 * goes to the server. The one-time code SAP's sign-in hands back only works with the secret.
 */
import * as Crypto from 'expo-crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '=';
  }
  return out;
}

export const base64Url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(bytesToBase64(Crypto.getRandomBytes(32)));   // 43 characters
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return { verifier, challenge: base64Url(digest) };
}
