// ==========================================
// src/screens/LoginScreen.tsx — Enhanced Production Version (Netlify Hosted)
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
  const [debugInfo, setDebugInfo] = useState<string>("");
  const processedCodesRef = useRef(new Set<string>());

  // Microsoft discovery (authorization/token endpoints)
  const discovery = AuthSession.useAutoDiscovery(ISSUER);

  // Random state for PKCE and replay protection
  const state = useMemo(() => Math.random().toString(36).slice(2, 12), []);

  // 🔹 Enhanced session handling for web
  useEffect(() => {
    if (Platform.OS === 'web') {
      // Clear any existing auth session on web
      WebBrowser.maybeCompleteAuthSession();
      
      // Check URL for auth response on page load
      const urlParams = new URLSearchParams(window.location.search);
      const fragment = window.location.hash.substring(1);
      const fragmentParams = new URLSearchParams(fragment);
      
      const code = urlParams.get('code') || fragmentParams.get('code');
      const error = urlParams.get('error') || fragmentParams.get('error');
      
      if (code || error) {
        setDebugInfo(`URL contains auth response: code=${!!code}, error=${error}`);
      }
    }
  }, []);

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
        response_mode: "fragment", // Changed from "query" for better Netlify compatibility
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

    // 🔍 Enhanced debugging
    console.log("=== AUTH DEBUG START ===");
    console.log("Response received:", {
      type: response.type,
      params: response.params,
      error: (response as any).error,
      url: typeof window !== 'undefined' ? window.location.href : 'N/A',
      timestamp: new Date().toISOString()
    });
    
    setDebugInfo(JSON.stringify({
      type: response.type,
      hasParams: !!response.params,
      paramKeys: response.params ? Object.keys(response.params) : [],
      url: typeof window !== 'undefined' ? window.location.href : 'N/A'
    }, null, 2));
    
    console.log("=== AUTH DEBUG END ===");

    const handleAuthResponse = async () => {
      if (response.type !== "success") {
        const params: any = (response as any).params || {};
        const errorCode = params.error || "";
        const errorDescription = params.error_description || "";

        console.error("[Auth] Error response:", {
          type: response.type,
          errorCode,
          errorDescription,
          allParams: params
        });

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
        } else if (response.type === "error") {
          setError(`Authentication error: ${errorDescription || errorCode || "Unknown error"}`);
        } else {
          setError(errorDescription || errorCode || `Authentication failed (${response.type}).`);
        }
        return;
      }

      try {
        setBusy(true);
        setError(null);

        const code = (response.params as any).code;
        const returnedState = (response.params as any).state;
        
        console.log("[Auth] Processing successful response:", {
          hasCode: !!code,
          codeLength: code?.length,
          stateMatch: returnedState === state,
          expectedState: state,
          receivedState: returnedState
        });

        if (!code) {
          console.error("[Auth] No authorization code in response params:", response.params);
          throw new Error("No authorization code received from Microsoft.");
        }
        
        if (returnedState !== state) {
          console.error("[Auth] State mismatch:", { expected: state, received: returnedState });
          throw new Error("Invalid authentication state - possible security issue.");
        }

        // Check for duplicate processing
        if (processedCodesRef.current.has(code)) {
          console.log("[Auth] Duplicate code detected - ignoring.");
          setBusy(false);
          return;
        }
        processedCodesRef.current.add(code);

        // Validate dependencies
        if (!discovery?.tokenEndpoint) {
          console.error("[Auth] Discovery failed:", discovery);
          throw new Error("Microsoft discovery failed - unable to get token endpoint.");
        }
        
        if (!request?.codeVerifier) {
          console.error("[Auth] PKCE verification missing:", { hasRequest: !!request });
          throw new Error("PKCE verification failed - missing code verifier.");
        }

        console.log("[Auth] Exchanging code for tokens...");

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

        console.log("[Auth] Token exchange result:", {
          hasIdToken: !!idToken,
          hasAccessToken: !!accessToken,
          tokenKeys: Object.keys(tokens || {})
        });

        if (!idToken && !accessToken) {
          console.error("[Auth] No tokens received:", tokens);
          throw new Error("No authentication tokens received from Microsoft.");
        }

        console.log("[Auth] Tokens received successfully. Signing in to Firebase...");

        // 🔸 Firebase sign-in
        const provider = new OAuthProvider("microsoft.com");
        const credential = idToken
          ? provider.credential({ idToken, accessToken })
          : provider.credential({ accessToken });

        const { user } = await signInWithCredential(auth, credential);
        const email = user.email?.trim().toLowerCase();

        console.log("[Auth] Firebase sign-in successful:", {
          uid: user.uid,
          email: email,
          displayName: user.displayName
        });

        if (!email) {
          await signOut(auth);
          throw new Error("No email found in Microsoft account.");
        }

        // 🔸 Check authorized roster
        console.log("[Auth] Checking roster for:", email);
        const rosterDoc = await getDoc(doc(db, "roster", email));
        
        if (!rosterDoc.exists()) {
          console.log("[Auth] User not in roster:", email);
          await signOut(auth);
          Alert.alert(
            "Access Denied",
            `Account ${email} is not in the roster.\nPlease contact your administrator.`
          );
          setBusy(false);
          return;
        }

        const rosterData = rosterDoc.data() || {};
        console.log("[Auth] Roster data found:", rosterData);

        // 🔸 Create/update user document
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

        console.log("[Auth] User document updated successfully. Navigating to WorldMap...");
        
        // Clear processed codes and navigate
        processedCodesRef.current.clear();
        navigation.replace("WorldMap");
        
      } catch (err: any) {
        console.error("[Auth] Error during authentication:", {
          message: err?.message,
          code: err?.code,
          stack: err?.stack
        });
        setError(err?.message || "Authentication failed. Please try again.");
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
    console.log("[Auth] Sign-in button clicked");
    setError(null);
    setDebugInfo("");
    
    if (!request) {
      console.error("[Auth] Request not ready:", { hasRequest: !!request, hasDiscovery: !!discovery });
      setError("Authentication not ready. Please wait and try again.");
      return;
    }
    
    try {
      console.log("[Auth] Starting OAuth flow...", {
        redirectUri: REDIRECT_URI,
        useProxy: USE_PROXY,
        clientId: MICROSOFT_CLIENT_ID
      });
      
      processedCodesRef.current.clear();
      await promptAsync({ 
        useProxy: USE_PROXY, 
        redirectUri: REDIRECT_URI 
      });
      
    } catch (err: any) {
      console.error("[Auth] Error starting sign-in:", err);
      setError(err?.message || "Failed to start sign-in process.");
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

        {/* 🔍 Debug info for development */}
        {__DEV__ && debugInfo && (
          <View style={styles.debugContainer}>
            <Text style={styles.debugTitle}>Debug Info:</Text>
            <Text style={styles.debugText}>{debugInfo}</Text>
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
  debugContainer: {
    backgroundColor: "#e3f2fd",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
    maxWidth: 500,
  },
  debugTitle: { color: "#1976d2", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  debugText: { color: "#1976d2", fontSize: 12, fontFamily: "monospace" },
  footerText: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    marginTop: 32,
    maxWidth: 300,
  },
});
