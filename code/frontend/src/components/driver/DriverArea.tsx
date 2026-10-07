import React, { useState, useEffect, useRef } from 'react';
import { DriverStatusCard } from './DriverStatusCard';
import { IncomingDispatchCard } from './IncomingDispatchCard';
import { ActiveTripCard } from './ActiveTripCard';
import { DriverRideHistory } from './DriverRideHistory';
import { DriverFeedbacksPanel } from './DriverFeedbacksPanel';
import { useRouter } from '../../context/RouterContext';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import type { Ride } from '../../types';

interface DriverAreaProps {
  onOpenAuth: () => void;
}

const POLL_INTERVAL_MS = 5000;

export const DriverArea: React.FC<DriverAreaProps> = ({ onOpenAuth }) => {
  const { activeTab } = useRouter();
  const { isAuthenticated } = useAuth();
  const [incomingRide, setIncomingRide] = useState<Ride | null>(null);
  const [activeTrip, setActiveTrip] = useState<Ride | null>(null);
  const [isPollError, setIsPollError] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Poll the backend for MATCHED rides assigned to this driver.
   * A MATCHED ride is one the driver hasn't accepted or rejected yet.
   * Also polls for ACCEPTED / IN_PROGRESS to restore activeTrip after refresh.
   */
  const pollDriverRides = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await apiClient.getDriverRides();
      const rides: Ride[] = (res.data as any)?.rides ?? (Array.isArray(res.data) ? res.data : []);
      setIsPollError(false);

      const matched = rides.find((r) => r.status === 'MATCHED');
      const inProgress = rides.find((r) => r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS');

      setIncomingRide(matched ?? null);

      // Restore or keep activeTrip up to date
      setActiveTrip((prev) => {
        if (prev && (prev.status === 'ACCEPTED' || prev.status === 'IN_PROGRESS')) {
          return inProgress ?? prev;
        }
        return inProgress ?? null;
      });
    } catch {
      setIsPollError(true);
    }
  };

  const stopPolling = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsPolling(false);
  };

  const startPolling = () => {
    stopPolling();
    setIsPolling(true);
    pollRef.current = setInterval(pollDriverRides, POLL_INTERVAL_MS);
  };

  useEffect(() => {
    if (isAuthenticated) {
      pollDriverRides(); // immediate first fetch
      startPolling();
    } else {
      stopPolling();
      setIncomingRide(null);
      setActiveTrip(null);
    }
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Stop polling when on history or feedbacks tab (less critical)
  useEffect(() => {
    if (activeTab === 'history' || activeTab === 'feedbacks') {
      stopPolling();
    } else if (isAuthenticated) {
      startPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthenticated]);

  // Cleanup on unmount
  useEffect(() => stopPolling, []);

  const handleRideAccepted = (acceptedRide: Ride) => {
    setIncomingRide(null);
    setActiveTrip({ ...acceptedRide, status: 'ACCEPTED' });
  };

  const handleRideRejected = () => {
    setIncomingRide(null);
  };

  const handleTripCompleted = () => {
    setActiveTrip(null);
    pollDriverRides();
  };

  return (
    <div className="driver-area-container">
      {activeTab === 'status' && (
        <div className="driver-grid">
          <DriverStatusCard />

          {/* Polling / Error status banner */}
          {isPollError && isAuthenticated ? (
            <div className="alert alert-error" style={{ margin: '0.5rem 0' }}>
              ⚠️ Could not reach server to check for incoming dispatches. Retrying...
            </div>
          ) : isPolling && isAuthenticated && !incomingRide && !activeTrip ? (
            <div className="polling-indicator text-xs text-muted" style={{ margin: '0.5rem 0' }}>
              <span className="pulse-circle pulse-green"></span>
              Listening for incoming ride dispatches...
            </div>
          ) : null}

          {incomingRide && !activeTrip && (
            <IncomingDispatchCard
              ride={incomingRide}
              onAccepted={handleRideAccepted}
              onRejected={handleRideRejected}
            />
          )}

          {activeTrip && (
            <ActiveTripCard
              ride={activeTrip}
              onTripUpdated={(updated) => setActiveTrip(updated)}
              onTripCompleted={handleTripCompleted}
            />
          )}
        </div>
      )}

      {activeTab === 'active' && (
        <div className="driver-single-view">
          {!isAuthenticated ? (
            <div className="card text-center empty-pad">
              <span className="empty-icon">🔒</span>
              <h3>Sign In Required</h3>
              <p className="text-muted">Please sign in to manage your trips.</p>
              <button className="btn btn-primary mt-3" onClick={onOpenAuth}>
                Sign In as Driver
              </button>
            </div>
          ) : activeTrip ? (
            <ActiveTripCard
              ride={activeTrip}
              onTripUpdated={(updated) => setActiveTrip(updated)}
              onTripCompleted={handleTripCompleted}
            />
          ) : incomingRide ? (
            <IncomingDispatchCard
              ride={incomingRide}
              onAccepted={handleRideAccepted}
              onRejected={handleRideRejected}
            />
          ) : (
            <div className="card text-center empty-pad">
              <span className="empty-icon">🚗</span>
              <h3>No Active Trip</h3>
              <p className="text-muted">
                {isPollError
                  ? 'Unable to connect to server. Please check your connection.'
                  : 'You are currently waiting for incoming dispatches.'}
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && <DriverRideHistory onOpenAuth={onOpenAuth} />}

      {activeTab === 'feedbacks' && <DriverFeedbacksPanel onOpenAuth={onOpenAuth} />}
    </div>
  );
};
