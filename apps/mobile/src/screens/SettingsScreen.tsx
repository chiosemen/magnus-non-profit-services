/**
 * SettingsScreen - User settings and logout
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import TabBar from '../components/TabBar';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setIsLoading(true);
          try {
            await logout();
          } catch (err) {
            console.error('Logout error:', err);
          } finally {
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>User ID</Text>
            <Text style={styles.value}>{user?.userId ?? 'N/A'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Organization</Text>
            <Text style={styles.value}>{user?.orgId ?? 'N/A'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Role</Text>
            <Text style={styles.value}>{user?.role ?? 'N/A'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Info</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Version</Text>
            <Text style={styles.value}>0.1.0 MVP</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Environment</Text>
            <Text style={styles.value}>
              {process.env.NODE_ENV ?? 'development'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.logoutButton, isLoading && styles.logoutButtonDisabled]}
          onPress={handleLogout}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Magnus Nonprofit OS</Text>
        <Text style={styles.footerText}>
          © {new Date().getFullYear()} Magnus. All rights reserved.
        </Text>
      </View>
    </ScrollView>
    <TabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  label: {
    fontSize: 16,
    color: '#333',
  },
  value: {
    fontSize: 16,
    color: '#666',
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  logoutButtonDisabled: {
    opacity: 0.6,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    padding: 32,
    marginTop: 20,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
});
