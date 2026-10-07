import { useAuth } from '../context/useAuth';
import { Link } from '../router/RouterContext';
import type { Role } from '../types/auth';
import { getDashboardRouteForRole } from '../utils/auth';

interface ForbiddenProps {
  attemptedRole?: Role;
  userRole?: Role;
}

export function Forbidden({ attemptedRole, userRole }: ForbiddenProps) {
  const { user } = useAuth();
  const effectiveRole = userRole || user?.role;
  const dashboardRoute = effectiveRole ? getDashboardRouteForRole(effectiveRole) : '/login';

  return (
    <div className="card forbidden-card" role="alert">
      <div className="forbidden-icon">🚫</div>
      <h2>Access Restricted</h2>
      <p className="forbidden-message">
        {effectiveRole === 'PASSENGER' && attemptedRole === 'DRIVER'
          ? 'Passengers are not permitted to access Driver portal dashboards.'
          : effectiveRole === 'DRIVER' && attemptedRole === 'PASSENGER'
          ? 'Drivers are not permitted to access Passenger portal dashboards.'
          : 'You do not have permission to view this section of UberLite.'}
      </p>

      <div className="user-role-badge-container">
        <span>Your current account role:</span>
        <span className={`role-badge badge-${effectiveRole?.toLowerCase() || 'guest'}`}>
          {effectiveRole || 'Unauthenticated'}
        </span>
      </div>

      <div className="forbidden-actions">
        <Link to={dashboardRoute} className="btn btn-primary">
          Return to My {effectiveRole === 'DRIVER' ? 'Driver' : 'Passenger'} Dashboard
        </Link>
      </div>
    </div>
  );
}
