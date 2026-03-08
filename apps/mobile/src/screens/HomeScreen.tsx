/**
 * HomeScreen - Main dashboard
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import TabBar from '../components/TabBar';

export default function HomeScreen() {
  const { user } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.subtitle}>Welcome to Magnus</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Profile</Text>
        <View style={styles.row}>
          <Text style={styles.label}>User ID:</Text>
          <Text style={styles.value}>{user?.userId ?? 'N/A'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Organization:</Text>
          <Text style={styles.value}>{user?.orgId ?? 'N/A'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Role:</Text>
          <Text style={styles.value}>{user?.role ?? 'N/A'}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick Actions</Text>
        <Text style={styles.placeholder}>
          • View compliance alerts{'\n'}
          • Check grant status{'\n'}
          • Review worker income{'\n'}
          • Generate reports
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Magnus Nonprofit OS</Text>
        <Text style={styles.footerText}>Mobile MVP v0.1.0</Text>
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  card: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  placeholder: {
    fontSize: 14,
    color: '#999',
    lineHeight: 24,
  },
  footer: {
    alignItems: 'center',
    padding: 20,
    marginTop: 20,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
});
