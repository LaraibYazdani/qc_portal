/**
 * Links into the app. packvision://auth?ias_code=… is SAP sign-in handing back to the app: the
 * browser session in lib/auth reads it, so the router should not navigate anywhere for it
 * (on Android the link can also reach the router). Everything else passes through unchanged.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    const isSignInReturn = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^/]*\/--\/)?\/?auth(?:[/?#]|$)/i.test(path)
      || /[?&]ias_(code|error)=/.test(path);
    if (isSignInReturn) return initial ? '/' : null;
    return path;
  } catch {
    return '/';
  }
}
