import {
  useCallback,
  useState,
  type ReactNode,
} from 'react';
import type { LoginCredentials, RegisterData, Role, User } from '../types/auth';
import {
  clearAuthSession,
  getStoredSession,
  loginUser,
  registerUser,
  saveAuthSession,
} from '../utils/auth';
import { AuthContext, type AuthContextType } from './authContextDef';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ user: User | null; token: string | null }>(() => {
    try {
      const stored = getStoredSession();
      if (stored) {
        return { user: stored.user, token: stored.token };
      }
    } catch (err) {
      console.error('Error restoring session from localStorage:', err);
      clearAuthSession();
    }
    return { user: null, token: null };
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const user = session.user;
  const token = session.token;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials): Promise<User> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await loginUser(credentials);
      saveAuthSession(result.token, result.user);
      setSession({ user: result.user, token: result.token });
      return result.user;
    } catch (err: any) {
      const msg = err.message || 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(
    async (data: RegisterData, autoLogin: boolean = true): Promise<User | void> => {
      setIsLoading(true);
      setError(null);
      try {
        const { user: registeredUser } = await registerUser(data);

        if (autoLogin) {
          const loginResult = await loginUser({
            email: data.email,
            password: data.password,
          });
          saveAuthSession(loginResult.token, loginResult.user);
          setSession({ user: loginResult.user, token: loginResult.token });
          return loginResult.user;
        }

        return registeredUser;
      } catch (err: any) {
        const msg = err.message || 'Registration failed';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const logout = useCallback(() => {
    clearAuthSession();
    setSession({ user: null, token: null });
    setError(null);
  }, []);

  const hasRole = useCallback(
    (role: Role): boolean => {
      return !!user && user.role === role;
    },
    [user]
  );

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    isLoading,
    error,
    login,
    register,
    logout,
    clearError,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
