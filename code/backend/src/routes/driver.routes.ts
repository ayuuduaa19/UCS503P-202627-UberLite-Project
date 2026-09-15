import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getDriverProfile,
  getAvailability,
  updateAvailability,
  getDriverLocation,
  updateDriverLocation,
  getDriverRides,
} from '../controllers/driver.controller';

const router = Router();
router.use(authenticate, authorize(Role.DRIVER));

router.get('/profile', getDriverProfile);
router.get('/availability', getAvailability);
router.patch('/availability', updateAvailability);
router.put('/availability', updateAvailability);
router.get('/location', getDriverLocation);
router.patch('/location', updateDriverLocation);
router.put('/location', updateDriverLocation);
router.get('/rides', getDriverRides);

export default router;
