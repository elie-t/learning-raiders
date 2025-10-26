// Pure Microsoft Login - NO Firebase
import React, { useEffect, useState } from "react";
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../providers/AuthProvider';

WebBrowser.maybeCompleteAuthSession();

const MICROSOFT_CLIENT_ID = "30f4acf0-ae27-4da2-aa10-45146236753d";
const TENANT_ID = "4119dba0-2378-496b-968b-696ef51bad2a";
const REDIRECT_URI = "http://localhost:8081";

export default function LoginScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const { refreshAuthState } = useAuth();

  const discovery = AuthSession.useAutoDiscovery(
    `https://login.microsoftonline.com/${TENANT_ID}/v2.0`
  );

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: MICROSOFT_CLIENT_ID,
      responseType: AuthSession.ResponseType.Code,
      redirectUri: REDIRECT_URI,
      usePKCE: true,
      scopes: ["openid", "email", "profile", "User.Read"],
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
      console.error("Auth response error:", response);
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  }, [response]);

  const handleLoginSuccess = async (code: string) => {
    try {
      setLoading(true);
      setError("");

      console.log("Exchanging code for tokens...");

      // Exchange code for tokens
      const tokenResponse = await AuthSession.exchangeCodeAsync(
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

      console.log("Tokens received successfully!");

      // Get user info from Microsoft Graph API
      const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${tokenResponse.accessToken}`,
        },
      });

      const userInfo = await userInfoResponse.json();
      console.log("User info:", userInfo);

      // Store user data locally
      const userData = {
        id: userInfo.id,
        email: userInfo.mail || userInfo.userPrincipalName,
        name: userInfo.displayName,
        givenName: userInfo.givenName,
        surname: userInfo.surname,
        accessToken: tokenResponse.accessToken,
        idToken: tokenResponse.idToken,
        loginTime: new Date().toISOString(),
      };

      // Save to local storage
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      await AsyncStorage.setItem('isLoggedIn', 'true');

      console.log("User logged in successfully:", userData.email);

      // Refresh the auth state to trigger navigation
      await refreshAuthState();
      setLoading(false);

      console.log("Auth state refreshed, should navigate now");

    } catch (err: any) {
      console.error("Login error:", err);
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!request) return;
    
    setLoading(true);
    setError("");
    
    try {
      console.log("Starting Microsoft login...");
      await promptAsync();
    } catch (err: any) {
      console.error("Failed to start login:", err);
      setError("Failed to start login");
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Learning Raiders</Text>
        <Text style={styles.subtitle}>Microsoft Authentication</Text>
        <Text style={styles.description}>
          Sign in with your Microsoft account to access your learning journey
        </Text>

        <Pressable
          style={[styles.button, (!request || loading) && styles.buttonDisabled]}
          disabled={!request || loading}
          onPress={handleLogin}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="white" />
              <Text style={styles.loadingText}>
                {response?.type === "success" ? "Completing login..." : "Connecting..."}
              </Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>🚀 Sign in with Microsoft</Text>
          )}
        </Pressable>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Secure authentication powered by Microsoft
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f8ff",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 20,
    color: "#34495e",
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  description: {
    fontSize: 16,
    color: "#7f8c8d",
    textAlign: "center",
    marginBottom: 48,
    lineHeight: 24,
    maxWidth: 300,
  },
  button: {
    backgroundColor: "#0078d4",
    paddingVertical: 18,
    paddingHorizontal: 36,
    borderRadius: 12,
    minWidth: 250,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
    ...(Platform.OS === "web" && {
      boxShadow: "0 4px 12px rgba(0,120,212,0.3)",
    }),
  },
  buttonDisabled: {
    backgroundColor: "#bdc3c7",
    shadowOpacity: 0,
    elevation: 0,
    ...(Platform.OS === "web" && {
      boxShadow: "none",
    }),
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  loadingText: {
    color: "white",
    fontSize: 16,
    marginLeft: 10,
  },
  errorContainer: {
    backgroundColor: "#ffebee",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#e74c3c",
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  errorText: {
    color: "#c0392b",
    fontSize: 15,
    textAlign: "center",
    fontWeight: "500",
  },
  footer: {
    fontSize: 14,
    color: "#95a5a6",
    textAlign: "center",
    marginTop: 32,
    fontStyle: "italic",
  },
});
