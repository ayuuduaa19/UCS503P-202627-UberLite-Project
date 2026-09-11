import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidLatitude,
  isValidLongitude,
  isValidCoordinate,
  normalizeCoordinates,
  calculateDistance,
  isWithinRadius,
  calculateRideDistance,
  estimateTravelTimeMinutes,
  calculateDistanceAndDuration,
  sortByDistance,
  filterByRadius,
  findNearest,
} from '../location';

describe('Location & Distance Utility', () => {
  describe('Coordinate Validation & Normalization', () => {
    it('should validate latitudes correctly', () => {
      assert.equal(isValidLatitude(0), true);
      assert.equal(isValidLatitude(28.6139), true);
      assert.equal(isValidLatitude(90), true);
      assert.equal(isValidLatitude(-90), true);

      assert.equal(isValidLatitude(90.1), false);
      assert.equal(isValidLatitude(-90.1), false);
      assert.equal(isValidLatitude(NaN), false);
      assert.equal(isValidLatitude(Infinity), false);
      assert.equal(isValidLatitude('28.6139'), false);
      assert.equal(isValidLatitude(null), false);
      assert.equal(isValidLatitude(undefined), false);
    });

    it('should validate longitudes correctly', () => {
      assert.equal(isValidLongitude(0), true);
      assert.equal(isValidLongitude(77.209), true);
      assert.equal(isValidLongitude(180), true);
      assert.equal(isValidLongitude(-180), true);

      assert.equal(isValidLongitude(180.1), false);
      assert.equal(isValidLongitude(-180.1), false);
      assert.equal(isValidLongitude(NaN), false);
      assert.equal(isValidLongitude(Infinity), false);
      assert.equal(isValidLongitude('77.209'), false);
      assert.equal(isValidLongitude(null), false);
      assert.equal(isValidLongitude(undefined), false);
    });

    it('should validate coordinate objects and tuples', () => {
      assert.equal(isValidCoordinate({ lat: 28.6139, lng: 77.209 }), true);
      assert.equal(isValidCoordinate({ latitude: 28.6139, longitude: 77.209 }), true);
      assert.equal(isValidCoordinate([28.6139, 77.209]), true);

      assert.equal(isValidCoordinate({ lat: 95, lng: 77.209 }), false);
      assert.equal(isValidCoordinate({ lat: 28.6139, lng: 190 }), false);
      assert.equal(isValidCoordinate([28.6139]), false);
      assert.equal(isValidCoordinate(null), false);
      assert.equal(isValidCoordinate('invalid'), false);
    });

    it('should normalize coordinates in different formats', () => {
      const fromLatLng = normalizeCoordinates({ lat: 28.6139, lng: 77.209 });
      assert.deepEqual(fromLatLng, { lat: 28.6139, lng: 77.209 });

      const fromFull = normalizeCoordinates({ latitude: 28.6139, longitude: 77.209 });
      assert.deepEqual(fromFull, { lat: 28.6139, lng: 77.209 });

      const fromTuple = normalizeCoordinates([28.6139, 77.209]);
      assert.deepEqual(fromTuple, { lat: 28.6139, lng: 77.209 });
    });

    it('should throw descriptive errors on invalid coordinate inputs', () => {
      assert.throws(() => normalizeCoordinates({ lat: 100, lng: 77 } as any, 'Pickup'), /Pickup latitude must be a valid number between -90 and 90/);
      assert.throws(() => normalizeCoordinates({ lat: 28, lng: 200 } as any, 'Dropoff'), /Dropoff longitude must be a valid number between -180 and 180/);
      assert.throws(() => normalizeCoordinates(null as any, 'Origin'), /Origin is required/);
    });
  });

  describe('Haversine Distance Calculation', () => {
    const connaughtPlace = { lat: 28.6315, lng: 77.2167 };
    const indiaGate = { lat: 28.6129, lng: 77.2295 };

    it('should return 0 for identical coordinates', () => {
      const dist = calculateDistance(connaughtPlace, connaughtPlace);
      assert.equal(dist, 0);
    });

    it('should accurately calculate distance between Delhi landmarks (~2.42 km)', () => {
      const distKm = calculateDistance(connaughtPlace, indiaGate, { unit: 'km', decimals: 2 });
      assert.equal(distKm >= 2.3 && distKm <= 2.5, true, `Expected ~2.4 km, got ${distKm}`);
    });

    it('should calculate long distance between New Delhi and Mumbai (~1148 km)', () => {
      const newDelhi = { lat: 28.6139, lng: 77.209 };
      const mumbai = { lat: 19.076, lng: 72.8777 };

      const dist = calculateDistance(newDelhi, mumbai, { unit: 'km', decimals: 1 });
      assert.equal(dist >= 1140 && dist <= 1160, true, `Expected ~1148 km, got ${dist}`);
    });

    it('should support unit conversions (m and miles)', () => {
      const distKm = calculateDistance(connaughtPlace, indiaGate, { unit: 'km', decimals: 4 });
      const distM = calculateDistance(connaughtPlace, indiaGate, { unit: 'm', decimals: 1 });
      const distMiles = calculateDistance(connaughtPlace, indiaGate, { unit: 'miles', decimals: 4 });

      assert.equal(Math.abs(distM - distKm * 1000) < 0.1, true);
      assert.equal(Math.abs(distMiles - distKm * 0.621371) < 0.01, true);
    });
  });

  describe('Driver Matching Proximity Helpers', () => {
    const passengerLocation = { lat: 28.6139, lng: 77.209 }; // New Delhi center

    const drivers = [
      { id: 'driver-far', name: 'Far Driver', lat: 28.7041, lng: 77.1025 }, // ~14 km away (Rohini)
      { id: 'driver-close', name: 'Close Driver', lat: 28.615, lng: 77.2105 }, // ~0.2 km away
      { id: 'driver-medium', name: 'Medium Driver', lat: 28.6289, lng: 77.2065 }, // ~1.7 km away
      { id: 'driver-no-loc', name: 'Offline Driver', lat: null, lng: null },
    ];

    it('should check if location is within radius', () => {
      assert.equal(isWithinRadius(passengerLocation, { lat: 28.615, lng: 77.2105 }, 1.0), true);
      assert.equal(isWithinRadius(passengerLocation, { lat: 28.7041, lng: 77.1025 }, 5.0), false);
    });

    it('should sort drivers by distance ascending and skip offline drivers', () => {
      const sorted = sortByDistance(passengerLocation, drivers, (d) =>
        d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng } : null
      );

      assert.equal(sorted.length, 3);
      assert.equal(sorted[0].id, 'driver-close');
      assert.equal(sorted[1].id, 'driver-medium');
      assert.equal(sorted[2].id, 'driver-far');
      assert.equal(sorted[0].distanceKm < sorted[1].distanceKm, true);
      assert.equal(sorted[1].distanceKm < sorted[2].distanceKm, true);
    });

    it('should filter drivers within search radius', () => {
      const within3Km = filterByRadius(
        passengerLocation,
        drivers,
        (d) => (d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng } : null),
        3.0
      );

      assert.equal(within3Km.length, 2);
      assert.equal(within3Km[0].id, 'driver-close');
      assert.equal(within3Km[1].id, 'driver-medium');
    });

    it('should find the single nearest driver', () => {
      const nearest = findNearest(passengerLocation, drivers, (d) =>
        d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng } : null
      );

      assert.notEqual(nearest, null);
      assert.equal(nearest?.id, 'driver-close');
      assert.equal(nearest?.distanceKm < 0.5, true);
    });

    it('should return null if nearest driver exceeds max radius', () => {
      const nearestStrict = findNearest(
        passengerLocation,
        [drivers[0]], // Far driver ~14 km away
        (d) => ({ lat: d.lat!, lng: d.lng! }),
        5.0
      );

      assert.equal(nearestStrict, null);
    });
  });

  describe('Fare & Trip Estimation Helpers', () => {
    const pickup = { lat: 28.6139, lng: 77.209 };
    const dropoff = { lat: 28.7041, lng: 77.1025 };

    it('should calculate ride distance formatted with 2 decimals', () => {
      const distanceKm = calculateRideDistance(pickup, dropoff);
      assert.equal(typeof distanceKm, 'number');
      assert.equal(distanceKm > 13 && distanceKm < 16, true);
    });

    it('should estimate travel duration in minutes based on distance and speed', () => {
      // 15 km at 30 km/h = 30 minutes
      const durationMin = estimateTravelTimeMinutes(15, 30);
      assert.equal(durationMin, 30);

      // 10 km at 40 km/h = 15 minutes
      const durationMin2 = estimateTravelTimeMinutes(10, 40);
      assert.equal(durationMin2, 15);
    });

    it('should compute combined distance and duration matching Ride schema fields', () => {
      const estimate = calculateDistanceAndDuration(pickup, dropoff, 30);
      assert.equal('distanceKm' in estimate, true);
      assert.equal('durationMin' in estimate, true);
      assert.equal(estimate.distanceKm > 0, true);
      assert.equal(estimate.durationMin > 0, true);
    });
  });
});
