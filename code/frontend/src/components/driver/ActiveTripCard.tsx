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
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);

  const handleStartTrip = async () => {
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.startRide(ride.id);
      // Backend returns { data: { ride } }
      const updated = (res.data as any)?.ride ?? res.data;
      onTripUpdated(updated ?? { ...ride, status: 'IN_PROGRESS' });
      setStatusMessage({ text: 'Trip started! Driving towards destination.', type: 'success' });
    } catch (err: any) {
      if (err.statusCode === 400 || err.statusCode === 409) {
        setStatusMessage({ text: err.message || 'Cannot start ride in current state.', type: 'error' });
      } else {
        // Network error – optimistic update
        onTripUpdated({ ...ride, status: 'IN_PROGRESS' });
        setStatusMessage({ text: 'Trip started! Driving towards destination.', type: 'info' });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteTrip = async () => {
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.completeRide(ride.id, ride.distanceKm ?? undefined, ride.durationMin ?? undefined);
      // Backend returns { data: { ride, fare } }
      const updated = (res.data as any)?.ride ?? res.data;
      onTripUpdated(updated ?? { ...ride, status: 'COMPLETED' });
      setStatusMessage({ text: 'Trip completed successfully! Fare generated.', type: 'success' });
      setTimeout(() => {
        onTripCompleted();
      }, 1800);
    } catch (err: any) {
      if (err.statusCode === 400 || err.statusCode === 409) {
        setStatusMessage({ text: err.message || 'Cannot complete ride in current state.', type: 'error' });
      } else {
        // Network error – optimistic update
        onTripUpdated({ ...ride, status: 'COMPLETED' });
        setStatusMessage({ text: 'Trip completed successfully! Fare generated.', type: 'info' });
        setTimeout(() => {
          onTripCompleted();
        }, 1800);
      }
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

      {statusMessage && (
        <div className={`alert alert-${statusMessage.type === 'error' ? 'error' : statusMessage.type === 'success' ? 'success' : 'info'}`}>
          {statusMessage.text}
        </div>
      )}

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
          <span className="metric-val">{ride.distanceKm != null ? `${ride.distanceKm} km` : '—'}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Estimated Payout</span>
          <span className="metric-val">
            {ride.fare?.totalFare != null ? `₹${ride.fare.totalFare}` : '—'}
          </span>
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
            🎉 Trip completed! Total Fare: {ride.fare?.totalFare != null ? `₹${ride.fare.totalFare}` : 'Processing...'}
          </div>
        )}
      </div>
    </div>
  );
};
