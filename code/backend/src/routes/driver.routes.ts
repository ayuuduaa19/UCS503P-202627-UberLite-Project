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
  acceptRide,
  rejectRide,
  startRide,
  completeRide,
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

// Ride acceptance / rejection (Task 14)
// Only the driver assigned to the ride may call these.
router.patch('/rides/:id/accept', acceptRide);
router.patch('/rides/:id/reject', rejectRide);

// Ride status transitions (Task 15) & completion with final fare calculation (Task 18)
// Only the driver assigned to the ride may call these.
router.patch('/rides/:id/start', startRide);
router.patch('/rides/:id/complete', completeRide);
router.post('/rides/:id/complete', completeRide);

export default router;
