import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getPassengerProfile,
  getPassengerRides,
  requestRide,
  getRideDetails,
  matchRideWithDriver,
  assignRideDriver,
  getNearbyDrivers,
} from '../controllers/passenger.controller';

const router = Router();
router.use(authenticate, authorize(Role.PASSENGER));

router.get('/profile', getPassengerProfile);
router.get('/rides', getPassengerRides);
router.post('/rides', requestRide);
router.get('/rides/:id', getRideDetails);

// Location-based matching and nearby driver discovery endpoints
router.post('/rides/:id/match', matchRideWithDriver);
router.post('/rides/:id/assign', assignRideDriver);
router.post('/drivers/nearby', getNearbyDrivers);

export default router;

