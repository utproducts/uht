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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getFollowedTeams, getEvents } from '../services/api';
import ScreenHeader from '../components/ScreenHeader';

interface FollowedTeam {
  id: string;
  team_id: string;
  team_name: string;
  org_name?: string;
  age_group?: string;
  next_event_name?: string;
  next_event_date?: string;
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
  const [teams, setTeams] = useState<FollowedTeam[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [teamData, eventData] = await Promise.all([
        getFollowedTeams(),
        getEvents(),
      ]);
      setTeams(teamData);
      // Show only upcoming events (next 3)
      const today = new Date().toISOString().split('T')[0];
      const upcoming = (eventData as Event[])
        .filter((e: Event) => e.end_date >= today)
        .sort((a: Event, b: Event) => a.start_date.localeCompare(b.start_date))
        .slice(0, 3);
      setUpcomingEvents(upcoming);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  function onRefresh() {
    setRefreshing(true);
    loadData(true);
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Dashboard" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Dashboard" />
      <FlatList
        data={[]}
        renderItem={() => null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />
        }
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
          <>
            {/* Quick Actions */}
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('Events' as never)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickIconWrap, { backgroundColor: colors.highlight }]}>
                  <Ionicons name="calendar" size={22} color={colors.navy} />
                </View>
                <Text style={styles.quickLabel}>Events</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('My Teams' as never)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickIconWrap, { backgroundColor: '#e6f9ff' }]}>
                  <Ionicons name="people" size={22} color={colors.cyan} />
                </View>
                <Text style={styles.quickLabel}>My Teams</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('Shop' as never)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickIconWrap, { backgroundColor: '#fff3e0' }]}>
                  <Ionicons name="trophy" size={22} color={colors.warning} />
                </View>
                <Text style={styles.quickLabel}>Shop</Text>
              </TouchableOpacity>
            </View>

            {/* Followed Teams */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your Teams</Text>
                <TouchableOpacity onPress={() => navigation.navigate('My Teams' as never)}>
                  <Text style={styles.seeAll}>See All</Text>
                </TouchableOpacity>
              </View>
              {teams.length === 0 ? (
                <TouchableOpacity
                  style={styles.emptyCard}
                  onPress={() => navigation.navigate('FollowTeams')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle-outline" size={32} color={colors.cyan} />
                  <Text style={styles.emptyTitle}>Follow a Team</Text>
                  <Text style={styles.emptyText}>
                    Tap to find and follow your favorite teams
                  </Text>
                </TouchableOpacity>
              ) : (
                teams.slice(0, 4).map((team) => (
                  <View key={team.id} style={styles.teamCard}>
                    <View style={styles.teamAvatar}>
                      <Text style={styles.teamAvatarText}>
                        {(team.team_name || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.teamInfo}>
                      <Text style={styles.teamName}>{team.team_name}</Text>
                      {team.org_name ? (
                        <Text style={styles.teamOrg}>{team.org_name}</Text>
                      ) : null}
                      {team.age_group ? (
                        <View style={styles.ageBadge}>
                          <Text style={styles.ageBadgeText}>{team.age_group}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                  </View>
                ))
              )}
            </View>

            {/* Upcoming Events */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Upcoming Events</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Events' as never)}>
                  <Text style={styles.seeAll}>See All</Text>
                </TouchableOpacity>
              </View>
              {upcomingEvents.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="calendar-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>No Upcoming Events</Text>
                  <Text style={styles.emptyText}>
                    Check back soon for upcoming UHT events
                  </Text>
                </View>
              ) : (
                upcomingEvents.map((event) => (
                  <TouchableOpacity
                    key={event.id}
                    style={styles.eventCard}
                    onPress={() => navigation.navigate('EventDetail', { eventId: event.id, eventName: event.name })}
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
                      <Text style={styles.eventMeta}>
                        {formatDateRange(event.start_date, event.end_date)}
                        {event.city ? ` · ${event.city}, ${event.state || ''}` : ''}
                      </Text>
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
    paddingBottom: spacing.xxxl,
  },
  // Quick actions
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  quickAction: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  quickLabel: {
    fontSize: 13,
    color: colors.text,
    ...fonts.semibold,
  },
  // Section
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
  sectionTitle: {
    fontSize: 18,
    color: colors.text,
    ...fonts.bold,
  },
  seeAll: {
    fontSize: 14,
    color: colors.cyan,
    ...fonts.semibold,
  },
  // Empty
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontSize: 16,
    color: colors.text,
    ...fonts.semibold,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  // Team cards
  teamCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  teamAvatarText: {
    fontSize: 18,
    color: colors.white,
    ...fonts.bold,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 15,
    color: colors.text,
    ...fonts.semibold,
  },
  teamOrg: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 2,
  },
  ageBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.highlight,
    borderRadius: radii.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.xs,
  },
  ageBadgeText: {
    fontSize: 11,
    color: colors.navy,
    ...fonts.semibold,
  },
  // Event cards
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
  },
  eventMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 2,
  },
});
