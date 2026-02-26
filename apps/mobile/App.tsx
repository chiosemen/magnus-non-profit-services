import React from 'react';
import { SafeAreaView, Text } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>Magnus Mobile</Text>
      <Text>Expo app is running.</Text>
    </SafeAreaView>
  );
}

