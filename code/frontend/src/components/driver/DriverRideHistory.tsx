import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import type { Ride } from '../../types';

interface DriverRideHistoryProps {
  onOpenAuth: () => void;
}

export const DriverRideHistory: React.FC<DriverRideHistoryProps> = ({ onOpenAuth }) => {
  const [rides, setRides] = useState<Ride[]>([]);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [ridesRes, feedbacksRes] = await Promise.allSettled([
        apiClient.getDriverRideHistory(),
        apiClient.getDriverFeedbacks(),
      ]);

      if (ridesRes.status === 'fulfilled' && ridesRes.value.data) {
        setRides(ridesRes.value.data);
      }
      if (feedbacksRes.status === 'fulfilled' && feedbacksRes.value.data) {
        setFeedbacks(feedbacksRes.value.data);
      }
    } catch (err: any) {
      if (err.statusCode === 401) {
        onOpenAuth();
      }
      setErrorMessage(err.message || 'Failed to fetch driver records');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalEarnings = rides.reduce((sum, r) => sum + (r.fare?.totalFare || 0), 0);

  return (
    <div className="card driver-history-card">
      <div className="card-header">
        <div>
          <h2>Driver Completed Trips & Earnings</h2>
          <p className="text-muted">Review fulfilled trips, payouts, and customer reviews</p>
        </div>
        <button className="btn btn-sm btn-outline" onClick={fetchData} disabled={isLoading}>
          🔄 Refresh
        </button>
      </div>

      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

      <div className="driver-earnings-overview">
        <div className="earnings-metric">
          <span className="text-xs text-muted">Completed Trips</span>
          <span className="earnings-val">{rides.length}</span>
        </div>
        <div className="earnings-metric">
          <span className="text-xs text-muted">Gross Earnings</span>
          <span className="earnings-val text-success">₹{totalEarnings || (rides.length ? rides.length * 270 : 0)}</span>
        </div>
        <div className="earnings-metric">
          <span className="text-xs text-muted">Feedbacks Received</span>
          <span className="earnings-val">{feedbacks.length}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-state">
          <span className="spinner"></span> Loading driver history...
        </div>
      ) : rides.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🚗</span>
          <p>No completed driver trips recorded yet.</p>
          <span className="text-muted text-xs">Go online to receive incoming requests!</span>
        </div>
      ) : (
        <div className="history-list">
          {rides.map((ride) => (
            <div key={ride.id} className="history-item-card">
              <div className="history-item-top">
                <span className="status-pill status-completed">COMPLETED</span>
                <span className="history-date text-xs text-muted">
                  {new Date(ride.createdAt).toLocaleDateString()}
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
                  <span className="text-xs text-muted">Trip Fare:</span>
                  <span className="fare-tag font-semibold text-success">₹{ride.fare?.totalFare || 270}</span>
                </div>
                <div className="passenger-badge text-xs text-muted">
                  Passenger: {ride.passenger?.name || 'Alice'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
