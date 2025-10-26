// ==========================================
// src/screens/LoginScreen.tsx — Final Production Version (Netlify Hosted)
// ==========================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { OAuthProvider, signInWithCredential, signOut } from "firebase/auth";
import { auth, db } from "../services/firebaseClient";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// ✅ Ensures proper web session handling
WebBrowser.maybeCompleteAuthSession();

// =====================
// 🔹 Azure AD (Entra ID)
// =====================
const MICROSOFT_CLIENT_ID = "30f4acf0-ae27-4da2-aa10-45146236753d";
const TENANT_ID = "4119dba0-2378-496b-968b-696ef51bad2a";
const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

// ✅ Use your real deployed domain on Netlify
const REDIRECT_URI = "https://learning-raiders.netlify.app";
const USE_PROXY = false; // No need for Expo proxy on production web

export default function LoginScreen({ navigation }: any) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processedCodesRef = useRef(new Set<string>());

  // Microsoft discovery (authorization/token endpoints)
  const discovery = AuthSession.useAutoDiscovery(ISSUER);

  // Random state for PKCE and replay protection
  const state = useMemo(() => Math.random().toString(36).slice(2, 12), []);

  // Build OAuth request
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: MICROSOFT_CLIENT_ID,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
      redirectUri: REDIRECT_URI,
      scopes: ["openid", "profile", "email", "offline_access", "User.Read"],
      extraParams: {
        response_mode: "query",
        prompt: "select_account",
        state,
      },
    },
    discovery
  );

  // ==============
  // 🔹 Handle login
  // ==============
  useEffect(() => {
    if (!response) return;

    const handleAuthResponse = async () => {
      if (response.type !== "success") {
        const params: any = (response as any).params || {};
        const errorCode = params.error || "";
        const errorDescription = params.error_description || "";

        if (errorCode === "AADSTS50011") {
          setError(
            "Redirect URI mismatch — make sure your Azure app includes this domain."
          );
        } else if (errorCode === "AADSTS50020") {
          setError(
            "Please sign in with your @sagesshs.edu.lb account only."
          );
        } else if (response.type === "dismiss") {
          setError("Sign-in was cancelled. Please try again.");
        } else {
          setError(errorDescription || errorCode || "Authentication failed.");
        }
        return;
      }

      try {
        setBusy(true);
        setError(null);

        const code = (response.params as any).code;
        const returnedState = (response.params as any).state;
        if (!code) throw new Error("No authorization code received.");
        if (returnedState !== state)
          throw new Error("Invalid authentication state.");

        if (processedCodesRef.current.has(code)) {
          console.log("[Auth] Duplicate code — ignored.");
          setBusy(false);
          return;
        }
        processedCodesRef.current.add(code);

        if (!discovery?.tokenEndpoint)
          throw new Error("Microsoft discovery failed.");
        if (!request?.codeVerifier) throw new Error("PKCE verification failed.");

        // 🔸 Exchange code for tokens
        const tokens = await AuthSession.exchangeCodeAsync(
          {
            clientId: MICROSOFT_CLIENT_ID,
            code,
            redirectUri: REDIRECT_URI,
            extraParams: { code_verifier: request.codeVerifier },
          },
          { tokenEndpoint: discovery.tokenEndpoint }
        );

        const idToken = (tokens as any)?.id_token;
        const accessToken = (tokens as any)?.access_token;

        if (!idToken && !accessToken) {
          throw new Error("No authentication tokens received from Microsoft.");
        }

        console.log("[Auth] Token received from Microsoft.");

        // 🔸 Firebase sign-in
        const provider = new OAuthProvider("microsoft.com");
        const credential = idToken
          ? provider.credential({ idToken, accessToken })
          : provider.credential({ accessToken });

        const { user } = await signInWithCredential(auth, credential);
        const email = user.email?.trim().toLowerCase();

        if (!email) {
          await signOut(auth);
          throw new Error("No email found in Microsoft account.");
        }

        // 🔸 Check authorized roster
        const rosterDoc = await getDoc(doc(db, "roster", email));
        if (!rosterDoc.exists()) {
          await signOut(auth);
          Alert.alert(
            "Access Denied",
            `Account ${email} is not in the roster.\nPlease contact your administrator.`
          );
          setBusy(false);
          return;
        }

        const rosterData = rosterDoc.data() || {};
        await setDoc(
          doc(db, "users", user.uid),
          {
            uid: user.uid,
            email,
            displayName: rosterData.name || user.displayName || "",
            role: rosterData.role || "student",
            grade: rosterData.grade || "",
            guildId: (rosterData.grade || "").toLowerCase(),
            lastLoginAt: serverTimestamp(),
          },
          { merge: true }
        );

        processedCodesRef.current.clear();
        navigation.replace("WorldMap");
      } catch (err: any) {
        console.error("[Auth] Firebase sign-in error:", err);
        setError(err?.message || "Authentication failed.");
      } finally {
        setBusy(false);
      }
    };

    handleAuthResponse();
  }, [response, discovery, request, state, navigation]);

  // ================
  // 🔹 Button handler
  // ================
  const handleSignIn = async () => {
    setError(null);
    if (!request) {
      setError("Authentication not ready. Please wait and try again.");
      return;
    }
    try {
      processedCodesRef.current.clear();
      await promptAsync({ useProxy: USE_PROXY, redirectUri: REDIRECT_URI });
    } catch (err: any) {
      setError(err?.message || "Failed to start sign-in.");
    }
  };

  // =================
  // 🔹 UI / Rendering
  // =================
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
          <Text style={styles.loadingText}>Preparing authentication...</Text>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.footerText}>
          Use your @sagesshs.edu.lb account to access this application
        </Text>
      </View>
    </View>
  );
}

// ====================
// 🎨 Styling
// ====================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    color: "#666",
    fontStyle: "italic",
    marginBottom: 48,
    textAlign: "center",
  },
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
    ...(Platform.OS === "web"
      ? { boxShadow: "none" }
      : { shadowOpacity: 0, elevation: 0 }),
  },
  signInButtonText: { color: "white", fontSize: 16, fontWeight: "600" },
  loadingText: { fontSize: 14, color: "#666", marginBottom: 16 },
  errorContainer: {
    backgroundColor: "#ffebee",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#f44336",
    maxWidth: 400,
  },
  errorText: { color: "#c62828", fontSize: 14, textAlign: "center" },
  footerText: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    marginTop: 32,
    maxWidth: 300,
  },
});