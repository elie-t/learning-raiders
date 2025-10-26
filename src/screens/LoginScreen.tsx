// src/screens/LoginScreen.tsx — Microsoft → Firebase (no roster check)
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { OAuthProvider, signInWithCredential, signOut } from "firebase/auth";
import { auth, db } from "../services/firebaseClient";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

// Make web popups complete the session properly
WebBrowser.maybeCompleteAuthSession();

/**
 * === Azure AD app values ===
 * Make sure these match your App Registration.
 */
const MICROSOFT_CLIENT_ID = "30f4acf0-ae27-4da2-aa10-45146236753d";
const TENANT_ID = "4119dba0-2378-496b-968b-696ef51bad2a";
const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

/**
 * Redirect URI:
 * - On web we use the current origin so it works for Netlify prod and localhost dev
 *   (be sure this exact URL is added in Azure: e.g. https://learning-raiders.netlify.app and/or http://localhost:8081)
 * - On native we go through the Expo proxy (no extra setup on Azure beyond adding https://auth.expo.dev/@yourUser/yourSlug if you use custom proxy).
 */
function useRedirectUri() {
  return useMemo(() => {
    if (Platform.OS === "web") {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "http://localhost:8081";
      console.log("[Auth] Web redirect URI:", origin);
      return origin; // must be registered in Azure exactly
    }
    // Native / Expo Go
    const uri = AuthSession.makeRedirectUri({ useProxy: true });
    console.log("[Auth] Native redirect URI (proxy):", uri);
    return uri;
  }, []);
}

export default function LoginScreen({ navigation }: any) {
  const redirectUri = useRedirectUri();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processedCodesRef = useRef(new Set<string>());

  // Discovery for Azure endpoints
  const discovery = AuthSession.useAutoDiscovery(ISSUER);

  // Stable state for CSRF/replay protection
  const state = useMemo(() => Math.random().toString(36).slice(2, 12), []);

  // Build the OAuth authorization request
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: MICROSOFT_CLIENT_ID,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
      redirectUri,
      scopes: ["openid", "profile", "email", "offline_access", "User.Read"],
      extraParams: {
        // Query is easiest for web; fragment also works with proxy flows
        response_mode: Platform.OS === "web" ? "query" : "fragment",
        prompt: "select_account",
        state,
      },
    },
    discovery
  );

  // Handle the auth response
  useEffect(() => {
    if (!response) return;

    const handleAuthResponse = async () => {
      if (response.type !== "success") {
        const params: any = (response as any).params || {};
        const errorCode = params.error || "";
        const errorDescription = params.error_description || "";

        if (errorCode === "AADSTS50011" || errorDescription.includes("AADSTS50011")) {
          setError(
            "Redirect URI mismatch. Make sure this exact URL is added in Azure."
          );
        } else if (errorCode === "AADSTS50020" || errorDescription.includes("AADSTS50020")) {
          setError("Please sign in with your @sagesshs.edu.lb account.");
        } else if (response.type === "dismiss") {
          setError("Sign-in was cancelled.");
        } else {
          setError(errorDescription || errorCode || `Authentication ${response.type}`);
        }
        return;
      }

      try {
        setBusy(true);
        setError(null);

        const params: any = (response as any).params || {};
        const code: string = String(params.code || "");
        const returnedState: string | undefined = params.state;

        if (!code) throw new Error("No authorization code received.");
        if (returnedState && returnedState !== state)
          throw new Error("Invalid authentication state");

        // avoid Fast Refresh double-processing
        if (processedCodesRef.current.has(code)) {
          console.log("[Auth] Duplicate code ignored");
          return;
        }
        processedCodesRef.current.add(code);

        if (!discovery?.tokenEndpoint) throw new Error("Microsoft discovery failed");
        if (!request?.codeVerifier) throw new Error("PKCE verification failed");

        // Exchange the code for tokens
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
        if (!idToken && !accessToken)
          throw new Error("No authentication tokens received from Microsoft");

        console.log("[Auth] Tokens acquired (id/access). Proceeding to Firebase…");

        // Sign into Firebase using Microsoft provider
        const provider = new OAuthProvider("microsoft.com");
        const credential = idToken
          ? provider.credential({ idToken, accessToken })
          : provider.credential({ accessToken });

        const { user } = await signInWithCredential(auth, credential);

        const email = user.email?.trim().toLowerCase();
        if (!email) {
          await signOut(auth);
          throw new Error("No email address present on Microsoft account");
        }

        // Create/update a basic user profile (NO ROSTER CHECK)
        await setDoc(
          doc(db, "users", user.uid),
          {
            uid: user.uid,
            email,
            displayName: user.displayName || "",
            lastLoginAt: serverTimestamp(),
            // you can add any defaults you like here
            role: "student",
            grade: "",
            guildId: "",
          },
          { merge: true }
        );

        processedCodesRef.current.clear();

        // Go to your main app
        navigation.replace("WorldMap");
      } catch (err: any) {
        console.error("[Auth] Firebase sign-in error:", err);
        // allow retry by removing the processed code if we added it
        const code = (response as any)?.params?.code;
        if (code) processedCodesRef.current.delete(String(code));
        setError(err?.message || "Authentication failed. Please try again.");
      } finally {
        setBusy(false);
      }
    };

    handleAuthResponse();
  }, [response, discovery, request, state, navigation, redirectUri]);

  // Start the auth flow
  const handleSignIn = async () => {
    setError(null);
    if (!request) {
      setError("Authentication not ready. Try again in a moment.");
      return;
    }

    try {
      processedCodesRef.current.clear();
      await promptAsync({
        useProxy: Platform.OS !== "web", // proxy on native; direct on web
        redirectUri,
      } as any);
    } catch (err: any) {
      setError(err?.message || "Failed to start sign-in");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Learning Raiders</Text>
        <Text style={styles.subtitle}>"Your Choices Create Your Path"</Text>

        <Pressable
          style={[
            styles.signInButton,
            (!request || busy) && styles.signInButtonDisabled,
          ]}
          disabled={!request || busy}
          onPress={handleSignIn}
        >
          {busy ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.signInButtonText}>Sign in with Microsoft</Text>
          )}
        </Pressable>

        {!request && (
          <Text style={styles.loadingText}>Preparing authentication…</Text>
        )}

        {!!error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.footerText}>
          Use your @sagesshs.edu.lb account to access the application
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  title: { fontSize: 32, fontWeight: "bold", color: "#333", marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 18, color: "#666", fontStyle: "italic", marginBottom: 48, textAlign: "center" },
  signInButton: {
    backgroundColor: "#0078d4",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    minWidth: 200,
    alignItems: "center",
    marginBottom: 16,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }),
  },
  signInButtonDisabled: {
    backgroundColor: "#ccc",
    ...(Platform.OS === "web" ? { boxShadow: "none" } : { shadowOpacity: 0, elevation: 0 }),
  },
  signInButtonText: { color: "white", fontSize: 16, fontWeight: "600" },
  loadingText: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 16 },
  errorContainer: {
    backgroundColor: "#ffebee",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#f44336",
    maxWidth: 420,
  },
  errorText: { color: "#c62828", fontSize: 14, textAlign: "center" },
  footerText: { fontSize: 12, color: "#999", textAlign: "center", marginTop: 32, maxWidth: 320 },
});