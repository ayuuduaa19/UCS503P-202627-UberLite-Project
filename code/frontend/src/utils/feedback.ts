export interface FeedbackItem {
  id: string;
  rideId: string;
  userId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email?: string;
  };
  ride?: {
    id: string;
    status: string;
    pickupAddress: string;
    dropoffAddress: string;
    driverId?: string | null;
  };
}

export interface SubmitFeedbackPayload {
  rating: number;
  comment?: string | null;
}

export interface SubmitFeedbackResponse {
  success: boolean;
  message: string;
  data: {
    feedback: FeedbackItem;
  };
}

export interface DriverFeedbacksResponse {
  success: boolean;
  data: {
    averageRating: number;
    totalFeedbacks: number;
    feedbacks: FeedbackItem[];
  };
}

/**
 * Submit post-ride rating and optional feedback for a completed ride (Task #20)
 */
export async function submitRideFeedback(
  rideId: string,
  payload: SubmitFeedbackPayload,
  token: string,
  apiBaseUrl: string = ''
): Promise<FeedbackItem> {
  const response = await fetch(`${apiBaseUrl}/api/passenger/rides/${rideId}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to submit feedback: ${response.statusText}`);
  }

  const json: SubmitFeedbackResponse = await response.json();
  return json.data.feedback;
}

/**
 * Fetch feedback for a specific ride
 */
export async function fetchRideFeedback(
  rideId: string,
  token: string,
  apiBaseUrl: string = ''
): Promise<FeedbackItem[]> {
  const response = await fetch(`${apiBaseUrl}/api/passenger/rides/${rideId}/feedback`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch feedback: ${response.statusText}`);
  }

  const json = await response.json();
  return json.data.feedbacks;
}

/**
 * Fetch all feedbacks received by the driver
 */
export async function fetchDriverFeedbacks(
  token: string,
  apiBaseUrl: string = ''
): Promise<DriverFeedbacksResponse['data']> {
  const response = await fetch(`${apiBaseUrl}/api/driver/feedbacks`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch driver feedbacks: ${response.statusText}`);
  }

  const json: DriverFeedbacksResponse = await response.json();
  return json.data;
}
