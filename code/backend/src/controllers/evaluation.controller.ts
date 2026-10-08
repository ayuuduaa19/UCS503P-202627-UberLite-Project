import { Request, Response, NextFunction } from 'express';
import { evaluationService } from '../services/evaluation.service';
import { metricsCollector } from '../utils/metricsCollector';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

/**
 * Get comprehensive evaluation report covering all 6 pillars:
 * driver assignment time, API response time, ride-request success,
 * matching accuracy, fare accuracy, and workflow correctness.
 */
export const getEvaluationSummary = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const summary = await evaluationService.getSystemEvaluationSummary();
    return res.status(200).json({
      success: true,
      message: 'System evaluation metrics retrieved successfully',
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Driver Assignment Time metrics
 */
export const getDriverAssignmentMetrics = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const metrics = await evaluationService.getDriverAssignmentMetrics();
    return res.status(200).json({
      success: true,
      message: 'Driver assignment timing metrics retrieved successfully',
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get API Response Time metrics from telemetry collector
 */
export const getApiResponseTimeMetrics = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const metrics = evaluationService.getApiResponseTimeMetrics();
    return res.status(200).json({
      success: true,
      message: 'API response time metrics retrieved successfully',
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Ride Request Success metrics
 */
export const getRideRequestSuccessMetrics = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const metrics = await evaluationService.getRideRequestSuccessMetrics();
    return res.status(200).json({
      success: true,
      message: 'Ride request success metrics retrieved successfully',
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Matching Accuracy metrics
 */
export const getMatchingAccuracyMetrics = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const metrics = await evaluationService.getMatchingAccuracyMetrics();
    return res.status(200).json({
      success: true,
      message: 'Matching accuracy metrics retrieved successfully',
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Fare Accuracy metrics
 */
export const getFareAccuracyMetrics = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const metrics = await evaluationService.getFareAccuracyMetrics();
    return res.status(200).json({
      success: true,
      message: 'Fare accuracy metrics retrieved successfully',
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Workflow Correctness metrics
 */
export const getWorkflowCorrectnessMetrics = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const metrics = await evaluationService.getWorkflowCorrectnessMetrics();
    return res.status(200).json({
      success: true,
      message: 'Workflow correctness metrics retrieved successfully',
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Audit workflow correctness for an individual ride by ID
 */
export const auditRideWorkflow = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const ride = await prisma.ride.findUnique({
      where: { id },
      include: {
        driver: true,
        fare: true,
      },
    });

    if (!ride) {
      throw new AppError('Ride not found', 404);
    }

    const audit = evaluationService.validateRideWorkflow(ride);
    return res.status(200).json({
      success: true,
      message: 'Ride workflow audit completed',
      data: audit,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset in-memory telemetry metrics
 */
export const resetMetrics = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    metricsCollector.reset();
    return res.status(200).json({
      success: true,
      message: 'Telemetry metrics have been reset',
    });
  } catch (error) {
    next(error);
  }
};
