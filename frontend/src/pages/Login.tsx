import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { CheckBadgeIcon, MagnifyingGlassIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext.tsx';
import { homeFor } from '../components/ProtectedRoute.tsx';
import { Brand, BrandMark } from '../components/AppShell.tsx';
import { Alert, Button, Field, Input } from '../components/ui';

// Messages for ?ias_error=<code> after a SAP sign-in comes back
const IAS_ERRORS: Record<string, string> = {
  pending: 'Your account has been created and is waiting for an administrator to give you access. You can sign in once that is done.',
  disabled: 'Your account is disabled. Contact your administrator.',
  not_in_sf: 'You are not listed as an active employee in SuccessFactors.',
  sf_unavailable: 'SuccessFactors could not be reached to set up your account. Please try again in a few minutes.',
  ias_denied: 'SAP sign-in was cancelled.',
  invalid_state: 'The sign-in took too long or was started in another window. Please try again.',
  no_employee_number: 'SAP did not send your employee number. Ask IT to check the IAS application settings.',
};
const IAS_FALLBACK = 'SAP sign-in did not complete. Please try again, or contact IT if it keeps happening.';

const POINTS = [
  { icon: MagnifyingGlassIcon, title: 'Find any approved design', text: 'Look up artwork by job number in seconds, on the floor or at a desk.' },
  { icon: CheckBadgeIcon, title: 'Every version kept', text: 'Replaced designs stay on record, so you always know what was approved when.' },
  { icon: ShieldCheckIcon, title: 'One trail for audit', text: 'Uploads, approvals and changes are recorded across every company in the group.' },
];

export const Login: React.FC = () => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [sapLoading, setSapLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { login, loginWithIasCode, iasEnabled, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const exchanged = useRef(false);

  // Coming back from SAP: a one-time code to trade for a session, or a reason it failed.
  useEffect(() => {
    const code = params.get('ias_code');
    const iasError = params.get('ias_error');
    if (!code && !iasError) return;
    setParams({}, { replace: true }); // keep the code out of history and bookmarks

    if (iasError) {
      if (iasError === 'pending') setInfo(IAS_ERRORS.pending);
      else setError(IAS_ERRORS[iasError] ?? IAS_FALLBACK);
      return;
    }
    if (code && !exchanged.current) {
      exchanged.current = true;
      setSapLoading(true);
      loginWithIasCode(code).then(r => {
        if (!r.success) setError(r.message || IAS_FALLBACK);
        setSapLoading(false);
      });
    }
  }, [params, setParams, loginWithIasCode]);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const r = await login(form.email, form.password);
    if (!r.success) setError(r.message || 'Sign-in failed');
    setLoading(false);
  };

  const signInWithSap = async () => {
    setSapLoading(true);
    setError(null);
    setInfo(null);
    try {
      // The server returns SAP's address; going there from the browser avoids proxies rewriting redirects.
      const res = await fetch('/api/auth/ias/start', { credentials: 'same-origin' });
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.message || IAS_FALLBACK);
    } catch {
      setError('Network error. Check your connection and try again.');
    }
    setSapLoading(false);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-ink-950 text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <svg className="absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden>
          <defs>
            <pattern id="dieline" width="56" height="56" patternUnits="userSpaceOnUse">
              <path d="M0 28h56M28 0v56" stroke="#fff" strokeWidth="1" strokeDasharray="4 6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dieline)" />
        </svg>
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand-600/30 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 h-[420px] w-[420px] rounded-full bg-brand-400/10 blur-[100px]" />

        <div className="relative"><Brand dark /></div>

        <div className="relative max-w-lg">
          <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight">
            Every printed carton,<br /><span className="text-brand-300">true to its approved design.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-300">
            The quality workspace for the Packages group: approved artwork, upload history and print checks in one place.
          </p>
          <ul className="mt-10 space-y-5">
            {POINTS.map(p => (
              <li key={p.title} className="flex gap-4">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
                  <p.icon className="h-5 w-5 text-brand-300" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{p.title}</span>
                  <span className="block text-sm text-ink-400">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-ink-500">Packages group · Internal use</p>
      </section>

      {/* Sign-in */}
      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[380px] animate-fade-in">
          <div className="mb-10 lg:hidden"><BrandMark className="h-10 w-10" /></div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-950">Sign in</h2>
          <p className="mt-1.5 text-sm text-ink-500">
            {iasEnabled ? 'Use your SAP account, as for SuccessFactors.' : 'Use the email and password your administrator gave you.'}
          </p>

          <div className="mt-8 space-y-4">
            {error && <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert>}
            {info && <Alert tone="info" title="Almost there">{info}</Alert>}
          </div>

          {iasEnabled && (
            <>
              <Button size="lg" variant="dark" className="mt-6 w-full" loading={sapLoading} onClick={signInWithSap}>
                Continue with SAP
              </Button>
              <div className="my-7 flex items-center gap-3 text-xs text-ink-400">
                <div className="h-px flex-1 bg-ink-100" />or with email<div className="h-px flex-1 bg-ink-100" />
              </div>
            </>
          )}

          <form onSubmit={submit} className={iasEnabled ? 'space-y-4' : 'mt-6 space-y-4'}>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" required value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@packages.com.pk" />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" required value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Your password" />
            </Field>
            <Button type="submit" size="lg" variant={iasEnabled ? 'secondary' : 'primary'} className="w-full" loading={loading}>
              Sign in
            </Button>
          </form>

          <p className="mt-10 text-center text-sm text-ink-500">
            On the shop floor?{' '}
            <Link to="/operator" className="font-medium text-brand-700 hover:text-brand-800">Look up a design without signing in</Link>
          </p>
        </div>
      </section>
    </div>
  );
};
