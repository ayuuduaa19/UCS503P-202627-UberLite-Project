import { calculateRideDistance, type CoordinatesInput } from './location';

export type VehicleType = 'STANDARD' | 'PREMIUM' | 'XL';

export interface FareRule {
  baseFare: number;
  ratePerKm: number;
}

export const FARE_RULES: Record<VehicleType, FareRule> = {
  STANDARD: { baseFare: 30, ratePerKm: 12 },
  PREMIUM: { baseFare: 60, ratePerKm: 20 },
  XL: { baseFare: 50, ratePerKm: 16 },
};

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  surgeMultiplier: number;
  totalFare: number;
  distanceKm: number;
  currency: string;
  vehicleType: VehicleType;
}

export interface CompleteRideResult {
  ride: any;
  fare: any;
}

/**
 * Predefined fare formula:
 * TotalFare = BaseFare + (Distance × RatePerKm)
 */
export function calculateFareBreakdown(
  distanceKm: number,
  vehicleType: VehicleType = 'STANDARD'
): FareBreakdown {
  if (distanceKm < 0) {
    throw new Error('Distance must be non-negative');
  }

  const rules = FARE_RULES[vehicleType] ?? FARE_RULES.STANDARD;
  const baseFare = rules.baseFare;
  const distanceFare = parseFloat((distanceKm * rules.ratePerKm).toFixed(2));
  const timeFare = 0;
  const surgeMultiplier = 1.0;
  const totalFare = parseFloat(
    ((baseFare + distanceFare + timeFare) * surgeMultiplier).toFixed(2)
  );

  return {
    baseFare,
    distanceFare,
    timeFare,
    surgeMultiplier,
    totalFare,
    distanceKm: parseFloat(distanceKm.toFixed(2)),
    currency: 'INR',
    vehicleType,
  };
}

/**
 * Client-side calculation of estimated fare between two locations (coordinates)
 */
export function estimateFareFromLocations(
  pickup: CoordinatesInput,
  dropoff: CoordinatesInput,
  vehicleType: VehicleType = 'STANDARD'
): FareBreakdown {
  const distanceKm = calculateRideDistance(pickup, dropoff, 2);
  return calculateFareBreakdown(distanceKm, vehicleType);
}

/**
 * Fetch estimated fare for an existing ride from the backend API (Task #17)
 */
export async function fetchRideFareEstimate(
  rideId: string,
  token: string,
  apiBaseUrl: string = ''
): Promise<FareBreakdown & { rideId: string }> {
  const response = await fetch(`${apiBaseUrl}/api/passenger/rides/${rideId}/fare/estimate`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch fare estimate: ${response.statusText}`);
  }

  const json = await response.json();
  return json.data.fareEstimate;
}

/**
 * Fetch estimated fare directly from pickup/dropoff coordinates from backend API (Task #17)
 */
export async function fetchFareEstimateFromLocations(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  token: string,
  vehicleType: VehicleType = 'STANDARD',
  apiBaseUrl: string = ''
): Promise<FareBreakdown> {
  const response = await fetch(`${apiBaseUrl}/api/passenger/fare/estimate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      vehicleType,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch fare estimate: ${response.statusText}`);
  }

  const json = await response.json();
  return json.data.fareEstimate;
}

/**
 * Complete a ride and calculate final fare (Task #18)
 */
export async function completeRide(
  rideId: string,
  token: string,
  recordedDistanceKm?: number,
  apiBaseUrl: string = ''
): Promise<CompleteRideResult> {
  const body =
    recordedDistanceKm !== undefined
      ? JSON.stringify({ distanceKm: recordedDistanceKm })
      : undefined;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${apiBaseUrl}/api/driver/rides/${rideId}/complete`, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to complete ride: ${response.statusText}`);
  }

  const json = await response.json();
  return json.data;
}
