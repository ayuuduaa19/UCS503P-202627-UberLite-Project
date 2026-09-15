import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import {
  UpdateAvailabilityInput,
  UpdateLocationInput,
  UpdateDriverStatusInput,
} from '../validators/driver.validator';

export class DriverService {
  /**
   * Helper to verify driver existence and retrieve driver profile by user ID
   */
  async getDriverByUserId(userId: string) {
    const driver = await prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new AppError('Driver profile not found', 404);
    }

    return driver;
  }

  /**
   * Retrieve driver availability and current location by user ID
   */
  async getAvailabilityAndLocation(userId: string) {
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

  /**
   * Update driver availability status, with optional location update
   */
  async updateAvailability(
    userId: string,
    isAvailable: boolean,
    location?: { currentLat?: number; currentLng?: number }
  ) {
    const driver = await this.getDriverByUserId(userId);

    const dataToUpdate: {
      isAvailable: boolean;
      currentLat?: number;
      currentLng?: number;
    } = { isAvailable };

    if (location?.currentLat !== undefined && location?.currentLng !== undefined) {
      dataToUpdate.currentLat = location.currentLat;
      dataToUpdate.currentLng = location.currentLng;
    }

    const updatedDriver = await prisma.driver.update({
      where: { id: driver.id },
      data: dataToUpdate,
    });

    return updatedDriver;
  }

  /**
   * Update driver current location coordinates
   */
  async updateLocation(userId: string, input: UpdateLocationInput) {
    const driver = await this.getDriverByUserId(userId);

    const updatedDriver = await prisma.driver.update({
      where: { id: driver.id },
      data: {
        currentLat: input.currentLat,
        currentLng: input.currentLng,
      },
    });

    return updatedDriver;
  }

  /**
   * Update both availability and/or current location
   */
  async updateStatus(userId: string, input: UpdateDriverStatusInput) {
    const driver = await this.getDriverByUserId(userId);

    const dataToUpdate: {
      isAvailable?: boolean;
      currentLat?: number;
      currentLng?: number;
    } = {};

    if (input.isAvailable !== undefined) {
      dataToUpdate.isAvailable = input.isAvailable;
    }
    if (input.currentLat !== undefined) {
      dataToUpdate.currentLat = input.currentLat;
    }
    if (input.currentLng !== undefined) {
      dataToUpdate.currentLng = input.currentLng;
    }

    const updatedDriver = await prisma.driver.update({
      where: { id: driver.id },
      data: dataToUpdate,
    });

    return updatedDriver;
  }
}

export const driverService = new DriverService();
