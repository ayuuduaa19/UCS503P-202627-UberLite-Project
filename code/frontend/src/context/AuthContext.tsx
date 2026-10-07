import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { DriverProfile, Role, User, VehicleType } from '../types';

interface AuthContextType {
  user: User | null;
  driver: DriverProfile | null;
  token: string | null;
  role: Role | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
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
  }) => Promise<void>;
  logout: () => void;
  setDemoUser: (role: 'PASSENGER' | 'DRIVER') => void;
  updateDriverProfile: (partial: Partial<DriverProfile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const storedToken = apiClient.getToken();
    const stored = apiClient.getStoredUser();

    if (storedToken && stored) {
      setToken(storedToken);
      setUser(stored.user);
      setDriver(stored.driver || null);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiClient.login(email, password);
      if (res.data) {
        setUser(res.data.user);
        setDriver(res.data.driver || null);
        setToken(res.data.token);
      }
    } catch (err) {
      setIsLoading(false);
      throw err;
    }
    setIsLoading(false);
  };

  const register = async (payload: {
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
  }) => {
    setIsLoading(true);
    try {
      const res = await apiClient.register(payload);
      if (res.data) {
        setUser(res.data.user);
        setDriver(res.data.driver || null);
        setToken(res.data.token);
      }
    } catch (err) {
      setIsLoading(false);
      throw err;
    }
    setIsLoading(false);
  };

  const logout = () => {
    apiClient.removeToken();
    setUser(null);
    setDriver(null);
    setToken(null);
  };

  const setDemoUser = (roleType: 'PASSENGER' | 'DRIVER') => {
    if (roleType === 'PASSENGER') {
      const demoPassenger: User = {
        id: 'demo-passenger-uuid',
        name: 'Alice Passenger',
        email: 'alice@uberlite.local',
        phone: '+91 9876543210',
        role: 'PASSENGER',
      };
      const demoToken = 'demo-jwt-passenger-token';
      apiClient.setToken(demoToken);
      apiClient.setStoredUser(demoPassenger, null);
      setUser(demoPassenger);
      setDriver(null);
      setToken(demoToken);
    } else {
      const demoDriverUser: User = {
        id: 'demo-driver-user-uuid',
        name: 'Bob Driver',
        email: 'bob@uberlite.local',
        phone: '+91 9123456780',
        role: 'DRIVER',
      };
      const demoDriverProfile: DriverProfile = {
        id: 'demo-driver-uuid',
        userId: demoDriverUser.id,
        licenseNumber: 'DL-IND-2026-7890',
        vehicleType: 'STANDARD',
        vehicleModel: 'Hyundai Aura',
        vehiclePlate: 'DL-01-AB-1234',
        vehicleColor: 'Silver Metallic',
        isAvailable: true,
        currentLat: 28.6139,
        currentLng: 77.209,
        rating: 4.9,
      };
      const demoToken = 'demo-jwt-driver-token';
      apiClient.setToken(demoToken);
      apiClient.setStoredUser(demoDriverUser, demoDriverProfile);
      setUser(demoDriverUser);
      setDriver(demoDriverProfile);
      setToken(demoToken);
    }
  };

  const updateDriverProfile = (partial: Partial<DriverProfile>) => {
    setDriver((prev) => (prev ? { ...prev, ...partial } : null));
  };

  const value: AuthContextType = {
    user,
    driver,
    token,
    role: user?.role || null,
    isAuthenticated: !!user && !!token,
    isLoading,
    login,
    register,
    logout,
    setDemoUser,
    updateDriverProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
