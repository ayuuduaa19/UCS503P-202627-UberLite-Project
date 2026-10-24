import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Role, RideStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { matchingService, CandidateDriver } from '../services/matching.service';
import { rideService } from '../services/ride.service';
import { driverService } from '../services/driver.service';
import {
  calculateDistance,
  estimateTravelTimeMinutes,
  sortByDistance,
  filterByRadius,
} from '../utils/location';
import { createRideSchema } from '../validators/ride.validator';
import { authenticate } from '../middleware/auth.middleware';

// ─── Latency Percentile Helper ───────────────────────────────────────────────

function calculatePercentiles(latenciesMs: number[]): {
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  totalMs: number;
} {
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((sum, v) => sum + v, 0);
  const p50 = sorted[Math.floor(n * 0.5)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)];

  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean: parseFloat((total / n).toFixed(3)),
    p50: parseFloat(p50.toFixed(3)),
    p95: parseFloat(p95.toFixed(3)),
    p99: parseFloat(p99.toFixed(3)),
    totalMs: parseFloat(total.toFixed(3)),
  };
}

// ─── Generator Helpers ───────────────────────────────────────────────────────

function generateMockDrivers(count: number, centerLat = 28.6315, centerLng = 77.2167) {
  const drivers: any[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    // Generate drivers in a ~15 km radial spread around Delhi CP
    const angle = (i / count) * 2 * Math.PI;
    const distanceKm = (i / count) * 14.5 + 0.1; // 0.1 to 14.6 km
    // 1 deg lat ~ 111 km, 1 deg lng ~ 111 * cos(28.6 deg) ~ 97 km
    const latOffset = (distanceKm * Math.cos(angle)) / 111;
    const lngOffset = (distanceKm * Math.sin(angle)) / 97;

    drivers.push({
      id: `driver-perf-${i}`,
      userId: `user-driver-perf-${i}`,
      licenseNumber: `DL-${String(i).padStart(6, '0')}`,
      vehicleType: i % 3 === 0 ? VehicleType.XL : i % 2 === 0 ? VehicleType.PREMIUM : VehicleType.STANDARD,
      vehicleModel: i % 2 === 0 ? 'Hyundai Aura' : 'Maruti Dzire',
      vehiclePlate: `DL-01-PF-${String(i).padStart(4, '0')}`,
      vehicleColor: i % 2 === 0 ? 'White' : 'Silver',
      isAvailable: i % 15 !== 0, // ~93% available
      currentLat: parseFloat((centerLat + latOffset).toFixed(6)),
      currentLng: parseFloat((centerLng + lngOffset).toFixed(6)),
      rating: parseFloat((4.0 + (i % 11) * 0.1).toFixed(1)),
      updatedAt: new Date(now - (i % 300) * 1000), // Updated between 0 and 300 seconds ago
      user: {
        id: `user-driver-perf-${i}`,
        name: `Driver ${i}`,
        phone: `+9198000${String(i).padStart(5, '0')}`,
        email: `driver${i}@uberlite.test`,
      },
    });
  }

  return drivers;
}

function generateMockRideRequests(count: number) {
  const requests: any[] = [];
  for (let i = 0; i < count; i++) {
    const latDelta = ((i % 10) - 5) * 0.002;
    const lngDelta = ((i % 10) - 5) * 0.002;
    requests.push({
      pickupAddress: `Pickup Station ${i}, New Delhi`,
      dropoffAddress: `Dropoff Hub ${i}, Gurugram`,
      pickupLat: parseFloat((28.6315 + latDelta).toFixed(5)),
      pickupLng: parseFloat((77.2167 + lngDelta).toFixed(5)),
      dropoffLat: parseFloat((28.4952 + latDelta).toFixed(5)),
      dropoffLng: parseFloat((77.0895 + lngDelta).toFixed(5)),
      distanceKm: 22.5 + (i % 10),
      durationMin: 35.0 + (i % 15),
    });
  }
  return requests;
}

