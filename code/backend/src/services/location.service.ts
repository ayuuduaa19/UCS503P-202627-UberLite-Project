import {
  calculateDistance,
  calculateDistanceAndDuration,
  DistanceUnit,
  RideEstimate,
  sortByDistance,
  findNearest,
  filterByRadius,
  CoordinatesInput,
} from '../utils/location';
import { CalculateDistanceInput, EstimateRideInput } from '../validators/location.validator';

export interface DistanceResult {
  distance: number;
  unit: DistanceUnit;
  distanceKm: number;
  estimatedDurationMin: number;
}

export class LocationService {
  /**
   * Calculates distance between origin and destination with unit and precision options.
   */
  calculateDistance(input: CalculateDistanceInput): DistanceResult {
    const unit = input.unit || 'km';
    const decimals = typeof input.decimals === 'number' ? input.decimals : 2;

    const distance = calculateDistance(input.origin, input.destination, {
      unit,
      decimals,
    });

    const distanceKm = calculateDistance(input.origin, input.destination, {
      unit: 'km',
      decimals: 2,
    });

    const estimatedDurationMin = calculateDistanceAndDuration(
      input.origin,
      input.destination
    ).durationMin;

    return {
      distance,
      unit,
      distanceKm,
      estimatedDurationMin,
    };
  }

  /**
   * Estimates ride distance (km) and travel duration (minutes) for a pickup and dropoff pair.
   */
  estimateRide(input: EstimateRideInput): RideEstimate {
    const avgSpeed = input.averageSpeedKmh || 30;
    return calculateDistanceAndDuration(input.pickup, input.dropoff, avgSpeed);
  }

  /**
   * Matching helper: Sorts candidates by distance to an origin location.
   */
  sortByDistance<T>(
    origin: CoordinatesInput,
    items: T[],
    getCoordinates: (item: T) => CoordinatesInput | null | undefined
  ) {
    return sortByDistance(origin, items, getCoordinates);
  }

  /**
   * Matching helper: Finds the closest candidate to origin.
   */
  findNearest<T>(
    origin: CoordinatesInput,
    items: T[],
    getCoordinates: (item: T) => CoordinatesInput | null | undefined,
    maxRadiusKm?: number
  ) {
    return findNearest(origin, items, getCoordinates, maxRadiusKm);
  }

  /**
   * Matching helper: Filters candidates within a given radius.
   */
  filterByRadius<T>(
    origin: CoordinatesInput,
    items: T[],
    getCoordinates: (item: T) => CoordinatesInput | null | undefined,
    maxRadiusKm: number
  ) {
    return filterByRadius(origin, items, getCoordinates, maxRadiusKm);
  }
}

export const locationService = new LocationService();
