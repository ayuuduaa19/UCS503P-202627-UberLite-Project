import { RideStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { calculateDistance, calculateRideDistance } from '../utils/location';
import { FARE_RULES } from './fare.service';
import { metricsCollector, ApiResponseTimeMetrics } from '../utils/metricsCollector';

// ─── Interfaces for Evaluation Metrics ────────────────────────────────────────

export interface DriverAssignmentTiming {
  rideId: string;
  requestedAt: Date;
  matchedAt: Date | null;
  acceptedAt: Date | null;
  requestToMatchMs: number | null;
  matchToAcceptMs: number | null;
  totalAssignmentMs: number | null;
}

export interface DriverAssignmentMetrics {
  totalRidesAnalyzed: number;
  matchedRidesCount: number;
  acceptedRidesCount: number;
  pendingAssignmentCount: number;
  avgRequestToMatchMs: number;
  avgMatchToAcceptMs: number;
  avgTotalAssignmentMs: number;
  minAssignmentMs: number;
  maxAssignmentMs: number;
  p95AssignmentMs: number;
  sampleRides: DriverAssignmentTiming[];
}

export interface RideRequestSuccessMetrics {
  totalRequests: number;
  statusBreakdown: Record<RideStatus, number>;
  matchRate: number;        // % of rides matched
  acceptanceRate: number;   // % of matched rides accepted
  completionRate: number;   // % of rides completed
  cancellationRate: number; // % of rides cancelled
  successScore: number;     // 0 - 100 rating
}

export interface MatchingAccuracyMetricItem {
  rideId: string;
  driverId: string;
  pickupLat: number;
  pickupLng: number;
  driverLat: number | null;
  driverLng: number | null;
  distanceKm: number | null;
  withinSearchRadius: boolean;
  vehicleType: VehicleType;
}

export interface MatchingAccuracyMetrics {
  totalMatchedRides: number;
  avgMatchDistanceKm: number;
  minMatchDistanceKm: number;
  maxMatchDistanceKm: number;
  within1KmCount: number;
  within3KmCount: number;
  within5KmCount: number;
  within10KmCount: number;
  radiusAdherenceRate: number; // % of matches within standard 10km radius
  sampleMatches: MatchingAccuracyMetricItem[];
}

export interface FareAccuracyItem {
  rideId: string;
  vehicleType: VehicleType;
  estimatedDistanceKm: number;
  actualDistanceKm: number;
  distanceVarianceKm: number;
  estimatedFare: number;
  actualFare: number;
  fareVariance: number;
  percentageError: number;
  isAccurate: boolean; // within 5% tolerance
}

export interface FareAccuracyMetrics {
  totalCompletedFares: number;
  meanAbsoluteFareError: number;        // INR
  meanAbsolutePercentageError: number;  // %
  avgDistanceVarianceKm: number;
  fareAccuracyRate: number;             // % within ±5% tolerance
  exactMatchRate: number;               // % exact matches (0 variance)
  sampleFares: FareAccuracyItem[];
}

export interface WorkflowAuditResult {
  rideId: string;
  currentStatus: RideStatus;
  isValid: boolean;
  violations: string[];
  warnings: string[];
  timestamps: {
    createdAt: Date;
    matchedAt: Date | null;
    acceptedAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
  };
}

export interface WorkflowCorrectnessMetrics {
  totalRidesAudited: number;
  validRidesCount: number;
  invalidRidesCount: number;
  workflowComplianceRate: number; // %
  violationBreakdown: Record<string, number>;
  sampleAudits: WorkflowAuditResult[];
}

export interface SystemEvaluationSummary {
  timestamp: string;
  driverAssignment: DriverAssignmentMetrics;
  apiResponseTime: ApiResponseTimeMetrics;
  rideRequestSuccess: RideRequestSuccessMetrics;
  matchingAccuracy: MatchingAccuracyMetrics;
  fareAccuracy: FareAccuracyMetrics;
  workflowCorrectness: WorkflowCorrectnessMetrics;
  overallHealthScore: number;
}

// ─── Evaluation Service Implementation ────────────────────────────────────────

export class EvaluationService {
  /**
   * Helper: calculate percentile from sorted numbers
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (lower === upper) return sorted[lower];
    return parseFloat((sorted[lower] * (1 - weight) + sorted[upper] * weight).toFixed(2));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. DRIVER ASSIGNMENT TIME
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Measure driver assignment timing for a single ride
   */
  measureRideAssignmentTime(ride: any): DriverAssignmentTiming {
    const requestedAt = new Date(ride.createdAt);
    const matchedAt = ride.matchedAt ? new Date(ride.matchedAt) : null;
    const acceptedAt = ride.acceptedAt ? new Date(ride.acceptedAt) : null;

    const requestToMatchMs = matchedAt ? Math.max(0, matchedAt.getTime() - requestedAt.getTime()) : null;
    const matchToAcceptMs = matchedAt && acceptedAt ? Math.max(0, acceptedAt.getTime() - matchedAt.getTime()) : null;
    const totalAssignmentMs = acceptedAt ? Math.max(0, acceptedAt.getTime() - requestedAt.getTime()) : null;

    return {
      rideId: ride.id,
      requestedAt,
      matchedAt,
      acceptedAt,
      requestToMatchMs,
      matchToAcceptMs,
      totalAssignmentMs,
    };
  }

  /**
   * Get aggregated Driver Assignment Time metrics across all rides
   */
  async getDriverAssignmentMetrics(): Promise<DriverAssignmentMetrics> {
    let rides: any[] = [];
    try {
      rides = await prisma.ride.findMany({
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          matchedAt: true,
          acceptedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    } catch {
      rides = [];
    }

    if (rides.length === 0) {
      return {
        totalRidesAnalyzed: 0,
        matchedRidesCount: 0,
        acceptedRidesCount: 0,
        pendingAssignmentCount: 0,
        avgRequestToMatchMs: 0,
        avgMatchToAcceptMs: 0,
        avgTotalAssignmentMs: 0,
        minAssignmentMs: 0,
        maxAssignmentMs: 0,
        p95AssignmentMs: 0,
        sampleRides: [],
      };
    }

    const timings: DriverAssignmentTiming[] = [];
    const matchTimes: number[] = [];
    const acceptTimes: number[] = [];
    const totalTimes: number[] = [];
    let pendingCount = 0;

    for (const r of rides) {
      const timing = this.measureRideAssignmentTime(r);
      timings.push(timing);

      if (timing.requestToMatchMs !== null) matchTimes.push(timing.requestToMatchMs);
      if (timing.matchToAcceptMs !== null) acceptTimes.push(timing.matchToAcceptMs);
      if (timing.totalAssignmentMs !== null) totalTimes.push(timing.totalAssignmentMs);
      if (r.status === RideStatus.REQUESTED) pendingCount++;
    }

    totalTimes.sort((a, b) => a - b);
    const sumMatch = matchTimes.reduce((a, b) => a + b, 0);
    const sumAccept = acceptTimes.reduce((a, b) => a + b, 0);
    const sumTotal = totalTimes.reduce((a, b) => a + b, 0);

    return {
      totalRidesAnalyzed: rides.length,
      matchedRidesCount: matchTimes.length,
      acceptedRidesCount: totalTimes.length,
      pendingAssignmentCount: pendingCount,
      avgRequestToMatchMs: matchTimes.length > 0 ? parseFloat((sumMatch / matchTimes.length).toFixed(2)) : 0,
      avgMatchToAcceptMs: acceptTimes.length > 0 ? parseFloat((sumAccept / acceptTimes.length).toFixed(2)) : 0,
      avgTotalAssignmentMs: totalTimes.length > 0 ? parseFloat((sumTotal / totalTimes.length).toFixed(2)) : 0,
      minAssignmentMs: totalTimes.length > 0 ? totalTimes[0] : 0,
      maxAssignmentMs: totalTimes.length > 0 ? totalTimes[totalTimes.length - 1] : 0,
      p95AssignmentMs: this.percentile(totalTimes, 95),
      sampleRides: timings.slice(0, 15),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. API RESPONSE TIME
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get API Response Time metrics from the telemetry collector
   */
  getApiResponseTimeMetrics(): ApiResponseTimeMetrics {
    return metricsCollector.getApiResponseMetrics();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. RIDE-REQUEST SUCCESS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get Ride-Request Success metrics
   */
  async getRideRequestSuccessMetrics(): Promise<RideRequestSuccessMetrics> {
    let rides: any[] = [];
    try {
      rides = await prisma.ride.findMany({
        select: { status: true },
      });
    } catch {
      rides = [];
    }

    const statusBreakdown: Record<RideStatus, number> = {
      [RideStatus.REQUESTED]: 0,
      [RideStatus.MATCHED]: 0,
      [RideStatus.ACCEPTED]: 0,
      [RideStatus.IN_PROGRESS]: 0,
      [RideStatus.COMPLETED]: 0,
      [RideStatus.CANCELLED]: 0,
    };

    for (const r of rides) {
      if (statusBreakdown[r.status as RideStatus] !== undefined) {
        statusBreakdown[r.status as RideStatus]++;
      }
    }

    const total = rides.length;
    if (total === 0) {
      return {
        totalRequests: 0,
        statusBreakdown,
        matchRate: 100,
        acceptanceRate: 100,
        completionRate: 100,
        cancellationRate: 0,
        successScore: 100,
      };
    }

    const matchedOrBeyond =
      statusBreakdown[RideStatus.MATCHED] +
      statusBreakdown[RideStatus.ACCEPTED] +
      statusBreakdown[RideStatus.IN_PROGRESS] +
      statusBreakdown[RideStatus.COMPLETED];

    const acceptedOrBeyond =
      statusBreakdown[RideStatus.ACCEPTED] +
      statusBreakdown[RideStatus.IN_PROGRESS] +
      statusBreakdown[RideStatus.COMPLETED];

    const matchRate = parseFloat(((matchedOrBeyond / total) * 100).toFixed(2));
    const acceptanceRate = matchedOrBeyond > 0
      ? parseFloat(((acceptedOrBeyond / matchedOrBeyond) * 100).toFixed(2))
      : 100;
    const completionRate = parseFloat(((statusBreakdown[RideStatus.COMPLETED] / total) * 100).toFixed(2));
    const cancellationRate = parseFloat(((statusBreakdown[RideStatus.CANCELLED] / total) * 100).toFixed(2));

    // Composite success score calculation (weighting completion, match rate, low cancellation)
    const successScore = parseFloat(
      Math.max(0, Math.min(100, matchRate * 0.4 + completionRate * 0.4 + (100 - cancellationRate) * 0.2)).toFixed(2)
    );

    return {
      totalRequests: total,
      statusBreakdown,
      matchRate,
      acceptanceRate,
      completionRate,
      cancellationRate,
      successScore,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. MATCHING ACCURACY
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get Matching Accuracy metrics (distance to driver at match time, radius adherence)
   */
  async getMatchingAccuracyMetrics(): Promise<MatchingAccuracyMetrics> {
    let rides: any[] = [];
    try {
      rides = await prisma.ride.findMany({
        where: { driverId: { not: null } },
        include: {
          driver: {
            select: {
              id: true,
              currentLat: true,
              currentLng: true,
              vehicleType: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    } catch {
      rides = [];
    }

    if (rides.length === 0) {
      return {
        totalMatchedRides: 0,
        avgMatchDistanceKm: 0,
        minMatchDistanceKm: 0,
        maxMatchDistanceKm: 0,
        within1KmCount: 0,
        within3KmCount: 0,
        within5KmCount: 0,
        within10KmCount: 0,
        radiusAdherenceRate: 100,
        sampleMatches: [],
      };
    }

    const matches: MatchingAccuracyMetricItem[] = [];
    const distances: number[] = [];
    let within1Km = 0;
    let within3Km = 0;
    let within5Km = 0;
    let within10Km = 0;

    for (const r of rides) {
      let dist: number | null = null;
      let withinRadius = true;

      if (
        r.driver &&
        r.driver.currentLat !== null &&
        r.driver.currentLng !== null &&
        r.pickupLat !== null &&
        r.pickupLng !== null
      ) {
        dist = calculateDistance(
          { lat: r.pickupLat, lng: r.pickupLng },
          { lat: r.driver.currentLat, lng: r.driver.currentLng },
          { unit: 'km', decimals: 2 }
        );
        distances.push(dist);

        if (dist <= 1.0) within1Km++;
        if (dist <= 3.0) within3Km++;
        if (dist <= 5.0) within5Km++;
        if (dist <= 10.0) within10Km++;
        else withinRadius = false;
      }

      matches.push({
        rideId: r.id,
        driverId: r.driverId || '',
        pickupLat: r.pickupLat,
        pickupLng: r.pickupLng,
        driverLat: r.driver?.currentLat ?? null,
        driverLng: r.driver?.currentLng ?? null,
        distanceKm: dist,
        withinSearchRadius: withinRadius,
        vehicleType: r.driver?.vehicleType || VehicleType.STANDARD,
      });
    }

    distances.sort((a, b) => a - b);
    const sumDist = distances.reduce((a, b) => a + b, 0);
    const avgDist = distances.length > 0 ? parseFloat((sumDist / distances.length).toFixed(2)) : 0;
    const adherenceRate = distances.length > 0
      ? parseFloat(((within10Km / distances.length) * 100).toFixed(2))
      : 100;

    return {
      totalMatchedRides: rides.length,
      avgMatchDistanceKm: avgDist,
      minMatchDistanceKm: distances.length > 0 ? distances[0] : 0,
      maxMatchDistanceKm: distances.length > 0 ? distances[distances.length - 1] : 0,
      within1KmCount: within1Km,
      within3KmCount: within3Km,
      within5KmCount: within5Km,
      within10KmCount: within10Km,
      radiusAdherenceRate: adherenceRate,
      sampleMatches: matches.slice(0, 15),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. FARE ACCURACY
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Calculate fare accuracy for a single completed ride with fare
   */
  calculateFareAccuracy(ride: any, fare: any): FareAccuracyItem {
    const pickup = { lat: ride.pickupLat, lng: ride.pickupLng };
    const dropoff = { lat: ride.dropoffLat, lng: ride.dropoffLng };
    const vehicleType: VehicleType = ride.driver?.vehicleType || VehicleType.STANDARD;

    const estimatedDistanceKm = calculateRideDistance(pickup, dropoff, 2);
    const rules = FARE_RULES[vehicleType] || FARE_RULES[VehicleType.STANDARD];
    const estimatedFare = parseFloat((rules.baseFare + estimatedDistanceKm * rules.ratePerKm).toFixed(2));

    const actualDistanceKm = ride.distanceKm !== null && ride.distanceKm !== undefined
      ? parseFloat(Number(ride.distanceKm).toFixed(2))
      : estimatedDistanceKm;
    const actualFare = fare ? parseFloat(Number(fare.totalFare).toFixed(2)) : estimatedFare;

    const distanceVarianceKm = parseFloat(Math.abs(actualDistanceKm - estimatedDistanceKm).toFixed(2));
    const fareVariance = parseFloat(Math.abs(actualFare - estimatedFare).toFixed(2));
    const percentageError = estimatedFare > 0
      ? parseFloat(((fareVariance / estimatedFare) * 100).toFixed(2))
      : 0;

    return {
      rideId: ride.id,
      vehicleType,
      estimatedDistanceKm,
      actualDistanceKm,
      distanceVarianceKm,
      estimatedFare,
      actualFare,
      fareVariance,
      percentageError,
      isAccurate: percentageError <= 5.0,
    };
  }

  /**
   * Get aggregated Fare Accuracy metrics across completed rides
   */
  async getFareAccuracyMetrics(): Promise<FareAccuracyMetrics> {
    let ridesWithFares: any[] = [];
    try {
      ridesWithFares = await prisma.ride.findMany({
        where: {
          status: RideStatus.COMPLETED,
          fare: { isNot: null },
        },
        include: {
          fare: true,
          driver: { select: { vehicleType: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    } catch {
      ridesWithFares = [];
    }

    if (ridesWithFares.length === 0) {
      return {
        totalCompletedFares: 0,
        meanAbsoluteFareError: 0,
        meanAbsolutePercentageError: 0,
        avgDistanceVarianceKm: 0,
        fareAccuracyRate: 100,
        exactMatchRate: 100,
        sampleFares: [],
      };
    }

    const fareItems: FareAccuracyItem[] = [];
    let sumFareError = 0;
    let sumPercentError = 0;
    let sumDistVariance = 0;
    let accurateCount = 0;
    let exactCount = 0;

    for (const r of ridesWithFares) {
      const item = this.calculateFareAccuracy(r, r.fare);
      fareItems.push(item);

      sumFareError += item.fareVariance;
      sumPercentError += item.percentageError;
      sumDistVariance += item.distanceVarianceKm;

      if (item.isAccurate) accurateCount++;
      if (item.fareVariance === 0) exactCount++;
    }

    const n = fareItems.length;
    return {
      totalCompletedFares: n,
      meanAbsoluteFareError: parseFloat((sumFareError / n).toFixed(2)),
      meanAbsolutePercentageError: parseFloat((sumPercentError / n).toFixed(2)),
      avgDistanceVarianceKm: parseFloat((sumDistVariance / n).toFixed(2)),
      fareAccuracyRate: parseFloat(((accurateCount / n) * 100).toFixed(2)),
      exactMatchRate: parseFloat(((exactCount / n) * 100).toFixed(2)),
      sampleFares: fareItems.slice(0, 15),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. WORKFLOW CORRECTNESS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Audit an individual ride's workflow integrity and state transitions
   */
  validateRideWorkflow(ride: any): WorkflowAuditResult {
    const violations: string[] = [];
    const warnings: string[] = [];

    const createdAt = new Date(ride.createdAt);
    const matchedAt = ride.matchedAt ? new Date(ride.matchedAt) : null;
    const acceptedAt = ride.acceptedAt ? new Date(ride.acceptedAt) : null;
    const startedAt = ride.startedAt ? new Date(ride.startedAt) : null;
    const completedAt = ride.completedAt ? new Date(ride.completedAt) : null;
    const cancelledAt = ride.cancelledAt ? new Date(ride.cancelledAt) : null;

    // Invariant 1: State machine requirements
    switch (ride.status) {
      case RideStatus.REQUESTED:
        if (ride.driverId) {
          violations.push('Ride in REQUESTED status should not have an assigned driver');
        }
        break;

      case RideStatus.MATCHED:
        if (!ride.driverId) {
          violations.push('Ride in MATCHED status must have an assigned driverId');
        }
        break;

      case RideStatus.ACCEPTED:
        if (!ride.driverId) {
          violations.push('Ride in ACCEPTED status must have an assigned driverId');
        }
        break;

      case RideStatus.IN_PROGRESS:
        if (!ride.driverId) {
          violations.push('Ride in IN_PROGRESS status must have an assigned driverId');
        }
        break;

      case RideStatus.COMPLETED:
        if (!ride.driverId) {
          violations.push('Completed ride must have an assigned driverId');
        }
        break;

      case RideStatus.CANCELLED:
        // Cancelled rides are valid
        break;

      default:
        violations.push(`Unknown ride status: ${ride.status}`);
    }

    // Invariant 2: Timestamp chronological order
    if (matchedAt && matchedAt.getTime() < createdAt.getTime() - 1000) {
      violations.push(`matchedAt (${matchedAt.toISOString()}) occurs before createdAt (${createdAt.toISOString()})`);
    }

    if (matchedAt && acceptedAt && acceptedAt.getTime() < matchedAt.getTime() - 1000) {
      violations.push(`acceptedAt (${acceptedAt.toISOString()}) occurs before matchedAt (${matchedAt.toISOString()})`);
    }

    if (acceptedAt && startedAt && startedAt.getTime() < acceptedAt.getTime() - 1000) {
      violations.push(`startedAt (${startedAt.toISOString()}) occurs before acceptedAt (${acceptedAt.toISOString()})`);
    }

    if (startedAt && completedAt && completedAt.getTime() < startedAt.getTime() - 1000) {
      violations.push(`completedAt (${completedAt.toISOString()}) occurs before startedAt (${startedAt.toISOString()})`);
    }

    // Invariant 3: Fare presence on completion
    if (ride.status === RideStatus.COMPLETED && !ride.fare) {
      warnings.push('Completed ride does not have a persisted Fare record attached');
    }

    return {
      rideId: ride.id,
      currentStatus: ride.status,
      isValid: violations.length === 0,
      violations,
      warnings,
      timestamps: {
        createdAt,
        matchedAt,
        acceptedAt,
        startedAt,
        completedAt,
        cancelledAt,
      },
    };
  }

  /**
   * Get aggregated Workflow Correctness metrics across all rides in the system
   */
  async getWorkflowCorrectnessMetrics(): Promise<WorkflowCorrectnessMetrics> {
    let rides: any[] = [];
    try {
      rides = await prisma.ride.findMany({
        include: { fare: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    } catch {
      rides = [];
    }

    if (rides.length === 0) {
      return {
        totalRidesAudited: 0,
        validRidesCount: 0,
        invalidRidesCount: 0,
        workflowComplianceRate: 100,
        violationBreakdown: {},
        sampleAudits: [],
      };
    }

    const audits: WorkflowAuditResult[] = [];
    let validCount = 0;
    const violationBreakdown: Record<string, number> = {};

    for (const r of rides) {
      const audit = this.validateRideWorkflow(r);
      audits.push(audit);

      if (audit.isValid) {
        validCount++;
      } else {
        for (const v of audit.violations) {
          violationBreakdown[v] = (violationBreakdown[v] || 0) + 1;
        }
      }
    }

    const complianceRate = parseFloat(((validCount / rides.length) * 100).toFixed(2));

    return {
      totalRidesAudited: rides.length,
      validRidesCount: validCount,
      invalidRidesCount: rides.length - validCount,
      workflowComplianceRate: complianceRate,
      violationBreakdown,
      sampleAudits: audits.slice(0, 15),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. COMPREHENSIVE SYSTEM EVALUATION SUMMARY
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate complete unified evaluation report covering all 6 pillars
   */
  async getSystemEvaluationSummary(): Promise<SystemEvaluationSummary> {
    const [
      driverAssignment,
      rideRequestSuccess,
      matchingAccuracy,
      fareAccuracy,
      workflowCorrectness,
    ] = await Promise.all([
      this.getDriverAssignmentMetrics(),
      this.getRideRequestSuccessMetrics(),
      this.getMatchingAccuracyMetrics(),
      this.getFareAccuracyMetrics(),
      this.getWorkflowCorrectnessMetrics(),
    ]);

    const apiResponseTime = this.getApiResponseTimeMetrics();

    // Composite health score calculation (weighted avg of individual compliance rates)
    const overallHealthScore = parseFloat(
      (
        rideRequestSuccess.successScore * 0.25 +
        matchingAccuracy.radiusAdherenceRate * 0.25 +
        fareAccuracy.fareAccuracyRate * 0.25 +
        workflowCorrectness.workflowComplianceRate * 0.25
      ).toFixed(2)
    );

    return {
      timestamp: new Date().toISOString(),
      driverAssignment,
      apiResponseTime,
      rideRequestSuccess,
      matchingAccuracy,
      fareAccuracy,
      workflowCorrectness,
      overallHealthScore,
    };
  }
}

export const evaluationService = new EvaluationService();
