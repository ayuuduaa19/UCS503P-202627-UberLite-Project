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
      // Backend returns { data: { ride } }
      const accepted = (res.data as any)?.ride ?? res.data;
      onAccepted(accepted ?? { ...ride, status: 'ACCEPTED' });
    } catch (err: any) {
      if (err.statusCode === 409 || err.statusCode === 400) {
        // Ride was already accepted or rejected by another driver — dismiss
        setErrorMessage(err.message || 'Ride is no longer available.');
        setTimeout(() => onRejected(), 1500);
      } else if (err.statusCode === 401 || err.statusCode === 403) {
        setErrorMessage('You are not authorised to accept this ride.');
      } else {
        // Network error – optimistically accept to not block the driver UX
        onAccepted({ ...ride, status: 'ACCEPTED' });
      }
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
    } catch (err: any) {
      if (err.statusCode === 409 || err.statusCode === 400) {
        // Already rejected/completed — just dismiss
        onRejected();
      } else {
        // Network error – still dismiss to avoid blocking the driver
        onRejected();
      }
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
          {ride.distanceKm ?? '—'} km trip
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
          <span className="dispatch-amount">
            {ride.fare?.totalFare != null ? `₹${ride.fare.totalFare}` : '—'}
          </span>
        </div>
        <div className="dispatch-fare-col">
          <span className="text-xs text-muted">Passenger</span>
          <span className="dispatch-passenger">{ride.passenger?.name ?? 'Passenger'}</span>
        </div>
      </div>

      <div className="dispatch-actions">
        <button
          type="button"
          className="btn btn-danger btn-lg"
          onClick={handleReject}
          disabled={isProcessing}
        >
          {isProcessing ? '...' : '✕ Decline'}
        </button>
        <button
          type="button"
          className="btn btn-success btn-lg"
          onClick={handleAccept}
          disabled={isProcessing}
        >
          {isProcessing ? 'Processing...' : '✓ Accept Ride'}
        </button>
      </div>
    </div>
  );
};
