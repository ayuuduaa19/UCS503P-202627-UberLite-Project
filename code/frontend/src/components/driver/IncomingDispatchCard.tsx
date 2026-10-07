import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../api/client';
import type { Ride } from '../../types';

interface IncomingDispatchCardProps {
  ride: Ride;
  onAccepted: (ride: Ride) => void;
  onRejected: () => void;
}

const ACCEPTANCE_TIMEOUT_SEC = 30;

export const IncomingDispatchCard: React.FC<IncomingDispatchCardProps> = ({
  ride,
  onAccepted,
  onRejected,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(ACCEPTANCE_TIMEOUT_SEC);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer — auto-reject when it reaches 0
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          onRejected();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const handleAccept = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
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
      // Optimistic: still move to accepted locally so driver flow continues
      onAccepted({ ...ride, status: 'ACCEPTED' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
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

  const urgency = countdown <= 10 ? 'critical' : countdown <= 20 ? 'warning' : 'normal';
  const timerColor = urgency === 'critical' ? '#ef4444' : urgency === 'warning' ? '#f59e0b' : '#00dc82';
  const progressPct = (countdown / ACCEPTANCE_TIMEOUT_SEC) * 100;

  const estimatedFare = ride.fare?.totalFare;
  const distKm = ride.distanceKm;

  return (
    <div className={`card dispatch-card pulse-glow dispatch-urgency-${urgency}`}>
      {/* Timer Bar */}
      <div className="dispatch-timer-bar">
        <div
          className="dispatch-timer-fill"
          style={{ width: `${progressPct}%`, background: timerColor }}
        />
      </div>

      <div className="card-header dispatch-header">
        <div className="dispatch-badge">
          <span className="pulse-circle pulse-amber"></span>
          <span>⚡ INCOMING RIDE DISPATCH</span>
        </div>
        <div className="dispatch-timer-pill" style={{ color: timerColor }}>
          <span className="dispatch-timer-icon">⏱</span>
          <span className="dispatch-timer-count">{countdown}s</span>
        </div>
      </div>

      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

      {/* Route Summary */}
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

      {/* Fare & Trip Info */}
      <div className="dispatch-fare-preview">
        <div className="dispatch-fare-col">
          <span className="text-xs text-muted">Est. Payout</span>
          <span className="dispatch-amount">
            ₹{estimatedFare != null ? estimatedFare.toFixed(0) : '—'}
          </span>
        </div>
        <div className="dispatch-fare-col">
          <span className="text-xs text-muted">Distance</span>
          <span className="dispatch-amount text-info">
            {distKm != null ? `${distKm.toFixed(1)} km` : '—'}
          </span>
        </div>
        <div className="dispatch-fare-col">
          <span className="text-xs text-muted">Passenger</span>
          <span className="dispatch-passenger">
            {ride.passenger?.name || 'Passenger'}
          </span>
        </div>
      </div>

      {/* Accept / Reject */}
      <div className="dispatch-actions">
        <button
          id="dispatch-reject-btn"
          type="button"
          className="btn btn-danger btn-lg"
          onClick={handleReject}
          disabled={isProcessing}
        >
          ✕ Decline
        </button>
        <button
          id="dispatch-accept-btn"
          type="button"
          className="btn btn-success btn-lg"
          onClick={handleAccept}
          disabled={isProcessing}
        >
          {isProcessing ? 'Accepting...' : '✓ Accept Ride'}
        </button>
      </div>
    </div>
  );
};
