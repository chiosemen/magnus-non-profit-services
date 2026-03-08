/**
 * API client for Magnus backend
 * Uses EXPO_PUBLIC_API_BASE_URL from env
 */

import axios, { type AxiosInstance } from 'axios';
import { getToken } from './storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export type LoginCredentials = {
  email: string;
  password: string;
};

export type UserProfile = {
  userId: string;
  orgId: string;
  role: string;
};

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  async login(credentials: LoginCredentials): Promise<{ success: boolean }> {
    const formData = new URLSearchParams();
    formData.append('email', credentials.email);
    formData.append('password', credentials.password);

    const response = await this.client.post('/api/login', formData.toString(), {
      // Follow redirects manually to capture cookies
      maxRedirects: 0,
      validateStatus: (status) => status === 302 || status === 200,
    });

    // Backend returns 302 redirect on success
    return { success: response.status === 302 || response.status === 200 };
  }

  async getMe(): Promise<UserProfile> {
    const token = await getToken();
    if (!token) {
      throw new Error('AUTH_REQUIRED');
    }

    const response = await this.client.get<UserProfile>('/api/me', {
      headers: {
        Cookie: `session=${token}`,
      },
    });

    return response.data;
  }

  async logout(): Promise<void> {
    const token = await getToken();
    if (!token) return;

    try {
      await this.client.post('/api/auth/logout', null, {
        headers: {
          Cookie: `session=${token}`,
        },
      });
    } catch (err) {
      // Fail open: logout should always succeed locally
      console.error('Logout request failed:', err);
    }
  }
}

export const apiClient = new ApiClient();
