import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from '../../context/RouterContext';

interface NavbarProps {
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuth }) => {
  const { user, driver, isAuthenticated, logout, setDemoUser } = useAuth();
  const { currentPath, navigate } = useRouter();

  const isPassengerView = currentPath.startsWith('/passenger') || currentPath === '/';
  const isDriverView = currentPath.startsWith('/driver');

  return (
    <header className="navbar">
      <div className="navbar-container">
        <div className="brand-section" onClick={() => navigate('/')}>
          <div className="brand-logo">
            <span className="logo-dot"></span>
            <span className="brand-name">Uber<span className="brand-accent">Lite</span></span>
          </div>
          <span className="brand-tag">v1.0</span>
        </div>

        <nav className="nav-links">
          <button
            className={`nav-item ${isPassengerView ? 'active' : ''}`}
            onClick={() => navigate('/passenger')}
          >
            <span className="nav-icon">👤</span>
            Passenger Area
          </button>
          <button
            className={`nav-item ${isDriverView ? 'active' : ''}`}
            onClick={() => navigate('/driver')}
          >
            <span className="nav-icon">🚗</span>
            Driver Area
          </button>
        </nav>

        <div className="nav-actions">
          {isAuthenticated && user ? (
            <div className="user-profile-widget">
              <div className="user-badge">
                <span className="user-avatar">{user.name.charAt(0).toUpperCase()}</span>
                <div className="user-meta">
                  <span className="user-name">{user.name}</span>
                  <span className={`user-role-pill role-${user.role.toLowerCase()}`}>
                    {user.role} {driver ? `⭐ ${driver.rating.toFixed(1)}` : ''}
                  </span>
                </div>
              </div>
              <button className="btn btn-sm btn-outline" onClick={logout}>
                Log Out
              </button>
            </div>
          ) : (
            <div className="auth-buttons">
              <div className="demo-switchers">
                <button
                  className="btn btn-xs btn-ghost"
                  title="Demo Passenger"
                  onClick={() => setDemoUser('PASSENGER')}
                >
                  ⚡ Alice (Passenger)
                </button>
                <button
                  className="btn btn-xs btn-ghost"
                  title="Demo Driver"
                  onClick={() => setDemoUser('DRIVER')}
                >
                  ⚡ Bob (Driver)
                </button>
              </div>
              <button className="btn btn-sm btn-primary" onClick={onOpenAuth}>
                Sign In / Register
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
