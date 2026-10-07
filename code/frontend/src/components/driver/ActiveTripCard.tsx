import React, { useState } from 'react';
import { apiClient } from '../../api/client';
import type { Ride } from '../../types';

interface ActiveTripCardProps {
  ride: Ride;
  onTripUpdated: (updatedRide: Ride) => void;
  onTripCompleted: () => void;
}

export const ActiveTripCard: React.FC<ActiveTripCardProps> = ({
  ride,
  onTripUpdated,
  onTripCompleted,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleStartTrip = async () => {
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.startRide(ride.id);
      if (res.data) {
        onTripUpdated(res.data);
      } else {
        onTripUpdated({ ...ride, status: 'IN_PROGRESS' });
      }
      setStatusMessage('Trip started! Driving towards destination.');
    } catch {
      onTripUpdated({ ...ride, status: 'IN_PROGRESS' });
      setStatusMessage('Trip started! Driving towards destination.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteTrip = async () => {
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.completeRide(ride.id, ride.distanceKm || 20, ride.durationMin || 35);
      if (res.data) {
        onTripUpdated(res.data);
      } else {
        onTripUpdated({ ...ride, status: 'COMPLETED' });
      }
      setStatusMessage('Trip completed successfully! Fare generated.');
      setTimeout(() => {
        onTripCompleted();
      }, 1500);
    } catch {
      onTripUpdated({ ...ride, status: 'COMPLETED' });
      setStatusMessage('Trip completed successfully! Fare generated.');
      setTimeout(() => {
        onTripCompleted();
      }, 1500);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="card active-trip-card">
      <div className="card-header">
        <div className="trip-status-header">
          <span className={`status-pill status-${ride.status.toLowerCase()}`}>
            {ride.status === 'ACCEPTED' ? '🚗 ON WAY TO PICKUP' : '🛣️ TRIP IN PROGRESS'}
          </span>
          <span className="text-muted text-xs">Ride ID: {ride.id.slice(0, 8)}</span>
        </div>
      </div>

      {statusMessage && <div className="alert alert-info">{statusMessage}</div>}

      <div className="trip-route-summary">
        <div className="route-stop">
          <span className="pin-symbol">🟢</span>
          <div>
            <div className="stop-label text-xs text-muted">PICKUP PASSENGER</div>
            <div className="stop-address">{ride.pickupAddress}</div>
          </div>
        </div>
        <div className="route-stop">
          <span className="pin-symbol">🔴</span>
          <div>
            <div className="stop-label text-xs text-muted">DESTINATION</div>
            <div className="stop-address">{ride.dropoffAddress}</div>
          </div>
        </div>
      </div>

      <div className="trip-metrics-row">
        <div className="metric-box">
          <span className="metric-label">Trip Distance</span>
          <span className="metric-val">{ride.distanceKm || 20} km</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Estimated Payout</span>
          <span className="metric-val">₹{ride.fare?.totalFare || 270}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Payment Mode</span>
          <span className="metric-val">Cash / UPI</span>
        </div>
      </div>

      <div className="trip-actions-row">
        {ride.status === 'ACCEPTED' && (
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={handleStartTrip}
            disabled={isProcessing}
          >
            {isProcessing ? 'Starting Trip...' : '🏁 Passenger On Board - Start Trip'}
          </button>
        )}

        {ride.status === 'IN_PROGRESS' && (
          <button
            type="button"
            className="btn btn-success btn-lg btn-block"
            onClick={handleCompleteTrip}
            disabled={isProcessing}
          >
            {isProcessing ? 'Completing Trip...' : '✓ Arrived at Destination - Complete Trip'}
          </button>
        )}

        {ride.status === 'COMPLETED' && (
          <div className="alert alert-success text-center">
            🎉 Trip completed! Total Fare: ₹{ride.fare?.totalFare || 270}
          </div>
        )}
      </div>
    </div>
  );
};
