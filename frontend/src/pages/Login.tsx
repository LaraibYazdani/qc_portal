import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Navigate, useSearchParams } from 'react-router-dom';

// Messages for ?ias_error=<code> after a SAP sign-in comes back
const IAS_ERRORS: Record<string, string> = {
  pending: 'Your account has been created and is waiting for an administrator to give you access. You will be able to sign in once that is done.',
  disabled: 'Your account is disabled. Contact your administrator.',
  not_in_sf: 'You are not listed as an active employee in SuccessFactors.',
  sf_unavailable: 'SuccessFactors could not be reached to set up your account. Please try again in a few minutes.',
  ias_denied: 'SAP sign-in was cancelled.',
  invalid_state: 'The sign-in took too long or was started in another window. Please try again.',
  no_employee_number: 'SAP did not send your employee number. Ask IT to check the IAS application settings.',
};
const IAS_FALLBACK = 'SAP sign-in did not complete. Please try again, or contact IT if it keeps happening.';

export const Login: React.FC = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
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
      setLoading(true);
      loginWithIasCode(code).then(r => {
        if (!r.success) setError(r.message || IAS_FALLBACK);
        setLoading(false);
      });
    }
  }, [params, setParams, loginWithIasCode]);

  // Redirect if already logged in
  if (user) {
    const redirectPath = ['admin', 'company_admin'].includes(user.role) ? '/admin' :
                        ['operator', 'qc_supervisor'].includes(user.role) ? '/operator-view' : '/upload';
    return <Navigate to={redirectPath} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const result = await login(formData.email, formData.password);

    if (!result.success) {
      setError(result.message || 'Login failed');
    }

    setLoading(false);
  };

  const signInWithSap = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      // The server returns SAP's address; going there from the browser avoids proxies rewriting redirects.
      const response = await fetch('/api/auth/ias/start', { credentials: 'same-origin' });
      const data = await response.json();
      if (data.success && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.message || IAS_FALLBACK);
    } catch {
      setError('Network error');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-blue-900 mb-6">
          <span className="font-black">Packages QC Assistant</span> - Login
        </h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        {info && (
          <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-lg mb-6">
            {info}
          </div>
        )}

        {iasEnabled && (
          <>
            <button
              type="button"
              onClick={signInWithSap}
              disabled={loading}
              className="w-full bg-blue-900 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-blue-800 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign in with SAP'}
            </button>
            <div className="flex items-center gap-3 my-6 text-xs text-gray-400">
              <div className="flex-1 border-t border-gray-200" />
              or with email and password
              <div className="flex-1 border-t border-gray-200" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full font-bold py-2 px-4 rounded-lg disabled:bg-gray-400 transition-colors ${
              iasEnabled ? 'bg-white text-blue-700 border border-blue-600 hover:bg-blue-50' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

      </div>
    </div>
  );
};
