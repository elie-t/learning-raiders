// src/screens/LoginScreen.tsx — Minimal Microsoft login (no Firebase), web-friendly

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from "react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

// === Your Entra (Azure AD) app ===
const CLIENT_ID = "30f4acf0-ae27-4da2-aa10-45146236753d";
const TENANT_ID = "4119dba0-2378-496b-968b-696ef51bad2a";
const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

// Register BOTH of these as SPA redirect URIs in Azure:
// • http://localhost:8081
// • https://learning-raiders.netlify.app
const REDIRECT_URI =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:8081";

export default function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);

  // Good OIDC practice: send a nonce; we won't validate it client-side
  const nonce = useMemo(() => Math.random().toString(36).slice(2), []);

  const discovery = AuthSession.useAutoDiscovery(ISSUER);

  // Let AuthSession generate & validate its own state
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      scopes: ["openid", "profile", "email", "offline_access"],
      extraParams: {
        response_mode: "query",
        nonce,
      },
    },
    discovery
  );

  // Tiny helper to decode JWTs
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
    const { code } = (response.params as any) || {};
    if (!code) {
      setError("No authorization code returned.");
      return;
    }
    exchange(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  async function exchange(code: string) {
    try {
      setBusy(true);
      setError(null);
      if (!discovery?.tokenEndpoint) throw new Error("Missing token endpoint");

      // Include scope again here so AAD reliably issues an id_token
      const tokens = await AuthSession.exchangeCodeAsync(
        {
          clientId: CLIENT_ID,
          code,
          redirectUri: REDIRECT_URI,
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

  async function handleSignIn() {
    setError(null);
    if (!request) {
      setError("Auth not ready yet. Please try again in a moment.");
      return;
    }
    // Don’t pass custom redirect/state; keep it simple on web
    await promptAsync({ useProxy: false });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Learning Raiders</Text>
      <Text style={styles.subtitle}>"Your Choices Create Your Path"</Text>

      {!user ? (
        <Pressable
          onPress={handleSignIn}
          style={[styles.button, (!request || busy) && styles.buttonDisabled]}
          disabled={!request || busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in with Microsoft</Text>}
        </Pressable>
      ) : (
        <View style={styles.card}>
          <Text style={styles.success}>✅ Signed in</Text>
          <Text style={styles.info}>Name: {user.name || "—"}</Text>
          <Text style={styles.info}>Email: {user.email || "—"}</Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.footer}>
        Redirect URI in Azure must match exactly: {REDIRECT_URI}
      </Text>
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
  card: { backgroundColor: "#f9f9f9", borderRadius: 8, padding: 20, alignItems: "center", width: 320, marginTop: 16 },
  success: { color: "#2e7d32", fontWeight: "bold", marginBottom: 8 },
  info: { color: "#333", marginBottom: 4 },
  error: { color: "#c62828", marginTop: 18, textAlign: "center" },
  footer: { marginTop: 18, color: "#999", fontSize: 12, textAlign: "center" },
});