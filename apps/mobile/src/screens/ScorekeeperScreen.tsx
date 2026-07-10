import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getScorekeeperEvents, getScorekeeperGames } from '../services/api';
import ScreenHeader from '../components/ScreenHeader';

interface ScorekeeperEvent {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  city?: string;
  state?: string;
  venue_name?: string;
  game_count: number;
  active_games: number;
}

interface ScorekeeperGame {
  id: string;
  game_number: number;
  game_type: string;
  status: string;
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  period: number;
  start_time: string;
  rink_name: string;
  age_group: string;
  division_level: string;
}

interface Division {
  key: string;
  label: string;
  games: ScorekeeperGame[];
  activeCount: number;
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

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDay(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ScorekeeperScreen({ navigation, route }: { navigation: any; route: any }) {
  const insets = useSafeAreaInsets();
  // If navigated from home with a specific event
  const routeEventId = route?.params?.eventId;
  const routeEventName = route?.params?.eventName;

  // View mode: 'events' list or 'divisions' for a specific event
  const [viewMode, setViewMode] = useState<'events' | 'divisions'>(routeEventId ? 'divisions' : 'events');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(routeEventId || null);
  const [selectedEventName, setSelectedEventName] = useState<string>(routeEventName || '');

  const [events, setEvents] = useState<ScorekeeperEvent[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [expandedDivision, setExpandedDivision] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDivisions, setLoadingDivisions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await getScorekeeperEvents();
      setEvents(data as ScorekeeperEvent[]);

      // If we have a route event, auto-load its divisions
      if (routeEventId) {
        await loadDivisionsForEvent(routeEventId, data as ScorekeeperEvent[]);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [routeEventId]);

  const loadDivisionsForEvent = async (eventId: string, eventList?: ScorekeeperEvent[]) => {
    setLoadingDivisions(true);
    try {
      const games = await getScorekeeperGames(eventId) as ScorekeeperGame[];

      // Group games by division (age_group + division_level)
      const divMap = new Map<string, ScorekeeperGame[]>();
      for (const game of games) {
        const key = [game.age_group, game.division_level].filter(Boolean).join(' ') || 'Unassigned';
        if (!divMap.has(key)) divMap.set(key, []);
        divMap.get(key)!.push(game);
      }

      // Convert to sorted array
      const divList: Division[] = Array.from(divMap.entries())
        .map(([key, games]) => ({
          key,
          label: key,
          games: games.sort((a, b) => {
            if (!a.start_time) return 1;
            if (!b.start_time) return -1;
            return a.start_time.localeCompare(b.start_time);
          }),
          activeCount: games.filter(g => ['in_progress', 'warmup', 'intermission'].includes(g.status)).length,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      setDivisions(divList);
    } catch {
      setDivisions([]);
    }
    setLoadingDivisions(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents])
  );

  const selectEvent = async (event: ScorekeeperEvent) => {
    setSelectedEventId(event.id);
    setSelectedEventName(event.name);
    setViewMode('divisions');
    setExpandedDivision(null);
    await loadDivisionsForEvent(event.id);
  };

  const goBackToEvents = () => {
    setViewMode('events');
    setSelectedEventId(null);
    setSelectedEventName('');
    setDivisions([]);
    setExpandedDivision(null);
  };

  const openScoring = (game: ScorekeeperGame) => {
    const url = `https://uht-web.pages.dev/scoring/game?gameId=${game.id}`;
    Linking.openURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return { bg: '#e0f0ff', text: '#003e79' };
      case 'intermission': return { bg: '#fff3e0', text: '#e67700' };
      case 'warmup': return { bg: '#e6f9ff', text: colors.cyan };
      case 'final': return { bg: '#e8f5e9', text: '#2e7d32' };
      default: return { bg: '#f5f5f7', text: '#86868b' };
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'in_progress': return 'LIVE';
      case 'intermission': return 'INTERMISSION';
      case 'warmup': return 'WARMUP';
      case 'final': return 'FINAL';
      case 'scheduled': return 'SCHEDULED';
      default: return status?.toUpperCase() || '';
    }
  };

  // ============= EVENTS LIST VIEW =============
  const renderEventsView = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadEvents(true); }}
          tintColor={colors.navy}
        />
      }
    >
      {events.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="clipboard-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Assignments</Text>
          <Text style={styles.emptyText}>
            You don't have any scoring assignments yet. An admin will assign you to games.
          </Text>
        </View>
      ) : (
        events.map(event => (
          <TouchableOpacity
            key={event.id}
            style={styles.eventCard}
            onPress={() => selectEvent(event)}
            activeOpacity={0.7}
          >
            <View style={styles.eventIcon}>
              <Ionicons name="trophy" size={22} color={colors.white} />
            </View>
            <View style={styles.eventInfo}>
              <Text style={styles.eventName} numberOfLines={2}>{event.name}</Text>
              <View style={styles.eventMetaRow}>
                <Ionicons name="calendar-outline" size={13} color={colors.cyan} />
                <Text style={styles.eventMeta}>{formatDateRange(event.start_date, event.end_date)}</Text>
              </View>
              {event.venue_name && (
                <View style={styles.eventMetaRow}>
                  <Ionicons name="location-outline" size={13} color={colors.cyan} />
                  <Text style={styles.eventMeta}>{event.venue_name}</Text>
                </View>
              )}
            </View>
            <View style={styles.eventRight}>
              <View style={styles.gameCountBadge}>
                <Text style={styles.gameCountText}>{event.game_count}</Text>
                <Text style={styles.gameCountLabel}>games</Text>
              </View>
              {event.active_games > 0 && (
                <View style={styles.activeBadge}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>{event.active_games} live</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );

  // ============= DIVISIONS VIEW =============
  const renderDivisionsView = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            if (selectedEventId) await loadDivisionsForEvent(selectedEventId);
            setRefreshing(false);
          }}
          tintColor={colors.navy}
        />
      }
    >
      {loadingDivisions ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : divisions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="grid-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Games Yet</Text>
          <Text style={styles.emptyText}>
            No games have been assigned for this event yet.
          </Text>
        </View>
      ) : (
        divisions.map(div => {
          const isExpanded = expandedDivision === div.key;
          return (
            <View key={div.key} style={styles.divisionCard}>
              <TouchableOpacity
                style={styles.divisionHeader}
                onPress={() => setExpandedDivision(isExpanded ? null : div.key)}
                activeOpacity={0.7}
              >
                <View style={styles.divisionLeft}>
                  <View style={styles.divisionIcon}>
                    <Ionicons name="shield" size={18} color={colors.white} />
                  </View>
                  <View>
                    <Text style={styles.divisionName}>{div.label}</Text>
                    <Text style={styles.divisionCount}>{div.games.length} game{div.games.length !== 1 ? 's' : ''}</Text>
                  </View>
                </View>
                <View style={styles.divisionRight}>
                  {div.activeCount > 0 && (
                    <View style={styles.activeBadge}>
                      <View style={styles.activeDot} />
                      <Text style={styles.activeText}>{div.activeCount} live</Text>
                    </View>
                  )}
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.gamesContainer}>
                  {div.games.map(game => {
                    const statusColors = getStatusColor(game.status);
                    const isActive = ['in_progress', 'warmup', 'intermission'].includes(game.status);

                    return (
                      <View key={game.id} style={[styles.gameCard, isActive && styles.gameCardActive]}>
                        <View style={styles.gameTop}>
                          <Text style={styles.gameNumber}>Game #{game.game_number}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
                            <Text style={[styles.statusText, { color: statusColors.text }]}>
                              {getStatusLabel(game.status)}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.gameMatchup}>
                          <Text style={styles.gameTeam} numberOfLines={1}>{game.home_team_name || 'TBD'}</Text>
                          <Text style={styles.gameVs}>vs</Text>
                          <Text style={styles.gameTeam} numberOfLines={1}>{game.away_team_name || 'TBD'}</Text>
                        </View>
                        {(game.status === 'in_progress' || game.status === 'final') && (
                          <Text style={styles.gameScore}>
                            {game.home_score} - {game.away_score}
                          </Text>
                        )}
                        <View style={styles.gameDetails}>
                          <View style={styles.gameDetailItem}>
                            <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                            <Text style={styles.gameDetailText}>
                              {formatDay(game.start_time)} {formatTime(game.start_time)}
                            </Text>
                          </View>
                          <View style={styles.gameDetailItem}>
                            <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                            <Text style={styles.gameDetailText}>{game.rink_name || '—'}</Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.scoreButton}
                          onPress={() => openScoring(game)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="create-outline" size={16} color={colors.white} />
                          <Text style={styles.scoreButtonText}>
                            {game.status === 'final' ? 'View Game Sheet' : 'Score Game'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={viewMode === 'divisions' ? selectedEventName || 'Event' : 'My Scoring'}
        showBack={viewMode === 'divisions'}
        onBack={viewMode === 'divisions' ? goBackToEvents : undefined}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : viewMode === 'events' ? (
        renderEventsView()
      ) : (
        renderDivisionsView()
      )}
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
  loadingCenter: {
    paddingTop: 60,
    alignItems: 'center',
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    ...fonts.bold,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },

  // ==========================================
  // EVENT CARDS
  // ==========================================
  eventCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: '#34c759',
  },
  eventIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#34c759',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: 16,
    ...fonts.bold,
    color: colors.text,
    marginBottom: 4,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  eventMeta: {
    fontSize: 12,
    ...fonts.regular,
    color: colors.textMuted,
  },
  eventRight: {
    alignItems: 'center',
    gap: 6,
    marginLeft: spacing.sm,
  },
  gameCountBadge: {
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  gameCountText: {
    fontSize: 18,
    ...fonts.extrabold,
    color: colors.white,
  },
  gameCountLabel: {
    fontSize: 10,
    ...fonts.semibold,
    color: 'rgba(255,255,255,0.7)',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34c759',
  },
  activeText: {
    fontSize: 10,
    ...fonts.bold,
    color: '#34c759',
  },

  // ==========================================
  // DIVISION CARDS
  // ==========================================
  divisionCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  divisionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  divisionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  divisionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  divisionName: {
    fontSize: 16,
    ...fonts.bold,
    color: colors.text,
  },
  divisionCount: {
    fontSize: 13,
    ...fonts.regular,
    color: colors.textMuted,
    marginTop: 1,
  },
  divisionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  // ==========================================
  // GAMES
  // ==========================================
  gamesContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  gameCard: {
    backgroundColor: '#fafafa',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  gameCardActive: {
    backgroundColor: '#f0f7ff',
    borderWidth: 1,
    borderColor: '#003e79',
  },
  gameTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  gameNumber: {
    fontSize: 12,
    ...fonts.bold,
    color: colors.textMuted,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 10,
    ...fonts.extrabold,
  },
  gameMatchup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  gameTeam: {
    flex: 1,
    fontSize: 14,
    ...fonts.semibold,
    color: colors.text,
  },
  gameVs: {
    fontSize: 12,
    color: colors.textMuted,
    marginHorizontal: 8,
  },
  gameScore: {
    fontSize: 20,
    ...fonts.extrabold,
    color: colors.navy,
    textAlign: 'center',
    marginBottom: 4,
  },
  gameDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  gameDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  gameDetailText: {
    fontSize: 11,
    ...fonts.regular,
    color: colors.textMuted,
  },
  scoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#34c759',
    borderRadius: radii.md,
    paddingVertical: 10,
  },
  scoreButtonText: {
    fontSize: 14,
    ...fonts.bold,
    color: colors.white,
  },
});
