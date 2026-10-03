import React, { useState, useCallback, useEffect } from 'react';
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
import { getUser, getActiveRole, setActiveRole, refreshUser, User, addRoleToAccount, authFetch } from '../services/auth';
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
  // Registered events drive the Game Day banner and Next Up countdown
  const [myEvents, setMyEvents] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const r = await authFetch('/api/events/my-registered');
        const j = await r.json();
        if (j.success) setMyEvents(j.data || []);
      } catch { /* home still renders without it */ }
    })();
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const liveEvent = myEvents.find(e => e.start_date && e.end_date
    && String(e.start_date).slice(0, 10) <= todayStr && todayStr <= String(e.end_date).slice(0, 10));
  const nextEvent = myEvents
    .filter(e => e.start_date && String(e.start_date).slice(0, 10) > todayStr)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0];
  const daysToNext = nextEvent
    ? Math.max(1, Math.round((new Date(String(nextEvent.start_date).slice(0, 10) + 'T12:00:00').getTime() - new Date(todayStr + 'T12:00:00').getTime()) / 86400000))
    : 0;
  const fmtRange = (sd: string, ed?: string) => {
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const [sy, sm, sdd] = String(sd).slice(0,10).split('-').map(Number);
    if (!ed) return `${M[sm-1]} ${sdd}`;
    const [, em, edd] = String(ed).slice(0,10).split('-').map(Number);
    return sm === em ? `${M[sm-1]} ${sdd}-${edd}` : `${M[sm-1]} ${sdd} - ${M[em-1]} ${edd}`;
  };

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

  function handleAddRole() {
    const selfAddableRoles = [
      { key: 'coach', label: 'Coach' },
      { key: 'parent', label: 'Parent / Fan' },
      { key: 'referee', label: 'Referee' },
      { key: 'scorekeeper', label: 'Scorekeeper' },
    ];
    const available = selfAddableRoles.filter(r => !userRoles.includes(r.key));
    if (available.length === 0) {
      Alert.alert('All Roles Added', 'You already have all available roles.');
      return;
    }
    Alert.alert(
      'Add a Role',
      'Select a role to add to your account:',
      [
        ...available.map(r => ({
          text: r.label,
          onPress: async () => {
            const result = await addRoleToAccount(r.key);
            if (result.success && result.roles) {
              setUserRoles(result.roles);
              Alert.alert('Role Added', `${r.label} has been added to your account.`);
            } else {
              Alert.alert('Error', result.error || 'Failed to add role.');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
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
        onAddRole={handleAddRole}
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.navy]} />
        }
      >
        {/* Hero zone - the hero photo runs down behind the tiles and fades into the page */}
        <View style={styles.heroZone}>
          <Image
            source={require('../../assets/hero-kid.jpg')}
            style={styles.heroBgImg}
            resizeMode="cover"
          />
          <View style={styles.heroScrim} />
          <Image
            source={require('../../assets/hero-fade.png')}
            style={styles.heroFade}
            resizeMode="stretch"
          />
          <View style={styles.hero}>
            <View style={styles.heroContent}>
              <Text style={styles.heroGreeting}>Welcome back,</Text>
              <Text style={styles.heroName} numberOfLines={1}>{userName || 'Coach'}</Text>
              <Text style={styles.heroSeason}>2026-27 SEASON</Text>
              <View style={styles.heroUnderline} />
              <Text style={styles.heroSubtext}>What would you like to do?</Text>
            </View>
          </View>

        {/* Game Day banner - a registered event is running right now */}
        {liveEvent && (
          <TouchableOpacity
            style={styles.gameDayCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('EventDetail', { eventId: liveEvent.id, eventName: liveEvent.name, initialTab: 'game_center' })}
          >
            <View style={styles.gameDayPill}>
              <View style={styles.gameDayDot} />
              <Text style={styles.gameDayPillText}>GAME DAY</Text>
            </View>
            <Text style={styles.gameDayName} numberOfLines={1}>{liveEvent.name}</Text>
            <Text style={styles.gameDaySub}>Live scores, schedules and standings are running now</Text>
            <View style={styles.gameDayCta}>
              <Text style={styles.gameDayCtaText}>Open Game Center</Text>
              <Ionicons name="arrow-forward" size={15} color={colors.cyan} />
            </View>
          </TouchableOpacity>
        )}

        {/* Next Up countdown */}
        {!liveEvent && nextEvent && (
          <TouchableOpacity
            style={styles.nextUpCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('EventDetail', { eventId: nextEvent.id, eventName: nextEvent.name })}
          >
            <View style={styles.nextUpCount}>
              <Text style={styles.nextUpDays}>{daysToNext}</Text>
              <Text style={styles.nextUpDaysLabel}>{daysToNext === 1 ? 'DAY' : 'DAYS'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nextUpKicker}>NEXT UP</Text>
              <Text style={styles.nextUpName} numberOfLines={2}>{nextEvent.name}</Text>
              <Text style={styles.nextUpMeta}>
                {fmtRange(nextEvent.start_date, nextEvent.end_date)}{nextEvent.city ? ` · ${nextEvent.city}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        )}

        {/* Quick Access - photo tiles */}
        <View style={styles.qaGrid}>
          {([
            { label: 'My Teams', sub: 'View and manage all your teams', img: require('../../assets/tiles/teams.jpg'), go: () => navigation.navigate('My Teams') },
            { label: 'Find Events', sub: 'Search tournaments across the country', img: require('../../assets/tiles/find.jpg'), go: () => navigation.navigate('Find Events' as never) },
            { label: 'My Events', sub: 'View your schedules, rosters and details', img: require('../../assets/tiles/events.jpg'), go: () => navigation.navigate('My Events' as never) },
            { label: 'Shop', sub: 'Official UHT gear, apparel and more', img: require('../../assets/tiles/shop.jpg'), go: () => navigation.navigate('Menu', { screen: 'Shop' }) },
          ]).map(tile => (
            <TouchableOpacity key={tile.label} style={styles.qaCard} onPress={tile.go} activeOpacity={0.85}
              accessibilityLabel={`${tile.label} - ${tile.sub}`}>
              <ImageBackground source={tile.img} style={styles.qaImage} imageStyle={styles.qaImageInner} />
            </TouchableOpacity>
          ))}
          </View>
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
  heroZone: {
    width: SCREEN_WIDTH,
  },
  heroBgImg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    // hero-kid.jpg is 852x1000 - exact aspect so cover never crops the composition
    height: Math.round(SCREEN_WIDTH * 1000 / 852),
  },
  heroScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: Math.round(SCREEN_WIDTH * 1000 / 852),
    backgroundColor: 'rgba(0, 26, 54, 0.18)',
  },
  heroFade: {
    position: 'absolute',
    top: Math.round(SCREEN_WIDTH * 1000 / 852 * 0.585),
    left: 0,
    width: SCREEN_WIDTH,
    height: Math.round(SCREEN_WIDTH * 1000 / 852 * 0.415) + 1,
  },
  hero: {
    width: SCREEN_WIDTH,
    paddingTop: 24,
    paddingBottom: 46,
    minHeight: 264,
    justifyContent: 'flex-end',
  },
  heroContent: {
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: 44,
    paddingBottom: 10,
    position: 'relative',
  },
  heroGreeting: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.white,
  },
  heroName: {
    fontSize: 44,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: -0.5,
    marginTop: -2,
  },
  heroSeason: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.cyan,
    letterSpacing: 2,
    marginTop: 14,
  },
  heroUnderline: {
    width: 56,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.cyan,
    marginTop: 8,
  },
  heroSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 12,
  },
  // Game Day banner
  gameDayCard: {
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    backgroundColor: colors.navy, borderRadius: 18, padding: 18,
    borderWidth: 2, borderColor: '#e74c3c',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  gameDayPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#e74c3c', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  gameDayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  gameDayPillText: { color: '#fff', fontSize: 10, letterSpacing: 1.2, ...fonts.bold },
  gameDayName: { color: '#fff', fontSize: 20, marginTop: 10, ...fonts.bold },
  gameDaySub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 },
  gameDayCta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  gameDayCtaText: { color: colors.cyan, fontSize: 14, ...fonts.bold },
  // Next Up countdown
  nextUpCard: {
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    backgroundColor: colors.navy, borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  nextUpCount: { width: 72, height: 72, borderRadius: 16, backgroundColor: 'rgba(0,204,255,0.14)', borderWidth: 1, borderColor: 'rgba(0,204,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  nextUpDays: { color: colors.cyan, fontSize: 28, lineHeight: 30, ...fonts.bold },
  nextUpDaysLabel: { color: colors.cyan, fontSize: 9, letterSpacing: 1.5, ...fonts.bold },
  nextUpKicker: { color: 'rgba(255,255,255,0.55)', fontSize: 10, letterSpacing: 1.5, ...fonts.bold },
  nextUpName: { color: '#fff', fontSize: 16, marginTop: 2, ...fonts.bold },
  nextUpMeta: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 3 },
  // Quick Access Grid
  qaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  qaCard: {
    width: (SCREEN_WIDTH - spacing.lg * 2 - spacing.md) / 2,
    height: ((SCREEN_WIDTH - spacing.lg * 2 - spacing.md) / 2) * 0.875,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#e8edf4',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5,
  },
  qaImage: { flex: 1, justifyContent: 'flex-end' },
  qaImageInner: { borderRadius: 18 },
});
