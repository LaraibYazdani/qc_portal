import express from 'express';
import { iasEnabled, startSignIn, finishSignIn, createHandoffCode, redeemHandoffCode, employeeIdClaim, IasError } from '../lib/ias';
import { signInEmployee } from '../lib/employeeSignIn';
import { issueToken, loadPublicUser } from '../lib/session';

const router = express.Router();

const STATE_COOKIE = 'qc_ias_state';
const loginPage = () => process.env.IAS_LOGIN_PAGE || '/login';

function readCookie(req: express.Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

const cookieOptions = (req: express.Request) => ({
  httpOnly: true,
  sameSite: 'lax' as const,                // sent on SAP's top-level redirect back to us
  secure: req.secure || process.env.COOKIE_SECURE === 'true',
  path: '/api/auth/ias',
});

// 1. The login page asks where to send the browser. The state is pinned to this
//    browser in a cookie, so a sign-in started elsewhere can't be completed here.
router.get('/start', async (req: express.Request, res: express.Response) => {
  if (!iasEnabled()) return res.status(404).json({ success: false, message: 'SAP sign-in is not enabled' });
  try {
    const { url, state } = await startSignIn();
    res.cookie(STATE_COOKIE, state, { ...cookieOptions(req), maxAge: 10 * 60_000 });
    res.json({ success: true, url });
  } catch (e) {
    console.error('[ias] start failed:', e);
    res.status(503).json({ success: false, message: 'SAP sign-in is unavailable, try again shortly' });
  }
});

// 2. SAP sends the browser back here with a code.
router.get('/callback', async (req: express.Request, res: express.Response) => {
  const back = (param: string, value: string) => res.redirect(`${loginPage()}?${param}=${encodeURIComponent(value)}`);
  if (!iasEnabled()) return back('ias_error', 'disabled');

  const cookieState = readCookie(req, STATE_COOKIE);
  res.clearCookie(STATE_COOKIE, cookieOptions(req));

  const { state, code, error } = req.query as Record<string, string | undefined>;
  if (error) return back('ias_error', 'ias_denied');
  if (!state || !code || !cookieState || cookieState !== state) return back('ias_error', 'invalid_state');

  try {
    const claims = await finishSignIn(state, code);
    const employeeId = claims[employeeIdClaim()];
    if (!employeeId) return back('ias_error', 'no_employee_number');

    const { outcome, userId } = await signInEmployee(req, String(employeeId));
    if (outcome !== 'active' || !userId) return back('ias_error', outcome);
    return back('ias_code', createHandoffCode(userId));
  } catch (e) {
    if (e instanceof IasError) {
      console.warn(`[ias] sign-in refused: ${e.code}: ${e.message}`);
      return back('ias_error', e.code);
    }
    console.error('[ias] callback failed:', e);
    return back('ias_error', 'server_error');
  }
});

// 3. The login page trades the one-time code for a session.
router.post('/exchange', async (req: express.Request, res: express.Response) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const userId = code ? redeemHandoffCode(code) : null;
  if (!userId) return res.status(401).json({ success: false, message: 'Sign-in expired, please try again' });

  const user = await loadPublicUser(userId);
  if (!user || user.status !== 'active') return res.status(403).json({ success: false, message: 'Your account is not active' });
  res.json({ success: true, token: issueToken(user), user });
});

export { router as iasRoutes };
