import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { Navbar } from './components/Navbar';
import { LoginForm } from './components/LoginForm';
import { RegisterForm } from './components/RegisterForm';
import { PassengerDashboard } from './components/PassengerDashboard';
import { DriverDashboard } from './components/DriverDashboard';
import { Forbidden } from './components/Forbidden';
import { GuestOnlyGuard, RoleGuard } from './router/Guards';
import { Link, Navigate, Router } from './router/RouterContext';
import { useRouter } from './router/useRouter';
import { getDashboardRouteForRole } from './utils/auth';
import './App.css';

function RouteContent() {
  const { path } = useRouter();
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="card loading-card" aria-busy="true">
        <div className="spinner"></div>
        <p>Loading UberLite session...</p>
      </div>
    );
  }

  // Root path: redirect according to authentication and role
  if (path === '/' || path === '') {
    if (!isAuthenticated || !user) {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to={getDashboardRouteForRole(user.role)} replace />;
  }

  // Public/Guest-only routes
  if (path === '/login') {
    return (
      <GuestOnlyGuard>
        <LoginForm />
      </GuestOnlyGuard>
    );
  }

  if (path === '/register') {
    return (
      <GuestOnlyGuard>
        <RegisterForm />
      </GuestOnlyGuard>
    );
  }

  // Passenger protected routes
  if (path === '/passenger' || path === '/passenger/dashboard') {
    return (
      <RoleGuard allowedRoles={['PASSENGER']}>
        <PassengerDashboard />
      </RoleGuard>
    );
  }

  // Driver protected routes
  if (path === '/driver' || path === '/driver/dashboard') {
    return (
      <RoleGuard allowedRoles={['DRIVER']}>
        <DriverDashboard />
      </RoleGuard>
    );
  }

  // Explicit forbidden route
  if (path === '/forbidden') {
    return <Forbidden />;
  }

  // 404 Fallback
  return (
    <div className="card notfound-card">
      <h2>404 &mdash; Page Not Found</h2>
      <p className="card-desc">The requested route <code>{path}</code> does not exist.</p>
      <Link to="/" className="btn btn-primary">
        Go to Home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app-layout">
          <Navbar />
          <main className="main-content">
            <RouteContent />
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}
