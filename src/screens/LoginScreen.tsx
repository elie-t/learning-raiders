// src/screens/LoginScreen.tsx — minimal Microsoft login with guaranteed ID token (Expo Web/Netlify)

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

// === Azure AD (Entra) app info ===
const CLIENT_ID = "30f4acf0-ae27-4da2-aa10-45146236753d";
const TENANT_ID = "4119dba0-2378-496b-968b-696ef51bad2a";
const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

// Register BOTH in Azure > Authentication > Single-page application (SPA):
// • http://localhost:8081
// • https://learning-raiders.netlify.app
const REDIRECT_URI =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:8081";

export default function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);

  // OIDC state + nonce
  const state = useMemo(() => Math.random().toString(36).slice(2), []);
  const nonce = useMemo(() => Math.random().toString(36).slice(2), []);

  const discovery = AuthSession.useAutoDiscovery(ISSUER);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,   // Authorization Code + PKCE
      usePKCE: true,
      scopes: ["openid", "profile", "email", "offline_access"],
      extraParams: {
        response_mode: "query",
        state,
        nonce, // helps some IdPs; good OIDC practice
        // client_info: "1", // optional: can include this if you want AAD client_info
      },
    },
    discovery
  );

  // quick JWT decode for the ID token
  function decodeJwt(token: string) {
    try {
      const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(base64));
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (response?.type !== "success") return;
    const { code, state: returnedState } = (response.params as any) || {};
    if (!code) {
      setError("No authorization code returned.");
      return;
    }
    if (returnedState && returnedState !== state) {
      setError("Invalid authentication state.");
      return;
    }
    exchangeCodeForTokens(code);
  }, [response]);

  async function exchangeCodeForTokens(code: string) {
    try {
      setBusy(true);
      setError(null);
      if (!discovery?.tokenEndpoint) throw new Error("Missing token endpoint");

      const tokens = await AuthSession.exchangeCodeAsync(
        {
          clientId: CLIENT_ID,
          code,
          redirectUri: REDIRECT_URI,
          // IMPORTANT: include scope again so AAD issues an id_token
          extraParams: {
            code_verifier: request?.codeVerifier || "",
            scope: "openid profile email offline_access",
          },
        },
        { tokenEndpoint: discovery.tokenEndpoint }
      );

      const idToken = (tokens as any)?.id_token;
      if (!idToken) throw new Error("No ID token received from Microsoft");

      const claims = decodeJwt(idToken);
      setUser({
        name: claims?.name,
        email: claims?.email || claims?.preferred_username,
      });
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Learning Raiders</Text>
      <Text style={styles.subtitle}>"Your Choices Create Your Path"</Text>

      {!user ? (
        <Pressable
          onPress={() => promptAsync()}
          style={[styles.button, (!request || busy) && styles.buttonDisabled]}
          disabled={!request || busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in with Microsoft</Text>}
        </Pressable>
      ) : (
        <View style={styles.card}>
          <Text style={styles.success}>✅ Signed in!</Text>
          <Text style={styles.info}>Name: {user.name}</Text>
          <Text style={styles.info}>Email: {user.email}</Text>
          <Pressable style={[styles.button, styles.secondary]} onPress={() => setUser(null)}>
            <Text style={styles.buttonText}>Sign out</Text>
          </Pressable>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 30, fontWeight: "700", marginBottom: 6, color: "#333" },
  subtitle: { fontSize: 16, color: "#666", marginBottom: 40, fontStyle: "italic" },
  button: {
    backgroundColor: "#0078d4",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 220,
    alignItems: "center",
  },
  buttonDisabled: { backgroundColor: "#aaccee" },
  buttonText: { color: "#fff", fontWeight: "600" },
  card: { backgroundColor: "#f9f9f9", borderRadius: 8, padding: 20, alignItems: "center", width: 300 },
  success: { color: "#2e7d32", fontWeight: "bold", marginBottom: 8 },
  info: { color: "#333", marginBottom: 4 },
  secondary: { backgroundColor: "#444", marginTop: 12 },
  error: { color: "#c62828", marginTop: 20, textAlign: "center" },
});