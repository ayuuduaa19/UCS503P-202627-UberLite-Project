import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { isValidLatitude, isValidLongitude } from '../utils/location';
import { UpdateDriverStatusInput } from '../validators/driver.validator';

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

  /**
   * Alias for getAvailability (includes location fields)
   */
  async getAvailabilityAndLocation(userId: string) {
    return this.getAvailability(userId);
  }

  /**
   * Update driver availability status
   */
  async updateAvailability(
    userId: string,
    isAvailable: boolean,
    location?: { currentLat?: number; currentLng?: number }
  ) {
    if (typeof isAvailable !== 'boolean') {
      throw new AppError('Field isAvailable must be a boolean', 400);
    }

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
   * Get driver current location
   */
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

  /**
   * Update driver current location coordinates (accepts lat/lng or currentLat/currentLng)
   */
  async updateLocation(
    userId: string,
    latOrInput: number | { currentLat: number; currentLng: number },
    lng?: number
  ) {
    let lat: number;
    let lngVal: number;

    if (typeof latOrInput === 'number') {
      lat = latOrInput;
      lngVal = lng!;
    } else {
      lat = latOrInput.currentLat;
      lngVal = latOrInput.currentLng;
    }

    if (!isValidLatitude(lat)) {
      throw new AppError('Latitude must be a number between -90 and 90', 400);
    }

    if (!isValidLongitude(lngVal)) {
      throw new AppError('Longitude must be a number between -180 and 180', 400);
    }

    const driver = await this.getDriverByUserId(userId);

    const updatedDriver = await prisma.driver.update({
      where: { id: driver.id },
      data: {
        currentLat: lat,
        currentLng: lngVal,
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
