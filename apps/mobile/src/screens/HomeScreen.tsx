import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  ImageBackground,
  Dimensions,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getFollowedTeams, getScorekeeperEvents, unfollowTeam } from '../services/api';
import { getUser, authFetch, getActiveRole, User } from '../services/auth';
import { refreshBadgeCount } from '../services/notifications';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface FollowedTeam {
  id: string;
  team_id: string;
  team_name: string;
  org_name?: string;
  age_group?: string;
  logo_url?: string;
  next_event_name?: string;
  next_event_date?: string;
  isOwnTeam?: boolean;
}

interface Event {
  id: string;
  name: string;
  slug: string;
  city?: string;
  state?: string;
  start_date: string;
  end_date: string;
  logo_url?: string;
  teamNames?: string[];
  hotel_name?: string;
  hotel_booking_url?: string;
  hotel_booking_code?: string;
  hotel_rate?: string;
  hotel_price_per_night?: number;
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (start.getMonth() === end.getMonth()) {
    return `${months[start.getMonth()]} ${start.getDate()} - ${end.getDate()}`;
  }
  return `${months[start.getMonth()]} ${start.getDate()} - ${months[end.getMonth()]} ${end.getDate()}`;
}

export default function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const [userName, setUserName] = useState('');
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [activeRole, setActiveRoleState] = useState<string>('');
  const [teams, setTeams] = useState<FollowedTeam[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [scoringEvents, setScoringEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Track when data was last loaded to avoid refetching on every tab switch
  const lastLoadRef = React.useRef<number>(0);
  const STALE_MS = 30000; // 30 seconds

  const loadData = useCallback(async (isRefresh = false) => {
    // Skip if data was loaded recently (unless pull-to-refresh)
    if (!isRefresh && lastLoadRef.current && Date.now() - lastLoadRef.current < STALE_MS) {
      return;
    }
    if (!isRefresh) setLoading(true);
    try {
      // Fire ALL API calls in parallel — no waterfall
      const [teamData, user, skEvents, myTeamsRes, badgeCount] = await Promise.all([
        getFollowedTeams().catch(() => []),
        getUser(),
        getScorekeeperEvents().catch(() => []),
        authFetch('/api/teams/my-teams').then(r => r.json()).catch(() => ({ success: false })),
        refreshBadgeCount().catch(() => 0),
      ]);
      setUnreadCount(badgeCount as number);

      if (user?.name) setUserName(user.name);
      if (user?.roles) setUserRoles(user.roles);

      // Load active role for role-aware UI
      const savedRole = await getActiveRole();
      if (savedRole && user?.roles?.includes(savedRole)) {
        setActiveRoleState(savedRole);
      } else if (user?.roles?.length) {
        setActiveRoleState(user.roles[0]);
      }

      // Only use scorekeeper data if user has that role
      if (user?.roles?.includes('scorekeeper') && Array.isArray(skEvents)) {
        setScoringEvents(skEvents as any[]);
      }

      // Process my-teams response
      let myTeamsData: FollowedTeam[] = [];
      const eventMap = new Map<string, Event>();
      const eventTeamNames = new Map<string, Set<string>>();
      const myTeamsJson = myTeamsRes as { success: boolean; data?: any[] };
      if (myTeamsJson.success && Array.isArray(myTeamsJson.data)) {
        myTeamsData = myTeamsJson.data.map((t: any) => ({
          id: t.id,
          team_id: t.id,
          team_name: t.name,
          org_name: t.organization_name,
          age_group: t.age_group,
          logo_url: t.effective_logo_url || t.logo_url,
          isOwnTeam: true,
        }));

        // Extract registered events from all teams, tracking which teams go to each
        for (const team of myTeamsJson.data) {
          const teamName = (team as any).name || '';
          const regEvents = (team as any).registered_events || [];
          for (const re of regEvents) {
            if (!re.event_id) continue;
            if (!eventMap.has(re.event_id)) {
              eventMap.set(re.event_id, {
                id: re.event_id,
                name: re.event_name || '',
                slug: re.slug || '',
                city: re.city,
                state: re.state,
                start_date: re.start_date || '',
                end_date: re.end_date || '',
                logo_url: re.logo_url,
                hotel_name: re.hotel_name || undefined,
                hotel_booking_url: re.hotel_booking_url || undefined,
                hotel_booking_code: re.hotel_booking_code || undefined,
                hotel_rate: re.hotel_rate || undefined,
                hotel_price_per_night: re.hotel_price_per_night || undefined,
              });
              eventTeamNames.set(re.event_id, new Set());
            } else if (re.hotel_name && !eventMap.get(re.event_id)!.hotel_name) {
              // Fill hotel info from another team's registration if first had none
              const existing = eventMap.get(re.event_id)!;
              existing.hotel_name = re.hotel_name;
              existing.hotel_booking_url = re.hotel_booking_url || undefined;
              existing.hotel_booking_code = re.hotel_booking_code || undefined;
              existing.hotel_rate = re.hotel_rate || undefined;
              existing.hotel_price_per_night = re.hotel_price_per_night || undefined;
            }
            if (teamName) eventTeamNames.get(re.event_id)!.add(teamName);
          }
        }
      }

      // Extract registered events from followed teams too
      if (Array.isArray(teamData)) {
        for (const ft of teamData) {
          const teamName = (ft as any).team_name || '';
          const regEvents = (ft as any).registered_events || [];
          for (const re of regEvents) {
            if (!re.event_id) continue;
            if (!eventMap.has(re.event_id)) {
              eventMap.set(re.event_id, {
                id: re.event_id,
                name: re.event_name || '',
                slug: re.slug || '',
                city: re.city,
                state: re.state,
                start_date: re.start_date || '',
                end_date: re.end_date || '',
                logo_url: re.logo_url,
              });
              eventTeamNames.set(re.event_id, new Set());
            }
            if (teamName) eventTeamNames.get(re.event_id)!.add(teamName);
          }
        }
      }

      // Attach team names to events
      const myRegisteredEvents: Event[] = [];
      for (const [eventId, event] of eventMap) {
        const names = eventTeamNames.get(eventId);
        event.teamNames = names ? Array.from(names) : [];
        myRegisteredEvents.push(event);
      }

      // Merge followed teams and my teams, dedup by team_id
      const allTeams = [...(teamData || []), ...myTeamsData];
      const seen = new Set<string>();
      const uniqueTeams = allTeams.filter((t: FollowedTeam) => {
        const key = t.team_id || t.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setTeams(uniqueTeams);

      // Show only upcoming registered events (next 3)
      const today = new Date().toISOString().split('T')[0];
      const upcoming = myRegisteredEvents
        .filter((e: Event) => e.end_date >= today)
        .sort((a: Event, b: Event) => a.start_date.localeCompare(b.start_date));
      setUpcomingEvents(upcoming);
      lastLoadRef.current = Date.now();
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Reset stale timer so data always refreshes on tab focus
      lastLoadRef.current = 0;
      loadData();
    }, [loadData])
  );

  function onRefresh() {
    setRefreshing(true);
    loadData(true);
  }

  const firstName = userName ? userName.split(' ')[0] : '';

  // Role-aware flags based on active role
  const isScorekeeper = activeRole === 'scorekeeper';
  const isParent = activeRole === 'parent';
  const isCoach = ['coach', 'manager', 'admin', 'director'].includes(activeRole);

  function handleUnfollowTeam(team: FollowedTeam) {
    Alert.alert(
      'Unfollow Team',
      `Are you sure you want to unfollow ${team.team_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            try {
              const teamId = team.team_id || team.id;
              await unfollowTeam(teamId);
              setTeams((prev) => prev.filter((t) => (t.team_id || t.id) !== teamId));
              // Refresh data to update upcoming events too
              lastLoadRef.current = 0;
              loadData(true);
            } catch {
              Alert.alert('Error', 'Failed to unfollow team. Please try again.');
            }
          },
        },
      ]
    );
  }

  // --------------- Hero Banner ---------------
  function HeroBanner() {
    return (
      <ImageBackground
        source={require('../../assets/hero-rink.jpg')}
        style={[styles.hero, { paddingTop: insets.top + 8 }]}
        resizeMode="cover"
      >
        {/* Dark overlay for text readability */}
        <View style={styles.heroOverlay} />

        {/* Bright cyan bottom edge */}
        <View style={styles.heroCyanEdge} />

        {/* Content */}
        <View style={styles.heroContent}>
          <View style={styles.heroTop}>
            <Image
              source={require('../../assets/uht-logo.png')}
              style={styles.heroLogo}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={styles.heroMenuBtn}
              onPress={() => navigation.navigate('NotificationsInbox' as never)}
              activeOpacity={0.7}
            >
              <Ionicons name="notifications-outline" size={22} color={colors.white} />
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.heroSeason}>2026-27 SEASON</Text>
          <Text style={styles.heroGreeting}>
            {firstName ? `Welcome back, ${firstName}` : 'Welcome'}
          </Text>
        </View>

        {/* Quick Actions — overlapping cards on hero */}
        <View style={styles.quickActionsBar}>
          <TouchableOpacity
            style={styles.qaButton}
            onPress={() => navigation.navigate('Events' as never)}
            activeOpacity={0.8}
          >
            <View style={styles.qaIconBox}>
              <Ionicons name="trophy" size={20} color={colors.white} />
            </View>
            <Text style={styles.qaLabel}>Events</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          <View style={styles.qaDivider} />

          <TouchableOpacity
            style={styles.qaButton}
            onPress={() => navigation.navigate(isScorekeeper ? 'Menu' : 'My Teams', isScorekeeper ? { screen: 'Scorekeeper' } : undefined)}
            activeOpacity={0.8}
          >
            <View style={styles.qaIconBox}>
              <Ionicons name={isScorekeeper ? 'clipboard' : 'shield'} size={20} color={colors.white} />
            </View>
            <Text style={styles.qaLabel}>{isScorekeeper ? 'My Scoring' : 'My Teams'}</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          <View style={styles.qaDivider} />

          <TouchableOpacity
            style={styles.qaButton}
            onPress={() => navigation.navigate('Shop' as never)}
            activeOpacity={0.8}
          >
            <View style={styles.qaIconBox}>
              <Ionicons name="cart" size={20} color={colors.white} />
            </View>
            <Text style={styles.qaLabel}>Shop</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>
      </ImageBackground>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <HeroBanner />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <HeroBanner />
      <FlatList
        data={[]}
        renderItem={() => null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />
        }
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
          <>
            {/* SCOREKEEPER HOME: assigned events as primary content */}
            {isScorekeeper && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <View style={[styles.sectionAccent, { backgroundColor: '#34c759' }]} />
                    <Text style={styles.sectionTitle}>MY SCORING ASSIGNMENTS</Text>
                  </View>
                </View>
                {scoringEvents.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <View style={[styles.emptyBadge, { backgroundColor: '#e8f5e9' }]}>
                      <Ionicons name="clipboard-outline" size={32} color="#34c759" />
                    </View>
                    <View style={styles.emptyContent}>
                      <Text style={styles.emptyTitle}>No Assignments Yet</Text>
                      <Text style={styles.emptyText}>
                        An admin will assign you to events and games
                      </Text>
                    </View>
                  </View>
                ) : (
                  scoringEvents.map((event: any) => (
                    <TouchableOpacity
                      key={event.id}
                      style={styles.scorekeeperEventCard}
                      activeOpacity={0.7}
                      onPress={() => navigation.navigate('Menu', { screen: 'Scorekeeper', params: { eventId: event.id, eventName: event.name } })}
                    >
                      <View style={[styles.teamBadge, { backgroundColor: '#34c759' }]}>
                        <Ionicons name="clipboard" size={20} color={colors.white} />
                      </View>
                      <View style={styles.teamInfo}>
                        <Text style={styles.teamName} numberOfLines={1}>{event.name}</Text>
                        <Text style={styles.teamOrg}>{event.game_count} games assigned</Text>
                        {event.start_date && (
                          <Text style={[styles.teamOrg, { marginTop: 2 }]}>
                            {formatDateRange(event.start_date, event.end_date || event.start_date)}
                          </Text>
                        )}
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        {event.active_games > 0 && (
                          <View style={[styles.agePill, { backgroundColor: '#e8f5e9', borderColor: '#34c759', marginBottom: 4 }]}>
                            <Text style={[styles.agePillText, { color: '#2e7d32' }]}>{event.active_games} live</Text>
                          </View>
                        )}
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {/* Your Teams — show for coach and parent, not scorekeeper primary */}
            {!isScorekeeper && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <View style={styles.sectionAccent} />
                    <Text style={styles.sectionTitle}>YOUR TEAMS</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.seeAllBtn}
                    onPress={() => navigation.navigate('My Teams')}
                  >
                    <Text style={styles.seeAllText}>See All</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.cyan} />
                  </TouchableOpacity>
                </View>
                {teams.length === 0 ? (
                  <TouchableOpacity
                    style={styles.emptyCard}
                    onPress={() => navigation.navigate('FollowTeams')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.emptyBadge}>
                      <Ionicons name="shield-outline" size={32} color={colors.cyan} />
                    </View>
                    <View style={styles.emptyContent}>
                      <Text style={styles.emptyTitle}>Follow a Team</Text>
                      <Text style={styles.emptyText}>
                        Stay updated on schedules, scores & standings
                      </Text>
                    </View>
                    <View style={styles.emptyArrow}>
                      <Ionicons name="add-circle" size={28} color={colors.cyan} />
                    </View>
                  </TouchableOpacity>
                ) : (
                  teams.slice(0, 4).map((team, index) => (
                    <View key={team.id} style={[styles.teamCard, index === 0 && styles.teamCardFirst]}>
                      <TouchableOpacity
                        style={styles.teamCardContent}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('My Teams')}
                      >
                        <View style={styles.teamBadge}>
                          {team.logo_url ? (
                            <Image source={{ uri: team.logo_url }} style={styles.teamBadgeImg} />
                          ) : (
                            <Image source={require('../../assets/uht-logo.png')} style={styles.teamBadgeLogoFallback} resizeMode="contain" />
                          )}
                        </View>
                        <View style={styles.teamInfo}>
                          <Text style={styles.teamName}>{team.team_name}</Text>
                          {team.org_name ? (
                            <Text style={styles.teamOrg} numberOfLines={1}>{team.org_name}</Text>
                          ) : null}
                        </View>
                        {team.age_group ? (
                          <View style={styles.agePill}>
                            <Text style={styles.agePillText}>{team.age_group}</Text>
                          </View>
                        ) : null}
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: 8 }} />
                      </TouchableOpacity>
                      {!team.isOwnTeam && (
                        <TouchableOpacity
                          style={styles.unfollowBtn}
                          onPress={() => handleUnfollowTeam(team)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="close-circle" size={22} color="#8e919e" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}

            {/* Upcoming Events */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionAccent} />
                  <Text style={styles.sectionTitle}>MY UPCOMING EVENTS</Text>
                </View>
                <TouchableOpacity
                  style={styles.seeAllBtn}
                  onPress={() => navigation.navigate('Events' as never)}
                >
                  <Text style={styles.seeAllText}>Browse</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.cyan} />
                </TouchableOpacity>
              </View>
              {upcomingEvents.length === 0 ? (
                <View style={styles.emptyCard}>
                  <View style={[styles.emptyBadge, { backgroundColor: colors.bg }]}>
                    <Ionicons name="calendar-outline" size={32} color={colors.textMuted} />
                  </View>
                  <View style={styles.emptyContent}>
                    <Text style={styles.emptyTitle}>No Upcoming Events</Text>
                    <Text style={styles.emptyText}>
                      Register for a tournament to see it here
                    </Text>
                  </View>
                </View>
              ) : (
                upcomingEvents.map((event) => (
                  <TouchableOpacity
                    key={event.id}
                    style={styles.eventCard}
                    onPress={() => navigation.navigate('EventDetail', { eventId: event.id, eventName: event.name, event: event })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.eventLogo}>
                      {event.logo_url ? (
                        <Image source={{ uri: event.logo_url }} style={styles.eventLogoImg} />
                      ) : (
                        <Text style={styles.eventLogoText}>UHT</Text>
                      )}
                    </View>
                    <View style={styles.eventInfo}>
                      <Text style={styles.eventName} numberOfLines={2}>{event.name}</Text>
                      <View style={styles.eventMetaRow}>
                        <Ionicons name="calendar-outline" size={13} color={colors.cyan} style={{ marginRight: 4 }} />
                        <Text style={styles.eventMeta}>
                          {formatDateRange(event.start_date, event.end_date)}
                        </Text>
                      </View>
                      {event.city ? (
                        <View style={styles.eventMetaRow}>
                          <Ionicons name="location-outline" size={13} color={colors.cyan} style={{ marginRight: 4 }} />
                          <Text style={styles.eventMeta}>
                            {event.city}{event.state ? `, ${event.state}` : ''}
                          </Text>
                        </View>
                      ) : null}
                      {event.teamNames && event.teamNames.length > 0 ? (
                        <View style={styles.eventTeamsRow}>
                          <Ionicons name="people-outline" size={13} color="#F59E0B" style={{ marginRight: 4 }} />
                          <Text style={styles.eventTeamNames} numberOfLines={2}>
                            {event.teamNames.join(', ')}
                          </Text>
                        </View>
                      ) : null}
                      {event.hotel_name ? (
                        <View style={styles.hotelRow}>
                          <View style={styles.hotelInfo}>
                            <Ionicons name="bed-outline" size={13} color={colors.navy} style={{ marginRight: 4 }} />
                            <Text style={styles.hotelName} numberOfLines={1}>{event.hotel_name}</Text>
                          </View>
                          {event.hotel_booking_url ? (
                            <TouchableOpacity
                              onPress={() => Linking.openURL(event.hotel_booking_url!)}
                              style={styles.bookBtn}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.bookBtnText}>Book Room</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },

  // ==========================================
  // HERO — Rink photo background, ESPN-inspired
  // ==========================================
  hero: {
    paddingBottom: 0,
    overflow: 'hidden',
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 30, 60, 0.55)',
  },
  heroCyanEdge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: colors.cyan,
  },
  heroContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  heroLogo: {
    width: 140,
    height: 52,
  },
  heroMenuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative' as const,
  },
  bellBadge: {
    position: 'absolute' as const,
    top: -2,
    right: -4,
    backgroundColor: '#E53935',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  bellBadgeText: {
    fontSize: 10,
    color: colors.white,
    ...fonts.bold,
  },
  heroSeason: {
    fontSize: 11,
    letterSpacing: 3,
    color: colors.cyan,
    ...fonts.extrabold,
    marginBottom: 2,
  },
  heroGreeting: {
    fontSize: 22,
    color: colors.white,
    ...fonts.bold,
  },

  // ==========================================
  // QUICK ACTIONS — Bold inline bar
  // ==========================================
  quickActionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    marginHorizontal: 0,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  qaButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    gap: 6,
  },
  qaIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0,204,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qaLabel: {
    fontSize: 13,
    color: colors.white,
    ...fonts.bold,
    letterSpacing: 0.3,
  },
  qaDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // ==========================================
  // SECTIONS
  // ==========================================
  section: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionAccent: {
    width: 4,
    height: 22,
    backgroundColor: colors.cyan,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    color: colors.text,
    ...fonts.extrabold,
    letterSpacing: 1,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: 13,
    color: colors.cyan,
    ...fonts.semibold,
  },

  // ==========================================
  // EMPTY STATE
  // ==========================================
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.cyan,
  },
  emptyBadge: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.highlight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  emptyContent: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 16,
    color: colors.text,
    ...fonts.bold,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 2,
    lineHeight: 18,
  },
  emptyArrow: {
    marginLeft: spacing.sm,
  },

  // ==========================================
  // TEAM CARDS — Bold, sporty
  // ==========================================
  teamCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: colors.navy,
    position: 'relative',
  },
  teamCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    paddingRight: spacing.xxl,
  },
  teamCardFirst: {
    borderLeftColor: colors.cyan,
  },
  unfollowBtn: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    padding: 4,
    zIndex: 5,
  },
  teamBadge: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  teamBadgeText: {
    fontSize: 20,
    color: colors.white,
    ...fonts.extrabold,
  },
  teamBadgeImg: {
    width: 46,
    height: 46,
    borderRadius: 10,
  },
  teamBadgeLogoFallback: {
    width: 32,
    height: 32,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 15,
    color: colors.text,
    ...fonts.bold,
  },
  teamOrg: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 2,
  },
  agePill: {
    backgroundColor: colors.highlight,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.cyan,
  },
  agePillText: {
    fontSize: 11,
    color: colors.cyanDark,
    ...fonts.bold,
    letterSpacing: 0.3,
  },

  // ==========================================
  // SCOREKEEPER EVENT CARD
  // ==========================================
  scorekeeperEventCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: '#34c759',
  },

  // ==========================================
  // EVENT CARDS (kept mostly same — Chad likes these)
  // ==========================================
  eventCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventLogo: {
    width: 50,
    height: 50,
    borderRadius: radii.sm,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  eventLogoImg: {
    width: 50,
    height: 50,
    borderRadius: radii.sm,
  },
  eventLogoText: {
    fontSize: 12,
    color: colors.white,
    ...fonts.bold,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: 15,
    color: colors.text,
    ...fonts.semibold,
    marginBottom: 4,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  eventMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
  },
  eventTeamsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 3,
  },
  eventTeamNames: {
    fontSize: 13,
    color: '#F59E0B',
    ...fonts.semibold,
    flex: 1,
  },
  hotelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    backgroundColor: '#F0F7FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  hotelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  hotelName: {
    fontSize: 12,
    color: colors.navy,
    ...fonts.semibold,
    flex: 1,
  },
  bookBtn: {
    backgroundColor: colors.navy,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  bookBtnText: {
    fontSize: 11,
    color: '#FFFFFF',
    ...fonts.bold,
  },
});
