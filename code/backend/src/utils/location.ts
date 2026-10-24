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

export function filterByRadius<T>(
  origin: CoordinatesInput,
  items: T[],
  getCoordinates: (item: T) => CoordinatesInput | null | undefined,
  maxRadiusKm: number
): Array<T & { distanceKm: number }> {
  return sortByDistance(origin, items, getCoordinates).filter(
    (item) => item.distanceKm <= maxRadiusKm
  );
}

export function sortByDistance<T>(
  origin: CoordinatesInput,
  items: T[],
  getCoordinates: (item: T) => CoordinatesInput | null | undefined
): Array<T & { distanceKm: number }> {
  const results: Array<T & { distanceKm: number }> = [];

  for (const item of items) {
    const coords = getCoordinates(item);
    if (!coords || !isValidCoordinate(coords)) {
      continue;
    }

    const dist = calculateDistance(origin, coords, { unit: 'km', decimals: 2 });
    results.push({
      ...item,
      distanceKm: dist,
    });
  }

  return results.sort((a, b) => a.distanceKm - b.distanceKm);
}

export function findNearest<T>(
  origin: CoordinatesInput,
  items: T[],
  getCoordinates: (item: T) => CoordinatesInput | null | undefined,
  maxRadiusKm?: number
): (T & { distanceKm: number }) | null {
  const sorted = sortByDistance(origin, items, getCoordinates);

  if (sorted.length === 0) {
    return null;
  }

  const closest = sorted[0];

  if (typeof maxRadiusKm === 'number' && closest.distanceKm > maxRadiusKm) {
    return null;
  }

  return closest;
}

// ─── Location-Based Search Strategy (Task 39) ────────────────────────────────

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Calculate a geographic bounding box [minLat, maxLat] and [minLng, maxLng]
 * around a center point for a given search radius in kilometers.
 * Applies a safety buffer factor (default 1.05) to ensure edge points are included.
 */
export function calculateBoundingBox(
  origin: CoordinatesInput,
  radiusKm: number,
  safetyFactor: number = 1.05
): BoundingBox {
  const center = normalizeCoordinates(origin, 'Bounding box center');
  if (radiusKm <= 0) {
    return {
      minLat: center.lat,
      maxLat: center.lat,
      minLng: center.lng,
      maxLng: center.lng,
    };
  }

  const effectiveRadius = radiusKm * safetyFactor;
  // 1 degree of latitude in km: (PI * EARTH_RADIUS_KM) / 180 ≈ 111.1949 km
  const kmPerLatDegree = (Math.PI * EARTH_RADIUS_KM) / 180;
  const deltaLat = effectiveRadius / kmPerLatDegree;

  const minLat = Math.max(-90, center.lat - deltaLat);
  const maxLat = Math.min(90, center.lat + deltaLat);

  let minLng: number;
  let maxLng: number;

  // If the bounding circle encompasses either pole, all longitudes are spanned
  if (center.lat + deltaLat >= 90 || center.lat - deltaLat <= -90) {
    minLng = -180;
    maxLng = 180;
  } else {
    // Longitude distance varies by latitude: cos(latitude)
    const radLat = toRadians(center.lat);
    const cosLat = Math.cos(radLat);

    let deltaLng: number;
    if (Math.abs(cosLat) < 0.0001) {
      deltaLng = 180;
    } else {
      deltaLng = effectiveRadius / (kmPerLatDegree * cosLat);
    }

    minLng = Math.max(-180, center.lng - deltaLng);
    maxLng = Math.min(180, center.lng + deltaLng);
  }

  return {
    minLat: parseFloat(minLat.toFixed(6)),
    maxLat: parseFloat(maxLat.toFixed(6)),
    minLng: parseFloat(minLng.toFixed(6)),
    maxLng: parseFloat(maxLng.toFixed(6)),
  };
}

/**
 * Fast check whether a point lies within a bounding box.
 */
export function isWithinBoundingBox(
  point: CoordinatesInput,
  box: BoundingBox
): boolean {
  const coords = normalizeCoordinates(point, 'Point');
  return (
    coords.lat >= box.minLat &&
    coords.lat <= box.maxLat &&
    coords.lng >= box.minLng &&
    coords.lng <= box.maxLng
  );
}

export interface SpatialGridItem<T> {
  id: string;
  lat: number;
  lng: number;
  data: T;
}

/**
 * 2D Spatial Grid Index for high-performance location-based lookups.
 * Discretizes coordinates into spatial grid cells (buckets) so queries
 * only scan candidates in adjacent cells rather than performing a linear O(N) scan.
 */
export class SpatialGridIndex<T> {
  private cellSizeDegrees: number;
  private grid: Map<string, Array<SpatialGridItem<T>>>;

  constructor(cellSizeKm: number = 5.0) {
    this.cellSizeDegrees = Math.max(0.01, cellSizeKm / 111.0);
    this.grid = new Map();
  }

  private getCellKey(lat: number, lng: number): string {
    const cellX = Math.floor(lat / this.cellSizeDegrees);
    const cellY = Math.floor(lng / this.cellSizeDegrees);
    return `${cellX}:${cellY}`;
  }

  clear(): void {
    this.grid.clear();
  }

  insert(id: string, lat: number, lng: number, data: T): void {
    if (!isValidLatitude(lat) || !isValidLongitude(lng)) return;
    const key = this.getCellKey(lat, lng);
    let cell = this.grid.get(key);
    if (!cell) {
      cell = [];
      this.grid.set(key, cell);
    }
    const existingIndex = cell.findIndex((item) => item.id === id);
    if (existingIndex >= 0) {
      cell[existingIndex] = { id, lat, lng, data };
    } else {
      cell.push({ id, lat, lng, data });
    }
  }

  remove(id: string): void {
    for (const cell of this.grid.values()) {
      const idx = cell.findIndex((item) => item.id === id);
      if (idx >= 0) {
        cell.splice(idx, 1);
        break;
      }
    }
  }

  queryRadius(
    center: CoordinatesInput,
    radiusKm: number
  ): Array<SpatialGridItem<T> & { distanceKm: number }> {
    const coords = normalizeCoordinates(center, 'Query Center');
    const box = calculateBoundingBox(coords, radiusKm, 1.0);

    const minCellX = Math.floor(box.minLat / this.cellSizeDegrees);
    const maxCellX = Math.floor(box.maxLat / this.cellSizeDegrees);
    const minCellY = Math.floor(box.minLng / this.cellSizeDegrees);
    const maxCellY = Math.floor(box.maxLng / this.cellSizeDegrees);

    const candidates: Array<SpatialGridItem<T> & { distanceKm: number }> = [];

    for (let x = minCellX; x <= maxCellX; x++) {
      for (let y = minCellY; y <= maxCellY; y++) {
        const cell = this.grid.get(`${x}:${y}`);
        if (!cell || cell.length === 0) continue;

        for (const item of cell) {
          const dist = calculateDistance(
            coords,
            { lat: item.lat, lng: item.lng },
            { unit: 'km', decimals: 2 }
          );
          if (dist <= radiusKm) {
            candidates.push({
              ...item,
              distanceKm: dist,
            });
          }
        }
      }
    }

    return candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  size(): number {
    let count = 0;
    for (const cell of this.grid.values()) {
      count += cell.length;
    }
    return count;
  }
}

