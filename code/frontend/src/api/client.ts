import type { ApiResponse, AuthResponse, DriverProfile, Ride, User, VehicleType } from '../types';

const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public getToken(): string | null {
    return localStorage.getItem('uberlite_token');
  }

  public setToken(token: string): void {
    localStorage.setItem('uberlite_token', token);
  }

  public removeToken(): void {
    localStorage.removeItem('uberlite_token');
    localStorage.removeItem('uberlite_user');
  }

  public getStoredUser(): { user: User; driver?: DriverProfile | null } | null {
    const raw = localStorage.getItem('uberlite_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public setStoredUser(user: User, driver?: DriverProfile | null): void {
    localStorage.setItem('uberlite_user', JSON.stringify({ user, driver }));
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage =
          data?.error?.message ||
          data?.message ||
          `Request failed with status ${response.status}`;
        const error = new Error(errorMessage) as any;
        error.statusCode = response.status;
        error.code = data?.error?.code;
        error.details = data?.error?.details;
        throw error;
      }

      return data;
    } catch (err: any) {
      // Re-throw formatted error
      throw err;
    }
  }

  public get<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T>(endpoint: string, body?: any, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public patch<T>(endpoint: string, body?: any, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public put<T>(endpoint: string, body?: any, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public delete<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  // ─── Authentication API Endpoints ──────────────────────────────────────────
  public async login(email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    const res = await this.post<AuthResponse>('/api/auth/login', { email, password });
    if (res.data?.token) {
      this.setToken(res.data.token);
      this.setStoredUser(res.data.user, res.data.driver);
    }
    return res;
  }

  public async register(payload: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    role: 'PASSENGER' | 'DRIVER';
    licenseNumber?: string;
    vehicleType?: VehicleType;
    vehicleModel?: string;
    vehiclePlate?: string;
    vehicleColor?: string;
  }): Promise<ApiResponse<AuthResponse>> {
    const res = await this.post<AuthResponse>('/api/auth/register', payload);
    if (res.data?.token) {
      this.setToken(res.data.token);
      this.setStoredUser(res.data.user, res.data.driver);
    }
    return res;
  }

  // ─── Passenger API Endpoints ───────────────────────────────────────────────
  public async getPassengerProfile(): Promise<ApiResponse<User>> {
    return this.get<User>('/api/passenger/profile');
  }

  public async requestRide(payload: {
    pickupAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropoffAddress: string;
    dropoffLat: number;
    dropoffLng: number;
    distanceKm?: number;
    durationMin?: number;
    vehicleType?: VehicleType;
  }): Promise<ApiResponse<Ride>> {
    return this.post<Ride>('/api/passenger/rides', payload);
  }

  public async getPassengerRides(status?: string): Promise<ApiResponse<Ride[]>> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.get<Ride[]>(`/api/passenger/rides${query}`);
  }

  public async getPassengerRideHistory(): Promise<ApiResponse<Ride[]>> {
    return this.get<Ride[]>('/api/passenger/rides/history');
  }

  public async getRideDetails(rideId: string): Promise<ApiResponse<Ride>> {
    return this.get<Ride>(`/api/passenger/rides/${rideId}`);
  }

  public async matchRide(rideId: string): Promise<ApiResponse<Ride>> {
    return this.post<Ride>(`/api/passenger/rides/${rideId}/match`);
  }

  public async estimateFare(payload: {
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    vehicleType?: VehicleType;
  }): Promise<ApiResponse<any>> {
    return this.post<any>('/api/passenger/fare/estimate', payload);
  }

  public async submitRideFeedback(
    rideId: string,
    rating: number,
    comment?: string,
  ): Promise<ApiResponse<any>> {
    return this.post<any>(`/api/passenger/rides/${rideId}/feedback`, { rating, comment });
  }

  // ─── Driver API Endpoints ──────────────────────────────────────────────────
  public async getDriverProfile(): Promise<ApiResponse<DriverProfile & { user: User }>> {
    return this.get<DriverProfile & { user: User }>('/api/driver/profile');
  }

  public async getDriverAvailability(): Promise<ApiResponse<{ isAvailable: boolean }>> {
    return this.get<{ isAvailable: boolean }>('/api/driver/availability');
  }

  public async updateDriverAvailability(isAvailable: boolean): Promise<ApiResponse<DriverProfile>> {
    return this.patch<DriverProfile>('/api/driver/availability', { isAvailable });
  }

  public async updateDriverLocation(lat: number, lng: number): Promise<ApiResponse<DriverProfile>> {
    return this.patch<DriverProfile>('/api/driver/location', { lat, lng });
  }

  public async acceptRide(rideId: string): Promise<ApiResponse<Ride>> {
    return this.patch<Ride>(`/api/driver/rides/${rideId}/accept`);
  }

  public async rejectRide(rideId: string): Promise<ApiResponse<Ride>> {
    return this.patch<Ride>(`/api/driver/rides/${rideId}/reject`);
  }

  public async startRide(rideId: string): Promise<ApiResponse<Ride>> {
    return this.patch<Ride>(`/api/driver/rides/${rideId}/start`);
  }

  public async completeRide(
    rideId: string,
    distanceKm?: number,
    durationMin?: number,
  ): Promise<ApiResponse<Ride>> {
    return this.patch<Ride>(`/api/driver/rides/${rideId}/complete`, {
      distanceKm,
      durationMin,
    });
  }

  public async getDriverRides(status?: string): Promise<ApiResponse<Ride[]>> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.get<Ride[]>(`/api/driver/rides${query}`);
  }

  public async getDriverRideHistory(): Promise<ApiResponse<Ride[]>> {
    return this.get<Ride[]>('/api/driver/rides/history');
  }

  public async getDriverFeedbacks(): Promise<ApiResponse<any[]>> {
    return this.get<any[]>('/api/driver/feedbacks');
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
