/** Calls to the portal API with the signed-in user's token. */
export interface ApiResult<T = any> {
  ok: boolean;
  status: number;
  data: T;
  message?: string;
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
    const data = await res.json().catch(() => ({}));
    const message = data.message || data.error || data.errors?.[0]?.msg;
    return { ok: res.ok && data.success !== false, status: res.status, data, message };
  } catch {
    return { ok: false, status: 0, data: {} as T, message: 'Network error. Check your connection and try again.' };
  }
}

export const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export const formatDate = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const formatDateTime = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const isImage = (path?: string | null) => /\.(jpe?g|png)$/i.test(path ?? '');

export const initials = (name?: string | null) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';
