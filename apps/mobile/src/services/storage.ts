/**
 * Secure token storage using expo-secure-store
 * Fail-closed: returns null on any error
 */

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';

export async function saveToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (err) {
    console.error('Failed to save token:', err);
    throw new Error('STORAGE_ERROR');
  }
}

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (err) {
    console.error('Failed to get token:', err);
    return null;
  }
}

export async function deleteToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (err) {
    console.error('Failed to delete token:', err);
    // Don't throw - logout should always succeed
  }
}
