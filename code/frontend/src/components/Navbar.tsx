import { useAuth } from '../context/useAuth';
import { Link } from '../router/RouterContext';
import { useRouter } from '../router/useRouter';
import { getDashboardRouteForRole } from '../utils/auth';

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { navigate } = useRouter();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const dashboardRoute = user ? getDashboardRouteForRole(user.role) : '/';

  return (
    <header className="navbar">
      <div className="navbar-container">
        <Link to={isAuthenticated ? dashboardRoute : '/'} className="navbar-brand">
          <span className="brand-logo">🚗</span>
          <span className="brand-text">UberLite</span>
        </Link>

        <nav className="navbar-nav">
          {isAuthenticated && user ? (
            <div className="navbar-user-section">
              <span className={`role-badge badge-${user.role.toLowerCase()}`}>
                {user.role}
              </span>
              <span className="user-greeting">Hi, {user.name}</span>
              <Link to={dashboardRoute} className="nav-link">
                Dashboard
              </Link>
              <button
                type="button"
                className="btn btn-outline btn-sm btn-logout"
                onClick={handleLogout}
              >
                Log Out
              </button>
            </div>
          ) : (
            <div className="navbar-auth-links">
              <Link to="/login" className="nav-link">
                Log In
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                Register
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
