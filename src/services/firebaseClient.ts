// src/services/firebaseClient.ts
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  browserLocalPersistence,
  Auth,
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirestore, Firestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Platform } from 'react-native';

// Only load AsyncStorage on native
let AsyncStorage: any = null;
if (Platform.OS !== 'web') {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
}

const firebaseConfig = {
  apiKey: 'AIzaSyB9Ofg50QQzppACes4Mh0ckmDXVkhxvTlY',
  authDomain: 'quest-and-conquer.firebaseapp.com',
  projectId: 'quest-and-conquer',
  storageBucket: 'quest-and-conquer.appspot.com',
  messagingSenderId: '233709738233',
  appId: '1:233709738233:web:7aad0ad896ce8a68eeea28',
};

// Reuse or init the app
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Singleton auth init per runtime
let authInstance: Auth;

if (!(globalThis as any).__auth_initialized__) {
  if (Platform.OS === 'web') {
    authInstance = initializeAuth(app, { persistence: browserLocalPersistence });
  } else {
    authInstance = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }
  (globalThis as any).__auth_initialized__ = true;
} else {
  authInstance = getAuth(app);
}

export const auth: Auth = authInstance;
export const db: Firestore = getFirestore(app);

// Optional helper used by AuthProvider
export const ensureUserDoc = async (user: { uid: string; email?: string | null; displayName?: string | null }) => {
  if (!user?.uid) return;
  const email = (user.email || '').toLowerCase().trim();

  await setDoc(
    doc(db, 'users', user.uid),
    {
      uid: user.uid,
      email,
      displayName: user.displayName || '',
      lastLoginAt: serverTimestamp(),
    },
    { merge: true }
  );
};