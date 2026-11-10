/** Calls to the PackVision API with the signed-in user's token. */
import { API_URL } from './config';

let token: string | null = null;
let onSessionEnded: (() => void) | null = null;

// Screens can mount before the saved session has been read back from secure storage; their
// calls wait for that, so they aren't sent without the token (and answered 401).
let markRestored: () => void = () => {};
const restored = new Promise<void>(resolve => { markRestored = resolve; });
/** Called once at start-up, after the saved token (if any) has been loaded. */
export const sessionRestored = () => markRestored();

export const setToken = (t: string | null) => { token = t; };
export const getToken = () => token;
/** Waits for start-up, then gives the token to send. */
export async function readyToken(): Promise<string | null> {
  await restored;
  return token;
}
/** Called when the API says the session is no longer valid (expired, account disabled). */
export const setSessionEndedHandler = (fn: (() => void) | null) => { onSessionEnded = fn; };

export class ApiError extends Error {
  status: number;
  code?: string;
  data: any;
  constructor(status: number, message: string, data: any = {}) {
    super(message);
    this.status = status;
    this.code = data?.code;
    this.data = data;
  }
  get offline() { return this.status === 0; }
}

const NETWORK_MESSAGE = "Can't reach PackVision. Check the Wi-Fi or mobile data and try again.";

export function messageOf(data: any, fallback: string): string {
  return data?.message || data?.error || data?.errors?.[0]?.msg || fallback;
}

/** The API answers 401 with no/invalid session and 403 "Invalid or expired token" for an old token. */
export function sessionEnded(status: number, data: any): boolean {
  return status === 401 || (status === 403 && /invalid or expired token/i.test(String(data?.error ?? '')));
}

/** Ends the session only when the refused request carried the token that is still current
 *  (a late answer to an older request must not sign out a newer session). */
export function handleSessionEnd(status: number, data: any, sentToken: string | null) {
  if (sentToken && sentToken === token && sessionEnded(status, data)) onSessionEnded?.();
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const sentToken = await readyToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    handleSessionEnd(res.status, data, sentToken);
    throw new ApiError(res.status, messageOf(data, `Something went wrong (${res.status}). Please try again.`), data);
  }
  return data as T;
}

export const errorText = (e: unknown, fallback = 'Something went wrong. Please try again.') =>
  e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : fallback;
