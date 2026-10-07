import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  clearAuthSession,
  extractErrorMessage,
  getDashboardRouteForRole,
  getStoredSession,
  getStoredToken,
  getStoredUser,
  isAuthorizedRole,
  saveAuthSession,
  validateEmail,
  validateLoginForm,
  validateName,
  validatePassword,
  validateRegisterForm,
} from '../utils/auth.ts';
import type { User } from '../types/auth.ts';

// In-memory mock localStorage for Node testing environment
class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

describe('Frontend Auth Utilities & Session Persistence', () => {
  const mockStorage = new MockLocalStorage();

  beforeEach(() => {
    mockStorage.clear();
    // Attach to global window object
    (globalThis as any).window = {
      localStorage: mockStorage,
    };
  });

  describe('Session Storage (localStorage)', () => {
    const dummyUser: User = {
      id: 'usr-123',
      name: 'Test Passenger',
      email: 'passenger@example.com',
      phone: '+919876543210',
      role: 'PASSENGER',
    };
    const dummyToken = 'jwt-sample-token-abc';

    it('should save auth session to storage', () => {
      saveAuthSession(dummyToken, dummyUser);
      assert.strictEqual(mockStorage.getItem(AUTH_TOKEN_KEY), dummyToken);
      const savedUser = JSON.parse(mockStorage.getItem(AUTH_USER_KEY)!);
      assert.strictEqual(savedUser.id, dummyUser.id);
      assert.strictEqual(savedUser.role, 'PASSENGER');
    });

    it('should retrieve stored token and user correctly', () => {
      saveAuthSession(dummyToken, dummyUser);
      const token = getStoredToken();
      const user = getStoredUser();
      const session = getStoredSession();

      assert.strictEqual(token, dummyToken);
      assert.deepStrictEqual(user, dummyUser);
      assert.ok(session);
      assert.strictEqual(session?.token, dummyToken);
      assert.deepStrictEqual(session?.user, dummyUser);
    });

    it('should clear stored session', () => {
      saveAuthSession(dummyToken, dummyUser);
      clearAuthSession();

      assert.strictEqual(getStoredToken(), null);
      assert.strictEqual(getStoredUser(), null);
      assert.strictEqual(getStoredSession(), null);
    });

    it('should return null when stored session JSON is invalid or missing', () => {
      mockStorage.setItem(AUTH_USER_KEY, 'invalid-json');
      assert.strictEqual(getStoredUser(), null);
      assert.strictEqual(getStoredSession(), null);
    });
  });

  describe('Form Validations', () => {
    it('validateEmail should validate correct emails and reject invalid ones', () => {
      assert.strictEqual(validateEmail('test@uberlite.com'), null);
      assert.strictEqual(validateEmail('user.name+tag@domain.co.in'), null);
      assert.ok(validateEmail(''));
      assert.ok(validateEmail('invalid-email'));
      assert.ok(validateEmail('@domain.com'));
    });

    it('validatePassword should enforce minimum length', () => {
      assert.strictEqual(validatePassword('secret123'), null);
      assert.ok(validatePassword(''));
      assert.ok(validatePassword('12345'));
    });

    it('validateName should require at least 2 characters', () => {
      assert.strictEqual(validateName('Alice'), null);
      assert.ok(validateName(''));
      assert.ok(validateName('A'));
    });

    it('validateLoginForm should report missing credentials', () => {
      const emptyErrors = validateLoginForm({ email: '', password: '' });
      assert.ok(emptyErrors.email);
      assert.ok(emptyErrors.password);

      const validErrors = validateLoginForm({ email: 'user@example.com', password: 'password123' });
      assert.strictEqual(Object.keys(validErrors).length, 0);
    });

    it('validateRegisterForm should validate passenger fields', () => {
      const passengerErrors = validateRegisterForm({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'PASSENGER',
      });
      assert.strictEqual(Object.keys(passengerErrors).length, 0);

      const invalidPassenger = validateRegisterForm({
        name: 'J',
        email: 'invalid',
        password: '123',
        role: 'PASSENGER',
      });
      assert.ok(invalidPassenger.name);
      assert.ok(invalidPassenger.email);
      assert.ok(invalidPassenger.password);
    });

    it('validateRegisterForm should require vehicle and license fields for drivers', () => {
      const missingDriverFields = validateRegisterForm({
        name: 'Driver Dan',
        email: 'dan@example.com',
        password: 'password123',
        role: 'DRIVER',
      });
      assert.ok(missingDriverFields.licenseNumber);
      assert.ok(missingDriverFields.vehicleModel);
      assert.ok(missingDriverFields.vehiclePlate);

      const validDriver = validateRegisterForm({
        name: 'Driver Dan',
        email: 'dan@example.com',
        password: 'password123',
        role: 'DRIVER',
        licenseNumber: 'DL-01-2023-999',
        vehicleType: 'STANDARD',
        vehicleModel: 'Honda City',
        vehiclePlate: 'DL-01-AB-1234',
      });
      assert.strictEqual(Object.keys(validDriver).length, 0);
    });
  });

  describe('Role-Based Route Helpers', () => {
    it('getDashboardRouteForRole should map roles to appropriate dashboards', () => {
      assert.strictEqual(getDashboardRouteForRole('PASSENGER'), '/passenger/dashboard');
      assert.strictEqual(getDashboardRouteForRole('DRIVER'), '/driver/dashboard');
    });

    it('isAuthorizedRole should verify role permissions correctly', () => {
      assert.strictEqual(isAuthorizedRole('PASSENGER', ['PASSENGER']), true);
      assert.strictEqual(isAuthorizedRole('PASSENGER', ['DRIVER']), false);
      assert.strictEqual(isAuthorizedRole('DRIVER', ['DRIVER']), true);
      assert.strictEqual(isAuthorizedRole('DRIVER', ['PASSENGER']), false);
      assert.strictEqual(isAuthorizedRole(undefined, ['PASSENGER', 'DRIVER']), false);
    });
  });

  describe('Error Message Extractor', () => {
    it('should extract error from Zod details array', () => {
      const json = {
        error: {
          details: [
            { field: 'email', message: 'Invalid email address' },
            { field: 'password', message: 'Password too short' },
          ],
        },
      };
      assert.strictEqual(
        extractErrorMessage(json),
        'Invalid email address. Password too short'
      );
    });

    it('should extract simple error message', () => {
      const json = { error: { message: 'A user with this email already exists' } };
      assert.strictEqual(
        extractErrorMessage(json),
        'A user with this email already exists'
      );
    });

    it('should fallback to default status text if json is empty or malformed', () => {
      assert.strictEqual(extractErrorMessage(null, 'Network Error'), 'Network Error');
    });
  });
});
