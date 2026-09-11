import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDistance, estimateRide } from '../location.controller';

// Helper to create mock Express request and response objects
function createMockContext(body: unknown) {
  let statusCode = 200;
  let jsonResponse: any = null;
  let nextCalledWith: any = null;

  const req = {
    body,
  } as any;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      jsonResponse = data;
      return this;
    },
  } as any;

  const next = (err?: any) => {
    nextCalledWith = err;
  };

  return {
    req,
    res,
    next,
    getStatusCode: () => statusCode,
    getJsonResponse: () => jsonResponse,
    getNextCalledWith: () => nextCalledWith,
  };
}

describe('Location Controller & API Endpoints', () => {
  describe('POST /api/location/distance', () => {
    it('should return 200 and distance data for valid coordinates', async () => {
      const ctx = createMockContext({
        origin: { lat: 28.6139, lng: 77.209 },
        destination: { lat: 28.6289, lng: 77.2065 },
        unit: 'km',
        decimals: 2,
      });

      await getDistance(ctx.req, ctx.res, ctx.next);

      assert.equal(ctx.getStatusCode(), 200);
      const json = ctx.getJsonResponse();
      assert.equal(json.success, true);
      assert.equal(typeof json.data.distance, 'number');
      assert.equal(json.data.unit, 'km');
      assert.equal(json.data.distance > 1.5 && json.data.distance < 2.0, true);
    });

    it('should support alternative coordinate keys (latitude, longitude)', async () => {
      const ctx = createMockContext({
        origin: { latitude: 28.6139, longitude: 77.209 },
        destination: { latitude: 28.6289, longitude: 77.2065 },
      });

      await getDistance(ctx.req, ctx.res, ctx.next);

      assert.equal(ctx.getStatusCode(), 200);
      assert.equal(ctx.getJsonResponse().success, true);
    });

    it('should pass validation errors to next() on invalid latitude', async () => {
      const ctx = createMockContext({
        origin: { lat: 95, lng: 77.209 }, // lat > 90
        destination: { lat: 28.6289, lng: 77.2065 },
      });

      await getDistance(ctx.req, ctx.res, ctx.next);

      const err = ctx.getNextCalledWith();
      assert.notEqual(err, null);
      assert.equal(err.name, 'ZodError');
    });

    it('should pass validation errors to next() on missing destination', async () => {
      const ctx = createMockContext({
        origin: { lat: 28.6139, lng: 77.209 },
      });

      await getDistance(ctx.req, ctx.res, ctx.next);

      const err = ctx.getNextCalledWith();
      assert.notEqual(err, null);
      assert.equal(err.name, 'ZodError');
    });
  });

  describe('POST /api/location/estimate', () => {
    it('should return 200 with distanceKm and durationMin for pickup and dropoff', async () => {
      const ctx = createMockContext({
        pickup: { lat: 28.6139, lng: 77.209 },
        dropoff: { lat: 28.7041, lng: 77.1025 },
        averageSpeedKmh: 35,
      });

      await estimateRide(ctx.req, ctx.res, ctx.next);

      assert.equal(ctx.getStatusCode(), 200);
      const json = ctx.getJsonResponse();
      assert.equal(json.success, true);
      assert.equal(typeof json.data.distanceKm, 'number');
      assert.equal(typeof json.data.durationMin, 'number');
      assert.equal(json.data.distanceKm > 10, true);
      assert.equal(json.data.durationMin > 0, true);
    });

    it('should pass validation errors on missing coordinates', async () => {
      const ctx = createMockContext({
        pickup: { lat: 28.6139, lng: 77.209 },
      });

      await estimateRide(ctx.req, ctx.res, ctx.next);

      const err = ctx.getNextCalledWith();
      assert.notEqual(err, null);
      assert.equal(err.name, 'ZodError');
    });
  });
});
