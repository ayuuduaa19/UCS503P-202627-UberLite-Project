import { useAuth } from '../context/useAuth';
import { useRouter } from '../router/useRouter';

export function PassengerDashboard() {
  const { user, logout } = useAuth();
  const { navigate } = useRouter();

  if (!user) return null;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-title-group">
          <span className="role-badge badge-passenger">PASSENGER PORTAL</span>
          <h1>Welcome, {user.name}</h1>
          <p className="dashboard-subtitle">
            Passenger Dashboard &bull; Manage your rides and travel requests
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-logout"
          onClick={() => {
            logout();
            navigate('/login');
          }}
        >
          Sign Out
        </button>
      </div>

      <div className="dashboard-grid">
        {/* Passenger Profile Card */}
        <div className="card dashboard-card">
          <div className="card-header">
            <h3>👤 Passenger Profile</h3>
          </div>
          <div className="card-body">
            <div className="info-list">
              <div className="info-item">
                <span className="info-label">Full Name:</span>
                <span className="info-value">{user.name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Email:</span>
                <span className="info-value">{user.email}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Phone:</span>
                <span className="info-value">{user.phone || 'Not provided'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Account Role:</span>
                <span className="info-value role-pill passenger-pill">{user.role}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Session Status:</span>
                <span className="info-value text-success">Active &bull; Authenticated</span>
              </div>
            </div>
          </div>
        </div>

        {/* Ride Quick Actions Card */}
        <div className="card dashboard-card">
          <div className="card-header">
            <h3>🚗 Ride Services</h3>
          </div>
          <div className="card-body">
            <p className="card-desc">
              Request a ride, discover nearby drivers with Haversine proximity matching, and calculate estimated fares.
            </p>
            <div className="actions-list">
              <div className="action-feature-item">
                <span className="feature-icon">📍</span>
                <div>
                  <strong>Proximity Matching</strong>
                  <p>Matches with nearest available driver within 10 km</p>
                </div>
              </div>
              <div className="action-feature-item">
                <span className="feature-icon">💰</span>
                <div>
                  <strong>Fare Estimation</strong>
                  <p>Predefined formula: BaseFare + (Distance &times; RatePerKm)</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Role Guard Testing Card */}
        <div className="card dashboard-card guard-test-card">
          <div className="card-header">
            <h3>🛡️ Route Guard Security Test</h3>
          </div>
          <div className="card-body">
            <p className="card-desc">
              Verify role-based route protection: As a passenger, attempting to access driver pages must be prevented.
            </p>
            <div className="guard-test-action">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/driver/dashboard')}
              >
                Test: Try Accessing Driver Dashboard (/driver/dashboard)
              </button>
              <p className="help-text">
                Clicking this attempts to open <code>/driver/dashboard</code>. The RoleGuard will intercept and restrict access.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
