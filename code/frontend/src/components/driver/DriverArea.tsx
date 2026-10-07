import React, { useState, useEffect, useRef } from 'react';
import { DriverStatusCard } from './DriverStatusCard';
import { IncomingDispatchCard } from './IncomingDispatchCard';
import { ActiveTripCard } from './ActiveTripCard';
import { DriverRideHistory } from './DriverRideHistory';
import { useRouter } from '../../context/RouterContext';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import type { Ride } from '../../types';

interface DriverAreaProps {
  onOpenAuth: () => void;
}

const POLL_INTERVAL_MS = 4000;

export const DriverArea: React.FC<DriverAreaProps> = ({ onOpenAuth }) => {
  const { activeTab } = useRouter();
  const { isAuthenticated } = useAuth();
  const [incomingRide, setIncomingRide] = useState<Ride | null>(null);
  const [activeTrip, setActiveTrip] = useState<Ride | null>(null);
  const [isPollError, setIsPollError] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Poll the backend for MATCHED rides assigned to this driver.
   * A MATCHED ride is one the driver hasn't accepted or rejected yet.
   * Also polls for ACCEPTED / IN_PROGRESS to restore activeTrip after refresh.
   */
  const pollDriverRides = async () => {
    if (!isAuthenticated) return;
    try {
      // Fetch all non-completed rides assigned to this driver
      const res = await apiClient.getDriverRides();
      const rides: Ride[] = (res.data as any)?.rides ?? (Array.isArray(res.data) ? res.data : []);
      setIsPollError(false);

      const matched = rides.find((r) => r.status === 'MATCHED');
      const inProgress = rides.find((r) => r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS');

      setIncomingRide(matched ?? null);

      // Only restore activeTrip if we don't already have one tracked locally
      // to avoid overwriting local optimistic updates
      setActiveTrip((prev) => {
        if (prev && (prev.status === 'ACCEPTED' || prev.status === 'IN_PROGRESS')) {
          // Keep the most up-to-date version from the server
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
  };

  const startPolling = () => {
    stopPolling();
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
  };

  return (
    <div className="driver-area-container">
      {activeTab === 'status' && (
        <div className="driver-grid">
          <DriverStatusCard />

          {/* Poll error banner */}
          {isPollError && isAuthenticated && (
            <div className="alert alert-error" style={{ margin: '0.5rem 0' }}>
              ⚠️ Could not reach server to check for incoming dispatches. Retrying...
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
          {!isAuthenticated ? (
            <div className="card text-center empty-pad">
              <span className="empty-icon">🔒</span>
              <h3>Sign In Required</h3>
              <p className="text-muted">Please sign in to manage your trips.</p>
              <button className="btn btn-primary mt-3" onClick={onOpenAuth}>
                Sign In
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

      {activeTab === 'feedbacks' && <DriverFeedbacksView />}
    </div>
  );
};

/** Extracted driver feedbacks view with real API loading state */
const DriverFeedbacksView: React.FC = () => {
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await apiClient.getDriverFeedbacks();
        const data: any[] = (res.data as any)?.feedbacks ?? (Array.isArray(res.data) ? res.data : []);
        setFeedbacks(data);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load feedback');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const avgRating =
    feedbacks.length > 0
      ? feedbacks.reduce((sum, f) => sum + (f.rating ?? 0), 0) / feedbacks.length
      : null;

  if (isLoading) {
    return (
      <div className="card feedbacks-card">
        <div className="loading-state">
          <span className="spinner"></span> Loading your ratings...
        </div>
      </div>
    );
  }

  return (
    <div className="card feedbacks-card">
      <h2>Driver Ratings &amp; Reviews</h2>
      <p className="text-muted">Passenger ratings and feedback for your completed trips</p>

      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

      {!errorMessage && feedbacks.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">⭐</span>
          <p>No feedback received yet.</p>
          <span className="text-muted text-xs">Complete trips to receive ratings from passengers!</span>
        </div>
      ) : (
        <>
          {avgRating !== null && (
            <div className="driver-rating-banner">
              <div className="big-rating-number">{avgRating.toFixed(1)}</div>
              <div className="rating-stars-row">
                {'★'.repeat(Math.round(avgRating))}{'☆'.repeat(5 - Math.round(avgRating))}
              </div>
              <span className="text-xs text-muted">
                Based on {feedbacks.length} verified passenger {feedbacks.length === 1 ? 'trip' : 'trips'}
              </span>
            </div>
          )}
          <div className="review-items-list">
            {feedbacks.map((fb: any) => (
              <div key={fb.id} className="review-item">
                <div className="review-header">
                  <span className="review-user">{fb.user?.name ?? 'Passenger'}</span>
                  <span className="rating-pill">★ {fb.rating}</span>
                </div>
                {fb.comment && <p className="review-text">"{fb.comment}"</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
