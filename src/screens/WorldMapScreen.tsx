// src/screens/WorldMapScreen.tsx
import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  Pressable, 
  StyleSheet, 
  ScrollView, 
  Dimensions,
  Alert,
  ActivityIndicator 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../providers/AuthProvider';

const { width, height } = Dimensions.get('window');

interface UserData {
  id: string;
  email: string;
  name: string;
  givenName: string;
  surname: string;
  loginTime: string;
}

const WorldMapScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userDataString = await AsyncStorage.getItem('user');
      if (userDataString) {
        const parsedUserData = JSON.parse(userDataString);
        setUserData(parsedUserData);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('user');
              await AsyncStorage.removeItem('isLoggedIn');
              // The AuthProvider will detect the change and redirect to login
              navigation.replace('Login');
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleIslandPress = (islandName: string) => {
    Alert.alert(
      `${islandName} Island`,
      `Welcome to ${islandName} Island! This is where your learning adventure begins.`,
      [
        {
          text: "Explore",
          onPress: () => {
            // TODO: Navigate to island-specific screen
            console.log(`Navigating to ${islandName} Island`);
          }
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0078d4" />
        <Text style={styles.loadingText}>Loading your adventure...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Learning Raiders</Text>
        <Text style={styles.subtitle}>World Map</Text>
        {userData && (
          <Text style={styles.welcomeText}>
            Welcome back, {userData.givenName || userData.name}!
          </Text>
        )}
      </View>

      {/* World Map Content */}
      <View style={styles.mapContainer}>
        <Text style={styles.mapTitle}>Choose Your Adventure</Text>
        
        {/* Math Island */}
        <Pressable 
          style={[styles.island, styles.mathIsland]} 
          onPress={() => handleIslandPress('Math')}
        >
          <Text style={styles.islandTitle}>🔢 Math Island</Text>
          <Text style={styles.islandDescription}>
            Master numbers, equations, and problem-solving skills
          </Text>
        </Pressable>

        {/* Science Island */}
        <Pressable 
          style={[styles.island, styles.scienceIsland]} 
          onPress={() => handleIslandPress('Science')}
        >
          <Text style={styles.islandTitle}>🧪 Science Island</Text>
          <Text style={styles.islandDescription}>
            Explore the wonders of physics, chemistry, and biology
          </Text>
        </Pressable>

        {/* Language Island */}
        <Pressable 
          style={[styles.island, styles.languageIsland]} 
          onPress={() => handleIslandPress('Language')}
        >
          <Text style={styles.islandTitle}>📚 Language Island</Text>
          <Text style={styles.islandDescription}>
            Improve reading, writing, and communication skills
          </Text>
        </Pressable>

        {/* History Island */}
        <Pressable 
          style={[styles.island, styles.historyIsland]} 
          onPress={() => handleIslandPress('History')}
        >
          <Text style={styles.islandTitle}>🏛️ History Island</Text>
          <Text style={styles.islandDescription}>
            Journey through time and learn from the past
          </Text>
        </Pressable>
      </View>

      {/* User Info Panel */}
      {userData && (
        <View style={styles.userPanel}>
          <Text style={styles.userPanelTitle}>Raider Profile</Text>
          <Text style={styles.userInfo}>Name: {userData.name}</Text>
          <Text style={styles.userInfo}>Email: {userData.email}</Text>
          <Text style={styles.userInfo}>
            Joined: {new Date(userData.loginTime).toLocaleDateString()}
          </Text>
        </View>
      )}

      {/* Sign Out Button */}
      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>🚪 Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f8ff',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    paddingTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 20,
    color: '#34495e',
    fontWeight: '600',
    marginBottom: 12,
  },
  welcomeText: {
    fontSize: 16,
    color: '#7f8c8d',
    fontStyle: 'italic',
  },
  mapContainer: {
    flex: 1,
    alignItems: 'center',
  },
  mapTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 24,
    textAlign: 'center',
  },
  island: {
    width: width * 0.85,
    padding: 20,
    marginVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  mathIsland: {
    backgroundColor: '#e74c3c',
    borderColor: '#c0392b',
    borderWidth: 2,
  },
  scienceIsland: {
    backgroundColor: '#3498db',
    borderColor: '#2980b9',
    borderWidth: 2,
  },
  languageIsland: {
    backgroundColor: '#2ecc71',
    borderColor: '#27ae60',
    borderWidth: 2,
  },
  historyIsland: {
    backgroundColor: '#f39c12',
    borderColor: '#e67e22',
    borderWidth: 2,
  },
  islandTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  islandDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 20,
  },
  userPanel: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginTop: 30,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  userPanelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 12,
    textAlign: 'center',
  },
  userInfo: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  signOutButton: {
    backgroundColor: '#e74c3c',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  signOutText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default WorldMapScreen;