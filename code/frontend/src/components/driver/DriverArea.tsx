import React, { useState } from 'react';
import { DriverStatusCard } from './DriverStatusCard';
import { IncomingDispatchCard } from './IncomingDispatchCard';
import { ActiveTripCard } from './ActiveTripCard';
import { DriverRideHistory } from './DriverRideHistory';
import { useRouter } from '../../context/RouterContext';
import type { Ride } from '../../types';

interface DriverAreaProps {
  onOpenAuth: () => void;
}

const SAMPLE_INCOMING_RIDE: Ride = {
  id: 'dispatch-demo-ride-123',
  passengerId: 'demo-passenger-uuid',
  pickupAddress: 'Connaught Place, New Delhi',
  pickupLat: 28.6315,
  pickupLng: 77.2167,
  dropoffAddress: 'DLF Cyber City, Gurugram',
  dropoffLat: 28.4952,
  dropoffLng: 77.0895,
  distanceKm: 20.0,
  durationMin: 35.0,
  status: 'MATCHED',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  passenger: {
    id: 'demo-passenger-uuid',
    name: 'Alice Passenger',
    phone: '+91 9876543210',
    email: 'alice@uberlite.local',
  },
};

export const DriverArea: React.FC<DriverAreaProps> = ({ onOpenAuth }) => {
  const { activeTab } = useRouter();
  const [incomingRide, setIncomingRide] = useState<Ride | null>(SAMPLE_INCOMING_RIDE);
  const [activeTrip, setActiveTrip] = useState<Ride | null>(null);

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
              <p className="text-muted">You are currently waiting for incoming dispatches.</p>
              <button
                className="btn btn-sm btn-outline mt-3"
                onClick={() => setIncomingRide(SAMPLE_INCOMING_RIDE)}
              >
                Simulate Incoming Dispatch
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && <DriverRideHistory onOpenAuth={onOpenAuth} />}

      {activeTab === 'feedbacks' && (
        <div className="card feedbacks-card">
          <h2>Driver Ratings & Reviews</h2>
          <p className="text-muted">Passenger ratings and feedback for your completed trips</p>
          <div className="driver-rating-banner">
            <div className="big-rating-number">4.9</div>
            <div className="rating-stars-row">★★★★★</div>
            <span className="text-xs text-muted">Based on 148 verified passenger trips</span>
          </div>
          <div className="review-items-list">
            <div className="review-item">
              <div className="review-header">
                <span className="review-user">Alice P.</span>
                <span className="rating-pill">★ 5.0</span>
              </div>
              <p className="review-text">"Very polite driver, on time and clean car!"</p>
            </div>
            <div className="review-item">
              <div className="review-header">
                <span className="review-user">Rohan M.</span>
                <span className="rating-pill">★ 5.0</span>
              </div>
              <p className="review-text">"Smooth drive during peak traffic, thank you."</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
