import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getEventDetail, getEventSchedule } from '../services/api';

type TabKey = 'schedule' | 'scores' | 'standings';

interface GameSlot {
  id: string;
  time?: string;
  date?: string;
  rink_name?: string;
  rink?: string;
  home_team_name?: string;
  away_team_name?: string;
  home_team?: string;
  away_team?: string;
  home_score?: number | null;
  away_score?: number | null;
  division_name?: string;
}

interface EventInfo {
  id: string;
  name: string;
  city?: string;
  state?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  status?: string;
}

export default function EventDetailScreen({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { eventId, eventName } = route.params || {};
  const [activeTab, setActiveTab] = useState<TabKey>('schedule');
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [schedule, setSchedule] = useState<GameSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [eventId]);

  async function loadData(isRefresh = false) {
    if (!isRefresh) setLoading(true);
    setError('');
    try {
      const [eventData, scheduleData] = await Promise.all([
        getEventDetail(eventId),
        getEventSchedule(eventId),
      ]);
      setEvent(eventData);
      setSchedule(scheduleData || []);
    } catch {
      setError('Failed to load event details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    loadData(true);
  }

  function formatDateRange(startDate?: string, endDate?: string): string {
    if (!startDate) return 'Dates TBD';
    try {
      const start = new Date(startDate);
      const opts: Intl.DateTimeFormatOptions = {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      };
      const startStr = start.toLocaleDateString('en-US', opts);

      if (!endDate) return startStr;

      const end = new Date(endDate);
      const endStr = end.toLocaleDateString('en-US', opts);

      return `${startStr} - ${endStr}`;
    } catch {
      return startDate;
    }
  }

  function formatGameTime(time?: string, date?: string): string {
    if (!time && !date) return 'TBD';
    const parts: string[] = [];
    if (date) {
      try {
        const d = new Date(date);
        parts.push(
          d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        );
      } catch {
        parts.push(date);
      }
    }
    if (time) {
      parts.push(time);
    }
    return parts.join(' at ');
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'schedule', label: 'Schedule' },
    { key: 'scores', label: 'Scores' },
    { key: 'standings', label: 'Standings' },
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {eventName || 'Event'}
          </Text>
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {event?.name || eventName || 'Event'}
        </Text>
      </View>

      {event ? (
        <View style={styles.eventInfo}>
          {event.city || event.state ? (
            <Text style={styles.eventLocation}>
              {[event.city, event.state].filter(Boolean).join(', ')}
            </Text>
          ) : null}
          <Text style={styles.eventDates}>
            {formatDateRange(event.start_date, event.end_date)}
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key ? styles.tabActive : null]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key ? styles.tabTextActive : null,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'schedule' ? (
        <FlatList
          data={schedule}
          keyExtractor={(item, index) => item.id || String(index)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.navy}
              colors={[colors.navy]}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.gameCard}>
              <View style={styles.gameTimeRow}>
                <Text style={styles.gameTime}>
                  {formatGameTime(item.time, item.date)}
                </Text>
                {item.rink_name || item.rink ? (
                  <Text style={styles.gameRink}>
                    {item.rink_name || item.rink}
                  </Text>
                ) : null}
              </View>

              {item.division_name ? (
                <Text style={styles.gameDivision}>{item.division_name}</Text>
              ) : null}

              <View style={styles.matchup}>
                <View style={styles.teamRow}>
                  <Text style={styles.teamLabel}>HOME</Text>
                  <Text style={styles.teamName}>
                    {item.home_team_name || item.home_team || 'TBD'}
                  </Text>
                </View>
                <Text style={styles.vsText}>vs</Text>
                <View style={styles.teamRow}>
                  <Text style={styles.teamLabel}>AWAY</Text>
                  <Text style={styles.teamName}>
                    {item.away_team_name || item.away_team || 'TBD'}
                  </Text>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Schedule Not Yet Published</Text>
              <Text style={styles.emptyText}>
                The schedule for this event hasn't been published yet. Check back
                closer to the event date.
              </Text>
            </View>
          }
        />
      ) : (
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonTitle}>Coming Soon</Text>
          <Text style={styles.comingSoonText}>
            {activeTab === 'scores'
              ? 'Live scores will be available once games begin.'
              : 'Standings will be updated as games are played.'}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
  },
  backText: {
    color: colors.navy,
    fontSize: 16,
    ...fonts.semibold,
  },
  headerTitle: {
    fontSize: 20,
    color: colors.text,
    ...fonts.bold,
    flex: 1,
  },
  eventInfo: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eventLocation: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.medium,
  },
  eventDates: {
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.regular,
    marginTop: spacing.xs,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBanner: {
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    marginHorizontal: spacing.xxl,
    marginTop: spacing.md,
    borderRadius: radii.sm,
  },
  errorBannerText: {
    color: colors.error,
    fontSize: 14,
    ...fonts.medium,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  tabText: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.semibold,
  },
  tabTextActive: {
    color: colors.white,
  },
  listContent: {
    padding: spacing.xxl,
    paddingBottom: 40,
  },
  gameCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  gameTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  gameTime: {
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  gameRink: {
    fontSize: 13,
    color: colors.info,
    ...fonts.medium,
  },
  gameDivision: {
    fontSize: 12,
    color: colors.navy,
    ...fonts.semibold,
    marginBottom: spacing.sm,
  },
  matchup: {
    gap: spacing.xs,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  teamLabel: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.semibold,
    letterSpacing: 0.5,
    width: 40,
  },
  teamName: {
    fontSize: 15,
    color: colors.text,
    ...fonts.semibold,
    flex: 1,
  },
  vsText: {
    fontSize: 12,
    color: colors.textMuted,
    ...fonts.regular,
    textAlign: 'center',
    marginLeft: 48,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    textAlign: 'center',
    lineHeight: 22,
  },
  comingSoon: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  comingSoonTitle: {
    fontSize: 20,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.md,
  },
  comingSoonText: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    textAlign: 'center',
    lineHeight: 22,
  },
});
