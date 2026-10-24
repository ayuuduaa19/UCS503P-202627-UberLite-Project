import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Ride, RideHistoryFilterParams, RideEventPayload } from '../../types';

interface DriverRideHistoryProps {
  onOpenAuth: () => void;
}

export const DriverRideHistory: React.FC<DriverRideHistoryProps> = ({ onOpenAuth }) => {
  const { isAuthenticated } = useAuth();
  const [rides, setRides] = useState<Ride[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Task #41 – filter state
  const [showFilters, setShowFilters] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState<RideHistoryFilterParams['sortBy']>('date');
  const [sortOrder, setSortOrder] = useState<RideHistoryFilterParams['sortOrder']>('desc');
  const [minFare, setMinFare] = useState('');
  const [maxFare, setMaxFare] = useState('');

  // Task #42 – SSE ref
  const sseRef = useRef<EventSource | null>(null);

  const buildFilters = useCallback((): RideHistoryFilterParams => {
    const f: RideHistoryFilterParams = {};
    if (searchText.trim()) f.search = searchText.trim();
    if (startDate) f.startDate = startDate;
    if (endDate) f.endDate = endDate;
    if (sortBy && sortBy !== 'date') f.sortBy = sortBy;
    if (sortOrder && sortOrder !== 'desc') f.sortOrder = sortOrder;
    if (minFare !== '') f.minFare = Number(minFare);
    if (maxFare !== '') f.maxFare = Number(maxFare);
    return f;
  }, [searchText, startDate, endDate, sortBy, sortOrder, minFare, maxFare]);

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) {
      onOpenAuth();
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const filters = buildFilters();
      const res = await apiClient.getDriverRideHistory(filters);
      // Backend returns { data: { rides, count } } or { data: <rides[]> }
      const ridesData: Ride[] = (res.data as any)?.rides ?? (Array.isArray(res.data) ? res.data : []);
      setRides(ridesData);
    } catch (err: any) {
      if (err.statusCode === 401) {
        onOpenAuth();
      }
      setErrorMessage(err.message || 'Failed to fetch driver records');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, onOpenAuth, buildFilters]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Task #42 – Subscribe to real-time ride updates via SSE
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleRideEvent = (_payload: RideEventPayload) => {
      // Auto-refresh history when a ride status changes
      fetchData();
    };

    sseRef.current = apiClient.subscribeToDriverRideEvents(handleRideEvent);

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [isAuthenticated, fetchData]);

  const clearFilters = () => {
    setSearchText('');
    setStartDate('');
    setEndDate('');
    setSortBy('date');
    setSortOrder('desc');
    setMinFare('');
    setMaxFare('');
  };

  const handleApplyFilters = () => {
    fetchData();
  };

  const handleClearFilters = () => {
    clearFilters();
    setTimeout(() => fetchData(), 0);
  };

  if (!isAuthenticated) {
    return (
      <div className="card driver-history-card">
        <div className="card-header">
          <div>
            <h2>Driver Completed Trips &amp; Earnings</h2>
            <p className="text-muted">Review fulfilled trips, payouts, and customer reviews</p>
          </div>
        </div>
        <div className="empty-state">
          <span className="empty-icon">🔒</span>
          <p>Sign in to view your trip history.</p>
          <button className="btn btn-primary mt-3" onClick={onOpenAuth}>
            Sign In
          </button>
        </div>
      </div>
    );
  }


  const totalEarnings = rides.reduce((sum, r) => sum + (r.fare?.totalFare ?? 0), 0);
  const totalDistance = rides.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0);
  const avgRating =
    rides.length > 0
      ? rides
          .filter((r) => r.feedbacks && r.feedbacks.length > 0)
          .flatMap((r) => r.feedbacks!)
          .reduce((acc, fb, _i, arr) => acc + fb.rating / arr.length, 0)
      : null;

  return (
    <div className="card driver-history-card">
      <div className="card-header">
        <div>
          <h2>Driver Trip History &amp; Earnings</h2>
          <p className="text-muted">Review your completed trips, payouts, and passenger reviews</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            🔍 Filters
          </button>
          <button className="btn btn-sm btn-outline" onClick={fetchData} disabled={isLoading}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Task #41 – Filter Bar */}
      {showFilters && (
        <div className="history-filter-bar">
          <div className="filter-row">
            <input
              type="text"
              className="filter-input"
              placeholder="Search address, passenger name, phone…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div className="filter-row">
            <label className="filter-label">
              From
              <input
                type="date"
                className="filter-input filter-date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="filter-label">
              To
              <input
                type="date"
                className="filter-input filter-date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>
          <div className="filter-row">
            <label className="filter-label">
              Min ₹
              <input
                type="number"
                className="filter-input filter-num"
                placeholder="0"
                value={minFare}
                onChange={(e) => setMinFare(e.target.value)}
                min="0"
              />
            </label>
            <label className="filter-label">
              Max ₹
              <input
                type="number"
                className="filter-input filter-num"
                placeholder="Any"
                value={maxFare}
                onChange={(e) => setMaxFare(e.target.value)}
                min="0"
              />
            </label>
            <label className="filter-label">
              Sort
              <select
                className="filter-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as RideHistoryFilterParams['sortBy'])}
              >
                <option value="date">Date</option>
                <option value="fare">Fare</option>
                <option value="distance">Distance</option>
              </select>
            </label>
            <label className="filter-label">
              Order
              <select
                className="filter-select"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as RideHistoryFilterParams['sortOrder'])}
              >
                <option value="desc">Newest</option>
                <option value="asc">Oldest</option>
              </select>
            </label>
          </div>
          <div className="filter-actions">
            <button className="btn btn-xs btn-primary" onClick={handleApplyFilters}>
              Apply
            </button>
            <button className="btn btn-xs btn-outline" onClick={handleClearFilters}>
              Clear
            </button>
          </div>
        </div>
      )}

      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

      {/* Summary Banner */}
      <div className="driver-earnings-overview">
        <div className="earnings-metric">
          <span className="text-xs text-muted">Completed Trips</span>
          <span className="earnings-val">{rides.length}</span>
        </div>
        <div className="earnings-metric">
          <span className="text-xs text-muted">Gross Earnings</span>
          <span className="earnings-val text-success">₹{totalEarnings.toFixed(0)}</span>
        </div>
        <div className="earnings-metric">
          <span className="text-xs text-muted">Total Distance</span>
          <span className="earnings-val">{totalDistance.toFixed(1)} km</span>
        </div>
        {avgRating !== null && (
          <div className="earnings-metric">
            <span className="text-xs text-muted">Avg. Rating</span>
            <span className="earnings-val text-warning">★ {avgRating.toFixed(1)}</span>
          </div>
        )}
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
          {rides.map((ride) => {
            const fare = ride.fare;
            const feedbacks = ride.feedbacks ?? [];
            const passengerRating = feedbacks[0];
            return (
              <div key={ride.id} className="history-item-card history-item-driver">
                <div className="history-item-top">
                  <span className="status-pill status-completed">COMPLETED</span>
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

                {/* Metrics Row */}
                <div className="history-metrics-strip">
                  {ride.distanceKm != null && (
                    <span className="metric-chip">📏 {ride.distanceKm.toFixed(1)} km</span>
                  )}
                  {ride.durationMin != null && (
                    <span className="metric-chip">⏱ ~{Math.round(ride.durationMin)} min</span>
                  )}
                  <span className="metric-chip">
                    {ride.driver?.vehicleType ?? 'STANDARD'}
                  </span>
                </div>

                <div className="history-item-bottom">
                  {/* Fare Breakdown */}
                  <div className="history-fare-block">
                    <div className="history-fare-info">
                      <span className="text-xs text-muted">Trip Earnings:</span>
                      <span className="fare-tag font-semibold text-success">
                        ₹{fare?.totalFare != null ? fare.totalFare.toFixed(0) : '—'}
                      </span>
                    </div>
                    {fare && (
                      <div className="fare-breakdown-strip">
                        <span className="fare-chip-sm">Base ₹{fare.baseFare?.toFixed(0)}</span>
                        <span className="fare-chip-sm">+ Dist ₹{fare.distanceFare?.toFixed(0)}</span>
                        {fare.surgeMultiplier > 1 && (
                          <span className="fare-chip-sm surge-chip">
                            × {fare.surgeMultiplier.toFixed(1)} surge
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Passenger Info */}
                  <div className="history-passenger-row">
                    <span className="text-xs text-muted">Passenger:</span>
                    <span className="font-semibold text-xs">{ride.passenger?.name ?? 'N/A'}</span>
                  </div>

                  {/* Passenger Rating for this ride */}
                  {passengerRating && (
                    <div className="history-feedback-badge">
                      <span className="review-stars-sm">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <span
                            key={s}
                            style={{ color: s <= passengerRating.rating ? '#f59e0b' : '#4b5563' }}
                          >
                            ★
                          </span>
                        ))}
                      </span>
                      {passengerRating.comment && (
                        <span className="text-xs text-muted">"{passengerRating.comment}"</span>
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
