export interface RideHistoryItem {
  id: string;
  passengerId: string;
  driverId: string | null;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  status: 'REQUESTED' | 'MATCHED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  distanceKm: number | null;
  durationMin: number | null;
  createdAt: string;
  updatedAt: string;
  passenger?: {
    id: string;
    name: string;
    phone: string | null;
    email: string;
  };
  driver?: {
    id: string;
    vehicleType: string;
    vehicleModel: string;
    vehiclePlate: string;
    vehicleColor?: string | null;
    rating: number;
    user?: {
      id?: string;
      name: string;
      phone: string | null;
      email?: string;
    };
  } | null;
  fare?: {
    id: string;
    rideId: string;
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    surgeMultiplier: number;
    totalFare: number;
    currency: string;
    paymentStatus: string;
    paymentMethod: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  feedbacks?: Array<{
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
  }>;
}

export interface RideHistoryResponse {
  success: boolean;
  data: {
    rides: RideHistoryItem[];
    count?: number;
  };
}

/**
 * Fetch completed ride history for authenticated passenger (Task #19)
 */
export async function fetchPassengerRideHistory(
  token: string,
  status: string = 'COMPLETED',
  apiBaseUrl: string = ''
): Promise<RideHistoryItem[]> {
  const url = status
    ? `${apiBaseUrl}/api/passenger/rides/history?status=${encodeURIComponent(status)}`
    : `${apiBaseUrl}/api/passenger/rides/history`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch ride history: ${response.statusText}`);
  }

  const json: RideHistoryResponse = await response.json();
  return json.data.rides;
}

/**
 * Fetch completed ride history for authenticated driver (Task #19)
 */
export async function fetchDriverRideHistory(
  token: string,
  status: string = 'COMPLETED',
  apiBaseUrl: string = ''
): Promise<RideHistoryItem[]> {
  const url = status
    ? `${apiBaseUrl}/api/driver/rides/history?status=${encodeURIComponent(status)}`
    : `${apiBaseUrl}/api/driver/rides/history`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch driver ride history: ${response.statusText}`);
  }

  const json: RideHistoryResponse = await response.json();
  return json.data.rides;
}
