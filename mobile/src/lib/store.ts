/**
 * Small values kept on the phone: the session token in the secure keychain/keystore,
 * plus a few conveniences (last user, recent lookups). The web preview uses localStorage.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const web = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  try {
    return web ? globalThis.localStorage?.getItem(key) ?? null : await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    if (web) globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    /* not kept; the app still works */
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    if (web) globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    /* already gone */
  }
}

export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const setJSON = (key: string, value: unknown) => setItem(key, JSON.stringify(value));

export const KEYS = {
  token: 'pv.token',
  user: 'pv.user',
  recent: 'pv.recentLookups',
  sensitivity: 'pv.sensitivity',
} as const;
