// src/providers/AuthProvider.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View, AppState } from 'react-native';

interface User {
  id: string;
  email: string;
  name: string;
  givenName: string;
  surname: string;
  accessToken: string;
  idToken: string;
  loginTime: string;
}

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshAuthState: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  loading: true,
  signOut: async () => {},
  refreshAuthState: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthState();
    
    // Listen for app state changes to check auth when app becomes active
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkAuthState();
      }
    });

    return () => subscription?.remove();
  }, []);

  const checkAuthState = async () => {
    try {
      console.log('Checking auth state...');
      const isLoggedIn = await AsyncStorage.getItem('isLoggedIn');
      const userDataString = await AsyncStorage.getItem('user');
      
      console.log('IsLoggedIn:', isLoggedIn);
      console.log('UserData exists:', !!userDataString);
      
      if (isLoggedIn === 'true' && userDataString) {
        const userData = JSON.parse(userDataString);
        console.log('Setting user data:', userData.email);
        setUser(userData);
      } else {
        console.log('No valid auth data found');
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshAuthState = async () => {
    setLoading(true);
    await checkAuthState();
  };

  const signOut = async () => {
    try {
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('isLoggedIn');
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const value = useMemo(() => ({ 
    user, 
    loading,
    signOut,
    refreshAuthState
  }), [user, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#0078d4" />
      </View>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};