import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch } from '../services/auth';
import ScreenHeader from '../components/ScreenHeader';

// ============================================================
// Types
// ============================================================

interface DirectorGame {
  id: string;
  game_number: number;
  start_time: string;
  status: string;
  home_score: number;
  away_score: number;
  period: number;
  game_type: string;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
  rink_name: string;
  age_group: string;
  division_level: string;
}

interface DirectorEvent {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

// ============================================================
// Component
// ============================================================

export default function DirectorGamesScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<DirectorEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<DirectorEvent | null>(null);
  const [games, setGames] = useState<DirectorGame[]>([]);
  const [filter, setFilter] = useState<'all' | 'live' | 'final' | 'upcoming'>('all');

  // Edit modal
  const [editGame, setEditGame] = useState<DirectorGame | null>(null);
  const [editHomeScore, setEditHomeScore] = useState('');
  const [editAwayScore, setEditAwayScore] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [saving, setSaving] = useState(false);

  // Load events assigned to this user (scorekeeper events reuse — directors see the same events)
  const loadEvents = useCallback(async () => {
    try {
      const res = await authFetch('/api/scoring/my-events');
      const json = await res.json();
      if (json.success && json.data) {
        setEvents(json.data);
        if (json.data.length > 0 && !selectedEvent) {
          setSelectedEvent(json.data[0]);
        }
      }
    } catch {}
  }, [selectedEvent]);

