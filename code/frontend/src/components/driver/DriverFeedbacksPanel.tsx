import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Feedback } from '../../types';

interface DriverFeedbacksPanelProps {
  onOpenAuth: () => void;
}

export const DriverFeedbacksPanel: React.FC<DriverFeedbacksPanelProps> = ({ onOpenAuth }) => {
  const { isAuthenticated, driver } = useAuth();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchFeedbacks = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.getDriverFeedbacks();
      if (res.data) {
        setFeedbacks(res.data as Feedback[]);
      }
    } catch (err: any) {
      if (err.statusCode === 401) {
        onOpenAuth();
      }
      setErrorMessage(err.message || 'Failed to load feedback');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchFeedbacks();
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  const avgRating =
    feedbacks.length > 0
      ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length
      : null;

  const ratingLabel = (r: number) => {
    if (r >= 5) return '🌟 Excellent';
    if (r >= 4) return '👍 Good';
    if (r >= 3) return '😐 Average';
    return '👎 Poor';
  };

  return (
    <div className="card feedbacks-card">
      <div className="card-header">
        <div>
          <h2>Driver Ratings &amp; Reviews</h2>
          <p className="text-muted">Passenger ratings and feedback for your completed trips</p>
        </div>
        <button className="btn btn-sm btn-outline" onClick={fetchFeedbacks} disabled={isLoading}>
          🔄 Refresh
        </button>
      </div>

      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

      {/* Rating Overview Banner */}
      <div className="driver-rating-banner">
        <div className="big-rating-number">
          {avgRating !== null ? avgRating.toFixed(1) : driver?.rating?.toFixed(1) ?? '—'}
        </div>
        <div className="rating-stars-row">
          {[1, 2, 3, 4, 5].map((s) => (
            <span
              key={s}
              style={{ color: s <= Math.round(avgRating ?? driver?.rating ?? 5) ? '#f59e0b' : '#374151' }}
            >
              ★
            </span>
          ))}
        </div>
        <span className="text-xs text-muted">
          Based on {feedbacks.length} verified passenger{feedbacks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Feedbacks List */}
      {isLoading ? (
        <div className="loading-state">
          <span className="spinner"></span> Loading reviews...
        </div>
      ) : !isAuthenticated ? (
        <div className="empty-state">
          <span className="empty-icon">🔒</span>
          <p>Sign in as a driver to view passenger reviews.</p>
          <button className="btn btn-sm btn-primary mt-3" onClick={onOpenAuth}>
            Sign In
          </button>
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">⭐</span>
          <p>No reviews yet.</p>
          <span className="text-muted text-xs">Complete rides to start collecting passenger feedback!</span>
        </div>
      ) : (
        <div className="review-items-list">
          {feedbacks.map((fb) => (
            <div key={fb.id} className="review-item">
              <div className="review-header">
                <span className="review-user">{fb.user?.name ?? 'Passenger'}</span>
                <div className="review-header-right">
                  <span className="rating-pill">★ {fb.rating}.0</span>
                  <span className="text-xs text-muted">
                    {new Date(fb.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <p className="review-quality-tag">{ratingLabel(fb.rating)}</p>
              {fb.comment && <p className="review-text">"{fb.comment}"</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
