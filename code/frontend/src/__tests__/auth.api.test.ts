import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  fetchUserProfile,
  loginUser,
  registerUser,
} from '../utils/auth.ts';
import type { DriverRegisterData, PassengerRegisterData } from '../types/auth.ts';

describe('Frontend Auth API Utilities', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('registerUser', () => {
    it('should send POST request to /api/auth/register and return registered user for passenger', async () => {
      const passengerData: PassengerRegisterData = {
        name: 'Jane Passenger',
        email: 'jane@example.com',
        password: 'password123',
        phone: '+919876543210',
        role: 'PASSENGER',
      };

      const mockResponseUser = {
        id: 'usr-p-1',
        name: passengerData.name,
        email: passengerData.email,
        phone: passengerData.phone,
        role: 'PASSENGER',
      };

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        assert.strictEqual(String(input), 'http://localhost:5000/api/auth/register');
        assert.strictEqual(init?.method, 'POST');
        const headers = init?.headers ? (init.headers as Record<string, string>) : {};
        assert.strictEqual(headers['Content-Type'], 'application/json');
        assert.deepStrictEqual(JSON.parse((init?.body as string) || '{}'), passengerData);

        return new Response(
          JSON.stringify({
            success: true,
            message: 'User registered successfully',
            data: { user: mockResponseUser },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const result = await registerUser(passengerData, 'http://localhost:5000');
      assert.deepStrictEqual(result.user, mockResponseUser);
    });

    it('should register a driver with vehicle and license details', async () => {
      const driverData: DriverRegisterData = {
        name: 'Dave Driver',
        email: 'dave@example.com',
        password: 'password123',
        phone: '+919876543211',
        role: 'DRIVER',
        licenseNumber: 'DL-01-2023-777',
        vehicleType: 'PREMIUM',
        vehicleModel: 'Honda Accord',
        vehiclePlate: 'DL-04-CC-5678',
        vehicleColor: 'Black',
      };

      const mockResponseDriver = {
        id: 'usr-d-1',
        name: driverData.name,
        email: driverData.email,
        role: 'DRIVER',
        driverProfile: {
          licenseNumber: driverData.licenseNumber,
          vehicleType: driverData.vehicleType,
          vehicleModel: driverData.vehicleModel,
          vehiclePlate: driverData.vehiclePlate,
        },
      };

      globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        assert.deepStrictEqual(JSON.parse((init?.body as string) || '{}'), driverData);
        return new Response(
          JSON.stringify({
            success: true,
            data: { user: mockResponseDriver },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const result = await registerUser(driverData, 'http://localhost:5000');
      assert.strictEqual(result.user.role, 'DRIVER');
      assert.strictEqual(result.user.driverProfile?.licenseNumber, 'DL-01-2023-777');
    });

    it('should throw an error with backend message when registration fails with 409 Conflict', async () => {
      globalThis.fetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              message: 'A user with this email already exists',
              statusCode: 409,
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        async () => {
          await registerUser(
            {
              name: 'Duplicate',
              email: 'exists@example.com',
              password: 'password123',
              role: 'PASSENGER',
            },
            'http://localhost:5000'
          );
        },
        /A user with this email already exists/
      );
    });
  });

  describe('loginUser', () => {
    it('should send POST request to /api/auth/login and return token and user', async () => {
      const credentials = {
        email: 'passenger@example.com',
        password: 'password123',
      };

      const mockLoginResponse = {
        token: 'signed-jwt-token-xyz',
        user: {
          id: 'usr-p-1',
          name: 'Jane Passenger',
          email: 'passenger@example.com',
          role: 'PASSENGER' as const,
        },
      };

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        assert.strictEqual(String(input), 'http://localhost:5000/api/auth/login');
        assert.strictEqual(init?.method, 'POST');
        assert.deepStrictEqual(JSON.parse((init?.body as string) || '{}'), credentials);

        return new Response(
          JSON.stringify({
            success: true,
            data: mockLoginResponse,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const result = await loginUser(credentials, 'http://localhost:5000');
      assert.strictEqual(result.token, mockLoginResponse.token);
      assert.strictEqual(result.user.email, credentials.email);
      assert.strictEqual(result.user.role, 'PASSENGER');
    });

    it('should throw an error when credentials are invalid', async () => {
      globalThis.fetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              message: 'Invalid email or password',
              statusCode: 401,
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        async () => {
          await loginUser(
            { email: 'wrong@example.com', password: 'wrong' },
            'http://localhost:5000'
          );
        },
        /Invalid email or password/
      );
    });
  });

  describe('fetchUserProfile', () => {
    it('should call /api/passenger/profile with Bearer token for passengers', async () => {
      const mockProfile = {
        id: 'usr-1',
        name: 'Passenger One',
        email: 'p1@test.com',
        role: 'PASSENGER' as const,
      };

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        assert.strictEqual(String(input), 'http://localhost:5000/api/passenger/profile');
        const headers = init?.headers ? (init.headers as Record<string, string>) : {};
        assert.strictEqual(headers['Authorization'], 'Bearer my-jwt-token');

        return new Response(
          JSON.stringify({
            success: true,
            data: { profile: mockProfile },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const profile = await fetchUserProfile('my-jwt-token', 'PASSENGER', 'http://localhost:5000');
      assert.deepStrictEqual(profile, mockProfile);
    });

    it('should call /api/driver/profile with Bearer token for drivers', async () => {
      const mockProfile = {
        id: 'usr-2',
        name: 'Driver Two',
        email: 'd2@test.com',
        role: 'DRIVER' as const,
        driverProfile: {
          licenseNumber: 'DL-999',
          vehicleModel: 'Camry',
          vehiclePlate: 'DL-01-999',
        },
      };

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        assert.strictEqual(String(input), 'http://localhost:5000/api/driver/profile');
        const headers = init?.headers ? (init.headers as Record<string, string>) : {};
        assert.strictEqual(headers['Authorization'], 'Bearer driver-token');

        return new Response(
          JSON.stringify({
            success: true,
            data: { profile: mockProfile },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const profile = await fetchUserProfile('driver-token', 'DRIVER', 'http://localhost:5000');
      assert.deepStrictEqual(profile, mockProfile);
    });
  });
});
