import { prisma } from '../lib/prisma';

/**
 * Result returned when a driver is successfully matched to a ride.
 */
export interface MatchResult {
  driverId: string;
  matchedAt: Date;
}

/**
 * MatchingService is responsible for finding an available driver for a ride
 * request. The strategy is:
 *  1. Prefer drivers whose current location is closest to the pickup point
 *     (when coordinates are available on both sides).
 *  2. Fall back to any available driver when no coordinates are stored.
 *
 * Only drivers whose `isAvailable` flag is `true` are considered.
 */
export class MatchingService {
  /**
   * Find the best available driver for a new ride request.
   *
   * @param pickupLat  Latitude of the ride pickup location.
   * @param pickupLng  Longitude of the ride pickup location.
   * @returns A `MatchResult` with the selected driver's id and the timestamp
   *          of the match, or `null` when no driver is available.
   */
  async findAvailableDriver(pickupLat: number, pickupLng: number): Promise<MatchResult | null> {
    // Fetch all currently available drivers.
    const availableDrivers = await prisma.driver.findMany({
      where: { isAvailable: true },
      select: {
        id: true,
        currentLat: true,
        currentLng: true,
      },
    });

    if (availableDrivers.length === 0) {
      return null;
    }

    // Separate drivers that have location data from those that don't.
    const driversWithLocation = availableDrivers.filter(
      (d) => d.currentLat !== null && d.currentLng !== null
    );

    let selectedDriverId: string;

    if (driversWithLocation.length > 0) {
      // Pick the driver closest to the pickup point using Euclidean distance
      // as an approximation (sufficient for matching within a city).
      let closestDriver = driversWithLocation[0];
      let minDistanceSq = this._distanceSq(
        pickupLat,
        pickupLng,
        closestDriver.currentLat!,
        closestDriver.currentLng!
      );

      for (let i = 1; i < driversWithLocation.length; i++) {
        const d = driversWithLocation[i];
        const distSq = this._distanceSq(pickupLat, pickupLng, d.currentLat!, d.currentLng!);
        if (distSq < minDistanceSq) {
          minDistanceSq = distSq;
          closestDriver = d;
        }
      }

      selectedDriverId = closestDriver.id;
    } else {
      // No location data — just pick the first available driver.
      selectedDriverId = availableDrivers[0].id;
    }

    const matchedAt = new Date();
    return { driverId: selectedDriverId, matchedAt };
  }

  /**
   * Mark a driver as unavailable once they are matched to a ride.
   * This prevents the same driver from being assigned to multiple rides.
   *
   * @param driverId  The id of the driver to mark as unavailable.
   */
  async markDriverUnavailable(driverId: string): Promise<void> {
    await prisma.driver.update({
      where: { id: driverId },
      data: { isAvailable: false },
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Squared Euclidean distance between two lat/lng points. */
  private _distanceSq(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLat = lat1 - lat2;
    const dLng = lng1 - lng2;
    return dLat * dLat + dLng * dLng;
  }
}

export const matchingService = new MatchingService();
