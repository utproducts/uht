import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Image,
  Share,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import ScreenHeader from '../components/ScreenHeader';
import { getEvents } from '../services/api';

interface UHTEvent {
  id: string;
  name: string;
  slug?: string;
  city?: string;
  state?: string;
  start_date?: string;
  end_date?: string;
  logo_url?: string;
  status?: string;
}

type TabKey = 'upcoming' | 'past';

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (start.getMonth() === end.getMonth()) {
    return `${months[start.getMonth()]} ${start.getDate()} - ${end.getDate()}`;
  }
  return `${months[start.getMonth()]} ${start.getDate()} - ${months[end.getMonth()]} ${end.getDate()}`;
}

async function shareEvent(event: UHTEvent) {
  await Share.share({
    message: `Check out ${event.name} at Ultimate Tournaments!\nhttps://ultimatetournaments.com/events/${event.slug}`,
  });
}

export default function EventsScreen({ navigation }: { navigation: any }) {
  const [allEvents, setAllEvents] = useState<UHTEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');

  const loadEvents = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError('');
    try {
      const data = await getEvents();
      const sorted = [...data].sort((a: UHTEvent, b: UHTEvent) => {
        const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
        const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
        return dateA - dateB;
      });
      setAllEvents(sorted);
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

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const upcomingEvents = useMemo(
    () =>
      allEvents.filter((e) => {
        if (!e.end_date) return true;
        return new Date(e.end_date + 'T00:00:00') >= today;
      }),
    [allEvents, today],
  );

  const pastEvents = useMemo(
    () =>
      allEvents
        .filter((e) => {
          if (!e.end_date) return false;
          return new Date(e.end_date + 'T00:00:00') < today;
        })
        .reverse(),
    [allEvents, today],
  );

  const displayedEvents = useMemo(() => {
    const source = activeTab === 'upcoming' ? upcomingEvents : pastEvents;
    if (!searchQuery.trim()) return source;
    const q = searchQuery.toLowerCase();
    return source.filter((e) => e.name.toLowerCase().includes(q));
  }, [activeTab, upcomingEvents, pastEvents, searchQuery]);

  function handleRefresh() {
    setRefreshing(true);
    loadEvents(true);
  }

  function renderEventLogo(event: UHTEvent) {
    if (event.logo_url) {
      return (
        <Image
          source={{ uri: event.logo_url }}
          style={styles.eventLogo}
          resizeMode="cover"
        />
      );
    }
    return (
      <View style={styles.eventLogoPlaceholder}>
        <Text style={styles.eventLogoText}>UHT</Text>
      </View>
    );
  }

  function renderTab(tab: TabKey, label: string, icon: string) {
    const isActive = activeTab === tab;
    return (
      <TouchableOpacity
        key={tab}
        style={[styles.tab, isActive && styles.tabActive]}
        onPress={() => setActiveTab(tab)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={icon as any}
          size={18}
          color={isActive ? colors.navy : colors.textMuted}
          style={styles.tabIcon}
        />
        <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Events" />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Events" />

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {renderTab('upcoming', 'Upcoming', 'calendar-outline')}
        {renderTab('past', 'Past Events', 'time-outline')}
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search events..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={displayedEvents}
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
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.eventCard}
            onPress={() =>
              navigation.navigate('EventDetail', {
                eventId: item.id,
                eventName: item.name,
              })
            }
            activeOpacity={0.7}
          >
            <View style={styles.eventCardRow}>
              {renderEventLogo(item)}

              <View style={styles.eventInfo}>
                <Text style={styles.eventName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.eventDates}>
                  {item.start_date && item.end_date
                    ? formatDateRange(item.start_date, item.end_date)
                    : 'Dates TBD'}
                </Text>
                {(item.city || item.state) && (
                  <View style={styles.locationRow}>
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color={colors.textMuted}
                    />
                    <Text style={styles.eventLocation}>
                      {[item.city, item.state].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.shareButton}
                onPress={() => shareEvent(item)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name={activeTab === 'upcoming' ? 'calendar-outline' : 'time-outline'}
              size={48}
              color={colors.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {searchQuery
                ? 'No Matching Events'
                : activeTab === 'upcoming'
                ? 'No Upcoming Events'
                : 'No Past Events'}
            </Text>
            <Text style={styles.emptyText}>
              {searchQuery
                ? `No events found matching "${searchQuery}".`
                : activeTab === 'upcoming'
                ? 'There are no upcoming events at this time. Check back soon!'
                : 'No past events to display.'}
            </Text>
          </View>
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
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.navy,
  },
  tabIcon: {
    marginRight: spacing.xs,
  },
  tabLabel: {
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.medium,
  },
  tabLabelActive: {
    color: colors.navy,
    ...fonts.bold,
  },

  // Search
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    marginLeft: spacing.sm,
    paddingVertical: spacing.xs,
    ...fonts.regular,
  },

  // Error
  errorBanner: {
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: radii.sm,
  },
  errorBannerText: {
    color: colors.error,
    fontSize: 14,
    ...fonts.medium,
  },

  // List
  listContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },

  // Event card
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
  eventCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventLogo: {
    width: 60,
    height: 60,
    borderRadius: radii.sm,
  },
  eventLogoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: radii.sm,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventLogoText: {
    color: colors.white,
    fontSize: 16,
    ...fonts.bold,
  },
  eventInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  eventName: {
    fontSize: 16,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.xs,
  },
  eventDates: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.medium,
    marginBottom: spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventLocation: {
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.regular,
    marginLeft: 4,
  },
  shareButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    color: colors.text,
    ...fonts.bold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    textAlign: 'center',
    lineHeight: 22,
  },
});
