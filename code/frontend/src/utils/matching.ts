import {
  calculateDistance,
  estimateTravelTimeMinutes,
  CoordinatesInput,
  normalizeCoordinates,
} from './location';

export type VehicleType = 'STANDARD' | 'PREMIUM' | 'XL';

export interface NearbyDriver {
  driverId: string;
  userId: string;
  name: string;
  phone: string | null;
  licenseNumber: string;
  vehicleType: VehicleType;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleColor: string | null;
  rating: number;
  currentLat: number;
  currentLng: number;
  distanceKm: number;
  estimatedArrivalMin: number;
}

export interface MatchingOptions {
  maxRadiusKm?: number;
  vehicleType?: VehicleType;
  limit?: number;
}

export interface MatchResult {
  ride: any;
  matchedDriver: NearbyDriver;
}

/**
 * Fetch nearby available drivers from the backend matching service
 */
export async function fetchNearbyDrivers(
  pickupLat: number,
  pickupLng: number,
  token: string,
  options?: MatchingOptions,
  apiBaseUrl: string = ''
): Promise<NearbyDriver[]> {
  const response = await fetch(`${apiBaseUrl}/api/passenger/drivers/nearby`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      pickupLat,
      pickupLng,
      ...options,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch nearby drivers: ${response.statusText}`);
  }

  const json = await response.json();
  return json.data.drivers;
}

/**
 * Request matching and automatic assignment of nearest driver to a ride
 */
export async function matchRideDriver(
  rideId: string,
  token: string,
  options?: MatchingOptions,
  apiBaseUrl: string = ''
): Promise<MatchResult> {
  const response = await fetch(`${apiBaseUrl}/api/passenger/rides/${rideId}/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(options || {}),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to match ride: ${response.statusText}`);
  }

  const json = await response.json();
  return json.data;
}

/**
 * Assign a specific available driver to a ride
 */
export async function assignDriverToRide(
  rideId: string,
  driverId: string,
  token: string,
  apiBaseUrl: string = ''
): Promise<MatchResult> {
  const response = await fetch(`${apiBaseUrl}/api/passenger/rides/${rideId}/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ driverId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to assign driver: ${response.statusText}`);
  }

  const json = await response.json();
  return json.data;
}

/**
 * Client-side helper: Filter and sort driver candidates by proximity to pickup
 */
export function filterAndSortNearbyDrivers<T extends { currentLat: number | null; currentLng: number | null; isAvailable: boolean }>(
  pickup: CoordinatesInput,
  drivers: T[],
  maxRadiusKm: number = 10.0
): Array<T & { distanceKm: number; estimatedArrivalMin: number }> {
  const pickupNorm = normalizeCoordinates(pickup, 'Pickup');
  const results: Array<T & { distanceKm: number; estimatedArrivalMin: number }> = [];

  for (const driver of drivers) {
    if (!driver.isAvailable || driver.currentLat === null || driver.currentLng === null) {
      continue;
    }

    const dist = calculateDistance(
      pickupNorm,
      { lat: driver.currentLat, lng: driver.currentLng },
      { unit: 'km', decimals: 2 }
    );

    if (dist <= maxRadiusKm) {
      results.push({
        ...driver,
        distanceKm: dist,
        estimatedArrivalMin: estimateTravelTimeMinutes(dist, 30, 1),
      });
    }
  }

  return results.sort((a, b) => a.distanceKm - b.distanceKm);
}
