import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { matchingService } from '../services/matching.service';
import {
  calculateBoundingBox,
  isWithinBoundingBox,
  SpatialGridIndex,
  calculateDistance,
} from '../utils/location';

describe('Task 39: Driver Search Efficiency & Location-Based Search Strategy', () => {
  describe('Geographic Bounding Box Utility', () => {
    it('should compute valid bounding box around center coordinates', () => {
      const center = { lat: 28.6139, lng: 77.209 }; // Connaught Place, New Delhi
      const radiusKm = 10;
      const box = calculateBoundingBox(center, radiusKm);

      assert.ok(box.minLat < center.lat);
      assert.ok(box.maxLat > center.lat);
      assert.ok(box.minLng < center.lng);
      assert.ok(box.maxLng > center.lng);

      // Center must be inside the bounding box
      assert.strictEqual(isWithinBoundingBox(center, box), true);
    });

    it('should return point coordinates when radius is 0 or negative', () => {
      const center = { lat: 12.9716, lng: 77.5946 };
      const box = calculateBoundingBox(center, 0);

      assert.strictEqual(box.minLat, 12.9716);
      assert.strictEqual(box.maxLat, 12.9716);
      assert.strictEqual(box.minLng, 77.5946);
      assert.strictEqual(box.maxLng, 77.5946);
    });

    it('should correctly filter points inside vs outside the bounding box', () => {
      const center = { lat: 28.6139, lng: 77.209 };
      const box = calculateBoundingBox(center, 5.0);

      const nearbyPoint = { lat: 28.62, lng: 77.215 }; // ~1 km
      const farPoint = { lat: 28.8, lng: 77.5 }; // ~35 km

      assert.strictEqual(isWithinBoundingBox(nearbyPoint, box), true);
      assert.strictEqual(isWithinBoundingBox(farPoint, box), false);
    });

    it('should clamp latitude within -90 to +90 degrees near poles', () => {
      const northPole = { lat: 89.5, lng: 0.0 };
      const box = calculateBoundingBox(northPole, 100);

      assert.ok(box.maxLat <= 90.0);
      assert.ok(box.minLat >= -90.0);
      assert.strictEqual(box.maxLng, 180);
      assert.strictEqual(box.minLng, -180);
    });
  });

  describe('2D Spatial Grid Index', () => {
    it('should insert items and query within radius using spatial cells', () => {
      const grid = new SpatialGridIndex<{ name: string }>(5.0); // 5km cell size

      grid.insert('d1', 28.615, 77.21, { name: 'Driver 1' }); // ~0.15km from CP
      grid.insert('d2', 28.63, 77.22, { name: 'Driver 2' });  // ~2km from CP
      grid.insert('d3', 28.9, 77.5, { name: 'Driver 3' });    // ~40km from CP

      assert.strictEqual(grid.size(), 3);

      const results = grid.queryRadius({ lat: 28.6139, lng: 77.209 }, 5.0);

      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].id, 'd1');
      assert.strictEqual(results[1].id, 'd2');
      assert.ok(results[0].distanceKm < results[1].distanceKm);
    });

    it('should remove items correctly from grid', () => {
      const grid = new SpatialGridIndex<{ name: string }>(5.0);
      grid.insert('d1', 28.615, 77.21, { name: 'Driver 1' });
      assert.strictEqual(grid.size(), 1);

      grid.remove('d1');
      assert.strictEqual(grid.size(), 0);

      const results = grid.queryRadius({ lat: 28.615, lng: 77.21 }, 10);
      assert.strictEqual(results.length, 0);
    });

    it('should update position when re-inserting with the same id', () => {
      const grid = new SpatialGridIndex<{ name: string }>(5.0);
      grid.insert('d1', 28.615, 77.21, { name: 'Driver 1' });
      grid.insert('d1', 28.616, 77.22, { name: 'Driver 1 updated' });

      assert.strictEqual(grid.size(), 1);
      const results = grid.queryRadius({ lat: 28.615, lng: 77.21 }, 5.0);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].data.name, 'Driver 1 updated');
    });
  });

  describe('MatchingService Location-Based Search Strategy', () => {
    it('should pass bounding box coordinates to database query to avoid full table scans', async () => {
      const originalFindMany = prisma.driver.findMany;
      let capturedArgs: any = null;

      prisma.driver.findMany = (async (args: any) => {
        capturedArgs = args;
        return [
          {
            id: 'drv-spatial-1',
            userId: 'usr-1',
            licenseNumber: 'LIC-1',
            vehicleType: VehicleType.STANDARD,
            vehicleModel: 'Sedan',
            vehiclePlate: 'DL-01-1111',
            vehicleColor: 'White',
            rating: 4.9,
            currentLat: 28.615,
            currentLng: 77.21,
            user: { name: 'Nearby Driver', phone: '+919999999991' },
          },
        ] as any;
      }) as any;

      try {
        const pickup = { lat: 28.6139, lng: 77.209 };
        const drivers = await matchingService.findAvailableDrivers(pickup, { maxRadiusKm: 8.0 });

        assert.ok(capturedArgs);
        assert.strictEqual(capturedArgs.where.isAvailable, true);
        assert.ok(capturedArgs.where.currentLat.gte !== undefined);
        assert.ok(capturedArgs.where.currentLat.lte !== undefined);
        assert.ok(capturedArgs.where.currentLng.gte !== undefined);
        assert.ok(capturedArgs.where.currentLng.lte !== undefined);

        assert.strictEqual(drivers.length, 1);
        assert.strictEqual(drivers[0].driverId, 'drv-spatial-1');
        assert.ok(drivers[0].distanceKm < 8.0);
      } finally {
        prisma.driver.findMany = originalFindMany;
      }
    });

    it('should preserve existing matching-service interface and return candidate drivers sorted by distance', async () => {
      const originalFindMany = prisma.driver.findMany;

      prisma.driver.findMany = (async () => {
        return [
          {
            id: 'drv-far',
            userId: 'u-far',
            licenseNumber: 'LIC-FAR',
            vehicleType: VehicleType.STANDARD,
            vehicleModel: 'Van',
            vehiclePlate: 'DL-01-2222',
            vehicleColor: 'Grey',
            rating: 5.0,
            currentLat: 28.65,
            currentLng: 77.25, // ~5.7 km
            user: { name: 'Farther Driver' },
          },
          {
            id: 'drv-near',
            userId: 'u-near',
            licenseNumber: 'LIC-NEAR',
            vehicleType: VehicleType.STANDARD,
            vehicleModel: 'Hatchback',
            vehiclePlate: 'DL-01-3333',
            vehicleColor: 'Blue',
            rating: 4.8,
            currentLat: 28.615,
            currentLng: 77.21, // ~0.15 km
            user: { name: 'Closer Driver' },
          },
        ] as any;
      }) as any;

      try {
        const pickup = { lat: 28.6139, lng: 77.209 };
        const drivers = await matchingService.findAvailableDrivers(pickup, { maxRadiusKm: 10.0 });

        assert.strictEqual(drivers.length, 2);
        assert.strictEqual(drivers[0].driverId, 'drv-near');
        assert.strictEqual(drivers[1].driverId, 'drv-far');
        assert.ok(drivers[0].distanceKm < drivers[1].distanceKm);

        // findNearestDriver interface test
        const nearest = await matchingService.findNearestDriver(pickup, { maxRadiusKm: 10.0 });
        assert.ok(nearest !== null);
        assert.strictEqual(nearest?.driverId, 'drv-near');
      } finally {
        prisma.driver.findMany = originalFindMany;
      }
    });
  });
});
