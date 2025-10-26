import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { OAuthProvider, signInWithCredential, signOut } from 'firebase/auth';
import { auth, db } from '../services/firebaseClient';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

WebBrowser.maybeCompleteAuthSession();

// Azure AD (Entra)
const MICROSOFT_CLIENT_ID = '30f4acf0-ae27-4da2-aa10-45146236753d';
const ISSUER = 'https://login.microsoftonline.com/4119dba0-2378-496b-968b-696ef51bad2a/v2.0';

// Redirect URIs
const REDIRECT_WEB = 'https://auth.expo.dev/%40elie_t/learning-raiders';
const REDIRECT_NATIVE = 'learningraiders://redirect';

export default function LoginScreen({ navigation }: any) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processedCodesRef = useRef(new Set<string>());

  // Use the proxy on web to avoid page reloads (prevents state loss).
  const useProxy = Platform.OS === 'web';

  // Choose redirect URI per platform
  const redirectUri = useMemo(
    () =>
      useProxy
        ? REDIRECT_WEB
        : AuthSession.makeRedirectUri({ native: REDIRECT_NATIVE }),
    [useProxy]
  );

  // MS discovery
  const discovery = AuthSession.useAutoDiscovery(ISSUER);

  // Build the auth request (let the library manage `state`)
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: MICROSOFT_CLIENT_ID,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
      redirectUri,
      scopes: ['openid', 'profile', 'email', 'offline_access', 'https://graph.microsoft.com/User.Read'],
      extraParams: {
        response_mode: useProxy ? 'fragment' : 'query',
        prompt: 'select_account',
      },
    },
    discovery
  );

  // Handle the authorization response and sign in to Firebase
  useEffect(() => {
    if (!response) return;

    const handleAuthResponse = async () => {
      if (response.type !== 'success') {
        const params: any = (response as any).params ?? {};
        const err = params.error || params.error_description || `Authentication ${response.type}`;
        setError(
          err.includes('AADSTS50011')
            ? 'Redirect URI configuration error.'
            : err.includes('AADSTS50020')
            ? 'Please sign in with your @sagesshs.edu.lb account.'
            : err
        );
        return;
      }

      try {
        setBusy(true);
        setError(null);

        const code = String((response as any).params?.code || '');
        if (!code) throw new Error('No authorization code received');

        if (processedCodesRef.current.has(code)) {
          setBusy(false);
          return; // fast-refresh duplicate
        }
        processedCodesRef.current.add(code);

        if (!discovery?.tokenEndpoint) throw new Error('Microsoft discovery failed');
        if (!request?.codeVerifier) throw new Error('PKCE verification failed');

        // Exchange code for tokens
        const tokens = await AuthSession.exchangeCodeAsync(
          {
            clientId: MICROSOFT_CLIENT_ID,
            code,
            redirectUri,
            extraParams: { code_verifier: request.codeVerifier },
          },
          { tokenEndpoint: discovery.tokenEndpoint }
        );

        const idToken = (tokens as any)?.id_token;
        const accessToken = (tokens as any)?.access_token;
        if (!idToken && !accessToken) throw new Error('No authentication tokens received from Microsoft');

        // Firebase sign-in with Microsoft credential
        const provider = new OAuthProvider('microsoft.com');
        const credential = idToken
          ? provider.credential({ idToken, accessToken })
          : provider.credential({ accessToken });

        const { user } = await signInWithCredential(auth, credential);

        const email = user.email?.trim().toLowerCase();
        if (!email) {
          await signOut(auth);
          throw new Error('No email address found in Microsoft account');
        }

        // Roster gate
        const rosterDoc = await getDoc(doc(db, 'roster', email));
        if (!rosterDoc.exists()) {
          await signOut(auth);
          Alert.alert(
            'Access Denied',
            `Account ${email} is not authorized.\n\nAsk your admin to add you to the roster.`
          );
          setBusy(false);
          return;
        }

        const rosterData = rosterDoc.data() || {};
        await setDoc(
          doc(db, 'users', user.uid),
          {
            uid: user.uid,
            email,
            displayName: rosterData.name || user.displayName || '',
            role: rosterData.role || 'student',
            grade: rosterData.grade || '',
            guildId: (rosterData.grade || '').toLowerCase(),
            lastLoginAt: serverTimestamp(),
          },
          { merge: true }
        );

        processedCodesRef.current.clear();
        navigation.replace('WorldMap');
      } catch (e: any) {
        const code = (response as any)?.params?.code;
        if (code) processedCodesRef.current.delete(String(code));
        setError(e?.message || 'Authentication failed. Please try again.');
        console.log('[Auth] Firebase sign-in error:', e?.code, e?.message, e);
      } finally {
        setBusy(false);
      }
    };

    handleAuthResponse();
  }, [response, discovery, request, redirectUri, navigation]);

  const handleSignIn = async () => {
    setError(null);
    if (!request) {
      setError('Authentication not ready. Please try again in a moment.');
      return;
    }
    try {
      processedCodesRef.current.clear();
      await promptAsync({ useProxy, redirectUri } as any);
    } catch (e: any) {
      setError(e?.message || 'Failed to start sign-in process');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Learning Raiders</Text>
        <Text style={styles.subtitle}>"Your Choices Create Your Path"</Text>

        <Pressable
          style={[styles.signInButton, (!request || busy) && styles.signInButtonDisabled]}
          disabled={!request || busy}
          onPress={handleSignIn}
        >
          {busy ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.signInButtonText}>Sign in with Microsoft</Text>}
        </Pressable>

        {!request && <Text style={styles.loadingText}>Preparing authentication…</Text>}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <Text style={styles.footerText}>Use your @sagesshs.edu.lb account to access the application</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#333', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 18, color: '#666', fontStyle: 'italic', marginBottom: 48, textAlign: 'center' },
  signInButton: {
    backgroundColor: '#0078d4',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
    marginBottom: 16,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }
      : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }),
  },
  signInButtonDisabled: { backgroundColor: '#ccc', ...(Platform.OS === 'web' ? { boxShadow: 'none' } : { shadowOpacity: 0, elevation: 0 }) },
  signInButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  loadingText: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 16 },
  errorContainer: { backgroundColor: '#ffebee', padding: 16, borderRadius: 8, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#f44336', maxWidth: 420 },
  errorText: { color: '#c62828', fontSize: 14, textAlign: 'center' },
  footerText: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 32, maxWidth: 300 },
});