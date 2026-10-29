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
      .getPassengerRides()
      .then((res) => {
        const ridesList: Ride[] =
          (res.data as any)?.rides ?? (Array.isArray(res.data) ? res.data : []);
        setRides(ridesList);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isAuthenticated]);

  const safeRides = Array.isArray(rides) ? rides : [];
  const completedRides = safeRides.filter((r) => r.status === 'COMPLETED');
  const totalSpend = completedRides.reduce(
    (sum, r) => sum + (r.fare?.totalFare ?? 0),
    0,
  );
  const activeRide = safeRides.find((r) => {
    if (!['REQUESTED', 'MATCHED', 'ACCEPTED', 'IN_PROGRESS'].includes(r.status)) return false;
    // Mirror backend stale-ride filter: ignore rides older than 2 hours
    const isStale =
      r.createdAt && Date.now() - new Date(r.createdAt).getTime() > 2 * 60 * 60 * 1000;
    return !isStale;
  });

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
