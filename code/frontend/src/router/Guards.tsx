import type { ReactNode } from 'react';
import { useAuth } from '../context/useAuth';
import { Forbidden } from '../components/Forbidden';
import type { Role } from '../types/auth';
import { getDashboardRouteForRole } from '../utils/auth';
import { Navigate } from './RouterContext';

export interface GuardProps {
  children: ReactNode;
}

export interface RoleGuardProps extends GuardProps {
  allowedRoles: Role[];
}

/**
 * AuthGuard ensures that only authenticated users can access the child components.
 * Unauthenticated users are redirected to /login.
 */
export function AuthGuard({ children }: GuardProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="card loading-card" aria-busy="true">
        <div className="spinner"></div>
        <p>Verifying authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/**
 * RoleGuard ensures that users have one of the required roles to view a route.
 * If unauthenticated -> redirects to /login.
 * If authenticated but with the wrong role -> displays Forbidden view or redirects to their dashboard.
 */
export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="card loading-card" aria-busy="true">
        <div className="spinner"></div>
        <p>Verifying account permissions...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    const attemptedTargetRole = allowedRoles[0];
    return <Forbidden attemptedRole={attemptedTargetRole} userRole={user.role} />;
  }

  return <>{children}</>;
}

/**
 * GuestOnlyGuard ensures that already logged-in users cannot view login/register pages.
 * They are automatically redirected to their appropriate role's dashboard.
 */
export function GuestOnlyGuard({ children }: GuardProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="card loading-card" aria-busy="true">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (isAuthenticated && user) {
    const redirectPath = getDashboardRouteForRole(user.role);
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
}
