import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useRouter } from '../router/useRouter';
import { fetchDriverAvailability, updateDriverAvailability } from '../utils/driver';

export function DriverDashboard() {
  const { user, token, logout } = useAuth();
  const { navigate } = useRouter();

  const [isAvailable, setIsAvailable] = useState<boolean>(() => {
    return user?.driverProfile?.isAvailable ?? true;
  });
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Fetch initial availability from backend if token is available
  useEffect(() => {
    if (!token) return;
    let isMounted = true;
    fetchDriverAvailability(token)
      .then((data) => {
        if (isMounted && data) {
          setIsAvailable(data.isAvailable);
        }
      })
      .catch((err) => {
        // Backend might be offline during standalone frontend runs
        console.warn('Could not fetch latest driver availability:', err.message);
      });
    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleToggleAvailability = async () => {
    if (!token) return;
    const nextState = !isAvailable;
    setIsUpdatingStatus(true);
    setStatusMessage(null);
    try {
      await updateDriverAvailability(token, nextState);
      setIsAvailable(nextState);
      setStatusMessage(`Status updated to ${nextState ? 'Available (Online)' : 'Offline'}`);
    } catch {
      // Still toggle locally for UI demonstration
      setIsAvailable(nextState);
      setStatusMessage(`Status set to ${nextState ? 'Available' : 'Offline'} (locally updated)`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (!user) return null;

  const profile = user.driverProfile;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-title-group">
          <span className="role-badge badge-driver">DRIVER PORTAL</span>
          <h1>Welcome, {user.name}</h1>
          <p className="dashboard-subtitle">
            Driver Partner Dashboard &bull; Manage your vehicle and active rides
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
        {/* Driver Profile & Vehicle Card */}
        <div className="card dashboard-card">
          <div className="card-header">
            <h3>🚕 Driver &amp; Vehicle Profile</h3>
          </div>
          <div className="card-body">
            <div className="info-list">
              <div className="info-item">
                <span className="info-label">Driver Name:</span>
                <span className="info-value">{user.name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Email:</span>
                <span className="info-value">{user.email}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Account Role:</span>
                <span className="info-value role-pill driver-pill">{user.role}</span>
              </div>
              <div className="info-item">
                <span className="info-label">License Number:</span>
                <span className="info-value">{profile?.licenseNumber || 'Verified on file'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Vehicle Model:</span>
                <span className="info-value">{profile?.vehicleModel || 'Standard Vehicle'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">License Plate:</span>
                <span className="info-value plate-number">{profile?.vehiclePlate || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Vehicle Type:</span>
                <span className="info-value">{profile?.vehicleType || 'STANDARD'}</span>
              </div>
              {profile?.vehicleColor && (
                <div className="info-item">
                  <span className="info-label">Color:</span>
                  <span className="info-value">{profile.vehicleColor}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Availability & Status Card */}
        <div className="card dashboard-card">
          <div className="card-header">
            <h3>⚡ Driver Availability Status</h3>
          </div>
          <div className="card-body">
            <div className="status-indicator-block">
              <div className={`status-pill ${isAvailable ? 'status-online' : 'status-offline'}`}>
                <span className="status-dot"></span>
                <span>{isAvailable ? 'Available for Rides (Online)' : 'Offline (Not Accepting Rides)'}</span>
              </div>

              <p className="status-help">
                {isAvailable
                  ? 'Your vehicle is visible in proximity matching for passengers nearby.'
                  : 'You will not receive new ride requests until you go online.'}
              </p>

              <button
                type="button"
                className={`btn ${isAvailable ? 'btn-danger' : 'btn-success'}`}
                onClick={handleToggleAvailability}
                disabled={isUpdatingStatus}
              >
                {isUpdatingStatus
                  ? 'Updating...'
                  : isAvailable
                  ? 'Go Offline'
                  : 'Go Online'}
              </button>

              {statusMessage && (
                <p className="status-message-note">{statusMessage}</p>
              )}
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
              Verify role-based route protection: As a driver, attempting to access passenger pages must be prevented.
            </p>
            <div className="guard-test-action">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/passenger/dashboard')}
              >
                Test: Try Accessing Passenger Dashboard (/passenger/dashboard)
              </button>
              <p className="help-text">
                Clicking this attempts to open <code>/passenger/dashboard</code>. The RoleGuard will intercept and restrict access.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
