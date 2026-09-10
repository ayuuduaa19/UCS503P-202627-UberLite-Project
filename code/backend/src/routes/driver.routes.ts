import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getDriverProfile,
  updateAvailability,
  getDriverRides,
} from '../controllers/driver.controller';

const router = Router();

// Protect all driver routes: require valid token and DRIVER role
router.use(authenticate, authorize(Role.DRIVER));

router.get('/profile', getDriverProfile);
router.patch('/availability', updateAvailability);
router.get('/rides', getDriverRides);

export default router;
