import { Router } from 'express';
import { getDistance, estimateRide } from '../controllers/location.controller';

const router = Router();

router.post('/distance', getDistance);
router.post('/estimate', estimateRide);

export default router;
