import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { PasswordModal } from './PasswordModal';
import { useAuth } from '../hooks/useAuth';
import { homePathForRole } from '../lib/roles';
import type { UserRole } from '../types';

// Guards a route: requires authentication and (optionally) a specific set of roles.
export function RequireRole({ roles, children }: { roles?: UserRole[]; children: ReactNode }) {
  const { user, isAuthenticated, loading, refresh } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-canvas text-faint">Loading…</div>;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // On a pastor-issued password: nothing renders until it is replaced. The API
  // enforces the same gate, so showing the page would only produce 403s.
  if (user.mustChangePassword) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <PasswordModal open forced onClose={() => undefined} onDone={refresh} />
      </div>
    );
  }

  // Authenticated but wrong role — send them to their own home.
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return <>{children}</>;
}
