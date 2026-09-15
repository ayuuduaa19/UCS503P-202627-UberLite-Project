import { Request, Response, NextFunction } from 'express';
import { calculateDistanceSchema, estimateRideSchema } from '../validators/location.validator';
import { locationService } from '../services/location.service';

export const getDistance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = calculateDistanceSchema.parse(req.body);
    const result = locationService.calculateDistance(validatedData);

    return res.status(200).json({
      success: true,
      message: 'Distance calculated successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const estimateRide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = estimateRideSchema.parse(req.body);
    const estimate = locationService.estimateRide(validatedData);

    return res.status(200).json({
      success: true,
      message: 'Ride distance and duration estimated successfully',
      data: estimate,
    });
  } catch (error) {
    next(error);
  }
};
