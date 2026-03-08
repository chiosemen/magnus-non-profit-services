/**
 * TabBar - Bottom navigation for app screens
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/AppStack';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

export default function TabBar() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={[styles.tabText, route.name === 'Home' && styles.tabTextActive]}>
          Home
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => navigation.navigate('Settings')}
      >
        <Text style={[styles.tabText, route.name === 'Settings' && styles.tabTextActive]}>
          Settings
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingBottom: 20,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabText: {
    fontSize: 14,
    color: '#999',
  },
  tabTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
