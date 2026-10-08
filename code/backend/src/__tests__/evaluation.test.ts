import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RideStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { evaluationService } from '../services/evaluation.service';
import { metricsCollector } from '../utils/metricsCollector';
import { responseTimeMiddleware } from '../middleware/metrics.middleware';
import {
  getEvaluationSummary,
  getDriverAssignmentMetrics,
  getApiResponseTimeMetrics,
  getRideRequestSuccessMetrics,
  getMatchingAccuracyMetrics,
  getFareAccuracyMetrics,
  getWorkflowCorrectnessMetrics,
  auditRideWorkflow,
  resetMetrics,
} from '../controllers/evaluation.controller';

// ─── Mock Response Helper ─────────────────────────────────────────────────────

const createMockResponse = () => {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    body: null,
    headersSent: false,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    on(event: string, callback: () => void) {
      if (event === 'finish') {
        this.finishCallback = callback;
      }
      return this;
    },
    triggerFinish() {
      if (this.finishCallback) {
        this.finishCallback();
      }
    },
  };
  return res;
};

describe('Task 37: Evaluation Instrumentation Tests', () => {
  beforeEach(() => {
    metricsCollector.reset();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Driver Assignment Time Measurements
  // ───────────────────────────────────────────────────────────────────────────

  describe('1. Driver Assignment Time Instrumentation', () => {
    it('should measure assignment timestamps and durations accurately', () => {
      const createdAt = new Date('2026-10-08T10:00:00.000Z');
      const matchedAt = new Date('2026-10-08T10:00:05.500Z'); // 5500 ms
      const acceptedAt = new Date('2026-10-08T10:00:12.000Z'); // 6500 ms later

      const ride = {
        id: 'ride-timing-1',
        createdAt,
        matchedAt,
        acceptedAt,
        status: RideStatus.ACCEPTED,
      };

      const timing = evaluationService.measureRideAssignmentTime(ride);

      assert.equal(timing.rideId, 'ride-timing-1');
      assert.equal(timing.requestToMatchMs, 5500);
      assert.equal(timing.matchToAcceptMs, 6500);
      assert.equal(timing.totalAssignmentMs, 12000);
    });

    it('should handle pending rides without matchedAt or acceptedAt', () => {
      const ride = {
        id: 'ride-pending-1',
        createdAt: new Date(),
        matchedAt: null,
        acceptedAt: null,
        status: RideStatus.REQUESTED,
      };

      const timing = evaluationService.measureRideAssignmentTime(ride);

      assert.equal(timing.requestToMatchMs, null);
      assert.equal(timing.matchToAcceptMs, null);
      assert.equal(timing.totalAssignmentMs, null);
    });

    it('should aggregate driver assignment metrics across rides', async () => {
      const originalFindMany = prisma.ride.findMany;

      const base = new Date('2026-10-08T12:00:00.000Z');
      (prisma.ride.findMany as any) = async () => [
        {
          id: 'r1',
          status: RideStatus.COMPLETED,
          createdAt: base,
          matchedAt: new Date(base.getTime() + 4000),
          acceptedAt: new Date(base.getTime() + 10000),
        },
        {
          id: 'r2',
          status: RideStatus.ACCEPTED,
          createdAt: base,
          matchedAt: new Date(base.getTime() + 6000),
          acceptedAt: new Date(base.getTime() + 14000),
        },
        {
          id: 'r3',
          status: RideStatus.REQUESTED,
          createdAt: base,
          matchedAt: null,
          acceptedAt: null,
        },
      ];

      const metrics = await evaluationService.getDriverAssignmentMetrics();

      assert.equal(metrics.totalRidesAnalyzed, 3);
      assert.equal(metrics.matchedRidesCount, 2);
      assert.equal(metrics.acceptedRidesCount, 2);
      assert.equal(metrics.pendingAssignmentCount, 1);
      assert.equal(metrics.avgRequestToMatchMs, 5000); // (4000 + 6000) / 2
      assert.equal(metrics.avgMatchToAcceptMs, 7000);   // (6000 + 8000) / 2
      assert.equal(metrics.avgTotalAssignmentMs, 12000); // (10000 + 14000) / 2
      assert.equal(metrics.minAssignmentMs, 10000);
      assert.equal(metrics.maxAssignmentMs, 14000);

      prisma.ride.findMany = originalFindMany;
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. API Response Time Telemetry & Middleware
  // ───────────────────────────────────────────────────────────────────────────

  describe('2. API Response Time Telemetry', () => {
    it('should record API request duration and calculate statistics', () => {
      metricsCollector.recordRequest('GET', '/api/passenger/rides', '/api/passenger/rides', 200, 45.5);
      metricsCollector.recordRequest('POST', '/api/passenger/rides', '/api/passenger/rides', 201, 85.0);
      metricsCollector.recordRequest('GET', '/api/driver/location', '/api/driver/location', 200, 20.0);
      metricsCollector.recordRequest('GET', '/api/auth/profile', '/api/auth/profile', 401, 15.0);

      const metrics = metricsCollector.getApiResponseMetrics();

      assert.equal(metrics.totalRequests, 4);
      assert.equal(metrics.statusBreakdown.status2xx, 3);
      assert.equal(metrics.statusBreakdown.status4xx, 1);
      assert.equal(metrics.minDurationMs, 15.0);
      assert.equal(metrics.maxDurationMs, 85.0);
      assert.ok(metrics.avgDurationMs > 0);
      assert.equal(metrics.routes.length, 4);
    });

    it('should track slow requests exceeding threshold', () => {
      metricsCollector.recordRequest('POST', '/api/heavy/compute', '/api/heavy/compute', 200, 650.0);
      metricsCollector.recordRequest('GET', '/api/fast/ping', '/api/fast/ping', 200, 10.0);

      const metrics = metricsCollector.getApiResponseMetrics();
      assert.equal(metrics.slowRequestsCount, 1);
      assert.equal(metrics.recentSlowRequests.length, 1);
      assert.equal(metrics.recentSlowRequests[0].durationMs, 650.0);
    });

    it('should reset telemetry metrics properly', () => {
      metricsCollector.recordRequest('GET', '/test', '/test', 200, 50);
      assert.equal(metricsCollector.getApiResponseMetrics().totalRequests, 1);

      metricsCollector.reset();
      assert.equal(metricsCollector.getApiResponseMetrics().totalRequests, 0);
    });

    it('middleware should attach X-Response-Time header and record telemetry', () => {
      const req: any = {
        method: 'GET',
        path: '/api/passenger/profile',
        baseUrl: '/api/passenger',
        route: { path: '/profile' },
      };
      const res = createMockResponse();
      let nextCalled = false;

      responseTimeMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.ok(nextCalled, 'next() should be called');
      res.statusCode = 200;
      res.triggerFinish();

      const metrics = metricsCollector.getApiResponseMetrics();
      assert.equal(metrics.totalRequests, 1);
      assert.equal(metrics.routes[0].route, '/api/passenger/profile');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Ride-Request Success Metrics
  // ───────────────────────────────────────────────────────────────────────────

  describe('3. Ride-Request Success Metrics', () => {
    it('should calculate match rate, completion rate, and cancellation rate correctly', async () => {
      const originalFindMany = prisma.ride.findMany;

      (prisma.ride.findMany as any) = async () => [
        { status: RideStatus.COMPLETED },
        { status: RideStatus.COMPLETED },
        { status: RideStatus.IN_PROGRESS },
        { status: RideStatus.ACCEPTED },
        { status: RideStatus.MATCHED },
        { status: RideStatus.REQUESTED },
        { status: RideStatus.CANCELLED },
      ];

      const successMetrics = await evaluationService.getRideRequestSuccessMetrics();

      assert.equal(successMetrics.totalRequests, 7);
      assert.equal(successMetrics.statusBreakdown.COMPLETED, 2);
      assert.equal(successMetrics.statusBreakdown.CANCELLED, 1);
      assert.equal(successMetrics.statusBreakdown.REQUESTED, 1);

      // Matched or beyond: COMPLETED(2) + IN_PROGRESS(1) + ACCEPTED(1) + MATCHED(1) = 5/7 = 71.43%
      assert.equal(successMetrics.matchRate, 71.43);

      // Completion rate: 2/7 = 28.57%
      assert.equal(successMetrics.completionRate, 28.57);

      // Cancellation rate: 1/7 = 14.29%
      assert.equal(successMetrics.cancellationRate, 14.29);

      assert.ok(successMetrics.successScore > 0 && successMetrics.successScore <= 100);

      prisma.ride.findMany = originalFindMany;
    });

    it('should return defaults for empty database', async () => {
      const originalFindMany = prisma.ride.findMany;
      (prisma.ride.findMany as any) = async () => [];

      const metrics = await evaluationService.getRideRequestSuccessMetrics();
      assert.equal(metrics.totalRequests, 0);
      assert.equal(metrics.matchRate, 100);
      assert.equal(metrics.completionRate, 100);

      prisma.ride.findMany = originalFindMany;
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Matching Accuracy Metrics
  // ───────────────────────────────────────────────────────────────────────────

  describe('4. Matching Accuracy Metrics', () => {
    it('should measure pickup to driver distance and radius adherence', async () => {
      const originalFindMany = prisma.ride.findMany;

      // Connaught Place: 28.6315, 77.2167
      (prisma.ride.findMany as any) = async () => [
        {
          id: 'r-match-1',
          driverId: 'd1',
          pickupLat: 28.6315,
          pickupLng: 77.2167,
          driver: {
            id: 'd1',
            currentLat: 28.6350,
            currentLng: 77.2180, // ~0.4 km away
            vehicleType: VehicleType.STANDARD,
          },
        },
        {
          id: 'r-match-2',
          driverId: 'd2',
          pickupLat: 28.6315,
          pickupLng: 77.2167,
          driver: {
            id: 'd2',
            currentLat: 28.6100,
            currentLng: 77.2300, // ~2.7 km away
            vehicleType: VehicleType.PREMIUM,
          },
        },
      ];

      const metrics = await evaluationService.getMatchingAccuracyMetrics();

      assert.equal(metrics.totalMatchedRides, 2);
      assert.ok(metrics.avgMatchDistanceKm > 0);
      assert.equal(metrics.within1KmCount, 1);
      assert.equal(metrics.within3KmCount, 2);
      assert.equal(metrics.radiusAdherenceRate, 100);

      prisma.ride.findMany = originalFindMany;
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Fare Accuracy Metrics
  // ───────────────────────────────────────────────────────────────────────────

  describe('5. Fare Accuracy Metrics', () => {
    it('should accurately calculate fare discrepancy and MAPE', () => {
      const ride = {
        id: 'r-fare-1',
        pickupLat: 28.6315,
        pickupLng: 77.2167,
        dropoffLat: 28.5355,
        dropoffLng: 77.3910, // ~20.0 km
        distanceKm: 20.0,
        driver: { vehicleType: VehicleType.STANDARD },
      };

      // STANDARD: base = 30, rate = 12. Distance from coords ~20.09km = 30 + (20.09 * 12) = 271.08
      const fare = {
        totalFare: 271.08,
      };

      const item = evaluationService.calculateFareAccuracy(ride, fare);

      assert.equal(item.rideId, 'r-fare-1');
      assert.equal(item.fareVariance, 0);
      assert.equal(item.percentageError, 0);
      assert.equal(item.isAccurate, true);
    });

    it('should detect fare variances when actual fare deviates', () => {
      const ride = {
        id: 'r-fare-deviant',
        pickupLat: 28.6315,
        pickupLng: 77.2167,
        dropoffLat: 28.6315,
        dropoffLng: 77.3167, // ~9.76 km
        distanceKm: 10.0,
        driver: { vehicleType: VehicleType.STANDARD },
      };

      // Base: 30, Rate: 12. Expected ~147.12. If actual is 200:
      const fare = { totalFare: 200.00 };

      const item = evaluationService.calculateFareAccuracy(ride, fare);
      assert.ok(item.fareVariance > 0);
      assert.ok(item.percentageError > 0);
    });

    it('should aggregate fare metrics across completed rides', async () => {
      const originalFindMany = prisma.ride.findMany;

      (prisma.ride.findMany as any) = async () => [
        {
          id: 'rf1',
          pickupLat: 28.6315,
          pickupLng: 77.2167,
          dropoffLat: 28.5355,
          dropoffLng: 77.3910,
          distanceKm: 20.0,
          driver: { vehicleType: VehicleType.STANDARD },
          fare: { totalFare: 270.00 },
        },
      ];

      const metrics = await evaluationService.getFareAccuracyMetrics();
      assert.equal(metrics.totalCompletedFares, 1);
      assert.ok(metrics.fareAccuracyRate >= 0 && metrics.fareAccuracyRate <= 100);

      prisma.ride.findMany = originalFindMany;
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Workflow Correctness & State Transitions
  // ───────────────────────────────────────────────────────────────────────────

  describe('6. Workflow Correctness Verification', () => {
    it('should validate a correct chronological ride workflow', () => {
      const t0 = new Date('2026-10-08T10:00:00.000Z');
      const t1 = new Date('2026-10-08T10:00:05.000Z');
      const t2 = new Date('2026-10-08T10:00:15.000Z');
      const t3 = new Date('2026-10-08T10:05:00.000Z');
      const t4 = new Date('2026-10-08T10:25:00.000Z');

      const validCompletedRide = {
        id: 'r-valid-complete',
        passengerId: 'p1',
        driverId: 'd1',
        status: RideStatus.COMPLETED,
        createdAt: t0,
        matchedAt: t1,
        acceptedAt: t2,
        startedAt: t3,
        completedAt: t4,
        fare: { id: 'f1', totalFare: 250 },
      };

      const audit = evaluationService.validateRideWorkflow(validCompletedRide);
      assert.equal(audit.isValid, true);
      assert.equal(audit.violations.length, 0);
    });

    it('should detect timestamp inversions (e.g. acceptedAt before matchedAt)', () => {
      const t0 = new Date('2026-10-08T10:00:00.000Z');
      const t1 = new Date('2026-10-08T10:00:20.000Z');
      const t2 = new Date('2026-10-08T10:00:05.000Z'); // Inversion!

      const brokenRide = {
        id: 'r-inverted',
        passengerId: 'p1',
        driverId: 'd1',
        status: RideStatus.ACCEPTED,
        createdAt: t0,
        matchedAt: t1,
        acceptedAt: t2,
      };

      const audit = evaluationService.validateRideWorkflow(brokenRide);
      assert.equal(audit.isValid, false);
      assert.ok(audit.violations.some((v) => v.includes('acceptedAt') && v.includes('matchedAt')));
    });

    it('should detect state invariants violations (e.g. MATCHED without driver)', () => {
      const invalidRide = {
        id: 'r-no-driver',
        passengerId: 'p1',
        driverId: null, // Violation for MATCHED status
        status: RideStatus.MATCHED,
        createdAt: new Date(),
      };

      const audit = evaluationService.validateRideWorkflow(invalidRide);
      assert.equal(audit.isValid, false);
      assert.ok(audit.violations.some((v) => v.includes('driverId')));
    });

    it('should aggregate workflow correctness metrics', async () => {
      const originalFindMany = prisma.ride.findMany;

      (prisma.ride.findMany as any) = async () => [
        {
          id: 'r1',
          driverId: 'd1',
          status: RideStatus.ACCEPTED,
          createdAt: new Date(),
          matchedAt: new Date(),
          acceptedAt: new Date(),
        },
        {
          id: 'r2',
          driverId: null,
          status: RideStatus.MATCHED, // invalid
          createdAt: new Date(),
        },
      ];

      const metrics = await evaluationService.getWorkflowCorrectnessMetrics();
      assert.equal(metrics.totalRidesAudited, 2);
      assert.equal(metrics.validRidesCount, 1);
      assert.equal(metrics.invalidRidesCount, 1);
      assert.equal(metrics.workflowComplianceRate, 50.0);

      prisma.ride.findMany = originalFindMany;
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. System Evaluation Summary & Controllers
  // ───────────────────────────────────────────────────────────────────────────

  describe('7. System Evaluation Summary & Controller Endpoints', () => {
    it('getEvaluationSummary should return consolidated evaluation report', async () => {
      const originalFindMany = prisma.ride.findMany;
      (prisma.ride.findMany as any) = async () => [];

      const req: any = {};
      const res = createMockResponse();

      await getEvaluationSummary(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.driverAssignment);
      assert.ok(res.body.data.apiResponseTime);
      assert.ok(res.body.data.rideRequestSuccess);
      assert.ok(res.body.data.matchingAccuracy);
      assert.ok(res.body.data.fareAccuracy);
      assert.ok(res.body.data.workflowCorrectness);
      assert.ok(res.body.data.overallHealthScore !== undefined);

      prisma.ride.findMany = originalFindMany;
    });

    it('all specific pillar endpoints should return status 200', async () => {
      const originalFindMany = prisma.ride.findMany;
      (prisma.ride.findMany as any) = async () => [];

      const endpoints = [
        getDriverAssignmentMetrics,
        getApiResponseTimeMetrics,
        getRideRequestSuccessMetrics,
        getMatchingAccuracyMetrics,
        getFareAccuracyMetrics,
        getWorkflowCorrectnessMetrics,
      ];

      for (const handler of endpoints) {
        const req: any = {};
        const res = createMockResponse();
        await handler(req, res, () => {});
        assert.equal(res.statusCode, 200, `Handler ${handler.name} should return 200`);
        assert.equal(res.body.success, true);
      }

      prisma.ride.findMany = originalFindMany;
    });

    it('auditRideWorkflow should audit specific ride or return 404', async () => {
      const originalFindUnique = prisma.ride.findUnique;

      // Case 1: Ride found
      (prisma.ride.findUnique as any) = async () => ({
        id: 'r-audit-test',
        passengerId: 'p1',
        driverId: null,
        status: RideStatus.REQUESTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req: any = { params: { id: 'r-audit-test' } };
      const res = createMockResponse();

      await auditRideWorkflow(req, res, () => {});
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.rideId, 'r-audit-test');
      assert.equal(res.body.data.isValid, true);

      // Case 2: Ride not found
      (prisma.ride.findUnique as any) = async () => null;
      let errorThrown: any = null;
      await auditRideWorkflow(req, res, (err: any) => {
        errorThrown = err;
      });
      assert.ok(errorThrown);
      assert.equal(errorThrown.statusCode, 404);

      prisma.ride.findUnique = originalFindUnique;
    });

    it('resetMetrics endpoint should clear telemetry metrics', async () => {
      metricsCollector.recordRequest('GET', '/test', '/test', 200, 25);
      assert.equal(metricsCollector.getApiResponseMetrics().totalRequests, 1);

      const req: any = {};
      const res = createMockResponse();
      await resetMetrics(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(metricsCollector.getApiResponseMetrics().totalRequests, 0);
    });
  });
});
