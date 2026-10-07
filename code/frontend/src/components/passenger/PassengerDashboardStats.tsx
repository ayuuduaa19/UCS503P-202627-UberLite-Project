import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Ride } from '../../types';

export const PassengerDashboardStats: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [rides, setRides] = useState<Ride[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    apiClient
      .getPassengerRideHistory()
      .then((res) => {
        if (res.data) setRides(res.data);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isAuthenticated]);

  const completedRides = rides.filter((r) => r.status === 'COMPLETED');
  const totalSpend = completedRides.reduce(
    (sum, r) => sum + (r.fare?.totalFare ?? 0),
    0,
  );
  const activeRide = rides.find(
    (r) => r.status === 'REQUESTED' || r.status === 'MATCHED' || r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS',
  );

  return (
    <div className="dashboard-stats-banner">
      <div className="stats-welcome">
        <span className="stats-greeting">
          👋 Welcome{isAuthenticated && user ? `, ${user.name.split(' ')[0]}` : ''}
        </span>
        <span className="stats-subtitle text-muted">
          {isAuthenticated ? 'Your ride dashboard is ready.' : 'Sign in to track your rides.'}
        </span>
      </div>

      {isAuthenticated && (
        <div className="stats-metrics-row">
          <div className="stat-metric">
            <span className="stat-val">
              {isLoading ? '—' : completedRides.length}
            </span>
            <span className="stat-label">Total Trips</span>
          </div>
          <div className="stat-metric">
            <span className="stat-val text-success">
              {isLoading ? '—' : `₹${totalSpend.toFixed(0)}`}
            </span>
            <span className="stat-label">Total Spent</span>
          </div>
          <div className="stat-metric">
            <span className={`stat-val ${activeRide ? 'text-amber' : 'text-muted'}`}>
              {isLoading ? '—' : activeRide ? '🟡 Active' : '🟢 No active ride'}
            </span>
            <span className="stat-label">Ride Status</span>
          </div>
        </div>
      )}
    </div>
  );
};
