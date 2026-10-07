import React, { useState } from 'react';
import { RideBookingCard } from './RideBookingCard';
import { ActiveRideCard } from './ActiveRideCard';
import { PassengerRideHistory } from './PassengerRideHistory';
import { FeedbackModal } from './FeedbackModal';
import { useRouter } from '../../context/RouterContext';
import type { Ride } from '../../types';

interface PassengerAreaProps {
  onOpenAuth: () => void;
}

export const PassengerArea: React.FC<PassengerAreaProps> = ({ onOpenAuth }) => {
  const { activeTab } = useRouter();
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [feedbackRideId, setFeedbackRideId] = useState<string | null>(null);

  const handleRideCreated = (ride: Ride) => {
    setActiveRide(ride);
  };

  return (
    <div className="passenger-area-container">
      {/* Dynamic Tab Switch View */}
      {activeTab === 'book' && (
        <div className="passenger-grid">
          <RideBookingCard onRideCreated={handleRideCreated} onOpenAuth={onOpenAuth} />
          {activeRide && (
            <ActiveRideCard
              ride={activeRide}
              onRefresh={() => {}}
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
              onRefresh={() => {}}
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
