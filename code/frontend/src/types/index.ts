export type Role = 'PASSENGER' | 'DRIVER' | 'ADMIN';

export type VehicleType = 'STANDARD' | 'PREMIUM' | 'XL';

export type RideStatus =
  | 'REQUESTED'
  | 'MATCHED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: Role;
  createdAt?: string;
}

export interface DriverProfile {
  id: string;
  userId: string;
  licenseNumber: string;
  vehicleType: VehicleType;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleColor?: string | null;
  isAvailable: boolean;
  currentLat?: number | null;
  currentLng?: number | null;
  rating: number;
}

export interface Fare {
  id: string;
  rideId: string;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  surgeMultiplier: number;
  totalFare: number;
  currency: string;
  paymentStatus: PaymentStatus;
  paymentMethod?: string | null;
}

export interface Feedback {
  id: string;
  rideId: string;
  userId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
  };
}

export interface Ride {
  id: string;
  passengerId: string;
  driverId?: string | null;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress: string;
  status: RideStatus;
  distanceKm?: number | null;
  durationMin?: number | null;
  fare?: Fare | null;
  feedbacks?: Feedback[];
  passenger?: {
    id: string;
    name: string;
    phone?: string | null;
    email: string;
  };
  driver?: (DriverProfile & {
    user?: {
      name: string;
      phone?: string | null;
      email: string;
    };
  }) | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  driver?: DriverProfile | null;
  token: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    statusCode: number;
    message: string;
    code?: string;
    details?: any;
  };
}