  // Load games for selected event
  const loadGames = useCallback(async () => {
    if (!selectedEvent) return;
    try {
      const res = await authFetch(`/api/scoring/events/${selectedEvent.id}/director-games`);
      const json = await res.json();
      if (json.success && json.data) {
        setGames(json.data);
      }
    } catch {}
  }, [selectedEvent]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadEvents();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      loadGames();
    }
  }, [selectedEvent, loadGames]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGames();
    setRefreshing(false);
  };

  // ============================================================
  // Filter logic
  // ============================================================

  const filteredGames = games.filter((g) => {
    if (filter === 'live') return g.status === 'in_progress' || g.status === 'intermission';
    if (filter === 'final') return g.status === 'final';
    if (filter === 'upcoming') return g.status === 'scheduled';
    return true;
  });

  const liveCount = games.filter((g) => g.status === 'in_progress' || g.status === 'intermission').length;
  const finalCount = games.filter((g) => g.status === 'final').length;
  const upcomingCount = games.filter((g) => g.status === 'scheduled').length;

  // ============================================================
  // Edit score
  // ============================================================

  const openEditModal = (game: DirectorGame) => {
    setEditGame(game);
    setEditHomeScore(String(game.home_score));
    setEditAwayScore(String(game.away_score));
    setEditStatus(game.status);
  };

  const handleSaveScore = async () => {
    if (!editGame) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/scoring/games/${editGame.id}/score`, {
        method: 'PUT',
        body: JSON.stringify({
          homeScore: parseInt(editHomeScore) || 0,
          awayScore: parseInt(editAwayScore) || 0,
          status: editStatus !== editGame.status ? editStatus : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setEditGame(null);
        await loadGames();
      } else {
        Alert.alert('Error', json.error || 'Failed to update score');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Network error');
    }
    setSaving(false);
  };

  // ============================================================
  // Helpers
  // ============================================================

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress':
        return '#e74c3c';
      case 'intermission':
        return '#f39c12';
      case 'final':
        return '#27ae60';
      default:
        return '#95a5a6';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'in_progress':
        return 'LIVE';
      case 'intermission':
        return 'INT';
      case 'final':
        return 'FINAL';
      default:
        return 'SCHED';
    }
  };

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScreenHeader title="Score Management" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScreenHeader title="Score Management" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <Ionicons name="football-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No events assigned</Text>
          <Text style={styles.emptySubtext}>You'll see games here once you're assigned to an event</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Score Management" onBack={() => navigation.goBack()} />

      {/* Event Selector */}
      {events.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventScroll} contentContainerStyle={styles.eventScrollContent}>
          {events.map((ev) => (
            <TouchableOpacity
              key={ev.id}
              style={[styles.eventPill, selectedEvent?.id === ev.id && styles.eventPillActive]}
              onPress={() => setSelectedEvent(ev)}
            >
              <Text style={[styles.eventPillText, selectedEvent?.id === ev.id && styles.eventPillTextActive]}>
                {ev.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {[
          { key: 'all', label: 'All', count: games.length },
          { key: 'live', label: 'Live', count: liveCount },
          { key: 'final', label: 'Final', count: finalCount },
          { key: 'upcoming', label: 'Upcoming', count: upcomingCount },
        ].map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key as any)}
          >
            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
              {f.label} ({f.count})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Games List */}
      <ScrollView
        style={styles.gamesList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredGames.length === 0 ? (
          <View style={styles.centeredSmall}>
            <Text style={styles.emptySubtext}>No {filter === 'all' ? '' : filter} games</Text>
          </View>
        ) : (
          filteredGames.map((game) => (
            <TouchableOpacity key={game.id} style={styles.gameCard} onPress={() => openEditModal(game)}>
              <View style={styles.gameHeader}>
                <Text style={styles.gameDivision}>
                  {game.age_group} {game.division_level}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(game.status) }]}>
                  <Text style={styles.statusText}>{getStatusLabel(game.status)}</Text>
                </View>
              </View>

              <View style={styles.scoreRow}>
                <View style={styles.teamCol}>
                  <Text style={styles.teamName} numberOfLines={1}>{game.home_team_name || 'TBD'}</Text>
                </View>
                <Text style={styles.scoreText}>{game.home_score}</Text>
                <Text style={styles.scoreDash}>-</Text>
                <Text style={styles.scoreText}>{game.away_score}</Text>
                <View style={styles.teamCol}>
                  <Text style={[styles.teamName, { textAlign: 'right' }]} numberOfLines={1}>{game.away_team_name || 'TBD'}</Text>
                </View>
              </View>

              <View style={styles.gameFooter}>
                <Text style={styles.gameInfo}>Game #{game.game_number}</Text>
                <Text style={styles.gameInfo}>{game.rink_name}</Text>
                <Text style={styles.gameInfo}>{formatDate(game.start_time)} {formatTime(game.start_time)}</Text>
              </View>

              <View style={styles.editHint}>
                <Ionicons name="create-outline" size={14} color={colors.cyan} />
                <Text style={styles.editHintText}>Tap to edit score</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Score Modal */}
      <Modal visible={!!editGame} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Score</Text>
              <TouchableOpacity onPress={() => setEditGame(null)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {editGame && (
              <>
                <Text style={styles.modalDivision}>
                  {editGame.age_group} {editGame.division_level} — Game #{editGame.game_number}
                </Text>

                {/* Home Score */}
                <View style={styles.editScoreRow}>
                  <Text style={styles.editTeamName} numberOfLines={1}>{editGame.home_team_name || 'Home'}</Text>
                  <View style={styles.scoreControls}>
                    <TouchableOpacity
                      style={styles.scoreBtn}
                      onPress={() => setEditHomeScore(String(Math.max(0, (parseInt(editHomeScore) || 0) - 1)))}
                    >
                      <Ionicons name="remove" size={20} color="#fff" />
                    </TouchableOpacity>
                    <TextInput
                      style={styles.scoreInput}
                      value={editHomeScore}
                      onChangeText={setEditHomeScore}
                      keyboardType="number-pad"
                      selectTextOnFocus
                    />
                    <TouchableOpacity
                      style={styles.scoreBtn}
                      onPress={() => setEditHomeScore(String((parseInt(editHomeScore) || 0) + 1))}
                    >
                      <Ionicons name="add" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Away Score */}
                <View style={styles.editScoreRow}>
                  <Text style={styles.editTeamName} numberOfLines={1}>{editGame.away_team_name || 'Away'}</Text>
                  <View style={styles.scoreControls}>
                    <TouchableOpacity
                      style={styles.scoreBtn}
                      onPress={() => setEditAwayScore(String(Math.max(0, (parseInt(editAwayScore) || 0) - 1)))}
                    >
                      <Ionicons name="remove" size={20} color="#fff" />
                    </TouchableOpacity>
                    <TextInput
                      style={styles.scoreInput}
                      value={editAwayScore}
                      onChangeText={setEditAwayScore}
                      keyboardType="number-pad"
                      selectTextOnFocus
                    />
                    <TouchableOpacity
                      style={styles.scoreBtn}
                      onPress={() => setEditAwayScore(String((parseInt(editAwayScore) || 0) + 1))}
                    >
                      <Ionicons name="add" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Status Picker */}
                <Text style={styles.statusLabel}>Game Status</Text>
                <View style={styles.statusRow}>
                  {[
                    { key: 'scheduled', label: 'Scheduled' },
                    { key: 'in_progress', label: 'Live' },
                    { key: 'intermission', label: 'Intermission' },
                    { key: 'final', label: 'Final' },
                  ].map((s) => (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.statusOption, editStatus === s.key && styles.statusOptionActive]}
                      onPress={() => setEditStatus(s.key)}
                    >
                      <Text style={[styles.statusOptionText, editStatus === s.key && styles.statusOptionTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Save / Cancel */}
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditGame(null)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                    onPress={handleSaveScore}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save Score</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  centeredSmall: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: '#333',
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: '#888',
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  // Event selector
  eventScroll: {
    maxHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  eventScrollContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    flexDirection: 'row',
  },
  eventPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: '#f0f0f0',
    marginRight: spacing.xs,
  },
  eventPillActive: {
    backgroundColor: colors.navy,
  },
  eventPillText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: '#555',
  },
  eventPillTextActive: {
    color: '#fff',
  },

  // Filter tabs
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filterTab: {
    flex: 1,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  filterTabActive: {
    backgroundColor: colors.navy,
  },
  filterTabText: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: '#666',
  },
  filterTabTextActive: {
    color: '#fff',
  },

  // Games list
  gamesList: {
    flex: 1,
  },
  gameCard: {
    margin: spacing.md,
    marginBottom: 0,
    backgroundColor: '#fff',
    borderRadius: radii.md,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  gameDivision: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: '#888',
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  statusText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: '#fff',
    textTransform: 'uppercase',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  teamCol: {
    flex: 1,
  },
  teamName: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: '#333',
  },
  scoreText: {
    fontSize: 28,
    fontFamily: fonts.extrabold,
    color: colors.navy,
    minWidth: 36,
    textAlign: 'center',
  },
  scoreDash: {
    fontSize: 20,
    fontFamily: fonts.regular,
    color: '#999',
    marginHorizontal: spacing.xs,
  },
  gameFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: spacing.xs,
  },
  gameInfo: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: '#999',
  },
  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    gap: 4,
  },
  editHintText: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.cyan,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: '#333',
  },
  modalDivision: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: '#888',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },

  // Edit score rows
  editScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: '#f8f8f8',
    borderRadius: radii.md,
  },
  editTeamName: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: '#333',
    marginRight: spacing.sm,
  },
  scoreControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scoreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreInput: {
    width: 56,
    height: 44,
    textAlign: 'center',
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.navy,
    backgroundColor: '#fff',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#ddd',
  },

  // Status selector
  statusLabel: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: '#666',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  statusOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  statusOptionActive: {
    backgroundColor: colors.navy,
  },
  statusOptionText: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: '#666',
  },
  statusOptionTextActive: {
    color: '#fff',
  },

  // Actions
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: '#666',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.navy,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: '#fff',
  },
});
