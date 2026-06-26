import React, { useState, useCallback } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getEvents } from '../services/api';

interface UHTEvent {
  id: string;
  name: string;
  city?: string;
  state?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
}

export default function EventsScreen({ navigation }: { navigation: any }) {
  const [events, setEvents] = useState<UHTEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadEvents = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError('');
    try {
      const data = await getEvents();
      // Sort by start_date ascending (upcoming first)
      const sorted = [...data].sort((a: UHTEvent, b: UHTEvent) => {
        const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
        const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
        return dateA - dateB;
      });
      // Filter to upcoming events (start_date >= today)
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const upcoming = sorted.filter((e) => {
        if (!e.start_date) return true;
        return new Date(e.start_date) >= now;
      });
      // If no upcoming, show all sorted
      setEvents(upcoming.length > 0 ? upcoming : sorted);
    } catch {
      setError('Failed to load events. Pull to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents]),
  );

  function handleRefresh() {
    setRefreshing(true);
    loadEvents(true);
  }

  function formatDateRange(startDate?: string, endDate?: string): string {
    if (!startDate) return 'Dates TBD';
    try {
      const start = new Date(startDate);
      const opts: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
      };
      const startStr = start.toLocaleDateString('en-US', opts);

      if (!endDate) return startStr;

      const end = new Date(endDate);
      const endStr = end.toLocaleDateString('en-US', {
        ...opts,
        year: 'numeric',
      });

      if (start.getMonth() === end.getMonth()) {
        return `${startStr} - ${end.getDate()}, ${end.getFullYear()}`;
      }
      return `${startStr} - ${endStr}`;
    } catch {
      return startDate;
    }
  }

  function getStatusStyle(status?: string) {
    switch (status?.toLowerCase()) {
      case 'open':
      case 'registration_open':
        return { bg: colors.successBg, text: colors.success, label: 'Open' };
      case 'sold_out':
        return { bg: colors.errorBg, text: colors.error, label: 'Sold Out' };
      case 'closed':
      case 'registration_closed':
        return { bg: colors.warningBg, text: colors.warning, label: 'Closed' };
      case 'completed':
        return { bg: colors.infoBg, text: colors.info, label: 'Completed' };
      default:
        return status
          ? { bg: colors.infoBg, text: colors.info, label: status }
          : null;
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Events</Text>
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
        <Text style={styles.headerTitle}>Events</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.navy}
            colors={[colors.navy]}
          />
        }
        renderItem={({ item }) => {
          const statusInfo = getStatusStyle(item.status);
          return (
            <TouchableOpacity
              style={styles.eventCard}
              onPress={() =>
                navigation.navigate('EventDetail', { eventId: item.id, eventName: item.name })
              }
              activeOpacity={0.7}
            >
              <View style={styles.eventCardHeader}>
                <Text style={styles.eventName}>{item.name}</Text>
                {statusInfo ? (
                  <View
                    style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}
                  >
                    <Text style={[styles.statusText, { color: statusInfo.text }]}>
                      {statusInfo.label}
                    </Text>
                  </View>
                ) : null}
              </View>

              {item.city || item.state ? (
                <Text style={styles.eventLocation}>
                  {[item.city, item.state].filter(Boolean).join(', ')}
                </Text>
              ) : null}

              <Text style={styles.eventDates}>
                {formatDateRange(item.start_date, item.end_date)}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Events</Text>
            <Text style={styles.emptyText}>
              There are no upcoming events at this time. Check back soon.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 28,
    color: colors.text,
    ...fonts.bold,
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
  listContent: {
    padding: spacing.xxl,
    paddingBottom: 40,
  },
  eventCard: {
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
  eventCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  eventName: {
    fontSize: 17,
    color: colors.text,
    ...fonts.bold,
    flex: 1,
  },
  statusBadge: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusText: {
    fontSize: 12,
    ...fonts.semibold,
  },
  eventLocation: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: spacing.sm,
  },
  eventDates: {
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.medium,
    marginTop: spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 22,
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
});
