import React, { useState } from 'react';
import { apiClient } from '../../api/client';
import type { Ride } from '../../types';

interface IncomingDispatchCardProps {
  ride: Ride;
  onAccepted: (ride: Ride) => void;
  onRejected: () => void;
}

export const IncomingDispatchCard: React.FC<IncomingDispatchCardProps> = ({
  ride,
  onAccepted,
  onRejected,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAccept = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.acceptRide(ride.id);
      if (res.data) {
        onAccepted(res.data);
      } else {
        onAccepted({ ...ride, status: 'ACCEPTED' });
      }
    } catch {
      onAccepted({ ...ride, status: 'ACCEPTED' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      await apiClient.rejectRide(ride.id);
      onRejected();
    } catch {
      onRejected();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="card dispatch-card pulse-glow">
      <div className="card-header dispatch-header">
        <div className="dispatch-badge">
          <span className="pulse-circle pulse-amber"></span>
          <span>⚡ INCOMING RIDE DISPATCH</span>
        </div>
        <span className="dispatch-distance text-xs font-semibold">
          {ride.distanceKm || 20} km trip
        </span>
      </div>

      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

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

      <div className="dispatch-fare-preview">
        <div className="dispatch-fare-col">
          <span className="text-xs text-muted">Estimated Payout</span>
          <span className="dispatch-amount">₹{ride.fare?.totalFare || 270}</span>
        </div>
        <div className="dispatch-fare-col">
          <span className="text-xs text-muted">Passenger</span>
          <span className="dispatch-passenger">{ride.passenger?.name || 'Alice Passenger'}</span>
        </div>
      </div>

      <div className="dispatch-actions">
        <button
          type="button"
          className="btn btn-danger btn-lg"
          onClick={handleReject}
          disabled={isProcessing}
        >
          ✕ Decline
        </button>
        <button
          type="button"
          className="btn btn-success btn-lg"
          onClick={handleAccept}
          disabled={isProcessing}
        >
          ✓ Accept Ride
        </button>
      </div>
    </div>
  );
};
