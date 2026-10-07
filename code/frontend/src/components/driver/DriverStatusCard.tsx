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
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);

  const handleToggleAvailability = async () => {
    const nextState = !isAvailable;
    setIsUpdating(true);
    setStatusMessage(null);
    try {
      await apiClient.updateDriverAvailability(nextState);
      setIsAvailable(nextState);
      updateDriverProfile({ isAvailable: nextState });
      setStatusMessage({
        text: `Driver status is now ${nextState ? 'ONLINE (Accepting Rides)' : 'OFFLINE'}`,
        type: 'success',
      });
    } catch (err: any) {
      if (err.statusCode === 401 || err.statusCode === 403) {
        setStatusMessage({ text: 'You must be logged in as a driver to change availability.', type: 'error' });
      } else {
        // Network error – apply locally and show info
        setIsAvailable(nextState);
        updateDriverProfile({ isAvailable: nextState });
        setStatusMessage({
          text: `Status toggled to ${nextState ? 'ONLINE' : 'OFFLINE'} (offline mode)`,
          type: 'info',
        });
      }
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
      setStatusMessage({
        text: `GPS location updated to Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`,
        type: 'success',
      });
    } catch (err: any) {
      if (err.statusCode === 401 || err.statusCode === 403) {
        setStatusMessage({ text: 'Authentication required to update location.', type: 'error' });
      } else {
        // Network error – update locally
        updateDriverProfile({ currentLat: lat, currentLng: lng });
        setStatusMessage({
          text: `Simulated GPS updated: (${lat.toFixed(4)}, ${lng.toFixed(4)}) (offline mode)`,
          type: 'info',
        });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="card driver-status-card">
      <div className="card-header">
        <div>
          <h2>Driver Availability &amp; Telemetry</h2>
          <p className="text-muted">Manage dispatch status and real-time vehicle GPS coordinates</p>
        </div>
        <div className="status-toggle-box">
          <button
            className={`btn-status-toggle ${isAvailable ? 'online' : 'offline'}`}
            onClick={handleToggleAvailability}
            disabled={isUpdating}
          >
            <span className="toggle-dot"></span>
            {isUpdating ? '...' : isAvailable ? 'ONLINE' : 'OFFLINE'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className={`alert alert-${statusMessage.type === 'error' ? 'error' : statusMessage.type === 'success' ? 'success' : 'info'}`}>
          {statusMessage.text}
        </div>
      )}

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
            {driver?.vehiclePlate ?? 'DL-01-AB-1234'} ({driver?.vehicleType ?? 'STANDARD'})
          </span>
        </div>

        <div className="telemetry-item">
          <span className="telemetry-label">Driver Rating</span>
          <span className="telemetry-val text-warning">
            ★ {driver?.rating != null ? driver.rating.toFixed(1) : '5.0'} / 5.0
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
