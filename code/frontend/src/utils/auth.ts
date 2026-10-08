import type {
  AuthSession,
  LoginCredentials,
  RegisterData,
  RegisterFormFields,
  Role,
  User,
} from '../types/auth';

export const AUTH_TOKEN_KEY = 'uberlite_auth_token';
export const AUTH_USER_KEY = 'uberlite_auth_user';

export const DEFAULT_API_BASE_URL =
  typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL)
    ? ((import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL) as string)
    : '';

/**
 * Retrieve the stored JWT authentication token from localStorage
 */
export function getStoredToken(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Retrieve the stored authenticated user object from localStorage
 */
export function getStoredUser(): User | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    if (parsed && typeof parsed === 'object' && parsed.id && parsed.role) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Retrieve both the stored token and user if valid
 */
export function getStoredSession(): AuthSession | null {
  const token = getStoredToken();
  const user = getStoredUser();
  if (token && user) {
    return { token, user };
  }
  return null;
}

/**
 * Persist the authenticated session (token and user) to localStorage
 */
export function saveAuthSession(token: string, user: User): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } catch (err) {
    console.error('Failed to save auth session to localStorage', err);
  }
}

/**
 * Clear the authenticated session from localStorage
 */
export function clearAuthSession(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
  } catch (err) {
    console.error('Failed to clear auth session from localStorage', err);
  }
}

/**
 * Extract human-readable error message from backend error responses
 */
export function extractErrorMessage(json: any, statusText: string = 'Request failed'): string {
  if (!json) return statusText;
  if (json.error?.details && Array.isArray(json.error.details) && json.error.details.length > 0) {
    return json.error.details.map((d: any) => d.message).join('. ');
  }
  if (json.error?.message) {
    return json.error.message;
  }
  if (json.message) {
    return json.message;
  }
  return statusText;
}

/**
 * Register a new Passenger or Driver via POST /api/auth/register
 */
export async function registerUser(
  data: RegisterData,
  apiBaseUrl: string = DEFAULT_API_BASE_URL
): Promise<{ user: User }> {
  const response = await fetch(`${apiBaseUrl}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = extractErrorMessage(json, `Registration failed (${response.status})`);
    throw new Error(errorMsg);
  }

  return json.data;
}

/**
 * Authenticate user with credentials via POST /api/auth/login
 */
export async function loginUser(
  credentials: LoginCredentials,
  apiBaseUrl: string = DEFAULT_API_BASE_URL
): Promise<{ token: string; user: User }> {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = extractErrorMessage(json, `Login failed (${response.status})`);
    throw new Error(errorMsg);
  }

  return json.data;
}

/**
 * Fetch profile for the currently authenticated user
 */
export async function fetchUserProfile(
  token: string,
  role: Role,
  apiBaseUrl: string = DEFAULT_API_BASE_URL
): Promise<User> {
  const endpoint = role === 'DRIVER' ? '/api/driver/profile' : '/api/passenger/profile';
  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = extractErrorMessage(json, `Failed to load profile (${response.status})`);
    throw new Error(errorMsg);
  }

  return json.data.profile;
}

/**
 * Client-side validation helpers
 */
export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Email is required';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return 'Please enter a valid email address';
  return null;
}

export function validatePassword(password: string, minLength: number = 6): string | null {
  if (!password) return 'Password is required';
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters long`;
  }
  return null;
}

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Name is required';
  if (trimmed.length < 2) return 'Name must be at least 2 characters long';
  return null;
}

export function validateLoginForm(data: LoginCredentials): Record<string, string> {
  const errors: Record<string, string> = {};
  const emailErr = validateEmail(data.email);
  if (emailErr) errors.email = emailErr;

  if (!data.password) {
    errors.password = 'Password is required';
  }
  return errors;
}

export function validateRegisterForm(
  data: RegisterFormFields
): Record<string, string> {
  const errors: Record<string, string> = {};

  const nameErr = validateName(data.name || '');
  if (nameErr) errors.name = nameErr;

  const emailErr = validateEmail(data.email || '');
  if (emailErr) errors.email = emailErr;

  const passwordErr = validatePassword(data.password || '', 6);
  if (passwordErr) errors.password = passwordErr;

  if (data.role === 'DRIVER') {
    if (!data.licenseNumber || !data.licenseNumber.trim()) {
      errors.licenseNumber = 'License number is required for driver registration';
    }
    if (!data.vehicleModel || !data.vehicleModel.trim()) {
      errors.vehicleModel = 'Vehicle model is required for driver registration';
    }
    if (!data.vehiclePlate || !data.vehiclePlate.trim()) {
      errors.vehiclePlate = 'Vehicle plate is required for driver registration';
    }
  }

  return errors;
}

/**
 * Determine the correct dashboard route for a given user role
 */
export function getDashboardRouteForRole(role: Role): string {
  return role === 'DRIVER' ? '/driver/dashboard' : '/passenger/dashboard';
}

/**
 * Check whether a user's role is permitted for a set of allowed roles
 */
export function isAuthorizedRole(userRole: Role | undefined, allowedRoles: Role[]): boolean {
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
}
