/** Dates and small text helpers. Times from the API are the server's local time (Pakistan). */

const toDate = (d?: string | null) => (d ? new Date(d.includes('T') || d.includes('Z') ? d : d.replace(' ', 'T')) : null);

export function formatDateTime(d?: string | null): string {
  const date = toDate(d);
  if (!date || isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "Just now", "12 min ago", "3 h ago", else the date. */
export function timeAgo(d?: string | null): string {
  const date = toDate(d);
  if (!date || isNaN(date.getTime())) return '—';
  const s = (Date.now() - date.getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 6 * 3600) return `${Math.floor(s / 3600)} h ago`;
  return formatDateTime(d);
}

export const initials = (name?: string | null) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';

/** Same rule as the web lookup: 267N2943, 26ON4465, 2670699, optional -1 suffix. */
export const JOB_NUMBER_RE = /^\d{2}[1-9OND]N?\d{4}(-\d{1,2})?$/;
export const normaliseJobNumber = (s: string) => s.trim().toUpperCase();
export const isUsualJobNumber = (s: string) => JOB_NUMBER_RE.test(normaliseJobNumber(s));
