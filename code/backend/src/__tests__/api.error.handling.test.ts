import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z, ZodError } from 'zod';
import { AppError, errorHandler, notFoundHandler } from '../middleware/errorHandler';

const createMockResponse = () => {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
};

describe('Task 21: Consolidated API Error Handling & Error Responses', () => {
  // ─── AppError Factory Methods ─────────────────────────────────────────────
  describe('AppError Factory Methods & Structure', () => {
    it('should create badRequest error with statusCode 400 and code BAD_REQUEST', () => {
      const err = AppError.badRequest('Invalid parameter supplied', { field: 'id' });
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'BAD_REQUEST');
      assert.equal(err.message, 'Invalid parameter supplied');
      assert.deepEqual(err.details, { field: 'id' });
    });

    it('should create unauthorized error with statusCode 401 and code UNAUTHORIZED', () => {
      const err = AppError.unauthorized('Token expired');
      assert.equal(err.statusCode, 401);
      assert.equal(err.code, 'UNAUTHORIZED');
      assert.equal(err.message, 'Token expired');
    });

    it('should create forbidden error with statusCode 403 and code FORBIDDEN', () => {
      const err = AppError.forbidden('Driver not assigned to this ride');
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'FORBIDDEN');
      assert.equal(err.message, 'Driver not assigned to this ride');
    });

    it('should create notFound error with statusCode 404 and code NOT_FOUND', () => {
      const err = AppError.notFound('Ride not found');
      assert.equal(err.statusCode, 404);
      assert.equal(err.code, 'NOT_FOUND');
      assert.equal(err.message, 'Ride not found');
    });

    it('should create conflict error with statusCode 409 and code CONFLICT', () => {
      const err = AppError.conflict('Feedback already submitted for this ride');
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'CONFLICT');
      assert.equal(err.message, 'Feedback already submitted for this ride');
    });

    it('should create internal server error with statusCode 500 and code INTERNAL_SERVER_ERROR', () => {
      const err = AppError.internal('Database connection failed');
      assert.equal(err.statusCode, 500);
      assert.equal(err.code, 'INTERNAL_SERVER_ERROR');
    });
  });

  // ─── Zod Validation Error Response ────────────────────────────────────────
  describe('Zod Validation Error Response Formatting', () => {
    it('should format ZodError as 400 with success: false and field-level details', () => {
      const schema = z.object({
        email: z.string().email('Invalid email'),
        rating: z.number().min(1, 'Rating must be at least 1').max(5, 'Rating cannot exceed 5'),
      });

      let zodErr: ZodError | null = null;
      try {
        schema.parse({ email: 'bad-email', rating: 10 });
      } catch (err: any) {
        zodErr = err;
      }

      assert.ok(zodErr instanceof ZodError);

      const res = createMockResponse();
      errorHandler(zodErr, {} as any, res, () => {});

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.statusCode, 400);
      assert.equal(res.body.error.message, 'Validation failed');
      assert.ok(Array.isArray(res.body.error.details));
      assert.equal(res.body.error.details.length, 2);

      const fields = res.body.error.details.map((d: any) => d.field);
      assert.ok(fields.includes('email'));
      assert.ok(fields.includes('rating'));
    });
  });

  // ─── Unauthorized Access Response ─────────────────────────────────────────
  describe('Unauthorized Access Error Response (401)', () => {
    it('should return consistent 401 response for missing or expired token', () => {
      const err = AppError.unauthorized('Authentication token is required');
      const res = createMockResponse();

      errorHandler(err, {} as any, res, () => {});

      assert.equal(res.statusCode, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.statusCode, 401);
      assert.equal(res.body.error.message, 'Authentication token is required');
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
    });
  });

  // ─── Forbidden Access Response ────────────────────────────────────────────
  describe('Forbidden Access Error Response (403)', () => {
    it('should return consistent 403 response for unauthorized role or cross-user action', () => {
      const err = AppError.forbidden('Forbidden: you are not the driver assigned to this ride');
      const res = createMockResponse();

      errorHandler(err, {} as any, res, () => {});

      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.statusCode, 403);
      assert.equal(res.body.error.message, 'Forbidden: you are not the driver assigned to this ride');
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });
  });

  // ─── Missing Resources Response ───────────────────────────────────────────
  describe('Missing Resources Error Response (404)', () => {
    it('should return consistent 404 response when entity does not exist', () => {
      const err = AppError.notFound('Ride not found');
      const res = createMockResponse();

      errorHandler(err, {} as any, res, () => {});

      assert.equal(res.statusCode, 404);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.statusCode, 404);
      assert.equal(res.body.error.message, 'Ride not found');
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it('notFoundHandler should return consistent 404 response for unknown routes', () => {
      const req: any = { method: 'GET', originalUrl: '/api/unknown-endpoint' };
      const res = createMockResponse();

      notFoundHandler(req, res, () => {});

      assert.equal(res.statusCode, 404);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.statusCode, 404);
      assert.equal(res.body.error.message, 'Route not found: GET /api/unknown-endpoint');
    });
  });

  // ─── Invalid Workflow Operations Response ─────────────────────────────────
  describe('Invalid Workflow Operations Error Response (400 & 409)', () => {
    it('should return consistent 400 response for invalid state transitions', () => {
      const err = AppError.badRequest("Ride cannot be started because its current status is 'REQUESTED'. Expected: ACCEPTED");
      const res = createMockResponse();

      errorHandler(err, {} as any, res, () => {});

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.statusCode, 400);
      assert.equal(res.body.error.message, "Ride cannot be started because its current status is 'REQUESTED'. Expected: ACCEPTED");
    });

    it('should return consistent 409 response for conflict like duplicate feedback', () => {
      const err = AppError.conflict('Feedback has already been submitted for this ride');
      const res = createMockResponse();

      errorHandler(err, {} as any, res, () => {});

      assert.equal(res.statusCode, 409);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.statusCode, 409);
      assert.equal(res.body.error.message, 'Feedback has already been submitted for this ride');
    });
  });

  // ─── SyntaxError & Prisma Handlers ────────────────────────────────────────
  describe('Malformed JSON and Database Errors', () => {
    it('should format JSON SyntaxError as 400 Bad Request with consistent structure', () => {
      const syntaxError = new SyntaxError('Unexpected token in JSON');
      (syntaxError as any).status = 400;

      const res = createMockResponse();
      errorHandler(syntaxError, {} as any, res, () => {});

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.statusCode, 400);
      assert.equal(res.body.error.message, 'Invalid JSON payload in request body');
    });

    it('should format Prisma P2002 unique constraint error as 409 Conflict', () => {
      const prismaError: any = new Error('Unique constraint failed');
      prismaError.name = 'PrismaClientKnownRequestError';
      prismaError.code = 'P2002';
      prismaError.meta = { target: ['email'] };

      const res = createMockResponse();
      errorHandler(prismaError, {} as any, res, () => {});

      assert.equal(res.statusCode, 409);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.statusCode, 409);
      assert.equal(res.body.error.message, 'Unique constraint failed on email');
    });

    it('should format Prisma P2025 record not found as 404 Not Found', () => {
      const prismaError: any = new Error('Record not found');
      prismaError.name = 'PrismaClientKnownRequestError';
      prismaError.code = 'P2025';

      const res = createMockResponse();
      errorHandler(prismaError, {} as any, res, () => {});

      assert.equal(res.statusCode, 404);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.statusCode, 404);
      assert.equal(res.body.error.message, 'Requested record was not found');
    });

    it('should format unexpected generic error as 500 Internal Server Error', () => {
      const genericError = new Error('Something went completely wrong');
      const res = createMockResponse();

      errorHandler(genericError, {} as any, res, () => {});

      assert.equal(res.statusCode, 500);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.statusCode, 500);
      assert.equal(res.body.error.message, 'Something went completely wrong');
    });
  });
});
