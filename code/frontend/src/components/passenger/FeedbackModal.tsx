import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import type { Ride } from '../../types';

interface FeedbackModalProps {
  rideId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: '⚠️ Terrible',
  2: '👎 Poor',
  3: '😐 Average',
  4: '👍 Very Good',
  5: '🌟 Excellent',
};

const MAX_COMMENT_LEN = 300;

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  rideId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ride, setRide] = useState<Ride | null>(null);

  // Load ride details for the summary panel
  useEffect(() => {
    if (!isOpen) return;
    apiClient
      .getRideDetails(rideId)
      .then((res) => {
        if (res.data) setRide(res.data);
      })
      .catch(() => {});
  }, [isOpen, rideId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await apiClient.submitRideFeedback(rideId, rating, comment.trim() || undefined);
      setIsSubmitted(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayRating = hoverRating || rating;

  if (isSubmitted) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-card modal-card-narrow feedback-success-card" onClick={(e) => e.stopPropagation()}>
          <div className="feedback-success-body">
            <div className="feedback-success-icon">🎉</div>
            <h3>Thank You!</h3>
            <p className="text-muted">Your rating has been submitted successfully.</p>
            <div className="feedback-submitted-stars">
              {[1, 2, 3, 4, 5].map((s) => (
                <span key={s} style={{ color: s <= rating ? '#f59e0b' : '#374151' }}>
                  ★
                </span>
              ))}
            </div>
            <p className="text-xs text-muted">Closing automatically…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card-feedback"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
      >
        <div className="modal-header">
          <h3 id="feedback-modal-title">Rate Your Trip</h3>
          <button id="feedback-modal-close" className="btn-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Ride Summary */}
        {ride && (
          <div className="feedback-ride-summary">
            <div className="feedback-route">
              <span className="route-pin">🟢</span>
              <span className="route-text text-xs">{ride.pickupAddress}</span>
            </div>
            <div className="feedback-route">
              <span className="route-pin">🔴</span>
              <span className="route-text text-xs">{ride.dropoffAddress}</span>
            </div>
            <div className="feedback-summary-chips">
              {ride.distanceKm != null && (
                <span className="metric-chip">📏 {ride.distanceKm.toFixed(1)} km</span>
              )}
              {ride.fare?.totalFare != null && (
                <span className="metric-chip fare-chip">₹{ride.fare.totalFare.toFixed(0)}</span>
              )}
              {ride.driver && (
                <span className="metric-chip">
                  🚗 {ride.driver.user?.name ?? 'Driver'} · ★{ride.driver.rating.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-body">
          {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

          <p className="feedback-prompt-text text-muted">How was your experience?</p>

          {/* Star Selector */}
          <div className="rating-star-container" id="star-rating-group">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                id={`star-btn-${star}`}
                type="button"
                key={star}
                className={`star-btn ${star <= displayRating ? 'active' : ''}`}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
              >
                ★
              </button>
            ))}
          </div>

          {/* Rating Label */}
          <div className="rating-label-text">
            <span className={`rating-badge-label rating-${displayRating}`}>
              {RATING_LABELS[displayRating]}
            </span>
          </div>

          {/* Comment */}
          <div className="form-group">
            <label htmlFor="feedback-comment">Feedback &amp; Comments <span className="text-muted text-xs">(Optional)</span></label>
            <textarea
              id="feedback-comment"
              className="form-control"
              rows={3}
              maxLength={MAX_COMMENT_LEN}
              placeholder="Driver was punctual and polite, car was clean..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="textarea-counter text-xs text-muted">
              {comment.length}/{MAX_COMMENT_LEN}
            </div>
          </div>

          <div className="modal-footer">
            <button
              id="feedback-cancel-btn"
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              id="feedback-submit-btn"
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting…' : `Submit ${RATING_LABELS[rating]?.split(' ')[1] ?? 'Rating'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
