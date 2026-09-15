import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { isValidLatitude, isValidLongitude } from '../utils/location';

export class DriverService {
  async getDriverByUserId(userId: string) {
    const driver = await prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new AppError('Driver profile not found', 404);
    }

    return driver;
  }

  async getAvailability(userId: string) {
    const driver = await this.getDriverByUserId(userId);
    return {
      driverId: driver.id,
      userId: driver.userId,
      isAvailable: driver.isAvailable,
      currentLat: driver.currentLat,
      currentLng: driver.currentLng,
      updatedAt: driver.updatedAt,
    };
  }

  async updateAvailability(userId: string, isAvailable: boolean) {
    if (typeof isAvailable !== 'boolean') {
      throw new AppError('Field isAvailable must be a boolean', 400);
    }

    const driver = await this.getDriverByUserId(userId);

    const updatedDriver = await prisma.driver.update({
      where: { id: driver.id },
      data: { isAvailable },
    });

    return updatedDriver;
  }

  async getLocation(userId: string) {
    const driver = await this.getDriverByUserId(userId);
    return {
      driverId: driver.id,
      currentLat: driver.currentLat,
      currentLng: driver.currentLng,
      isAvailable: driver.isAvailable,
      updatedAt: driver.updatedAt,
    };
  }

  async updateLocation(userId: string, lat: number, lng: number) {
    if (!isValidLatitude(lat)) {
      throw new AppError('Latitude must be a number between -90 and 90', 400);
    }

    if (!isValidLongitude(lng)) {
      throw new AppError('Longitude must be a number between -180 and 180', 400);
    }

    const driver = await this.getDriverByUserId(userId);

    const updatedDriver = await prisma.driver.update({
      where: { id: driver.id },
      data: {
        currentLat: lat,
        currentLng: lng,
      },
    });

    return updatedDriver;
  }
}

export const driverService = new DriverService();
