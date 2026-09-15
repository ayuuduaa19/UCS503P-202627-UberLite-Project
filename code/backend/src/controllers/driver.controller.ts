import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { driverService } from '../services/driver.service';
import { updateLocationSchema } from '../validators/driver.validator';

export const getDriverProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
        driverProfile: true,
      },
    });

    if (!user || !user.driverProfile) {
      throw new AppError('Driver profile not found', 404);
    }

    return res.status(200).json({
      success: true,
      data: {
        profile: user,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const availability = await driverService.getAvailability(userId);

    return res.status(200).json({
      success: true,
      data: availability,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { isAvailable } = req.body;

    if (typeof isAvailable !== 'boolean') {
      throw new AppError('Field isAvailable must be a boolean', 400);
    }

    const updatedDriver = await driverService.updateAvailability(userId, isAvailable);

    return res.status(200).json({
      success: true,
      message: `Driver status updated to ${isAvailable ? 'available' : 'unavailable'}`,
      data: {
        driver: updatedDriver,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getDriverLocation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const location = await driverService.getLocation(userId);

    return res.status(200).json({
      success: true,
      data: location,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDriverLocation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { lat, lng } = updateLocationSchema.parse(req.body);

    const updatedDriver = await driverService.updateLocation(userId, lat, lng);

    return res.status(200).json({
      success: true,
      message: 'Driver location updated successfully',
      data: {
        driver: updatedDriver,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getDriverRides = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const driver = await prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new AppError('Driver profile not found', 404);
    }

    const rides = await prisma.ride.findMany({
      where: { driverId: driver.id },
      include: {
        passenger: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        fare: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: {
        rides,
      },
    });
  } catch (error) {
    next(error);
  }
};
