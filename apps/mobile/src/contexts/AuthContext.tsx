/**
 * AuthContext - Manages authentication state
 * Fail-closed: invalid/expired tokens trigger logout
 */

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { apiClient, type LoginCredentials, type UserProfile } from '../services/api';
import { saveToken, getToken, deleteToken } from '../services/storage';

type AuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: UserProfile | null;
  login: (credentials: LoginCredentials, sessionToken: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);

  const checkAuth = async () => {
    try {
      const token = await getToken();
      if (!token) {
        setIsAuthenticated(false);
        setUser(null);
        return;
      }

      const profile = await apiClient.getMe();
      setIsAuthenticated(true);
      setUser(profile);
    } catch (err) {
      // Fail closed: invalid/expired token -> logout
      console.error('Auth check failed:', err);
      await deleteToken();
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials, sessionToken: string) => {
    try {
      await saveToken(sessionToken);
      const profile = await apiClient.getMe();
      setIsAuthenticated(true);
      setUser(profile);
    } catch (err) {
      await deleteToken();
      throw err;
    }
  };

  const logout = async () => {
    try {
      await apiClient.logout();
    } finally {
      await deleteToken();
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        user,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
