import React, { useState } from 'react';
import { apiClient } from '../../api/client';

interface FeedbackModalProps {
  rideId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

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
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await apiClient.submitRideFeedback(rideId, rating, comment);
      setIsSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit feedback');
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="modal-backdrop">
        <div className="modal-card text-center" style={{ padding: '2.5rem 1.5rem' }}>
          <span style={{ fontSize: '3rem' }}>🎉</span>
          <h3 style={{ margin: '1rem 0 0.5rem' }}>Rating Submitted!</h3>
          <p className="text-muted">Thank you for rating your trip and helping our community.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <h3>Rate Your Trip</h3>
          <button className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

          <div className="rating-star-container">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                type="button"
                key={star}
                className={`star-btn ${star <= (hoverRating || rating) ? 'active' : ''}`}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
              >
                ★
              </button>
            ))}
          </div>
          <div className="rating-label-text">
            {rating === 5 && '🌟 Excellent Experience'}
            {rating === 4 && '👍 Very Good'}
            {rating === 3 && '😐 Average'}
            {rating === 2 && '👎 Poor'}
            {rating === 1 && '⚠️ Terrible'}
          </div>

          <div className="form-group">
            <label>Feedback & Comments (Optional)</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Driver was punctual and polite, car was clean..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Rating'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
