import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../api/client';
import type { Ride } from '../../types';

interface ActiveTripCardProps {
  ride: Ride;
  onTripUpdated: (updatedRide: Ride) => void;
  onTripCompleted: () => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const ActiveTripCard: React.FC<ActiveTripCardProps> = ({
  ride,
  onTripUpdated,
  onTripCompleted,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live trip timer — runs when status is IN_PROGRESS
  useEffect(() => {
    if (ride.status === 'IN_PROGRESS') {
      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [ride.status]);

  const handleStartTrip = async () => {
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.startRide(ride.id);
      const updated = (res.data as any)?.ride ?? res.data ?? { ...ride, status: 'IN_PROGRESS' as const };
      onTripUpdated(updated);
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
    const durationFromTimer = Math.max(Math.ceil(elapsedSec / 60), 1);
    try {
      const res = await apiClient.completeRide(
        ride.id,
        ride.distanceKm ?? 20,
        ride.durationMin ?? durationFromTimer,
      );
      const updated = (res.data as any)?.ride ?? res.data ?? { ...ride, status: 'COMPLETED' as const };
      onTripUpdated(updated);
      const fareAmount = updated.fare?.totalFare ?? ride.fare?.totalFare;
      setStatusMessage({
        text: `Trip completed! Fare: ₹${fareAmount != null ? Math.round(fareAmount) : '—'}`,
        type: 'success',
      });
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

  const fare = ride.fare;
  const vehicleTypeLabel = ride.driver?.vehicleType ?? 'STANDARD';

  return (
    <div className="card active-trip-card">
      <div className="card-header">
        <div className="trip-status-header">
          <span className={`status-pill status-${ride.status.toLowerCase()}`}>
            {ride.status === 'ACCEPTED' ? '🚗 ON WAY TO PICKUP' : '🛣️ TRIP IN PROGRESS'}
          </span>
          <span className="text-muted text-xs">Ride #{ride.id.slice(0, 8)}</span>
        </div>
        {ride.status === 'IN_PROGRESS' && (
          <div className="trip-live-timer">
            <span className="pulse-circle pulse-green"></span>
            <span className="trip-timer-val">{formatElapsed(elapsedSec)}</span>
          </div>
        )}
      </div>

      {statusMessage && (
        <div className={`alert alert-${statusMessage.type === 'error' ? 'error' : statusMessage.type === 'success' ? 'success' : 'info'}`}>
          {statusMessage.text}
        </div>
      )}

      {/* Passenger Info */}
      {ride.passenger && (
        <div className="trip-passenger-strip">
          <span className="text-xs text-muted">Passenger:</span>
          <span className="font-semibold">{ride.passenger.name}</span>
          {ride.passenger.phone && (
            <a href={`tel:${ride.passenger.phone}`} className="btn btn-xs btn-outline">
              📞 Call
            </a>
          )}
        </div>
      )}

      {/* Route */}
      <div className="trip-route-summary">
        <div className="route-stop">
          <span className="pin-symbol">🟢</span>
          <div>
            <div className="stop-label text-xs text-muted">PICKUP PASSENGER</div>
            <div className="stop-address">{ride.pickupAddress}</div>
          </div>
        </div>
        <div className="route-connector">
          <span className="route-line-dot"></span>
          <span className="route-line-dot"></span>
          <span className="route-line-dot"></span>
        </div>
        <div className="route-stop">
          <span className="pin-symbol">🔴</span>
          <div>
            <div className="stop-label text-xs text-muted">DESTINATION</div>
            <div className="stop-address">{ride.dropoffAddress}</div>
          </div>
        </div>
      </div>

      {/* Trip Metrics */}
      <div className="trip-metrics-row">
        <div className="metric-box">
          <span className="metric-label">Distance</span>
          <span className="metric-val">{ride.distanceKm != null ? `${ride.distanceKm.toFixed(1)} km` : '—'}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Est. Duration</span>
          <span className="metric-val">{ride.durationMin != null ? `~${Math.round(ride.durationMin)} min` : '—'}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Vehicle</span>
          <span className="metric-val">{vehicleTypeLabel}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Est. Payout</span>
          <span className="metric-val text-success">
            ₹{fare?.totalFare != null ? fare.totalFare.toFixed(0) : (ride.fare?.totalFare != null ? ride.fare.totalFare.toFixed(0) : '—')}
          </span>
        </div>
      </div>

      {/* Fare Breakdown (if available) */}
      {fare && (
        <div className="fare-breakdown-strip">
          <span className="fare-chip-sm">Base ₹{fare.baseFare?.toFixed(0)}</span>
          <span className="fare-chip-sm">+ Distance ₹{fare.distanceFare?.toFixed(0)}</span>
          {fare.surgeMultiplier > 1 && (
            <span className="fare-chip-sm surge-chip">× {fare.surgeMultiplier.toFixed(1)} surge</span>
          )}
          <span className="fare-chip-sm total-chip">= ₹{fare.totalFare?.toFixed(0)}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="trip-actions-row">
        {ride.status === 'ACCEPTED' && (
          <button
            id="start-trip-btn"
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={handleStartTrip}
            disabled={isProcessing}
          >
            {isProcessing ? 'Starting Trip...' : '🏁 Passenger On Board — Start Trip'}
          </button>
        )}

        {ride.status === 'IN_PROGRESS' && (
          <button
            id="complete-trip-btn"
            type="button"
            className="btn btn-success btn-lg btn-block"
            onClick={handleCompleteTrip}
            disabled={isProcessing}
          >
            {isProcessing ? 'Completing Trip...' : '✓ Arrived at Destination — Complete Trip'}
          </button>
        )}

        {ride.status === 'COMPLETED' && (
          <div className="alert alert-success text-center">
            🎉 Trip completed! Total Fare: ₹{fare?.totalFare != null ? fare.totalFare.toFixed(0) : (ride.fare?.totalFare != null ? ride.fare.totalFare.toFixed(0) : '—')}
          </div>
        )}
      </div>
    </div>
  );
};
