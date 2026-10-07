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

  return (
    <div className="card history-card">
      <div className="card-header">
        <div>
          <h2>Passenger Ride History</h2>
          <p className="text-muted">Review past trips, fares, and feedback</p>
        </div>
        <button className="btn btn-sm btn-outline" onClick={fetchHistory} disabled={isLoading}>
          🔄 Refresh
        </button>
      </div>

      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

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
          {rides.map((ride) => (
            <div key={ride.id} className="history-item-card">
              <div className="history-item-top">
                <span className={`status-pill status-${ride.status.toLowerCase()}`}>
                  {ride.status}
                </span>
                <span className="history-date text-xs text-muted">
                  {new Date(ride.createdAt).toLocaleDateString()} at{' '}
                  {new Date(ride.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

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

              <div className="history-item-bottom">
                <div className="history-fare-info">
                  <span className="text-xs text-muted">Total Fare:</span>
                  <span className="fare-tag font-semibold">
                    {ride.fare?.totalFare != null ? `₹${ride.fare.totalFare}` : '—'}
                  </span>
                </div>

                {ride.status === 'COMPLETED' && (
                  <button
                    className="btn btn-xs btn-primary"
                    onClick={() => onOpenFeedback(ride.id)}
                  >
                    ⭐ {ride.feedbacks && ride.feedbacks.length > 0 ? 'View/Edit Review' : 'Rate Driver'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
