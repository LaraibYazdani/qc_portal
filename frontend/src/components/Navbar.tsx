import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.tsx';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Don't render on the login page
  if (location.pathname === '/login') return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const linkClass = (path: string) =>
    `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
      location.pathname === path
        ? 'bg-blue-700 text-white'
        : 'text-blue-100 hover:bg-blue-700 hover:text-white'
    }`;

  return (
    <nav className="bg-blue-900 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">

        {/* Brand */}
        <span className="font-bold text-lg tracking-tight text-white">
          Packages QC Assistant
        </span>

        {/* Nav links — role-based */}
        {user && (
          <div className="flex items-center gap-1">
            {(user.role === 'admin' || user.role === 'sales') && (
              <>
                <Link to="/upload" className={linkClass('/upload')}>Upload</Link>
                <Link to="/my-jobs" className={linkClass('/my-jobs')}>My Jobs</Link>
              </>
            )}
            {user.role === 'admin' && (
              <Link to="/admin" className={linkClass('/admin')}>Admin</Link>
            )}
            {user.role === 'operator' && (
              <Link to="/operator-view" className={linkClass('/operator-view')}>Search</Link>
            )}
          </div>
        )}

        {/* User info + Logout */}
        <div className="flex items-center gap-4">
          {user && (
            <span className="text-sm text-blue-200">
              {user.name}
              <span className="ml-1 text-xs bg-blue-700 text-blue-100 px-1.5 py-0.5 rounded capitalize">
                {user.role}
              </span>
            </span>
          )}
          <button
            onClick={handleLogout}
            className="text-sm font-medium bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded transition-colors"
          >
            Logout
          </button>
        </div>

      </div>
    </nav>
  );
};
