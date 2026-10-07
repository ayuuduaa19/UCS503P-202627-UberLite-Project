import React, { useState, useEffect, useRef } from 'react';
import { RideBookingCard } from './RideBookingCard';
import { ActiveRideCard } from './ActiveRideCard';
import { PassengerRideHistory } from './PassengerRideHistory';
import { FeedbackModal } from './FeedbackModal';
import { PassengerDashboardStats } from './PassengerDashboardStats';
import { useRouter } from '../../context/RouterContext';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import type { Ride } from '../../types';

interface PassengerAreaProps {
  onOpenAuth: () => void;
}

/** Ride statuses that are still in flight and require polling */
const ACTIVE_STATUSES = new Set<string>(['REQUESTED', 'MATCHED', 'ACCEPTED', 'IN_PROGRESS']);
const POLL_INTERVAL_MS = 5000;

export const PassengerArea: React.FC<PassengerAreaProps> = ({ onOpenAuth }) => {
  const { activeTab } = useRouter();
  const { isAuthenticated } = useAuth();
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [feedbackRideId, setFeedbackRideId] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Fetch active ride on initial load or auth change */
  const fetchActiveRide = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await apiClient.getPassengerRides();
      const rides: Ride[] = (res.data as any)?.rides ?? (Array.isArray(res.data) ? res.data : []);
      const active = rides.find((r) => ACTIVE_STATUSES.has(r.status));
      if (active) {
        setActiveRide(active);
      }
    } catch {
      // Ignore network error on initial load
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchActiveRide();
    } else {
      setActiveRide(null);
      stopPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  /** Refresh the active ride from the backend to pick up status transitions. */
  const refreshActiveRide = async (rideId: string) => {
    try {
      const res = await apiClient.getRideDetails(rideId);
      // Backend returns { data: { ride } } or { data: <ride> }
      const updated = (res.data as any)?.ride ?? res.data;
      if (updated) {
        setActiveRide(updated as Ride);
        // If ride reached a terminal state, stop polling
        if (!ACTIVE_STATUSES.has(updated.status)) {
          stopPolling();
          if (updated.status === 'COMPLETED') {
            setFeedbackRideId(updated.id);
          }
        }
      }
    } catch {
      // Network error – keep polling silently
    }
  };

  const stopPolling = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (rideId: string) => {
    stopPolling();
    pollRef.current = setInterval(() => refreshActiveRide(rideId), POLL_INTERVAL_MS);
  };

  // Whenever active ride changes, decide whether to poll
  useEffect(() => {
    if (activeRide && ACTIVE_STATUSES.has(activeRide.status) && isAuthenticated) {
      startPolling(activeRide.id);
    } else {
      stopPolling();
    }
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRide?.id, activeRide?.status, isAuthenticated]);

  // Cleanup on unmount
  useEffect(() => stopPolling, []);

  const handleRideCreated = (ride: Ride) => {
    setActiveRide(ride);
  };

  const handleRefreshRide = () => {
    if (activeRide) {
      refreshActiveRide(activeRide.id);
    }
  };

  const handleFeedbackSuccess = () => {
    setFeedbackRideId(null);
    setActiveRide(null);
    setSuccessBanner('Thank you for rating your trip! Your feedback has been recorded.');
    setTimeout(() => setSuccessBanner(null), 5000);
  };

  return (
    <div className="passenger-area-container">
      {/* Dashboard Stats Banner */}
      <PassengerDashboardStats />

      {successBanner && (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          ⭐ {successBanner}
        </div>
      )}

      {/* Dynamic Tab Switch View */}
      {activeTab === 'book' && (
        <div className="passenger-grid">
          <RideBookingCard onRideCreated={handleRideCreated} onOpenAuth={onOpenAuth} />
          {activeRide && (
            <ActiveRideCard
              ride={activeRide}
              onRefresh={handleRefreshRide}
              onRideUpdated={(updated) => setActiveRide(updated)}
              onOpenFeedback={(id) => setFeedbackRideId(id)}
            />
          )}
        </div>
      )}

      {activeTab === 'active' && (
        <div className="passenger-single-view">
          {!isAuthenticated ? (
            <div className="card text-center empty-pad">
              <span className="empty-icon">🔒</span>
              <h3>Sign In Required</h3>
              <p className="text-muted">Please sign in to view your active ride.</p>
              <button className="btn btn-primary mt-3" onClick={onOpenAuth}>
                Sign In
              </button>
            </div>
          ) : activeRide ? (
            <ActiveRideCard
              ride={activeRide}
              onRefresh={handleRefreshRide}
              onRideUpdated={(updated) => setActiveRide(updated)}
              onOpenFeedback={(id) => setFeedbackRideId(id)}
            />
          ) : (
            <div className="card text-center empty-pad">
              <span className="empty-icon">📍</span>
              <h3>No Active Ride</h3>
              <p className="text-muted">You do not have an in-progress ride right now.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <PassengerRideHistory
          onOpenFeedback={(id) => setFeedbackRideId(id)}
          onOpenAuth={onOpenAuth}
        />
      )}

      {activeTab === 'fare' && (
        <div className="card fare-info-card">
          <h2>Transparent Fare Structure</h2>
          <p className="text-muted">Standard transparent calculation based on vehicle tier and distance</p>
          <div className="fare-rates-grid">
            <div className="rate-card">
              <h3>Standard</h3>
              <div className="rate-large">₹30 <span className="text-xs text-muted">base</span></div>
              <div className="rate-sub">+ ₹12 / km</div>
            </div>
            <div className="rate-card rate-highlight">
              <h3>Premium</h3>
              <div className="rate-large">₹60 <span className="text-xs text-muted">base</span></div>
              <div className="rate-sub">+ ₹20 / km</div>
            </div>
            <div className="rate-card">
              <h3>Uber XL</h3>
              <div className="rate-large">₹50 <span className="text-xs text-muted">base</span></div>
              <div className="rate-sub">+ ₹16 / km</div>
            </div>
          </div>
        </div>
      )}

      {/* Post-Ride Feedback Modal */}
      {feedbackRideId && (
        <FeedbackModal
          rideId={feedbackRideId}
          isOpen={true}
          onClose={() => setFeedbackRideId(null)}
          onSuccess={handleFeedbackSuccess}
        />
      )}
    </div>
  );
};
