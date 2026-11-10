/**
 * Where the PackVision API lives. Builds for the stores use the production address;
 * for development set EXPO_PUBLIC_API_URL in mobile/.env.local (e.g. http://192.168.1.20:5056).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://packvision.packagesgroup.com').replace(/\/+$/, '');

/** Files the API serves (/uploads/...) as full addresses. */
export const fileUrl = (path?: string | null): string | null => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

export const isImagePath = (path?: string | null) => /\.(jpe?g|png)$/i.test(path ?? '');
