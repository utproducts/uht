import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';
import { getToken } from '../services/auth';
import { registerForPushNotifications, refreshBadgeCount, addNotificationListener, addResponseListener } from '../services/notifications';

// Screens
import WelcomeScreen from '../screens/WelcomeScreen';
import SignUpScreen from '../screens/SignUpScreen';
import LoginScreen from '../screens/LoginScreen';
import FollowTeamsScreen from '../screens/FollowTeamsScreen';
import HomeScreen from '../screens/HomeScreen';
import EventsScreen from '../screens/EventsScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import MyTeamsScreen from '../screens/MyTeamsScreen';
import MyEventsScreen from '../screens/MyEventsScreen';
import ShopScreen from '../screens/ShopScreen';
import MenuScreen from '../screens/MenuScreen';
import CreateTeamScreen from '../screens/CreateTeamScreen';
import CoachOnboardingScreen from '../screens/CoachOnboardingScreen';
import TeamDetailScreen from '../screens/TeamDetailScreen';
import RegisterEventScreen from '../screens/RegisterEventScreen';
import ScorekeeperScreen from '../screens/ScorekeeperScreen';
import AccountSettingsScreen from '../screens/AccountSettingsScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import AdminRegistrationsScreen from '../screens/AdminRegistrationsScreen';
import NotificationsInboxScreen from '../screens/NotificationsInboxScreen';
import ScoreGameScreen from '../screens/ScoreGameScreen';
import DirectorGamesScreen from '../screens/DirectorGamesScreen';
import RewardRevealScreen from '../screens/RewardRevealScreen';

const Stack = createNativeStackNavigator();
const MenuStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// New 5-tab icon map: Home, My Teams, My Events, Find Events, Menu
const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  'My Teams': { active: 'people', inactive: 'people-outline' },
  'My Events': { active: 'calendar', inactive: 'calendar-outline' },
  'Find Events': { active: 'search', inactive: 'search-outline' },
  Menu: { active: 'menu', inactive: 'menu-outline' },
};

function MenuStackNavigator() {
  return (
    <MenuStack.Navigator screenOptions={{ headerShown: false }}>
      <MenuStack.Screen name="MenuHome" component={MenuScreen} />
      <MenuStack.Screen name="Scorekeeper" component={ScorekeeperScreen} options={{ animation: 'slide_from_right' }} />
      <MenuStack.Screen name="AccountSettings" component={AccountSettingsScreen} options={{ animation: 'slide_from_right' }} />
      <MenuStack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ animation: 'slide_from_right' }} />
      <MenuStack.Screen name="AdminRegistrations" component={AdminRegistrationsScreen} options={{ animation: 'slide_from_right' }} />
      <MenuStack.Screen name="ScoreGame" component={ScoreGameScreen} options={{ animation: 'slide_from_right' }} />
      <MenuStack.Screen name="DirectorGames" component={DirectorGamesScreen} options={{ animation: 'slide_from_right' }} />
      <MenuStack.Screen name="Shop" component={ShopScreen} options={{ animation: 'slide_from_right' }} />
    </MenuStack.Navigator>
  );
}

// Stack navigators for each tab so detail screens keep the tab bar visible
const HomeStackNav = createNativeStackNavigator();
const MyTeamsStackNav = createNativeStackNavigator();
const MyEventsStackNav = createNativeStackNavigator();
const FindEventsStackNav = createNativeStackNavigator();

function HomeStackNavigator() {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="HomeScreen" component={HomeScreen} />
      <HomeStackNav.Screen name="EventDetail" component={EventDetailScreen} options={{ animation: 'slide_from_right' }} />
      <HomeStackNav.Screen name="TeamDetail" component={TeamDetailScreen} options={{ animation: 'slide_from_right' }} />
      <HomeStackNav.Screen name="RegisterEvent" component={RegisterEventScreen} options={{ animation: 'slide_from_right' }} />
      <HomeStackNav.Screen name="NotificationsInbox" component={NotificationsInboxScreen} options={{ animation: 'slide_from_right' }} />
    </HomeStackNav.Navigator>
  );
}