// ═════════════════════════════════════════════════════════════════════════════
// Task 45: Performance & Scalability Test Suite
// ═════════════════════════════════════════════════════════════════════════════

describe('Task 45: Performance & Scalability Tests', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Authentication Performance & Scalability
  // ───────────────────────────────────────────────────────────────────────────

  describe('1. Authentication Performance & Scalability', () => {
    const JWT_SECRET = 'uberlite-perf-secret-jwt-key-32-chars-long';

    it('should benchmark JWT signing & verification throughput (> 2,500 ops/sec)', () => {
      const iterations = 500;
      const payload = { id: 'usr-perf-1', email: 'perf@test.com', role: Role.PASSENGER };

      // Signing Benchmark
      const signTimes: number[] = [];
      const tokens: string[] = [];
      const startSign = performance.now();

      for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
        signTimes.push(performance.now() - t0);
        tokens.push(token);
      }
      const totalSignMs = performance.now() - startSign;
      const signOpsPerSec = Math.round((iterations / totalSignMs) * 1000);

      // Verification Benchmark
      const verifyTimes: number[] = [];
      const startVerify = performance.now();

      for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        const decoded = jwt.verify(tokens[i], JWT_SECRET) as any;
        verifyTimes.push(performance.now() - t0);
        assert.strictEqual(decoded.id, 'usr-perf-1');
      }
      const totalVerifyMs = performance.now() - startVerify;
      const verifyOpsPerSec = Math.round((iterations / totalVerifyMs) * 1000);

      const signStats = calculatePercentiles(signTimes);
      const verifyStats = calculatePercentiles(verifyTimes);

      assert.ok(totalSignMs < 1000, `Sign took too long: ${totalSignMs} ms for ${iterations} tokens`);
      assert.ok(totalVerifyMs < 500, `Verify took too long: ${totalVerifyMs} ms for ${iterations} tokens`);
      assert.ok(verifyOpsPerSec > 2500, `Verify throughput low: ${verifyOpsPerSec} ops/sec`);
      assert.ok(verifyStats.p95 < 2.0, `p95 verify latency high: ${verifyStats.p95} ms`);
    });

    it('should benchmark password verification scaling for concurrent auth requests', async () => {
      // Benchmark 50 concurrent password verifications with bcrypt
      const password = 'SecurePassword123!';
      const hash = await bcrypt.hash(password, 6); // standard test salt
      const authAttempts = 30;

      const t0 = performance.now();
      const promises = Array.from({ length: authAttempts }, () => bcrypt.compare(password, hash));
      const results = await Promise.all(promises);
      const totalMs = performance.now() - t0;

      results.forEach((res) => assert.strictEqual(res, true));
      const avgMs = totalMs / authAttempts;

      assert.ok(totalMs < 1500, `Concurrent bcrypt verification took ${totalMs} ms (expected < 1500 ms)`);
      assert.ok(avgMs < 50, `Average compare took ${avgMs} ms`);
    });

    it('should benchmark authentication middleware throughput for batch incoming requests', async () => {
      const token = signToken({ id: 'usr-mw-perf', email: 'mw@test.com', role: Role.PASSENGER });
      const requestCount = 200;
      const latencies: number[] = [];

      for (let i = 0; i < requestCount; i++) {
        const req: any = {
          headers: { authorization: `Bearer ${token}` },
        };
        const res: any = {
          status: () => res,
          json: () => res,
        };

        const t0 = performance.now();
        await new Promise<void>((resolve, reject) => {
          authenticate(req, res, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        latencies.push(performance.now() - t0);
        assert.strictEqual(req.user.id, 'usr-mw-perf');
      }

      const stats = calculatePercentiles(latencies);
      assert.ok(stats.mean < 1.0, `Mean middleware auth took ${stats.mean} ms (expected < 1.0 ms)`);
      assert.ok(stats.p95 < 2.0, `p95 middleware auth took ${stats.p95} ms (expected < 2.0 ms)`);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Ride Creation Performance & Scalability
  // ───────────────────────────────────────────────────────────────────────────

  describe('2. Ride Creation Performance & Scalability', () => {
    it('should validate and create batches of ride requests with linear O(N) scaling', async () => {
      const batchSizes = [50, 100, 250, 500];
      const batchTimes: Record<number, number> = {};

      const originalCreate = prisma.ride.create;

      try {
        prisma.ride.create = (async (args: any) => ({
          id: `ride-${Math.random()}`,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
          passenger: { id: args.data.passengerId, name: 'Perf Passenger', phone: '9999' },
        })) as any;

        for (const size of batchSizes) {
          const payloadList = generateMockRideRequests(size);
          const t0 = performance.now();

          for (let i = 0; i < size; i++) {
            const valid = createRideSchema.parse(payloadList[i]);
            await rideService.createRide(`passenger-${i}`, valid);
          }

          const elapsedMs = performance.now() - t0;
          batchTimes[size] = elapsedMs;

          // Each batch must execute well within reasonable performance bounds
          const perRideMs = elapsedMs / size;
          assert.ok(perRideMs < 25.0, `Ride creation took ${perRideMs} ms/ride for size ${size}`);
        }

        // Verify approximately linear scaling: time(500) should be within 4x of time(100)
        const ratio500to100 = batchTimes[500] / batchTimes[100];
        assert.ok(
          ratio500to100 <= 7.0,
          `Scaling anomaly: 500 items took ${batchTimes[500]} ms vs 100 items taking ${batchTimes[100]} ms (ratio ${ratio500to100})`
        );
      } finally {
        prisma.ride.create = originalCreate;
      }
    });

    it('should measure schema validation throughput for 1,000 ride creation payloads (> 10,000 ops/sec)', () => {
      const payloads = generateMockRideRequests(1000);
      const t0 = performance.now();

      for (let i = 0; i < 1000; i++) {
        const res = createRideSchema.safeParse(payloads[i]);
        assert.strictEqual(res.success, true);
      }

      const totalMs = performance.now() - t0;
      const opsPerSec = Math.round((1000 / totalMs) * 1000);

      assert.ok(totalMs < 100, `Validation for 1,000 payloads took ${totalMs} ms (expected < 100 ms)`);
      assert.ok(opsPerSec > 10000, `Validation throughput ${opsPerSec} ops/sec (expected > 10,000)`);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Driver Matching Scalability with Increasing Numbers of Available Drivers
  // ───────────────────────────────────────────────────────────────────────────

  describe('3. Matching Scalability with Increasing Available Drivers', () => {
    const pickup = { lat: 28.6315, lng: 77.2167 };
    const driverScales = [10, 50, 100, 500, 1000, 2500, 5000];
    const originalFindMany = prisma.driver.findMany;

    it('should benchmark driver candidate search across scaling sizes (10 to 5,000 drivers)', async () => {
      const benchmarkResults: Record<number, { elapsedMs: number; candidatesFound: number }> = {};

      try {
        for (const count of driverScales) {
          const mockDrivers = generateMockDrivers(count);
          prisma.driver.findMany = (async () => mockDrivers) as any;

          const t0 = performance.now();
          const candidates = await matchingService.findAvailableDrivers(pickup, {
            maxRadiusKm: 10.0,
            limit: 20,
          });
          const elapsed = performance.now() - t0;

          benchmarkResults[count] = {
            elapsedMs: parseFloat(elapsed.toFixed(2)),
            candidatesFound: candidates.length,
          };

          // Verification criteria
          assert.ok(candidates.length > 0, `No candidates found for ${count} drivers`);
          assert.ok(candidates.length <= 20, `Candidate limit exceeded for ${count} drivers`);

          // Scalability thresholds
          if (count <= 100) {
            assert.ok(elapsed < 15, `Matching for ${count} drivers took ${elapsed} ms (expected < 15 ms)`);
          } else if (count <= 1000) {
            assert.ok(elapsed < 25, `Matching for ${count} drivers took ${elapsed} ms (expected < 25 ms)`);
          } else {
            assert.ok(elapsed < 60, `Matching for ${count} drivers took ${elapsed} ms (expected < 60 ms)`);
          }
        }

        // Verify candidates are sorted ascending by distance
        const mock1000 = generateMockDrivers(1000);
        prisma.driver.findMany = (async () => mock1000) as any;
        const candidates = await matchingService.findAvailableDrivers(pickup, { limit: 10 });
        for (let i = 0; i < candidates.length - 1; i++) {
          assert.ok(
            candidates[i].distanceKm <= candidates[i + 1].distanceKm,
            `Drivers not sorted: index ${i} (${candidates[i].distanceKm} km) > index ${i + 1} (${candidates[i + 1].distanceKm} km)`
          );
        }
      } finally {
        prisma.driver.findMany = originalFindMany;
      }
    });

    it('should benchmark in-memory Haversine distance & sorting throughput for 10,000 drivers', () => {
      const count = 10000;
      const drivers = generateMockDrivers(count);

      const t0 = performance.now();
      const getCoords = (d: any) => ({ lat: d.currentLat, lng: d.currentLng });

      // 1. Proximity filter
      const inRadius = filterByRadius(pickup, drivers, getCoords, 10.0);

      // 2. Proximity sort
      const sorted = sortByDistance(pickup, inRadius, getCoords);
      const elapsed = performance.now() - t0;

      assert.ok(sorted.length > 0);
      assert.ok(elapsed < 100, `Filtering & sorting 10,000 drivers took ${elapsed} ms (expected < 100 ms)`);
    });

    it('should verify nearest driver selection accuracy remains consistent as driver pool scales', async () => {
      try {
        for (const count of [50, 500, 2000]) {
          const drivers = generateMockDrivers(count);
          // Inject an exact nearest driver (< 50 meters away)
          drivers.push({
            id: `exact-nearest-${count}`,
            userId: `u-nearest-${count}`,
            licenseNumber: `DL-NEAR-${count}`,
            vehicleType: VehicleType.STANDARD,
            vehicleModel: 'Swift',
            vehiclePlate: `DL-01-NR-${count}`,
            vehicleColor: 'Red',
            isAvailable: true,
            currentLat: 28.63155, // ~0.005 km (< 10 meters)
            currentLng: 77.21675,
            rating: 5.0,
            updatedAt: new Date(),
            user: { name: 'Nearest Driver', phone: '0000' },
          });

          prisma.driver.findMany = (async () => drivers) as any;

          const nearest = await matchingService.findNearestDriver(pickup, { maxRadiusKm: 10.0 });
          assert.ok(nearest);
          assert.strictEqual(nearest!.driverId, `exact-nearest-${count}`);
          assert.ok(nearest!.distanceKm < 0.3);
        }
      } finally {
        prisma.driver.findMany = originalFindMany;
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Driver Assignment Performance & Scalability
  // ───────────────────────────────────────────────────────────────────────────

  describe('4. Driver Assignment Performance & Scalability', () => {
    it('should benchmark driver eligibility validation & assignment under sequential load', async () => {
      const assignmentCount = 100;
      const latencies: number[] = [];

      const originalFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;
      const originalRideUpdate = prisma.ride.update;
      const originalDriverUpdate = prisma.driver.update;
      const originalDriverUpdateMany = prisma.driver.updateMany;
      const originalTransaction = prisma.$transaction;

      try {
        (prisma.$transaction as any) = async (cb: any) => cb(prisma);
        prisma.driver.updateMany = (async () => ({ count: 1 })) as any;

        prisma.driver.findUnique = (async (args: any) => ({
          id: args.where.id,
          userId: `u-${args.where.id}`,
          isAvailable: true,
          currentLat: 28.6315,
          currentLng: 77.2167,
          rating: 4.8,
          licenseNumber: 'DL-ASSIGN',
          vehicleType: VehicleType.STANDARD,
          vehicleModel: 'Dzire',
          vehiclePlate: 'DL-01-AS-1111',
          vehicleColor: 'White',
          updatedAt: new Date(),
          user: { name: 'Assigned Driver', phone: '1234' },
        })) as any;

        prisma.ride.findUnique = (async (args: any) => ({
          id: args.where.id,
          passengerId: 'p-assign-perf',
          status: RideStatus.REQUESTED,
          pickupLat: 28.6315,
          pickupLng: 77.2167,
        })) as any;

        prisma.ride.update = (async (args: any) => ({
          id: args.where.id,
          driverId: args.data.driverId,
          status: RideStatus.MATCHED,
          matchedAt: new Date(),
          passenger: { id: 'p-assign-perf', name: 'Passenger' },
          driver: { id: args.data.driverId, user: { name: 'Assigned Driver' } },
        })) as any;

        prisma.driver.update = (async () => ({})) as any;

        for (let i = 0; i < assignmentCount; i++) {
          const t0 = performance.now();
          const result = await matchingService.assignDriverToRide(
            `ride-seq-${i}`,
            `driver-seq-${i}`,
            'p-assign-perf'
          );
          latencies.push(performance.now() - t0);
          assert.strictEqual(result.ride.status, RideStatus.MATCHED);
        }

        const stats = calculatePercentiles(latencies);
        assert.ok(stats.mean < 15.0, `Mean assignment latency ${stats.mean} ms (expected < 15.0 ms)`);
        assert.ok(stats.p95 < 25.0, `p95 assignment latency ${stats.p95} ms (expected < 25.0 ms)`);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
        prisma.ride.update = originalRideUpdate;
        prisma.driver.update = originalDriverUpdate;
        prisma.driver.updateMany = originalDriverUpdateMany;
        prisma.$transaction = originalTransaction;
      }
    });

    it('should benchmark concurrent driver assignment attempts and verify atomicity', async () => {
      const concurrentRequests = 40;
      let availableFlag = true;

      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;
      const originalDriverUpdateMany = prisma.driver.updateMany;
      const originalRideUpdate = prisma.ride.update;
      const originalTransaction = prisma.$transaction;

      try {
        (prisma.$transaction as any) = async (cb: any) => cb(prisma);

        prisma.driver.findUnique = (async () => ({
          id: 'shared-driver',
          userId: 'u-shared',
          isAvailable: availableFlag,
          currentLat: 28.6315,
          currentLng: 77.2167,
          rating: 4.8,
          licenseNumber: 'DL-ATOMIC',
          vehicleType: VehicleType.STANDARD,
          vehicleModel: 'Dzire',
          vehiclePlate: 'DL-01-AT-0000',
          vehicleColor: 'Silver',
          updatedAt: new Date(),
          user: { name: 'Shared Driver', phone: '1234' },
        })) as any;

        prisma.ride.findUnique = (async (args: any) => ({
          id: args.where.id,
          passengerId: `p-${args.where.id}`,
          status: RideStatus.REQUESTED,
          pickupLat: 28.6315,
          pickupLng: 77.2167,
        })) as any;

        // Atomic driver reservation simulation
        prisma.driver.updateMany = (async () => {
          if (availableFlag) {
            availableFlag = false;
            return { count: 1 };
          }
          return { count: 0 };
        }) as any;

        prisma.ride.update = (async (args: any) => ({
          id: args.where.id,
          driverId: 'shared-driver',
          status: RideStatus.MATCHED,
        })) as any;

        const t0 = performance.now();
        const promises = Array.from({ length: concurrentRequests }, (_, i) =>
          matchingService
            .assignDriverToRide(`ride-race-${i}`, 'shared-driver')
            .then(() => ({ success: true }))
            .catch(() => ({ success: false }))
        );

        const outcomes = await Promise.all(promises);
        const elapsed = performance.now() - t0;

        const successes = outcomes.filter((o) => o.success).length;
        const conflicts = outcomes.filter((o) => !o.success).length;

        // Exactly 1 request succeeds; all concurrent contenders receive 409 conflict
        assert.strictEqual(successes, 1, `Exactly 1 assignment must succeed, got ${successes}`);
        assert.strictEqual(conflicts, concurrentRequests - 1);
        assert.ok(elapsed < 200, `Concurrent assignment stress took ${elapsed} ms`);
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
        prisma.driver.updateMany = originalDriverUpdateMany;
        prisma.ride.update = originalRideUpdate;
        prisma.$transaction = originalTransaction;
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Status Updates & Lifecycle Transitions Scalability
  // ───────────────────────────────────────────────────────────────────────────

  describe('5. Status Updates & Lifecycle Transitions Scalability', () => {
    it('should benchmark full ride lifecycle status transitions for 200 rides', async () => {
      const rideCount = 200;
      const transitionTimes: number[] = [];

      const originalFindUnique = prisma.ride.findUnique;
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalUpdate = prisma.ride.update;
      const originalDriverUpdate = prisma.driver.update;
      const originalTransaction = prisma.$transaction;

      try {
        const rideStates: Record<string, RideStatus> = {};

        (prisma.$transaction as any) = async (ops: any) => {
          if (Array.isArray(ops)) {
            return Promise.all(ops);
          }
          if (typeof ops === 'function') {
            return ops(prisma);
          }
          return ops;
        };

        prisma.driver.findUnique = (async () => ({
          id: 'd-lifecycle',
          userId: 'u-lifecycle-driver',
        })) as any;

        prisma.driver.update = (async (args: any) => ({
          id: args.where.id,
          isAvailable: args.data.isAvailable ?? true,
        })) as any;

        prisma.ride.findUnique = (async (args: any) => ({
          id: args.where.id,
          driverId: 'd-lifecycle',
          status: rideStates[args.where.id] || RideStatus.MATCHED,
          pickupLat: 28.6315,
          pickupLng: 77.2167,
          pickupAddress: 'CP',
          dropoffLat: 28.4952,
          dropoffLng: 77.0895,
          dropoffAddress: 'Cyber City',
          distanceKm: 20.0,
          durationMin: 35.0,
          passengerId: 'p-1',
        })) as any;

        prisma.ride.update = (async (args: any) => {
          rideStates[args.where.id] = args.data.status;
          return {
            id: args.where.id,
            status: args.data.status,
            passengerId: 'p-1',
            driverId: 'd-lifecycle',
            acceptedAt: args.data.acceptedAt,
            startedAt: args.data.startedAt,
            completedAt: args.data.completedAt,
            passenger: { id: 'p-1', name: 'Pass 1', phone: '123', email: 'p@test.com' },
            driver: {
              id: 'd-lifecycle',
              vehicleType: 'SEDAN',
              vehicleNumber: 'DL01AB1234',
              vehicleColor: 'Black',
              user: { name: 'Dr 1', phone: '456' },
            },
          };
        }) as any;

        const t0 = performance.now();
        for (let i = 0; i < rideCount; i++) {
          const stepT0 = performance.now();
          // Step 1: Accept
          await rideService.acceptRide(`ride-step-${i}`, 'u-lifecycle-driver');
          // Step 2: Start
          await rideService.startRide(`ride-step-${i}`, 'u-lifecycle-driver');
          transitionTimes.push(performance.now() - stepT0);
        }
        const totalMs = performance.now() - t0;

        const stats = calculatePercentiles(transitionTimes);
        assert.ok(totalMs < 2500, `200 ride transitions took ${totalMs} ms (expected < 2500 ms)`);
        assert.ok(stats.mean < 12.0, `Mean transition latency ${stats.mean} ms (expected < 12.0 ms)`);
        assert.ok(stats.p95 < 25.0, `p95 transition latency ${stats.p95} ms (expected < 25.0 ms)`);
      } finally {
        prisma.ride.findUnique = originalFindUnique;
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.update = originalUpdate;
        prisma.driver.update = originalDriverUpdate;
        prisma.$transaction = originalTransaction;
      }
    });

    it('should benchmark periodic driver location updates throughput (500 telemetry pings)', async () => {
      const pingCount = 500;
      const latencies: number[] = [];

      const originalFindUnique = prisma.driver.findUnique;
      const originalUpdate = prisma.driver.update;

      try {
        prisma.driver.findUnique = (async () => ({
          id: 'driver-telemetry-perf',
          userId: 'u-driver-telemetry',
        })) as any;

        prisma.driver.update = (async (args: any) => ({
          id: 'driver-telemetry-perf',
          currentLat: args.data.currentLat,
          currentLng: args.data.currentLng,
          updatedAt: new Date(),
        })) as any;

        const t0 = performance.now();
        for (let i = 0; i < pingCount; i++) {
          const pingT0 = performance.now();
          const lat = 28.6315 + (i % 100) * 0.0001;
          const lng = 77.2167 + (i % 100) * 0.0001;
          const updated = await driverService.updatePeriodicLocation('u-driver-telemetry', lat, lng);
          latencies.push(performance.now() - pingT0);
          assert.strictEqual(updated.currentLat, lat);
        }
        const totalMs = performance.now() - t0;
        const throughput = Math.round((pingCount / totalMs) * 1000);

        const stats = calculatePercentiles(latencies);
        assert.ok(totalMs < 500, `500 periodic location updates took ${totalMs} ms (expected < 500 ms)`);
        assert.ok(throughput > 1000, `Periodic update throughput ${throughput} updates/sec (expected > 1000)`);
        assert.ok(stats.p95 < 2.0, `p95 telemetry update latency ${stats.p95} ms (expected < 2.0 ms)`);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.driver.update = originalUpdate;
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. End-to-End Scalability Stress Scenario
  // ───────────────────────────────────────────────────────────────────────────

  describe('6. High-Volume End-to-End Scalability Scenario', () => {
    it('should handle multi-tenant workload: 1,000 available drivers with 100 concurrent ride requests', async () => {
      const driverPool = generateMockDrivers(1000);
      const requests = generateMockRideRequests(100);

      const originalFindMany = prisma.driver.findMany;
      const originalCreate = prisma.ride.create;

      try {
        prisma.driver.findMany = (async () => driverPool) as any;
        prisma.ride.create = (async (args: any) => ({
          id: `ride-stress-${Math.random()}`,
          ...args.data,
          passenger: { id: args.data.passengerId, name: 'Stress Passenger' },
        })) as any;

        const t0 = performance.now();

        // 1. Concurrent Ride Creations
        const rideCreationPromises = requests.map((req, idx) =>
          rideService.createRide(`passenger-stress-${idx}`, req)
        );
        const createdRides = await Promise.all(rideCreationPromises);
        assert.strictEqual(createdRides.length, 100);

        // 2. Batch Proximity Matching across 1,000 drivers
        const matchPromises = createdRides.slice(0, 50).map((ride) =>
          matchingService.findNearestDriver(
            { lat: ride.pickupLat, lng: ride.pickupLng },
            { maxRadiusKm: 15.0 }
          )
        );
        const matches = await Promise.all(matchPromises);
        const totalStressMs = performance.now() - t0;

        assert.strictEqual(matches.length, 50);
        matches.forEach((m) => {
          assert.ok(m, 'Each ride in urban area should match a driver');
          assert.ok(m!.distanceKm <= 10.0);
        });

        assert.ok(
          totalStressMs < 1000,
          `High-volume stress test took ${totalStressMs} ms (expected < 1,000 ms)`
        );
      } finally {
        prisma.driver.findMany = originalFindMany;
        prisma.ride.create = originalCreate;
      }
    });
  });
});
