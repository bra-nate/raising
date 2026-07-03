import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { homePathForRole } from '../lib/roles';
import type { UserRole } from '../types';

// Guards a route: requires authentication and (optionally) a specific set of roles.
export function RequireRole({ roles, children }: { roles?: UserRole[]; children: ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-canvas text-faint">Loading…</div>;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated but wrong role — send them to their own home.
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return <>{children}</>;
}
