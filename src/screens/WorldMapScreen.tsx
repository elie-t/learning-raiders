// src/screens/WorldMapScreen.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { auth } from '../services/firebaseClient';

const WorldMapScreen: React.FC = () => {
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: '800', marginBottom: 8 }}>World Map</Text>
      <Text style={{ opacity: 0.7, marginBottom: 24 }}>Welcome to Math Island, Raider!</Text>

      <Pressable
        onPress={() => auth.signOut()}
        style={{ padding: 12, borderRadius: 12, borderWidth: 1 }}
      >
        <Text>Sign out</Text>
      </Pressable>
    </View>
  );
};

export default WorldMapScreen;