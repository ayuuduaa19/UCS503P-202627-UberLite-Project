import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const DISPATCH_POLL_MS = 7000;   // poll for new incoming rides every 7s
const TRIP_POLL_MS = 8000;       // poll active trip status every 8s

export const DriverArea: React.FC<DriverAreaProps> = ({ onOpenAuth }) => {
  const { activeTab } = useRouter();
  const { isAuthenticated } = useAuth();

  const [incomingRide, setIncomingRide] = useState<Ride | null>(null);
  const [activeTrip, setActiveTrip] = useState<Ride | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  const dispatchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tripPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch incoming dispatch (MATCHED rides assigned to this driver) ───────
  const fetchIncomingDispatch = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await apiClient.getDriverRides('MATCHED');
      if (res.data && res.data.length > 0) {
        // Only show if not currently in an active trip
        if (!activeTrip) {
          setIncomingRide(res.data[0]);
        }
      } else {
        // Clear incoming if no longer pending
        setIncomingRide((prev) => {
          // Keep previous if it's a local simulation
          if (prev?.id?.startsWith('dispatch-demo')) return prev;
          return null;
        });
      }
    } catch {
      // silently ignore network errors during polling
    }
  }, [isAuthenticated, activeTrip]);

  // ─── Fetch active trip (ACCEPTED / IN_PROGRESS) ───────────────────────────
  const fetchActiveTrip = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [acceptedRes, inProgressRes] = await Promise.allSettled([
        apiClient.getDriverRides('ACCEPTED'),
        apiClient.getDriverRides('IN_PROGRESS'),
      ]);

      let foundTrip: Ride | null = null;
      if (acceptedRes.status === 'fulfilled' && acceptedRes.value.data?.length) {
        foundTrip = acceptedRes.value.data[0];
      } else if (inProgressRes.status === 'fulfilled' && inProgressRes.value.data?.length) {
        foundTrip = inProgressRes.value.data[0];
      }

      if (foundTrip) {
        setActiveTrip(foundTrip);
        setIncomingRide(null);
      }
    } catch {
      // silently ignore
    }
  }, [isAuthenticated]);

  // ─── Resume in-flight state on mount ─────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    // Load current state from API on initial mount
    fetchActiveTrip();
    fetchIncomingDispatch();
  }, [isAuthenticated]);

  // ─── Start dispatch polling when no active trip ───────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    if (!activeTrip) {
      dispatchPollRef.current = setInterval(fetchIncomingDispatch, DISPATCH_POLL_MS);
      setIsPolling(true);
    } else {
      // Clear dispatch polling when actively on a trip
      if (dispatchPollRef.current) {
        clearInterval(dispatchPollRef.current);
        dispatchPollRef.current = null;
      }
      setIsPolling(false);
    }

    return () => {
      if (dispatchPollRef.current) {
        clearInterval(dispatchPollRef.current);
        dispatchPollRef.current = null;
      }
    };
  }, [isAuthenticated, activeTrip, fetchIncomingDispatch]);

  // ─── Poll active trip status ──────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !activeTrip) {
      if (tripPollRef.current) {
        clearInterval(tripPollRef.current);
        tripPollRef.current = null;
      }
      return;
    }

    if (activeTrip.status === 'ACCEPTED' || activeTrip.status === 'IN_PROGRESS') {
      tripPollRef.current = setInterval(async () => {
        try {
          const res = await apiClient.getDriverRides(activeTrip.status);
          if (res.data && res.data.length > 0) {
            setActiveTrip(res.data[0]);
          }
        } catch { /* ignore */ }
      }, TRIP_POLL_MS);
    }

    return () => {
      if (tripPollRef.current) {
        clearInterval(tripPollRef.current);
        tripPollRef.current = null;
      }
    };
  }, [isAuthenticated, activeTrip?.id, activeTrip?.status]);

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleRideAccepted = (acceptedRide: Ride) => {
    setIncomingRide(null);
    setActiveTrip({ ...acceptedRide, status: 'ACCEPTED' });
  };

  const handleRideRejected = () => {
    setIncomingRide(null);
  };

  const handleTripCompleted = () => {
    setActiveTrip(null);
    // Resume dispatch polling after trip completes
    fetchIncomingDispatch();
  };

  return (
    <div className="driver-area-container">
      {activeTab === 'status' && (
        <div className="driver-grid">
          <DriverStatusCard />

          {/* Polling indicator */}
          {isPolling && isAuthenticated && (
            <div className="polling-indicator text-xs text-muted">
              <span className="pulse-circle pulse-green"></span>
              Listening for incoming ride dispatches...
            </div>
          )}

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
          {activeTrip ? (
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
                {isAuthenticated
                  ? 'You are currently waiting for incoming dispatches.'
                  : 'Sign in as a driver to receive ride requests.'}
              </p>
              {!isAuthenticated && (
                <button className="btn btn-sm btn-primary mt-3" onClick={onOpenAuth}>
                  Sign In as Driver
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && <DriverRideHistory onOpenAuth={onOpenAuth} />}

      {activeTab === 'feedbacks' && <DriverFeedbacksPanel onOpenAuth={onOpenAuth} />}
    </div>
  );
};
