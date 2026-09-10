import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getPassengerProfile,
  getPassengerRides,
  requestRide,
} from '../controllers/passenger.controller';

const router = Router();

// Protect all passenger routes: require valid token and PASSENGER role
router.use(authenticate, authorize(Role.PASSENGER));

router.get('/profile', getPassengerProfile);
router.get('/rides', getPassengerRides);
router.post('/rides', requestRide);

export default router;
