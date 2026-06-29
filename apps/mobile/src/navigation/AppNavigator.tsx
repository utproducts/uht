import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import MyTeamsScreen from '../screens/MyTeamsScreen';
import ShopScreen from '../screens/ShopScreen';
import MenuScreen from '../screens/MenuScreen';
import CreateTeamScreen from '../screens/CreateTeamScreen';
import CoachOnboardingScreen from '../screens/CoachOnboardingScreen';
import TeamDetailScreen from '../screens/TeamDetailScreen';
import RegisterEventScreen from '../screens/RegisterEventScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Events: { active: 'calendar', inactive: 'calendar-outline' },
  'My Teams': { active: 'people', inactive: 'people-outline' },
  Shop: { active: 'cart', inactive: 'cart-outline' },
  Menu: { active: 'menu', inactive: 'menu-outline' },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, size }) => {
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons.active : icons.inactive;
          return (
            <Ionicons
              name={iconName}
              size={22}
              color={focused ? colors.navy : colors.tabInactive}
            />
          );
        },
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Events" component={EventsScreen} />
      <Tab.Screen name="My Teams" component={MyTeamsScreen} />
      <Tab.Screen name="Shop" component={ShopScreen} />
      <Tab.Screen name="Menu" component={MenuScreen} />
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
        <Stack.Screen name="CoachOnboarding" component={CoachOnboardingScreen} />
        <Stack.Screen name="FollowTeams" component={FollowTeamsScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen
          name="EventDetail"
          component={EventDetailScreen}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="TeamDetail"
          component={TeamDetailScreen}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="RegisterEvent"
          component={RegisterEventScreen}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="CreateTeam"
          component={CreateTeamScreen}
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
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingTop: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  tabItem: {
    paddingTop: 0,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
