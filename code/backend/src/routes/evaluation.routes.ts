import { Router } from 'express';
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

const router = Router();

// Evaluation summary
router.get('/summary', getEvaluationSummary);
router.get('/metrics', getEvaluationSummary);

// Specific evaluation pillars
router.get('/assignment-time', getDriverAssignmentMetrics);
router.get('/api-response-time', getApiResponseTimeMetrics);
router.get('/ride-success', getRideRequestSuccessMetrics);
router.get('/matching-accuracy', getMatchingAccuracyMetrics);
router.get('/fare-accuracy', getFareAccuracyMetrics);
router.get('/workflow-correctness', getWorkflowCorrectnessMetrics);

// Individual ride workflow audit
router.get('/rides/:id/workflow', auditRideWorkflow);

// Metrics reset (for testing/benchmarking)
router.post('/reset-metrics', resetMetrics);

export default router;
