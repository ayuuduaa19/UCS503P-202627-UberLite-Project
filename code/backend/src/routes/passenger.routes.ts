import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getPassengerProfile,
  getPassengerRides,
  getPassengerRideHistory,
  requestRide,
  getRideDetails,
  matchRideWithDriver,
  assignRideDriver,
  getNearbyDrivers,
  estimateRideFare,
  estimateFare,
  submitRideFeedback,
  getRideFeedback,
} from '../controllers/passenger.controller';

const router = Router();
router.use(authenticate, authorize(Role.PASSENGER));

router.get('/profile', getPassengerProfile);

// Ride history endpoints (Task #19)
router.get('/rides/history', getPassengerRideHistory);
router.get('/rides', getPassengerRides);
router.post('/rides', requestRide);
router.get('/rides/:id', getRideDetails);

// Feedback and rating endpoints (Task #20)
router.post('/rides/:id/feedback', submitRideFeedback);
router.post('/rides/:id/rate', submitRideFeedback);
router.get('/rides/:id/feedback', getRideFeedback);

// Location-based matching and nearby driver discovery endpoints
router.post('/rides/:id/match', matchRideWithDriver);
router.post('/rides/:id/assign', assignRideDriver);
router.post('/drivers/nearby', getNearbyDrivers);

// Fare estimation endpoints (task #17)
router.get('/rides/:id/fare/estimate', estimateRideFare);
router.post('/fare/estimate', estimateFare);
router.post('/rides/fare/estimate', estimateFare);

export default router;

