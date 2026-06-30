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

export default function ScorekeeperScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<ScorekeeperEvent[]>([]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [games, setGames] = useState<Record<string, ScorekeeperGame[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingGames, setLoadingGames] = useState<string | null>(null);

  const loadEvents = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await getScorekeeperEvents();
      setEvents(data as ScorekeeperEvent[]);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents])
  );

  const toggleEvent = async (eventId: string) => {
    if (expandedEventId === eventId) {
      setExpandedEventId(null);
      return;
    }
    setExpandedEventId(eventId);
    if (!games[eventId]) {
      setLoadingGames(eventId);
      try {
        const data = await getScorekeeperGames(eventId);
        setGames(prev => ({ ...prev, [eventId]: data as ScorekeeperGame[] }));
      } catch {}
      setLoadingGames(null);
    }
  };

  const openScoring = (game: ScorekeeperGame) => {
    // Open the tablet-optimized web scoring interface
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="My Scoring" navigation={navigation} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="clipboard-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Assignments</Text>
          <Text style={styles.emptyText}>
            You don't have any scoring assignments yet. An admin will assign you to games.
          </Text>
        </View>
      ) : (
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
          {events.map(event => {
            const isExpanded = expandedEventId === event.id;
            const eventGames = games[event.id] || [];
            const isLoadingThis = loadingGames === event.id;

            return (
              <View key={event.id} style={styles.eventCard}>
                <TouchableOpacity
                  style={styles.eventHeader}
                  onPress={() => toggleEvent(event.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.eventHeaderLeft}>
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
                  <View style={styles.eventHeaderRight}>
                    <View style={styles.gameCountBadge}>
                      <Text style={styles.gameCountText}>{event.game_count}</Text>
                      <Text style={styles.gameCountLabel}>games</Text>
                    </View>
                    {event.active_games > 0 && (
                      <View style={styles.activeBadge}>
                        <View style={styles.activeDot} />
                        <Text style={styles.activeText}>{event.active_games} active</Text>
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
                    {isLoadingThis ? (
                      <ActivityIndicator size="small" color={colors.navy} style={{ padding: 16 }} />
                    ) : eventGames.length === 0 ? (
                      <Text style={styles.noGames}>No games assigned yet</Text>
                    ) : (
                      eventGames.map(game => {
                        const statusColors = getStatusColor(game.status);
                        const isActive = ['in_progress', 'warmup', 'intermission'].includes(game.status);

                        return (
                          <TouchableOpacity
                            key={game.id}
                            style={[styles.gameCard, isActive && styles.gameCardActive]}
                            onPress={() => openScoring(game)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.gameTop}>
                              <Text style={styles.gameNumber}>#{game.game_number}</Text>
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
                              <View style={styles.divisionPill}>
                                <Text style={styles.divisionPillText}>
                                  {[game.age_group, game.division_level].filter(Boolean).join(' ')}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.scoreButton}>
                              <Ionicons name="create-outline" size={16} color={colors.white} />
                              <Text style={styles.scoreButtonText}>
                                {game.status === 'final' ? 'View Game Sheet' : 'Score Game'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
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
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
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

  // Event card
  eventCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  eventHeaderLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '700',
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
    color: colors.textMuted,
  },
  eventHeaderRight: {
    alignItems: 'center',
    gap: 6,
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
    fontWeight: '800',
    color: colors.white,
  },
  gameCountLabel: {
    fontSize: 10,
    fontWeight: '600',
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
    fontWeight: '700',
    color: '#34c759',
  },

  // Games
  gamesContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  noGames: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
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
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  gameMatchup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  gameTeam: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  gameVs: {
    fontSize: 12,
    color: colors.textMuted,
    marginHorizontal: 8,
  },
  gameScore: {
    fontSize: 20,
    fontWeight: '800',
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
    color: colors.textMuted,
  },
  divisionPill: {
    backgroundColor: colors.navy,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  divisionPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  scoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: 10,
  },
  scoreButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
});
