import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getDriverProfile,
  getDriverAvailability,
  getAvailability,
  updateAvailability,
  getDriverLocation,
  updateLocation,
  updateDriverLocation,
  updateDriverStatus,
  getDriverRides,
} from '../controllers/driver.controller';

const router = Router();
router.use(authenticate, authorize(Role.DRIVER));

router.get('/profile', getDriverProfile);

// Availability endpoints (supports both Gurleen's getDriverAvailability/updateAvailability and Ayush's getAvailability / PATCH & PUT)
router.get('/availability', getDriverAvailability || getAvailability);
router.patch('/availability', updateAvailability);
router.put('/availability', updateAvailability);

// Location endpoints (supports both Gurleen's getDriverLocation/updateLocation and Ayush's updateDriverLocation / PATCH & PUT)
router.get('/location', getDriverLocation);
router.patch('/location', updateLocation);
router.put('/location', updateDriverLocation);

// Status endpoint (Gurleen's combined availability & location update)
router.patch('/status', updateDriverStatus);

// Driver rides endpoint
router.get('/rides', getDriverRides);

export default router;
