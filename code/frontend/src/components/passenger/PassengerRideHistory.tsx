import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Ride } from '../../types';

interface PassengerRideHistoryProps {
  onOpenFeedback: (rideId: string) => void;
  onOpenAuth: () => void;
}

export const PassengerRideHistory: React.FC<PassengerRideHistoryProps> = ({
  onOpenFeedback,
  onOpenAuth,
}) => {
  const { isAuthenticated } = useAuth();
  const [rides, setRides] = useState<Ride[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchHistory = async () => {
    if (!isAuthenticated) {
      onOpenAuth();
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.getPassengerRideHistory();
      // Backend returns { data: { rides, count } } or { data: <rides[]> }
      const rides: Ride[] = (res.data as any)?.rides ?? (Array.isArray(res.data) ? res.data : []);
      setRides(rides);
    } catch (err: any) {
      if (err.statusCode === 401) {
        onOpenAuth();
      }
      setErrorMessage(err.message || 'Failed to load ride history');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="card history-card">
        <div className="card-header">
          <div>
            <h2>Passenger Ride History</h2>
            <p className="text-muted">Review past trips, fares, and feedback</p>
          </div>
        </div>
        <div className="empty-state">
          <span className="empty-icon">🔒</span>
          <p>Sign in to view your ride history.</p>
          <button className="btn btn-primary mt-3" onClick={onOpenAuth}>
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const totalRides = rides.length;
  const totalSpend = rides.reduce((sum, r) => sum + (r.fare?.totalFare ?? 0), 0);
  const completedRides = rides.filter((r) => r.status === 'COMPLETED');

  return (
    <div className="card history-card">
      <div className="card-header">
        <div>
          <h2>Passenger Ride History</h2>
          <p className="text-muted">Review past trips, fares, driver info, and your feedback</p>
        </div>
        <button className="btn btn-sm btn-outline" onClick={fetchHistory} disabled={isLoading}>
          🔄 Refresh
        </button>
      </div>

      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

      {/* Summary Strip */}
      {!isLoading && rides.length > 0 && (
        <div className="driver-earnings-overview">
          <div className="earnings-metric">
            <span className="text-xs text-muted">Total Rides</span>
            <span className="earnings-val">{totalRides}</span>
          </div>
          <div className="earnings-metric">
            <span className="text-xs text-muted">Completed</span>
            <span className="earnings-val text-success">{completedRides.length}</span>
          </div>
          <div className="earnings-metric">
            <span className="text-xs text-muted">Total Spent</span>
            <span className="earnings-val">₹{totalSpend.toFixed(0)}</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="loading-state">
          <span className="spinner"></span> Loading your trip history...
        </div>
      ) : rides.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📜</span>
          <p>No past rides recorded yet.</p>
          <span className="text-muted text-xs">Book a ride to get started!</span>
        </div>
      ) : (
        <div className="history-list">
          {rides.map((ride) => {
            const fare = ride.fare;
            const feedbacks = ride.feedbacks ?? [];
            const myFeedback = feedbacks[0];
            const driver = ride.driver;
            const hasRated = myFeedback != null;

            return (
              <div key={ride.id} className="history-item-card history-item-passenger">
                <div className="history-item-top">
                  <span className={`status-pill status-${ride.status.toLowerCase()}`}>
                    {ride.status}
                  </span>
                  <span className="history-date text-xs text-muted">
                    {new Date(ride.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    at{' '}
                    {new Date(ride.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Route */}
                <div className="history-routes">
                  <div className="history-route-row">
                    <span className="route-pin">🟢</span>
                    <span className="route-text">{ride.pickupAddress}</span>
                  </div>
                  <div className="history-route-row">
                    <span className="route-pin">🔴</span>
                    <span className="route-text">{ride.dropoffAddress}</span>
                  </div>
                </div>

                {/* Trip Metrics */}
                {(ride.distanceKm != null || ride.durationMin != null) && (
                  <div className="history-metrics-strip">
                    {ride.distanceKm != null && (
                      <span className="metric-chip">📏 {ride.distanceKm.toFixed(1)} km</span>
                    )}
                    {ride.durationMin != null && (
                      <span className="metric-chip">
                        ⏱ ~{Math.round(ride.durationMin)} min
                      </span>
                    )}
                  </div>
                )}

                <div className="history-item-bottom">
                  {/* Fare Info */}
                  <div className="history-fare-block">
                    <div className="history-fare-info">
                      <span className="text-xs text-muted">Total Fare:</span>
                      <span className="fare-tag font-semibold">
                        ₹{fare?.totalFare != null
                          ? fare.totalFare.toFixed(0)
                          : ride.distanceKm != null
                          ? Math.round(30 + ride.distanceKm * 12)
                          : '—'}
                      </span>
                    </div>
                    {fare && (
                      <div className="fare-breakdown-strip">
                        <span className="fare-chip-sm">Base ₹{fare.baseFare?.toFixed(0)}</span>
                        <span className="fare-chip-sm">
                          + Dist ₹{fare.distanceFare?.toFixed(0)}
                        </span>
                        {fare.surgeMultiplier > 1 && (
                          <span className="fare-chip-sm surge-chip">
                            × {fare.surgeMultiplier.toFixed(1)} surge
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Driver Info */}
                  {driver && (
                    <div className="history-driver-info">
                      <span className="text-xs text-muted">Driver:</span>
                      <span className="font-semibold text-xs">
                        {driver.user?.name ?? 'Driver'}
                      </span>
                      <span className="text-xs text-muted">
                        {driver.vehicleModel} • {driver.vehiclePlate}
                      </span>
                      <span className="rating-pill text-xs">★ {driver.rating.toFixed(1)}</span>
                    </div>
                  )}

                  {/* Feedback / Rating */}
                  {ride.status === 'COMPLETED' && (
                    <div className="history-feedback-row">
                      {hasRated ? (
                        <div className="feedback-given-badge">
                          <span className="review-stars-sm">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <span
                                key={s}
                                style={{
                                  color: s <= myFeedback.rating ? '#f59e0b' : '#4b5563',
                                }}
                              >
                                ★
                              </span>
                            ))}
                          </span>
                          <button
                            className="btn btn-xs btn-outline"
                            onClick={() => onOpenFeedback(ride.id)}
                          >
                            Edit Review
                          </button>
                        </div>
                      ) : (
                        <button
                          id={`rate-driver-btn-${ride.id}`}
                          className="btn btn-xs btn-primary"
                          onClick={() => onOpenFeedback(ride.id)}
                        >
                          ⭐ Rate Driver
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
