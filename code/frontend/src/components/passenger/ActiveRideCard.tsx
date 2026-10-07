import React, { useState } from 'react';
import { apiClient } from '../../api/client';
import type { Ride, RideStatus } from '../../types';

interface ActiveRideCardProps {
  ride: Ride;
  onRefresh: () => void;
  onOpenFeedback: (rideId: string) => void;
}

const STATUS_STEPS: { status: RideStatus; label: string; icon: string }[] = [
  { status: 'REQUESTED', label: 'Requested', icon: '📝' },
  { status: 'MATCHED', label: 'Matched', icon: '🤝' },
  { status: 'ACCEPTED', label: 'Driver Assigned', icon: '🚗' },
  { status: 'IN_PROGRESS', label: 'On Trip', icon: '🛣️' },
  { status: 'COMPLETED', label: 'Completed', icon: '🏁' },
];

export const ActiveRideCard: React.FC<ActiveRideCardProps> = ({
  ride,
  onRefresh,
  onOpenFeedback,
}) => {
  const [isMatching, setIsMatching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);

  const getStepIndex = (status: RideStatus) => {
    return STATUS_STEPS.findIndex((s) => s.status === status);
  };

  const currentStepIdx = getStepIndex(ride.status);

  const handleTriggerMatch = async () => {
    setIsMatching(true);
    setMessage(null);
    try {
      const res = await apiClient.matchRide(ride.id);
      if (res.success) {
        setMessage({ text: 'Driver successfully matched! Refreshing...', type: 'success' });
        onRefresh();
      }
    } catch (err: any) {
      setMessage({
        text: err.message || 'No drivers available at this moment.',
        type: 'error',
      });
    } finally {
      setIsMatching(false);
    }
  };

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    try {
      onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  return (
    <div className="card active-ride-card">
      <div className="card-header">
        <div className="active-header-left">
          <span className="live-tag">
            <span className="pulse-circle pulse-green"></span> LIVE RIDE
          </span>
          <span className="ride-id-text text-muted text-xs">ID: {ride.id.slice(0, 8)}...</span>
        </div>
        <button
          className="btn btn-xs btn-outline"
          onClick={handleRefreshClick}
          disabled={isRefreshing}
        >
          {isRefreshing ? '↻ Refreshing...' : '🔄 Refresh Status'}
        </button>
      </div>

      {message && (
        <div className={`alert alert-${message.type === 'error' ? 'error' : message.type === 'success' ? 'success' : 'info'}`}>
          {message.text}
        </div>
      )}

      {/* Ride Progress Stepper */}
      <div className="progress-stepper">
        {STATUS_STEPS.map((step, idx) => {
          const isDone = idx <= currentStepIdx;
          const isCurrent = idx === currentStepIdx;
          return (
            <div
              key={step.status}
              className={`step-item ${isDone ? 'step-done' : ''} ${isCurrent ? 'step-current' : ''}`}
            >
              <div className="step-bubble">
                {isDone ? <span>{step.icon}</span> : <span>{idx + 1}</span>}
              </div>
              <span className="step-label">{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Locations Summary */}
      <div className="trip-route-summary">
        <div className="route-stop">
          <span className="pin-symbol">🟢</span>
          <div>
            <div className="stop-label text-xs text-muted">PICKUP</div>
            <div className="stop-address">{ride.pickupAddress}</div>
          </div>
        </div>
        <div className="route-stop">
          <span className="pin-symbol">🔴</span>
          <div>
            <div className="stop-label text-xs text-muted">DROPOFF</div>
            <div className="stop-address">{ride.dropoffAddress}</div>
          </div>
        </div>
      </div>

      {/* Driver Info Card if assigned */}
      {ride.driver ? (
        <div className="driver-assigned-card">
          <div className="driver-info-avatar">
            <span>🚗</span>
          </div>
          <div className="driver-info-details">
            <div className="driver-name-row">
              <span className="font-semibold">{ride.driver.user?.name || 'Assigned Driver'}</span>
              <span className="rating-pill">
                ★ {ride.driver.rating != null ? ride.driver.rating.toFixed(1) : '5.0'}
              </span>
            </div>
            <div className="vehicle-details-row text-xs text-muted">
              <span>{ride.driver.vehicleModel} ({ride.driver.vehicleType})</span>
              <span>•</span>
              <span className="plate-badge">{ride.driver.vehiclePlate}</span>
            </div>
          </div>
        </div>
      ) : (
        ride.status === 'REQUESTED' && (
          <div className="unassigned-dispatch-banner">
            <div className="dispatch-text">
              <span>Searching for nearest available driver within 10 km...</span>
            </div>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleTriggerMatch}
              disabled={isMatching}
            >
              {isMatching ? 'Matching...' : 'Auto-Match Driver'}
            </button>
          </div>
        )
      )}

      {/* Trip Completed & Rating Prompt */}
      {ride.status === 'COMPLETED' && (
        <div className="trip-completed-panel">
          <div className="completed-fare-box">
            <span className="fare-tag">Final Fare</span>
            <span className="fare-value">₹{ride.fare?.totalFare ?? '—'}</span>
          </div>
          <button
            className="btn btn-primary btn-block"
            onClick={() => onOpenFeedback(ride.id)}
          >
            ⭐ Rate Driver & Trip
          </button>
        </div>
      )}
    </div>
  );
};
