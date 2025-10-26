// Simple Microsoft Login Screen for Netlify
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { OAuthProvider, signInWithCredential } from "firebase/auth";
import { auth, db } from "../services/firebaseClient";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

WebBrowser.maybeCompleteAuthSession();

const MICROSOFT_CLIENT_ID = "30f4acf0-ae27-4da2-aa10-45146236753d";
const TENANT_ID = "4119dba0-2378-496b-968b-696ef51bad2a";
const REDIRECT_URI = "https://learning-raiders.netlify.app";

export default function LoginScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const discovery = AuthSession.useAutoDiscovery(
    `https://login.microsoftonline.com/${TENANT_ID}/v2.0`
  );

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: MICROSOFT_CLIENT_ID,
      responseType: AuthSession.ResponseType.Code,
      redirectUri: REDIRECT_URI,
      usePKCE: true,
      scopes: ["openid", "email", "profile"],
      extraParams: {
        prompt: "select_account",
      },
    },
    discovery
  );

  useEffect(() => {
    if (response?.type === "success") {
      handleLoginSuccess(response.params.code);
    } else if (response?.type === "error") {
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  }, [response]);

  const handleLoginSuccess = async (code: string) => {
    try {
      setLoading(true);
      setError("");

      // Exchange code for tokens
      const tokens = await AuthSession.exchangeCodeAsync(
        {
          clientId: MICROSOFT_CLIENT_ID,
          code,
          redirectUri: REDIRECT_URI,
          extraParams: {
            code_verifier: request?.codeVerifier,
          },
        },
        discovery
      );

      // Sign in to Firebase
      const provider = new OAuthProvider("microsoft.com");
      const credential = provider.credential({
        idToken: tokens.idToken,
        accessToken: tokens.accessToken,
      });

      const result = await signInWithCredential(auth, credential);
      const user = result.user;
      const email = user.email?.toLowerCase();

      if (!email) {
        throw new Error("No email found");
      }

      // Check if user is in roster
      const rosterDoc = await getDoc(doc(db, "roster", email));
      if (!rosterDoc.exists()) {
        throw new Error("Account not authorized");
      }

      // Create user document
      const rosterData = rosterDoc.data();
      await setDoc(
        doc(db, "users", user.uid),
        {
          uid: user.uid,
          email,
          displayName: rosterData?.name || user.displayName || "",
          role: rosterData?.role || "student",
          grade: rosterData?.grade || "",
          lastLoginAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Navigate to main app
      navigation.replace("WorldMap");
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "Login failed");
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!request) return;
    
    setLoading(true);
    setError("");
    
    try {
      await promptAsync();
    } catch (err: any) {
      setError("Failed to start login");
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Learning Raiders</Text>
        <Text style={styles.subtitle}>"Your Choices Create Your Path"</Text>

        <Pressable
          style={[styles.button, (!request || loading) && styles.buttonDisabled]}
          disabled={!request || loading}
          onPress={handleLogin}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Sign in with Microsoft</Text>
          )}
        </Pressable>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.footer}>
          Use your @sagesshs.edu.lb account
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
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
  button: {
    backgroundColor: "#0078d4",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    minWidth: 200,
    alignItems: "center",
    marginBottom: 16,
    ...(Platform.OS === "web" && {
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    }),
  },
  buttonDisabled: {
    backgroundColor: "#ccc",
    ...(Platform.OS === "web" && {
      boxShadow: "none",
    }),
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  errorContainer: {
    backgroundColor: "#ffebee",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#f44336",
    maxWidth: 400,
  },
  errorText: {
    color: "#c62828",
    fontSize: 14,
    textAlign: "center",
  },
  footer: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    marginTop: 32,
  },
});
