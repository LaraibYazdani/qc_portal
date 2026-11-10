/**
 * Who is signed in. The session token sits in the phone's secure storage; the user is
 * refreshed from the API at start-up (a role change or a disabled account applies at once).
 *
 * SAP sign-in: the phone's browser opens /api/auth/ias/mobile/start, goes through SAP and
 * comes back to packvision://auth?ias_code=… ; the app trades that code plus its PKCE secret
 * for a session (POST /api/auth/ias/exchange).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { api, ApiError, sessionRestored, setSessionEndedHandler, setToken } from './api';
import { API_URL } from './config';
import { makePkce } from './pkce';
import { getItem, getJSON, KEYS, removeItem, setItem, setJSON } from './store';
import { User } from './types';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: User | null;
  sapEnabled: boolean;
  /** Shown on the sign-in screen once (e.g. "your session ended"). */
  notice: string | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithSap: () => Promise<'signedIn' | 'cancelled'>;
  signOut: (notice?: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export const SAP_ERRORS: Record<string, string> = {
  pending: 'Your account has been created and is waiting for an administrator to give you access. You can sign in once that is done.',
  disabled: 'Your account is disabled. Contact your administrator.',
  not_in_sf: 'You are not listed as an active employee in SuccessFactors.',
  sf_unavailable: 'SuccessFactors could not be reached to set up your account. Please try again in a few minutes.',
  ias_denied: 'SAP sign-in was cancelled.',
  invalid_state: 'The sign-in took too long. Please try again.',
  no_employee_number: 'SAP did not send your employee number. Ask IT to check the IAS application settings.',
  unavailable: 'SAP sign-in is unavailable right now. Please try again shortly.',
};
const SAP_FALLBACK = 'SAP sign-in did not complete. Please try again, or contact IT if it keeps happening.';

export class SignInError extends Error {
  info: boolean;
  constructor(message: string, info = false) {
    super(message);
    this.info = info;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [sapEnabled, setSapEnabled] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const startSession = useCallback(async (token: string, u: User) => {
    setToken(token);
    await setItem(KEYS.token, token);
    await setJSON(KEYS.user, u);
    setUser(u);
    setNotice(null);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async (message?: string) => {
    if (message === undefined) api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    await removeItem(KEYS.token);
    await removeItem(KEYS.user);
    setUser(null);
    setNotice(message ?? null);
    setStatus('signedOut');
  }, []);

  const refresh = useCallback(async () => {
    const res = await api<{ user: User }>('/api/auth/me');
    setUser(res.user);
    await setJSON(KEYS.user, res.user);
  }, []);

  // Start-up: restore the session, refresh the user (keep the saved one when offline)
  useEffect(() => {
    setSessionEndedHandler(() => { signOut('Your session has ended. Please sign in again.'); });
    (async () => {
      api<{ ias_enabled: boolean }>('/api/auth/config').then(c => setSapEnabled(!!c.ias_enabled)).catch(() => {});
      const [token, saved] = await Promise.all([getItem(KEYS.token), getJSON<User | null>(KEYS.user, null)]);
      setToken(token);
      sessionRestored();                    // calls waiting for the token may go now
      if (!token) { setStatus('signedOut'); return; }
      try {
        const res = await api<{ user: User }>('/api/auth/me');
        await startSession(token, res.user);
      } catch (e) {
        if (e instanceof ApiError && e.offline && saved) {
          setUser(saved);
          setStatus('signedIn');
        } else if (!(e instanceof ApiError && e.offline)) {
          await signOut(e instanceof ApiError && e.status === 401 ? 'Your session has ended. Please sign in again.' : undefined);
        } else {
          setStatus('signedOut');
        }
      }
    })();
    return () => setSessionEndedHandler(null);
  }, [signOut, startSession]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>('/api/auth/login', { body: { email: email.trim(), password } });
    await startSession(res.token, res.user);
  }, [startSession]);

  const signInWithSap = useCallback(async () => {
    const { verifier, challenge } = await makePkce();
    const returnTo = Linking.createURL('auth');
    const url = `${API_URL}/api/auth/ias/mobile/start?redirect_uri=${encodeURIComponent(returnTo)}`
      + `&code_challenge=${challenge}&code_challenge_method=S256`;
    const result = await WebBrowser.openAuthSessionAsync(url, returnTo);
    if (result.type !== 'success') return 'cancelled' as const;

    const { queryParams } = Linking.parse(result.url);
    const error = typeof queryParams?.ias_error === 'string' ? queryParams.ias_error : null;
    const code = typeof queryParams?.ias_code === 'string' ? queryParams.ias_code : null;
    if (error === 'ias_denied') return 'cancelled' as const;
    if (error || !code) throw new SignInError(SAP_ERRORS[error ?? ''] ?? SAP_FALLBACK, error === 'pending');

    const res = await api<{ token: string; user: User }>('/api/auth/ias/exchange', { body: { code, code_verifier: verifier } });
    await startSession(res.token, res.user);
    return 'signedIn' as const;
  }, [startSession]);

  const value = useMemo<AuthState>(() => ({
    status, user, sapEnabled, notice, signInWithPassword, signInWithSap, signOut, refresh,
  }), [status, user, sapEnabled, notice, signInWithPassword, signInWithSap, signOut, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
