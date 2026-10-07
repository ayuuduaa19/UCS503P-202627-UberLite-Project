import React, { useEffect, useRef, useState } from 'react';
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

const ACTIVE_STATUSES = ['REQUESTED', 'MATCHED', 'ACCEPTED', 'IN_PROGRESS'];
const POLL_INTERVAL_MS = 8000;

export const PassengerArea: React.FC<PassengerAreaProps> = ({ onOpenAuth }) => {
  const { activeTab } = useRouter();
  const { isAuthenticated } = useAuth();
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [feedbackRideId, setFeedbackRideId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll the active ride status if one exists
  const pollActiveRide = async (rideId: string) => {
    try {
      const res = await apiClient.getRideDetails(rideId);
      if (res.data) {
        const updated = res.data;
        setActiveRide(updated);
        // If ride reached terminal state, stop polling and prompt feedback
        if (updated.status === 'COMPLETED' || updated.status === 'CANCELLED') {
          stopPolling();
          if (updated.status === 'COMPLETED') {
            setFeedbackRideId(updated.id);
          }
        }
      }
    } catch {
      // silently ignore polling errors
    }
  };

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (activeRide && ACTIVE_STATUSES.includes(activeRide.status) && isAuthenticated) {
      // Start polling every 8 seconds
      stopPolling();
      pollTimerRef.current = setInterval(() => {
        pollActiveRide(activeRide.id);
      }, POLL_INTERVAL_MS);
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [activeRide?.id, activeRide?.status, isAuthenticated]);

  // Attempt to resume an in-progress ride on load
  useEffect(() => {
    if (!isAuthenticated) return;
    apiClient
      .getPassengerRides()
      .then((res) => {
        if (res.data && res.data.length > 0) {
          const ongoing = res.data.find((r) => ACTIVE_STATUSES.includes(r.status));
          if (ongoing) {
            setActiveRide(ongoing);
          }
        }
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const handleRideCreated = (ride: Ride) => {
    setActiveRide(ride);
  };

  return (
    <div className="passenger-area-container">
      {/* Dashboard Stats Banner */}
      <PassengerDashboardStats />

      {/* Dynamic Tab Switch View */}
      {activeTab === 'book' && (
        <div className="passenger-grid">
          <RideBookingCard onRideCreated={handleRideCreated} onOpenAuth={onOpenAuth} />
          {activeRide && (
            <ActiveRideCard
              ride={activeRide}
              onRefresh={() => pollActiveRide(activeRide.id)}
              onRideUpdated={(updated) => setActiveRide(updated)}
              onOpenFeedback={(id) => setFeedbackRideId(id)}
            />
          )}
        </div>
      )}

      {activeTab === 'active' && (
        <div className="passenger-single-view">
          {activeRide ? (
            <ActiveRideCard
              ride={activeRide}
              onRefresh={() => pollActiveRide(activeRide.id)}
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
          onSuccess={() => setFeedbackRideId(null)}
        />
      )}
    </div>
  );
};
