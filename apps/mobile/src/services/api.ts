/**
 * API client for Magnus backend (Next.js web app as BFF).
 * Uses EXPO_PUBLIC_API_BASE_URL from env.
 */

import axios, { type AxiosInstance } from 'axios';
import { getToken } from './storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export type LoginWithEinCredentials = {
  ein: string;
  email: string;
  password: string;
};

export type UserProfile = {
  userId: string;
  orgId: string;
  role: string;
};

export type SectionState<T> =
  | { available: true; data: T }
  | { available: false; reason: string; message: string };

export type OrgReadinessPayload = {
  org: SectionState<{
    id: string;
    ein: string;
    name: string;
    subscriptionTier: string;
    complianceItemCount: number;
    grantCount: number;
  }>;
  compliance: SectionState<{
    itemCount: number;
    nextDueDate: string | null;
  }>;
  governance: SectionState<{
    boardMembersCount: number;
    complete: boolean;
    completionRate: number;
    issueCount: number;
    totalChecks: number;
  }>;
  restrictedFunds: SectionState<{
    fundCount: number;
    totalRestrictedAmountUsd: number;
  }>;
  auditPrep: SectionState<{
    overallStatus: string;
    totalItems: number;
    openItems: number;
    blockedItems: number;
    overdueItems: number;
    disclaimer: string;
  }>;
  caveat: string;
};

function loginErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'ORG_NOT_FOUND':
      return 'No organization found for that EIN.';
    case 'WORKER_NOT_FOUND':
      return 'No account found for that email.';
    case 'CREDENTIALS_INVALID':
      return 'Incorrect password.';
    case 'NOT_ASSOCIATED':
      return 'That email is not linked to this organization.';
    case 'RATE_LIMITED':
      return 'Too many attempts. Try again later.';
    case 'INVALID_INPUT':
      return 'Please enter EIN, email, and password.';
    default:
      return 'Sign-in failed. Check your details and try again.';
  }
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 20000,
    });
  }

  /**
   * JSON login for native clients. Returns access JWT (same as web session cookie).
   */
  async loginWithEin(credentials: LoginWithEinCredentials): Promise<string> {
    const url = `${API_BASE_URL}/api/auth/login?includeAccessToken=true`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        ein: credentials.ein.replace(/\s/g, ''),
        email: credentials.email.trim().toLowerCase(),
        password: credentials.password,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; accessToken?: string; error?: string; retryAfterSec?: number };
    if (!res.ok) {
      throw new Error(loginErrorMessage(data.error));
    }
    if (typeof data.accessToken !== 'string' || data.accessToken.length === 0) {
      throw new Error('Server did not return an access token.');
    }
    return data.accessToken;
  }

  async getMe(): Promise<UserProfile> {
    const token = await getToken();
    if (!token) {
      throw new Error('AUTH_REQUIRED');
    }

    const response = await this.client.get<UserProfile>('/api/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  }

  async getOrgReadiness(): Promise<OrgReadinessPayload> {
    const token = await getToken();
    if (!token) {
      throw new Error('AUTH_REQUIRED');
    }

    const response = await this.client.get<OrgReadinessPayload>('/api/mobile/org-readiness', {
      headers: {
        Authorization: `Bearer ${token}`,
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
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (err) {
      console.error('Logout request failed:', err);
    }
  }
}

export const apiClient = new ApiClient();