function MyTeamsStackNavigator() {
  return (
    <MyTeamsStackNav.Navigator screenOptions={{ headerShown: false }}>
      <MyTeamsStackNav.Screen name="MyTeamsList" component={MyTeamsScreen} />
      <MyTeamsStackNav.Screen name="CreateTeam" component={CreateTeamScreen} options={{ animation: 'slide_from_right' }} />
      <MyTeamsStackNav.Screen name="TeamDetail" component={TeamDetailScreen} options={{ animation: 'slide_from_right' }} />
      <MyTeamsStackNav.Screen name="EventDetail" component={EventDetailScreen} options={{ animation: 'slide_from_right' }} />
      <MyTeamsStackNav.Screen name="RegisterEvent" component={RegisterEventScreen} options={{ animation: 'slide_from_right' }} />
    </MyTeamsStackNav.Navigator>
  );
}

function MyEventsStackNavigator() {
  return (
    <MyEventsStackNav.Navigator screenOptions={{ headerShown: false }}>
      <MyEventsStackNav.Screen name="MyEventsList" component={MyEventsScreen} />
      <MyEventsStackNav.Screen name="EventDetail" component={EventDetailScreen} options={{ animation: 'slide_from_right' }} />
      <MyEventsStackNav.Screen name="RegisterEvent" component={RegisterEventScreen} options={{ animation: 'slide_from_right' }} />
      <MyEventsStackNav.Screen name="NotificationsInbox" component={NotificationsInboxScreen} options={{ animation: 'slide_from_right' }} />
    </MyEventsStackNav.Navigator>
  );
}

function FindEventsStackNavigator() {
  return (
    <FindEventsStackNav.Navigator screenOptions={{ headerShown: false }}>
      <FindEventsStackNav.Screen name="EventsList" component={EventsScreen} />
      <FindEventsStackNav.Screen name="EventDetail" component={EventDetailScreen} options={{ animation: 'slide_from_right' }} />
      <FindEventsStackNav.Screen name="RegisterEvent" component={RegisterEventScreen} options={{ animation: 'slide_from_right' }} />
    </FindEventsStackNav.Navigator>
  );
}

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
              color={focused ? colors.cyan : 'rgba(0, 204, 255, 0.5)'}
            />
          );
        },
        tabBarActiveTintColor: colors.cyan,
        tabBarInactiveTintColor: 'rgba(0, 204, 255, 0.5)',
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
      })}
    >
      <Tab.Screen name="Home" component={HomeStackNavigator} />
      <Tab.Screen name="My Teams" component={MyTeamsStackNavigator} />
      <Tab.Screen name="My Events" component={MyEventsStackNavigator} />
      <Tab.Screen name="Find Events" component={FindEventsStackNavigator} />
      <Tab.Screen
        name="Menu"
        component={MenuStackNavigator}
        listeners={({ navigation, route }) => ({
          tabPress: (e) => {
            if (navigation.isFocused()) {
              e.preventDefault();
              navigation.navigate('Home');
            } else {
              e.preventDefault();
              navigation.navigate('Menu', { screen: 'MenuHome' });
            }
          },
        })}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const [checking, setChecking] = useState(true);
  const [initialRoute, setInitialRoute] = useState<string>('Welcome');
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          setInitialRoute('Main');
          registerForPushNotifications();
          refreshBadgeCount();
        }
      } catch {}
      setChecking(false);
    })();

    const sub = addNotificationListener(() => {
      refreshBadgeCount();
    });

    const responseSub = addResponseListener((response: any) => {
      const data = response.notification?.request?.content?.data;
      if (data?.type === 'meeting_reward') {
        navigationRef.current?.navigate('RewardReveal' as never);
      }
    });

    return () => {
      sub.remove();
      responseSub.remove();
    };
  }, []);

  if (checking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
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
          name="RewardReveal"
          component={RewardRevealScreen}
          options={{
            presentation: 'fullScreenModal',
            animation: 'fade',
          }}
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
    backgroundColor: colors.navy,
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingTop: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  tabItem: {
    paddingTop: 0,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});
