import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { colors } from '../constants/theme';
import { getToken } from '../services/auth';
import { registerForPushNotifications } from '../services/notifications';

// Screens
import WelcomeScreen from '../screens/WelcomeScreen';
import SignUpScreen from '../screens/SignUpScreen';
import LoginScreen from '../screens/LoginScreen';
import FollowTeamsScreen from '../screens/FollowTeamsScreen';
import HomeScreen from '../screens/HomeScreen';
import EventsScreen from '../screens/EventsScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import AlertsScreen from '../screens/AlertsScreen';
import TeamsScreen from '../screens/TeamsScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Bottom tab navigator — text only, no icons
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: () => null,
        tabBarLabel: ({ focused }) => (
          <Text style={[
            styles.tabLabel,
            focused ? styles.tabLabelActive : styles.tabLabelInactive,
          ]}>
            {route.name}
          </Text>
        ),
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Events" component={EventsScreen} />
      <Tab.Screen name="Alerts" component={AlertsScreen} />
      <Tab.Screen name="Teams" component={TeamsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const [checking, setChecking] = useState(true);
  const [initialRoute, setInitialRoute] = useState<string>('Welcome');

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          setInitialRoute('Main');
          // Register for push notifications when user is already logged in
          registerForPushNotifications();
        }
      } catch {}
      setChecking(false);
    })();
  }, []);

  if (checking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="FollowTeams" component={FollowTeamsScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen
          name="EventDetail"
          component={EventDetailScreen}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  tabBar: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: 56,
    paddingBottom: 6,
    paddingTop: 6,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabItem: {
    paddingTop: 0,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  tabLabelActive: {
    color: colors.navy,
  },
  tabLabelInactive: {
    color: colors.textMuted,
  },
});
