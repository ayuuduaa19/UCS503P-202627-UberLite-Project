import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { DriverProfile } from '../../types';

const GPS_CHECKPOINTS = [
  { name: 'Connaught Place, Central Delhi', lat: 28.6315, lng: 77.2167 },
  { name: 'DLF Cyber City, Gurugram', lat: 28.4952, lng: 77.0895 },
  { name: 'Sector 18 Market, Noida', lat: 28.5708, lng: 77.326 },
  { name: 'Select Citywalk, Saket', lat: 28.5284, lng: 77.2185 },
];

export const DriverStatusCard: React.FC = () => {
  const { driver: ctxDriver, isAuthenticated, updateDriverProfile } = useAuth();
  const [profile, setProfile] = useState<DriverProfile | null>(ctxDriver);
  const [isAvailable, setIsAvailable] = useState<boolean>(ctxDriver?.isAvailable ?? true);
  const [currentLat, setCurrentLat] = useState<number>(ctxDriver?.currentLat ?? 28.6315);
  const [currentLng, setCurrentLng] = useState<number>(ctxDriver?.currentLng ?? 77.2167);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);

  // Load fresh profile from API if authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    apiClient
      .getDriverProfile()
      .then((res) => {
        if (res.data) {
          const { user: _user, ...driverFields } = res.data;
          setProfile(driverFields as DriverProfile);
          setIsAvailable(driverFields.isAvailable);
          if (driverFields.currentLat) setCurrentLat(driverFields.currentLat);
          if (driverFields.currentLng) setCurrentLng(driverFields.currentLng);
        }
      })
      .catch(() => {
        // Use context data as fallback
        if (ctxDriver) {
          setProfile(ctxDriver);
          setIsAvailable(ctxDriver.isAvailable);
        }
      });
  }, [isAuthenticated]);

  const displayProfile = profile ?? ctxDriver;

  const handleToggleAvailability = async () => {
    const nextState = !isAvailable;
    setIsUpdating(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.updateDriverAvailability(nextState);
      setIsAvailable(nextState);
      if (res.data) {
        setProfile((prev) => (prev ? { ...prev, isAvailable: nextState } : null));
      }
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
      const res = await apiClient.updateDriverLocation(lat, lng);
      if (res.data) {
        setProfile((prev) => (prev ? { ...prev, currentLat: lat, currentLng: lng } : null));
      }
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
            {displayProfile?.vehiclePlate ?? 'DL-01-AB-1234'} ({displayProfile?.vehicleType ?? 'STANDARD'})
          </span>
        </div>

        <div className="telemetry-item">
          <span className="telemetry-label">Driver Rating</span>
          <span className="telemetry-val text-warning">
            ★ {displayProfile?.rating != null ? displayProfile.rating.toFixed(1) : '5.0'} / 5.0
          </span>
        </div>

        {displayProfile?.vehicleModel && (
          <div className="telemetry-item">
            <span className="telemetry-label">Vehicle Model</span>
            <span className="telemetry-val">{displayProfile.vehicleModel}</span>
          </div>
        )}

        {displayProfile?.vehicleColor && (
          <div className="telemetry-item">
            <span className="telemetry-label">Vehicle Colour</span>
            <span className="telemetry-val">{displayProfile.vehicleColor}</span>
          </div>
        )}

        <div className="telemetry-item">
          <span className="telemetry-label">Current GPS</span>
          <span className="telemetry-val text-xs">
            {currentLat.toFixed(4)}, {currentLng.toFixed(4)}
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
