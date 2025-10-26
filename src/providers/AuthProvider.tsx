// src/providers/AuthProvider.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth } from '../services/firebaseClient';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ensureUserDoc } from '../services/firebaseClient';
import { ActivityIndicator, View } from 'react-native';

type AuthContextType = {
  user: User | null;
};

const AuthContext = createContext<AuthContextType>({ user: null });
export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const sub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) await ensureUserDoc(u);
      setBooting(false);
    });
    return () => sub();
  }, []);

  const value = useMemo(() => ({ user }), [user]);

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};