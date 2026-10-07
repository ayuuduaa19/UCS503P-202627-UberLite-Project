import { createContext } from 'react';
import type { LoginCredentials, RegisterData, Role, User } from '../types/auth';

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<User>;
  register: (data: RegisterData, autoLogin?: boolean) => Promise<User | void>;
  logout: () => void;
  clearError: () => void;
  hasRole: (role: Role) => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
