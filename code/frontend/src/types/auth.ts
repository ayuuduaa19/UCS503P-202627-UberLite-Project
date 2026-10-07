export type Role = 'PASSENGER' | 'DRIVER';

export type VehicleType = 'STANDARD' | 'PREMIUM' | 'XL';

export interface DriverProfile {
  id: string;
  userId: string;
  licenseNumber: string;
  vehicleType: VehicleType;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleColor: string | null;
  rating: number;
  isAvailable: boolean;
  currentLat: number | null;
  currentLng: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: Role;
  driverProfile?: DriverProfile | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface PassengerRegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: 'PASSENGER';
}

export interface DriverRegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: 'DRIVER';
  licenseNumber: string;
  vehicleType?: VehicleType;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleColor?: string;
}

export type RegisterData = PassengerRegisterData | DriverRegisterData;

export interface RegisterFormFields {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  role?: Role;
  licenseNumber?: string;
  vehicleType?: VehicleType;
  vehicleModel?: string;
  vehiclePlate?: string;
  vehicleColor?: string;
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface ApiSuccessResponse<T> {
  success: true;
  message?: string;
  data: T;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    statusCode?: number;
    details?: ApiErrorDetail[];
  };
}
