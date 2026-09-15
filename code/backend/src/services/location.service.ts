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

  estimateRide(input: EstimateRideInput): RideEstimate {
    const avgSpeed = input.averageSpeedKmh || 30;
    return calculateDistanceAndDuration(input.pickup, input.dropoff, avgSpeed);
  }

  sortByDistance<T>(
    origin: CoordinatesInput,
    items: T[],
    getCoordinates: (item: T) => CoordinatesInput | null | undefined
  ) {
    return sortByDistance(origin, items, getCoordinates);
  }

  findNearest<T>(
    origin: CoordinatesInput,
    items: T[],
    getCoordinates: (item: T) => CoordinatesInput | null | undefined,
    maxRadiusKm?: number
  ) {
    return findNearest(origin, items, getCoordinates, maxRadiusKm);
  }

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
