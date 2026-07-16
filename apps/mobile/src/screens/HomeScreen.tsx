import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,
  ImageBackground,
  Dimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getUser, getActiveRole, setActiveRole, refreshUser, User } from '../services/auth';
import { refreshBadgeCount } from '../services/notifications';
import AppHeader from '../components/AppHeader';
import RoleBar from '../components/RoleBar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const [userName, setUserName] = useState('');
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [activeRole, setActiveRoleState] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      // Always try to refresh user from API to get latest roles
      const [freshUser, badgeCount] = await Promise.all([
        refreshUser().catch(() => null),
        refreshBadgeCount().catch(() => 0),
      ]);
      setUnreadCount(badgeCount as number);

      // Use fresh API data if available, fall back to stored
      const user = freshUser || await getUser();

      if (user?.name) setUserName(user.name);
      if (user?.roles) setUserRoles(user.roles);

      const savedRole = await getActiveRole();
      if (savedRole && user?.roles?.includes(savedRole)) {
        setActiveRoleState(savedRole);
      } else if (user?.roles?.length) {
        setActiveRoleState(user.roles[0]);
      }
    } catch {}
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => { loadData(); }, [loadData])
  );

  function onRefresh() {
    setRefreshing(true);
    loadData(true);
  }

  async function handleSwitchRole(role: string) {
    setActiveRoleState(role);
    await setActiveRole(role);
  }

  const firstName = userName ? userName.split(' ')[0] : '';

  return (
    <View style={styles.screen}>
      <AppHeader
        onNotificationPress={() => navigation.navigate('NotificationsInbox')}
        onRolePress={() => {}}
        unreadCount={unreadCount}
        hasMultipleRoles={userRoles.length > 1}
      />
      <RoleBar
        activeRole={activeRole}
        userRoles={userRoles}
        onSwitchRole={handleSwitchRole}
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.navy]} />
        }
      >
        {/* Hero greeting */}
        <ImageBackground
          source={require('../../assets/hero-rink.jpg')}
          style={styles.hero}
          resizeMode="cover"
        >
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <Image
              source={require('../../assets/uht-logo.png')}
              style={styles.heroLogo}
              resizeMode="contain"
            />
            <Text style={styles.heroSeason}>2026-27 SEASON</Text>
            <Text style={styles.heroGreeting}>
              {firstName ? `Welcome back, ${firstName}` : 'Welcome'}
            </Text>
            <Text style={styles.heroSubtext}>What would you like to do?</Text>
          </View>
        </ImageBackground>

        {/* Quick Access Grid */}
        <View style={styles.qaGrid}>
          <TouchableOpacity
            style={styles.qaCard}
            onPress={() => navigation.navigate('My Teams')}
            activeOpacity={0.7}
          >
            <View style={[styles.qaIconCircle, { backgroundColor: '#E6F1FB' }]}>
              <Ionicons name="people" size={24} color="#185FA5" />
            </View>
            <Text style={styles.qaLabel}>My teams</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.qaCard}
            onPress={() => navigation.navigate('Find Events' as never)}
            activeOpacity={0.7}
          >
            <View style={[styles.qaIconCircle, { backgroundColor: '#FAEEDA' }]}>
              <Ionicons name="search" size={24} color="#854F0B" />
            </View>
            <Text style={styles.qaLabel}>Find events</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.qaCard}
            onPress={() => navigation.navigate('My Events' as never)}
            activeOpacity={0.7}
          >
            <View style={[styles.qaIconCircle, { backgroundColor: '#EAF3DE' }]}>
              <Ionicons name="calendar" size={24} color="#3B6D11" />
            </View>
            <Text style={styles.qaLabel}>My events</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.qaCard}
            onPress={() => navigation.navigate('Menu', { screen: 'Shop' })}
            activeOpacity={0.7}
          >
            <View style={[styles.qaIconCircle, { backgroundColor: '#EEEDFE' }]}>
              <Ionicons name="cart" size={24} color="#534AB7" />
            </View>
            <Text style={styles.qaLabel}>Shop</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 24,
  },
  // Hero
  hero: {
    width: SCREEN_WIDTH,
    paddingTop: 24,
    paddingBottom: 32,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 30, 60, 0.75)',
  },
  heroContent: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    position: 'relative',
  },
  heroLogo: {
    width: 80,
    height: 80,
    marginBottom: 8,
  },
  heroSeason: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.cyan,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  heroGreeting: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
  },
  heroSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  // Quick Access Grid
  qaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  qaCard: {
    width: (SCREEN_WIDTH - spacing.lg * 2 - spacing.md) / 2,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 8,
  },
  qaIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  qaLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
