import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Card, EmptyState, PageLoader } from './ui';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) {
    return (
      <Card className="mx-auto mt-10 max-w-lg">
        <EmptyState icon={LockClosedIcon} title="You don't have access to this page"
          description="Your role doesn't include this part of the portal. Ask an administrator if you need it."
          action={<Link to="/" className="text-sm font-medium text-brand-700 hover:text-brand-800">Go to your start page</Link>} />
      </Card>
    );
  }

  return <>{children}</>;
};

/** Where each role starts. */
export const homeFor = (role?: string) =>
  role && ['admin', 'company_admin'].includes(role) ? '/admin'
    : role === 'sales' ? '/upload' : '/operator-view';

export const HomeRedirect: React.FC = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
};
