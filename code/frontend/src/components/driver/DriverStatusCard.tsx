import React, { useState } from 'react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const GPS_CHECKPOINTS = [
  { name: 'Connaught Place, Central Delhi', lat: 28.6315, lng: 77.2167 },
  { name: 'DLF Cyber City, Gurugram', lat: 28.4952, lng: 77.0895 },
  { name: 'Sector 18 Market, Noida', lat: 28.5708, lng: 77.326 },
  { name: 'Select Citywalk, Saket', lat: 28.5284, lng: 77.2185 },
];

export const DriverStatusCard: React.FC = () => {
  const { driver, updateDriverProfile } = useAuth();
  const [isAvailable, setIsAvailable] = useState<boolean>(driver?.isAvailable ?? true);
  const [currentLat, setCurrentLat] = useState<number>(driver?.currentLat ?? 28.6315);
  const [currentLng, setCurrentLng] = useState<number>(driver?.currentLng ?? 77.2167);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleToggleAvailability = async () => {
    const nextState = !isAvailable;
    setIsUpdating(true);
    setStatusMessage(null);
    try {
      await apiClient.updateDriverAvailability(nextState);
      setIsAvailable(nextState);
      updateDriverProfile({ isAvailable: nextState });
      setStatusMessage(`Driver status is now ${nextState ? 'ONLINE (Accepting Rides)' : 'OFFLINE'}`);
    } catch {
      // If unauthorized or local simulation, update state locally
      setIsAvailable(nextState);
      updateDriverProfile({ isAvailable: nextState });
      setStatusMessage(`Status toggled to ${nextState ? 'ONLINE' : 'OFFLINE'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateLocation = async (lat: number, lng: number) => {
    setCurrentLat(lat);
    setCurrentLng(lng);
    setIsUpdating(true);
    setStatusMessage(null);
    try {
      await apiClient.updateDriverLocation(lat, lng);
      updateDriverProfile({ currentLat: lat, currentLng: lng });
      setStatusMessage(`GPS location updated to Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
    } catch {
      updateDriverProfile({ currentLat: lat, currentLng: lng });
      setStatusMessage(`Simulated GPS updated: (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="card driver-status-card">
      <div className="card-header">
        <div>
          <h2>Driver Availability & Telemetry</h2>
          <p className="text-muted">Manage dispatch status and real-time vehicle GPS coordinates</p>
        </div>
        <div className="status-toggle-box">
          <button
            className={`btn-status-toggle ${isAvailable ? 'online' : 'offline'}`}
            onClick={handleToggleAvailability}
            disabled={isUpdating}
          >
            <span className="toggle-dot"></span>
            {isAvailable ? 'ONLINE' : 'OFFLINE'}
          </button>
        </div>
      </div>

      {statusMessage && <div className="alert alert-info">{statusMessage}</div>}

      <div className="driver-telemetry-grid">
        <div className="telemetry-item">
          <span className="telemetry-label">Availability Mode</span>
          <span className={`telemetry-val ${isAvailable ? 'text-success' : 'text-danger'}`}>
            {isAvailable ? '🟢 Ready for Dispatches' : '🔴 Unavailable / Busy'}
          </span>
        </div>

        <div className="telemetry-item">
          <span className="telemetry-label">Vehicle Registration</span>
          <span className="telemetry-val font-semibold">
            {driver?.vehiclePlate || 'DL-01-AB-1234'} ({driver?.vehicleType || 'STANDARD'})
          </span>
        </div>

        <div className="telemetry-item">
          <span className="telemetry-label">Driver Rating</span>
          <span className="telemetry-val text-warning">
            ★ {driver?.rating ? driver.rating.toFixed(1) : '5.0'} / 5.0
          </span>
        </div>
      </div>

      <div className="gps-section">
        <label className="section-label">Broadcast Current GPS Location</label>
        <div className="gps-checkpoints-grid">
          {GPS_CHECKPOINTS.map((cp, idx) => (
            <button
              key={idx}
              className={`btn btn-sm ${currentLat === cp.lat && currentLng === cp.lng ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handleUpdateLocation(cp.lat, cp.lng)}
              disabled={isUpdating}
            >
              📍 {cp.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
