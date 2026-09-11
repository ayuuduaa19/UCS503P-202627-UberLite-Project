/**
 * Location and Distance Utility Module (Frontend)
 *
 * Standalone utility providing coordinate normalization, coordinate validation,
 * Haversine great-circle distance calculation, and ride fare/duration estimators.
 */

export interface CoordinatesLatLng {
  lat: number;
  lng: number;
}

export interface CoordinatesFull {
  latitude: number;
  longitude: number;
}

export type CoordinateTuple = [number, number];

export type CoordinatesInput = CoordinatesLatLng | CoordinatesFull | CoordinateTuple;

export type DistanceUnit = 'km' | 'm' | 'miles';

export interface DistanceOptions {
  unit?: DistanceUnit;
  decimals?: number;
}

export interface RideEstimate {
  distanceKm: number;
  durationMin: number;
}

export const EARTH_RADIUS_KM = 6371.0;

const UNIT_FACTORS: Record<DistanceUnit, number> = {
  km: 1,
  m: 1000,
  miles: 0.621371192,
};

export function isValidLatitude(lat: unknown): boolean {
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lng: unknown): boolean {
  return typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

export function isValidCoordinate(input: unknown): boolean {
  if (!input) return false;

  if (Array.isArray(input)) {
    return input.length === 2 && isValidLatitude(input[0]) && isValidLongitude(input[1]);
  }

  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if ('lat' in obj && 'lng' in obj) {
      return isValidLatitude(obj.lat) && isValidLongitude(obj.lng);
    }
    if ('latitude' in obj && 'longitude' in obj) {
      return isValidLatitude(obj.latitude) && isValidLongitude(obj.longitude);
    }
  }

  return false;
}

export function normalizeCoordinates(input: CoordinatesInput, label: string = 'Coordinate'): CoordinatesLatLng {
  if (!input) {
    throw new Error(`${label} is required`);
  }

  let lat: number;
  let lng: number;

  if (Array.isArray(input)) {
    [lat, lng] = input;
  } else if ('lat' in input && 'lng' in input) {
    lat = input.lat;
    lng = input.lng;
  } else if ('latitude' in input && 'longitude' in input) {
    lat = input.latitude;
    lng = input.longitude;
  } else {
    throw new Error(`${label} format is invalid. Must provide {lat, lng}, {latitude, longitude}, or [lat, lng].`);
  }

  if (!isValidLatitude(lat)) {
    throw new Error(`${label} latitude must be a valid number between -90 and 90 degrees. Received: ${lat}`);
  }

  if (!isValidLongitude(lng)) {
    throw new Error(`${label} longitude must be a valid number between -180 and 180 degrees. Received: ${lng}`);
  }

  return { lat, lng };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function calculateDistance(
  origin: CoordinatesInput,
  destination: CoordinatesInput,
  options: DistanceOptions = {}
): number {
  const { unit = 'km', decimals } = options;

  const start = normalizeCoordinates(origin, 'Origin');
  const end = normalizeCoordinates(destination, 'Destination');

  if (start.lat === end.lat && start.lng === end.lng) {
    return 0;
  }

  const dLat = toRadians(end.lat - start.lat);
  const dLng = toRadians(end.lng - start.lng);

  const lat1Rad = toRadians(start.lat);
  const lat2Rad = toRadians(end.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const clampedA = Math.min(Math.max(a, 0), 1);
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  const distanceInKm = EARTH_RADIUS_KM * c;
  const factor = UNIT_FACTORS[unit] || 1;
  const convertedDistance = distanceInKm * factor;

  if (typeof decimals === 'number' && decimals >= 0) {
    const pow = Math.pow(10, decimals);
    return Math.round(convertedDistance * pow) / pow;
  }

  return convertedDistance;
}

export function isWithinRadius(
  origin: CoordinatesInput,
  target: CoordinatesInput,
  radiusKm: number
): boolean {
  if (radiusKm < 0) return false;
  const dist = calculateDistance(origin, target, { unit: 'km' });
  return dist <= radiusKm;
}

export function calculateRideDistance(
  pickup: CoordinatesInput,
  dropoff: CoordinatesInput,
  decimals: number = 2
): number {
  return calculateDistance(pickup, dropoff, { unit: 'km', decimals });
}

export function estimateTravelTimeMinutes(
  distanceKm: number,
  averageSpeedKmh: number = 30,
  decimals: number = 1
): number {
  if (distanceKm <= 0 || averageSpeedKmh <= 0) {
    return 0;
  }

  const hours = distanceKm / averageSpeedKmh;
  const minutes = hours * 60;

  const pow = Math.pow(10, decimals);
  return Math.round(minutes * pow) / pow;
}

export function calculateDistanceAndDuration(
  pickup: CoordinatesInput,
  dropoff: CoordinatesInput,
  averageSpeedKmh: number = 30
): RideEstimate {
  const distanceKm = calculateRideDistance(pickup, dropoff, 2);
  const durationMin = estimateTravelTimeMinutes(distanceKm, averageSpeedKmh, 1);

  return {
    distanceKm,
    durationMin,
  };
}
