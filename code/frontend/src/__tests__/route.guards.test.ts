import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getDashboardRouteForRole, isAuthorizedRole } from '../utils/auth.ts';
import type { User } from '../types/auth.ts';

/**
 * Route decision evaluator representing the router's guard behavior
 */
interface AuthContextState {
  isAuthenticated: boolean;
  user: User | null;
}

function evaluateRouteAccess(
  path: string,
  state: AuthContextState
): { action: 'ALLOW' | 'REDIRECT' | 'FORBIDDEN'; target?: string } {
  const { isAuthenticated, user } = state;

  // Root path resolution
  if (path === '/' || path === '') {
    if (!isAuthenticated || !user) {
      return { action: 'REDIRECT', target: '/login' };
    }
    return { action: 'REDIRECT', target: getDashboardRouteForRole(user.role) };
  }

  // Guest-only routes (/login, /register)
  if (path === '/login' || path === '/register') {
    if (isAuthenticated && user) {
      return { action: 'REDIRECT', target: getDashboardRouteForRole(user.role) };
    }
    return { action: 'ALLOW' };
  }

  // Passenger protected routes
  if (path === '/passenger' || path === '/passenger/dashboard') {
    if (!isAuthenticated || !user) {
      return { action: 'REDIRECT', target: '/login' };
    }
    if (!isAuthorizedRole(user.role, ['PASSENGER'])) {
      return { action: 'FORBIDDEN', target: '/passenger/dashboard' };
    }
    return { action: 'ALLOW' };
  }

  // Driver protected routes
  if (path === '/driver' || path === '/driver/dashboard') {
    if (!isAuthenticated || !user) {
      return { action: 'REDIRECT', target: '/login' };
    }
    if (!isAuthorizedRole(user.role, ['DRIVER'])) {
      return { action: 'FORBIDDEN', target: '/driver/dashboard' };
    }
    return { action: 'ALLOW' };
  }

  return { action: 'ALLOW' };
}

describe('Frontend Route Guards & Role-Based Access Control', () => {
  const unauthenticatedState: AuthContextState = {
    isAuthenticated: false,
    user: null,
  };

  const passengerState: AuthContextState = {
    isAuthenticated: true,
    user: {
      id: 'p-1',
      name: 'Passenger User',
      email: 'p@test.com',
      role: 'PASSENGER',
    },
  };

  const driverState: AuthContextState = {
    isAuthenticated: true,
    user: {
      id: 'd-1',
      name: 'Driver User',
      email: 'd@test.com',
      role: 'DRIVER',
      driverProfile: {
        id: 'dp-1',
        userId: 'd-1',
        licenseNumber: 'DL-12345',
        vehicleType: 'STANDARD',
        vehicleModel: 'Swift',
        vehiclePlate: 'DL-01-AB',
        vehicleColor: 'White',
        rating: 4.9,
        isAvailable: true,
        currentLat: null,
        currentLng: null,
      },
    },
  };

  describe('Unauthenticated User Access Control', () => {
    it('should redirect unauthenticated users visiting / to /login', () => {
      const decision = evaluateRouteAccess('/', unauthenticatedState);
      assert.strictEqual(decision.action, 'REDIRECT');
      assert.strictEqual(decision.target, '/login');
    });

    it('should allow unauthenticated users to access /login and /register', () => {
      assert.strictEqual(evaluateRouteAccess('/login', unauthenticatedState).action, 'ALLOW');
      assert.strictEqual(evaluateRouteAccess('/register', unauthenticatedState).action, 'ALLOW');
    });

    it('should guard passenger dashboard from unauthenticated users', () => {
      const decision = evaluateRouteAccess('/passenger/dashboard', unauthenticatedState);
      assert.strictEqual(decision.action, 'REDIRECT');
      assert.strictEqual(decision.target, '/login');
    });

    it('should guard driver dashboard from unauthenticated users', () => {
      const decision = evaluateRouteAccess('/driver/dashboard', unauthenticatedState);
      assert.strictEqual(decision.action, 'REDIRECT');
      assert.strictEqual(decision.target, '/login');
    });
  });

  describe('Passenger Role-Based Route Protection', () => {
    it('should redirect authenticated passenger visiting / to passenger dashboard', () => {
      const decision = evaluateRouteAccess('/', passengerState);
      assert.strictEqual(decision.action, 'REDIRECT');
      assert.strictEqual(decision.target, '/passenger/dashboard');
    });

    it('should allow passenger to access /passenger/dashboard', () => {
      const decision = evaluateRouteAccess('/passenger/dashboard', passengerState);
      assert.strictEqual(decision.action, 'ALLOW');
    });

    it('should forbid passenger from accessing /driver/dashboard (Tasks #25 & #26)', () => {
      const decision = evaluateRouteAccess('/driver/dashboard', passengerState);
      assert.strictEqual(decision.action, 'FORBIDDEN');
    });

    it('should redirect logged-in passenger trying to view /login back to dashboard', () => {
      const decision = evaluateRouteAccess('/login', passengerState);
      assert.strictEqual(decision.action, 'REDIRECT');
      assert.strictEqual(decision.target, '/passenger/dashboard');
    });
  });

  describe('Driver Role-Based Route Protection', () => {
    it('should redirect authenticated driver visiting / to driver dashboard', () => {
      const decision = evaluateRouteAccess('/', driverState);
      assert.strictEqual(decision.action, 'REDIRECT');
      assert.strictEqual(decision.target, '/driver/dashboard');
    });

    it('should allow driver to access /driver/dashboard', () => {
      const decision = evaluateRouteAccess('/driver/dashboard', driverState);
      assert.strictEqual(decision.action, 'ALLOW');
    });

    it('should forbid driver from accessing /passenger/dashboard (Tasks #25 & #26)', () => {
      const decision = evaluateRouteAccess('/passenger/dashboard', driverState);
      assert.strictEqual(decision.action, 'FORBIDDEN');
    });

    it('should redirect logged-in driver trying to view /register back to dashboard', () => {
      const decision = evaluateRouteAccess('/register', driverState);
      assert.strictEqual(decision.action, 'REDIRECT');
      assert.strictEqual(decision.target, '/driver/dashboard');
    });
  });
});
