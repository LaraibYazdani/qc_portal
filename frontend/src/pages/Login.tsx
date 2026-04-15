import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Navigate } from 'react-router-dom';

export const Login: React.FC = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, user } = useAuth();

  // Redirect if already logged in
  if (user) {
    const redirectPath = user.role === 'admin' ? '/admin' : 
                        user.role === 'operator' ? '/operator-view' : '/upload';
    return <Navigate to={redirectPath} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await login(formData.email, formData.password);
    
    if (!result.success) {
      setError(result.message || 'Login failed');
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
            className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="mt-6 text-sm text-gray-600">
          <p className="font-semibold text-gray-700 mb-2">Login Credentials:</p>
          <div className="space-y-2">
            <div className="border-l-2 border-blue-500 pl-2">
              <p className="font-medium">Admin Users:</p>
              <p>ahmed.imran@company.com / Sales@123</p>
              <p>admin@example.com / Admin@123</p>
            </div>
            <div className="border-l-2 border-green-500 pl-2">
              <p className="font-medium">Sales User:</p>
              <p>mirza.sarwan@company.com / Sales@123</p>
            </div>
            <div className="border-l-2 border-purple-500 pl-2">
              <p className="font-medium">Operator:</p>
              <p>rashid.ali@company.com / Operator@123</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
