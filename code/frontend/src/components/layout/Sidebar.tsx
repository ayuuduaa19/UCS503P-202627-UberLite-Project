import React from 'react';
import { useRouter } from '../../context/RouterContext';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  area: 'passenger' | 'driver';
}

export const Sidebar: React.FC<SidebarProps> = ({ area }) => {
  const { activeTab, setActiveTab } = useRouter();
  const { driver } = useAuth();

  if (area === 'passenger') {
    return (
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">Passenger Portal</span>
        </div>
        <nav className="sidebar-nav">
          <button
            className={`sidebar-link ${activeTab === 'book' ? 'active' : ''}`}
            onClick={() => setActiveTab('book')}
          >
            <span className="sidebar-icon">📍</span>
            <span>Book a Ride</span>
          </button>
          <button
            className={`sidebar-link ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            <span className="sidebar-icon">⚡</span>
            <span>Active Ride</span>
          </button>
          <button
            className={`sidebar-link ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <span className="sidebar-icon">📜</span>
            <span>Ride History</span>
          </button>
          <button
            className={`sidebar-link ${activeTab === 'fare' ? 'active' : ''}`}
            onClick={() => setActiveTab('fare')}
          >
            <span className="sidebar-icon">🏷️</span>
            <span>Fare Rates</span>
          </button>
        </nav>

        <div className="sidebar-widget">
          <div className="widget-card">
            <h4>💡 Quick Preset</h4>
            <p className="text-muted text-xs">
              Delhi CP → Cyber City Gurugram (20 km) is pre-configured for instant testing.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Driver Console</span>
      </div>
      <nav className="sidebar-nav">
        <button
          className={`sidebar-link ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          <span className="sidebar-icon">🎛️</span>
          <span>Status & GPS</span>
        </button>
        <button
          className={`sidebar-link ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          <span className="sidebar-icon">🚘</span>
          <span>Active Trip</span>
        </button>
        <button
          className={`sidebar-link ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <span className="sidebar-icon">📋</span>
          <span>Trip History</span>
        </button>
        <button
          className={`sidebar-link ${activeTab === 'feedbacks' ? 'active' : ''}`}
          onClick={() => setActiveTab('feedbacks')}
        >
          <span className="sidebar-icon">⭐</span>
          <span>Passenger Reviews</span>
        </button>
      </nav>

      {driver && (
        <div className="sidebar-widget">
          <div className="widget-card driver-mini-card">
            <div className="driver-mini-header">
              <span className="vehicle-badge">{driver.vehicleType}</span>
              <span className="rating-badge">★ {driver.rating.toFixed(1)}</span>
            </div>
            <div className="vehicle-plate-text">{driver.vehiclePlate}</div>
            <div className="vehicle-model-text text-muted text-xs">{driver.vehicleModel}</div>
          </div>
        </div>
      )}
    </aside>
  );
};
