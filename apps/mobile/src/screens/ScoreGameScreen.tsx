import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  FlatList,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch } from '../services/auth';
import ScreenHeader from '../components/ScreenHeader';

// ============================================================
// Types
// ============================================================

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: string;
  position: string;
}

interface GameEvent {
  id: string;
  event_type: string;
  team_id: string;
  jersey_number?: string;
  assist1_jersey?: string;
  assist2_jersey?: string;
  period: number;
  game_time?: string;
  penalty_type?: string;
  penalty_minutes?: number;
  details?: string;
  created_at: string;
}

interface ShotCount {
  period: number;
  home: number;
  away: number;
}

interface GameData {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  period: number;
  status: string;
  game_number: number;
  game_type: string;
  rink_name: string;
  venue_name: string;
  age_group: string;
  division_level: string;
  start_time: string;
  events: GameEvent[];
  shots: ShotCount[];
}

interface PenaltyCode {
  name: string;
  minutes: number;
  category: string;
}

// Common penalty codes to display in the picker
const COMMON_PENALTIES: { code: string; name: string; minutes: number }[] = [
  { code: 'HOOK', name: 'Hooking', minutes: 2 },
  { code: 'TRIP', name: 'Tripping', minutes: 2 },
  { code: 'SLASH', name: 'Slashing', minutes: 2 },
  { code: 'HOLD', name: 'Holding', minutes: 2 },
  { code: 'INTER', name: 'Interference', minutes: 2 },
  { code: 'CROSS', name: 'Cross-Checking', minutes: 2 },
  { code: 'ROUGH', name: 'Roughing', minutes: 2 },
  { code: 'HIGHST', name: 'High-Sticking', minutes: 2 },
  { code: 'ELBOW', name: 'Elbowing', minutes: 2 },
  { code: 'BOARD', name: 'Boarding', minutes: 2 },
  { code: 'DELAY', name: 'Delay of Game', minutes: 2 },
  { code: 'UNSPORT', name: 'Unsportsmanlike', minutes: 2 },
  { code: 'HOLDST', name: 'Holding the Stick', minutes: 2 },
  { code: 'CHARGE', name: 'Charging', minutes: 2 },
  { code: 'TOOMANY', name: 'Too Many Players', minutes: 2 },
  { code: 'KNEE', name: 'Kneeing', minutes: 2 },
  { code: 'SPEAR', name: 'Spearing', minutes: 5 },
  { code: 'BENCH', name: 'Bench Minor', minutes: 2 },
  { code: 'HC', name: 'Head Contact', minutes: 2 },
];

const PENALTY_MINUTE_OPTIONS = [2, 4, 5, 10];

// ============================================================
// Helper Functions
// ============================================================

function getPeriodLabel(period: number): string {
  if (period === 1) return '1st';
  if (period === 2) return '2nd';
  if (period === 3) return '3rd';
  if (period === 4) return 'OT';
  return `${period}`;
}

function getStatusDisplay(status: string, period: number): string {
  switch (status) {
    case 'scheduled': return 'SCHEDULED';
    case 'warmup': return 'WARMUP';
    case 'in_progress': return `PERIOD ${period}`;
    case 'intermission': return `INTERMISSION`;
    case 'final': return 'FINAL';
    default: return status?.toUpperCase() || '';
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'in_progress': return '#2e7d32';
    case 'intermission': return colors.warning;
    case 'warmup': return colors.cyanDark;
    case 'final': return colors.navy;
    case 'scheduled': return colors.textMuted;
    default: return colors.textMuted;
  }
}

function truncateTeamName(name: string, maxLen: number = 16): string {
  if (!name) return 'TBD';
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen - 1) + '…';
}

function getEventDescription(event: GameEvent, game: GameData): string {
  const teamName = event.team_id === game.home_team_id
    ? game.home_team_name
    : game.away_team_name;
  const shortTeam = truncateTeamName(teamName, 20);

  switch (event.event_type) {
    case 'goal': {
      let desc = `GOAL - #${event.jersey_number || '?'}`;
      const assists: string[] = [];
      if (event.assist1_jersey) assists.push(`#${event.assist1_jersey}`);
      if (event.assist2_jersey) assists.push(`#${event.assist2_jersey}`);
      if (assists.length > 0) desc += ` (A: ${assists.join(', ')})`;
      desc += ` - ${shortTeam}`;
      return desc;
    }
    case 'penalty': {
      const code = event.penalty_type || '';
      const mins = event.penalty_minutes || 2;
      return `PENALTY - #${event.jersey_number || '?'} ${code} (${mins} min) - ${shortTeam}`;
    }
    case 'period_start': return `Period ${event.period} started`;
    case 'period_end': return `Period ${event.period} ended`;
    case 'game_start': return 'Game started';
    case 'game_end': return 'Game ended';
    case 'timeout': return `Timeout - ${shortTeam}`;
    default: return event.event_type;
  }
}

function getEventIcon(eventType: string): keyof typeof Ionicons.glyphMap {
  switch (eventType) {
    case 'goal': return 'football';
    case 'penalty': return 'alert-circle';
    case 'period_start': return 'play-circle';
    case 'period_end': return 'stop-circle';
    case 'game_start': return 'flag';
    case 'game_end': return 'checkmark-circle';
    case 'timeout': return 'time';
    default: return 'ellipse';
  }
}

function getEventIconColor(eventType: string): string {
  switch (eventType) {
    case 'goal': return colors.success;
    case 'penalty': return colors.error;
    case 'period_start': return colors.cyanDark;
    case 'period_end': return colors.warning;
    case 'game_start': return colors.navy;
    case 'game_end': return colors.navy;
    default: return colors.textMuted;
  }
}

// ============================================================
// Main Component
// ============================================================

export default function ScoreGameScreen({ navigation, route }: { navigation: any; route: any }) {
  const insets = useSafeAreaInsets();
  const { gameId, gameName } = route.params || {};

  // Game state
  const [game, setGame] = useState<GameData | null>(null);
  const [homePlayers, setHomePlayers] = useState<Player[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([]);
  const [lineupsLoaded, setLineupsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [penaltyModalVisible, setPenaltyModalVisible] = useState(false);
  const [shotsModalVisible, setShotsModalVisible] = useState(false);
  const [rosterPickerVisible, setRosterPickerVisible] = useState(false);
  const [rosterPickerField, setRosterPickerField] = useState<string>('');
  const [rosterPickerTeam, setRosterPickerTeam] = useState<'home' | 'away'>('home');

  // Goal form
  const [goalTeam, setGoalTeam] = useState<'home' | 'away'>('home');
  const [goalJersey, setGoalJersey] = useState('');
  const [assist1Jersey, setAssist1Jersey] = useState('');
  const [assist2Jersey, setAssist2Jersey] = useState('');

  // Penalty form
  const [penaltyTeam, setPenaltyTeam] = useState<'home' | 'away'>('home');
  const [penaltyJersey, setPenaltyJersey] = useState('');
  const [penaltyCode, setPenaltyCode] = useState('');
  const [penaltyName, setPenaltyName] = useState('');
  const [penaltyMinutes, setPenaltyMinutes] = useState(2);
  const [penaltyPickerVisible, setPenaltyPickerVisible] = useState(false);

  // Shots form
  const [shotsData, setShotsData] = useState<{ period: number; home: number; away: number }[]>([]);

  // Auto-refresh timer
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================================
  // Data Loading
  // ============================================================

  const loadGameData = useCallback(async () => {
    try {
      const res = await authFetch(`/api/scoring/games/${gameId}`);
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        // Transform raw game_shots rows { team_id, period, shot_count } into { period, home, away }
        const rawShots: { team_id: string; period: number; shot_count: number }[] = d.shots || [];
        const shotMap: Record<number, { home: number; away: number }> = {};
        for (const s of rawShots) {
          if (!shotMap[s.period]) shotMap[s.period] = { home: 0, away: 0 };
          if (s.team_id === d.home_team_id) {
            shotMap[s.period].home = s.shot_count;
          } else {
            shotMap[s.period].away = s.shot_count;
          }
        }
        const transformedShots: ShotCount[] = Object.keys(shotMap)
          .map(Number)
          .sort()
          .map((p) => ({ period: p, home: shotMap[p].home, away: shotMap[p].away }));
        setGame({ ...d, shots: transformedShots } as GameData);
        setError(null);
      } else {
        setError(json.error || 'Failed to load game');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    }
  }, [gameId]);

  const loadRosters = useCallback(async () => {
    try {
      const res = await authFetch(`/api/scoring/games/${gameId}/roster`);
      const json = await res.json();
      if (json.success && json.data) {
        setHomePlayers(json.data.homePlayers || []);
        setAwayPlayers(json.data.awayPlayers || []);
        setLineupsLoaded(json.data.lineupsLoaded || false);
      }
    } catch {}
  }, [gameId]);

  const loadLineups = useCallback(async () => {
    try {
      const res = await authFetch(`/api/scoring/games/${gameId}/lineups/load`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        await loadRosters();
      }
    } catch {}
  }, [gameId, loadRosters]);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadGameData(), loadRosters()]);
      setLoading(false);
    })();
  }, [loadGameData, loadRosters]);

  // Load lineups if not loaded yet
  useEffect(() => {
    if (!loading && !lineupsLoaded && homePlayers.length === 0 && awayPlayers.length === 0) {
      loadLineups();
    }
  }, [loading, lineupsLoaded, homePlayers.length, awayPlayers.length, loadLineups]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    refreshTimer.current = setInterval(() => {
      loadGameData();
    }, 15000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [loadGameData]);

  // ============================================================
  // Event Handlers
  // ============================================================

  const postEvent = async (eventData: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/scoring/games/${gameId}/events`, {
        method: 'POST',
        body: JSON.stringify(eventData),
      });
      const json = await res.json();
      if (json.success) {
        await loadGameData();
      } else {
        Alert.alert('Error', json.error || 'Failed to record event');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Network error');
    }
    setSubmitting(false);
  };

  const deleteEvent = async (eventId: string) => {
    Alert.alert('Undo Event', 'Remove this event?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await authFetch(`/api/scoring/games/${gameId}/events/${eventId}`, {
              method: 'DELETE',
            });
            const json = await res.json();
            if (json.success) {
              await loadGameData();
            } else {
              Alert.alert('Error', json.error || 'Failed to undo event');
            }
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Network error');
          }
        },
      },
    ]);
  };

  const handleStartGame = async () => {
    await postEvent({ eventType: 'game_start', period: 1 });
    // Auto-start period 1
    await postEvent({ eventType: 'period_start', period: 1 });
  };

  const handleEndPeriod = async () => {
    if (!game) return;
    await postEvent({ eventType: 'period_end', period: game.period });
  };

  const handleStartPeriod = async () => {
    if (!game) return;
    const nextPeriod = game.period + 1;
    await postEvent({ eventType: 'period_start', period: nextPeriod });
  };

  const handleEndGame = () => {
    Alert.alert(
      'End Game',
      'Are you sure you want to end this game? This will mark it as FINAL.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Game',
          style: 'destructive',
          onPress: async () => {
            if (!game) return;
            // End current period first if in progress
            if (game.status === 'in_progress') {
              await postEvent({ eventType: 'period_end', period: game.period });
            }
            await postEvent({ eventType: 'game_end', period: game.period });
          },
        },
      ],
    );
  };

  // Goal recording
  const handleRecordGoal = async () => {
    if (!game) return;
    if (!goalJersey.trim()) {
      Alert.alert('Required', 'Please enter the goal scorer jersey number.');
      return;
    }
    const teamId = goalTeam === 'home' ? game.home_team_id : game.away_team_id;
    await postEvent({
      eventType: 'goal',
      teamId,
      jerseyNumber: goalJersey.trim(),
      assist1Jersey: assist1Jersey.trim() || undefined,
      assist2Jersey: assist2Jersey.trim() || undefined,
      period: game.period,
    });
    setGoalModalVisible(false);
    resetGoalForm();
  };

  const resetGoalForm = () => {
    setGoalJersey('');
    setAssist1Jersey('');
    setAssist2Jersey('');
    setGoalTeam('home');
  };

  // Penalty recording
  const handleRecordPenalty = async () => {
    if (!game) return;
    if (!penaltyJersey.trim()) {
      Alert.alert('Required', 'Please enter the penalized player jersey number.');
      return;
    }
    if (!penaltyCode) {
      Alert.alert('Required', 'Please select a penalty type.');
      return;
    }
    const teamId = penaltyTeam === 'home' ? game.home_team_id : game.away_team_id;
    await postEvent({
      eventType: 'penalty',
      teamId,
      jerseyNumber: penaltyJersey.trim(),
      penaltyCode,
      penaltyMinutes,
      period: game.period,
    });
    setPenaltyModalVisible(false);
    resetPenaltyForm();
  };

  const resetPenaltyForm = () => {
    setPenaltyJersey('');
    setPenaltyCode('');
    setPenaltyName('');
    setPenaltyMinutes(2);
    setPenaltyTeam('home');
  };

  // Shots
  const openShotsModal = () => {
    if (!game) return;
    // Initialize shots data from existing game data or create defaults for 3 periods
    const maxPeriod = Math.max(3, game.period || 1);
    const newShots: { period: number; home: number; away: number }[] = [];
    for (let p = 1; p <= maxPeriod; p++) {
      const existing = game.shots?.find((s) => s.period === p);
      newShots.push({
        period: p,
        home: existing?.home || 0,
        away: existing?.away || 0,
      });
    }
    setShotsData(newShots);
    setShotsModalVisible(true);
  };

  const adjustShot = (period: number, team: 'home' | 'away', delta: number) => {
    setShotsData((prev) =>
      prev.map((s) => {
        if (s.period === period) {
          const newVal = Math.max(0, (team === 'home' ? s.home : s.away) + delta);
          return team === 'home' ? { ...s, home: newVal } : { ...s, away: newVal };
        }
        return s;
      }),
    );
  };

  const handleSaveShots = async () => {
    if (!game) return;
    setSubmitting(true);
    try {
      // Save each period's shots using the proper /shots endpoint per team
      for (const s of shotsData) {
        // Save home team shots
        await authFetch(`/api/scoring/games/${gameId}/shots`, {
          method: 'POST',
          body: JSON.stringify({
            teamId: game.home_team_id,
            period: s.period,
            shotCount: s.home,
          }),
        });
        // Save away team shots
        await authFetch(`/api/scoring/games/${gameId}/shots`, {
          method: 'POST',
          body: JSON.stringify({
            teamId: game.away_team_id,
            period: s.period,
            shotCount: s.away,
          }),
        });
      }
      await loadGameData();
      setShotsModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save shots');
    }
    setSubmitting(false);
  };

  // Roster picker
  const openRosterPicker = (team: 'home' | 'away', field: string) => {
    setRosterPickerTeam(team);
    setRosterPickerField(field);
    setRosterPickerVisible(true);
  };

  const selectPlayerFromRoster = (player: Player) => {
    const jersey = player.jersey_number || '';
    switch (rosterPickerField) {
      case 'goalJersey':
        setGoalJersey(jersey);
        break;
      case 'assist1':
        setAssist1Jersey(jersey);
        break;
      case 'assist2':
        setAssist2Jersey(jersey);
        break;
      case 'penaltyJersey':
        setPenaltyJersey(jersey);
        break;
    }
    setRosterPickerVisible(false);
  };

  // ============================================================
  // Derived State
  // ============================================================

  const isFinal = game?.status === 'final';
  const isScheduled = game?.status === 'scheduled';
  const isInProgress = game?.status === 'in_progress';
  const isIntermission = game?.status === 'intermission';
  const canScore = isInProgress;

  // Events sorted newest first
  const sortedEvents = [...(game?.events || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  // Total shots
  const totalHomeShots = (game?.shots || []).reduce((sum, s) => sum + (s.home || 0), 0);
  const totalAwayShots = (game?.shots || []).reduce((sum, s) => sum + (s.away || 0), 0);

  const rosterForTeam = (team: 'home' | 'away') =>
    team === 'home' ? homePlayers : awayPlayers;

  // ============================================================
  // Loading / Error
  // ============================================================

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScreenHeader title="Score Game" showBack onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={styles.loadingText}>Loading game...</Text>
        </View>
      </View>
    );
  }

  if (error || !game) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScreenHeader title="Score Game" showBack onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.errorText}>{error || 'Game not found'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); loadGameData().finally(() => setLoading(false)); }}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={gameName || `Game #${game.game_number}`}
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <View style={styles.headerMeta}>
            <Text style={styles.headerRink}>{game.rink_name || ''}</Text>
          </View>
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ====== GAME INFO BAR ====== */}
        <View style={styles.gameInfoBar}>
          <Text style={styles.gameInfoText}>
            {game.age_group} {game.division_level} {game.game_type ? `• ${game.game_type}` : ''}
          </Text>
          {game.venue_name ? (
            <Text style={styles.gameInfoText}>{game.venue_name}</Text>
          ) : null}
        </View>

        {/* ====== SCOREBOARD ====== */}
        <View style={styles.scoreboard}>
          {/* Home Team */}
          <View style={styles.teamSide}>
            <Text style={styles.teamLabel}>HOME</Text>
            <Text style={styles.teamName} numberOfLines={2}>
              {truncateTeamName(game.home_team_name, 18)}
            </Text>
            <Text style={styles.score}>{game.home_score}</Text>
            <Text style={styles.shotsLabel}>SOG: {totalHomeShots}</Text>
          </View>

          {/* Center */}
          <View style={styles.scoreCenter}>
            <View style={[styles.statusPill, { backgroundColor: getStatusColor(game.status) }]}>
              <Text style={styles.statusPillText}>
                {getStatusDisplay(game.status, game.period)}
              </Text>
            </View>
            {isInProgress && (
              <View style={styles.periodIndicator}>
                <Text style={styles.periodText}>{getPeriodLabel(game.period)}</Text>
              </View>
            )}
            {isFinal && (
              <View style={styles.finalBanner}>
                <Ionicons name="checkmark-circle" size={20} color={colors.white} />
              </View>
            )}
          </View>

          {/* Away Team */}
          <View style={styles.teamSide}>
            <Text style={styles.teamLabel}>AWAY</Text>
            <Text style={styles.teamName} numberOfLines={2}>
              {truncateTeamName(game.away_team_name, 18)}
            </Text>
            <Text style={styles.score}>{game.away_score}</Text>
            <Text style={styles.shotsLabel}>SOG: {totalAwayShots}</Text>
          </View>
        </View>

        {/* ====== PERIOD / GAME CONTROLS ====== */}
        {!isFinal && (
          <View style={styles.controlBar}>
            {isScheduled && (
              <TouchableOpacity
                style={[styles.controlButton, styles.controlButtonStart]}
                onPress={handleStartGame}
                disabled={submitting}
                activeOpacity={0.7}
              >
                <Ionicons name="play" size={18} color={colors.white} />
                <Text style={styles.controlButtonText}>Start Game</Text>
              </TouchableOpacity>
            )}

            {isInProgress && (
              <>
                <TouchableOpacity
                  style={[styles.controlButton, styles.controlButtonPeriod]}
                  onPress={handleEndPeriod}
                  disabled={submitting}
                  activeOpacity={0.7}
                >
                  <Ionicons name="stop" size={16} color={colors.white} />
                  <Text style={styles.controlButtonText}>End Period</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.controlButton, styles.controlButtonEnd]}
                  onPress={handleEndGame}
                  disabled={submitting}
                  activeOpacity={0.7}
                >
                  <Ionicons name="flag" size={16} color={colors.white} />
                  <Text style={styles.controlButtonText}>End Game</Text>
                </TouchableOpacity>
              </>
            )}

            {isIntermission && (
              <>
                <TouchableOpacity
                  style={[styles.controlButton, styles.controlButtonStart]}
                  onPress={handleStartPeriod}
                  disabled={submitting}
                  activeOpacity={0.7}
                >
                  <Ionicons name="play" size={16} color={colors.white} />
                  <Text style={styles.controlButtonText}>
                    Start P{(game.period || 1) + 1}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.controlButton, styles.controlButtonEnd]}
                  onPress={handleEndGame}
                  disabled={submitting}
                  activeOpacity={0.7}
                >
                  <Ionicons name="flag" size={16} color={colors.white} />
                  <Text style={styles.controlButtonText}>End Game</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* FINAL banner */}
        {isFinal && (
          <View style={styles.finalBar}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.finalBarText}>GAME FINAL</Text>
          </View>
        )}

        {/* ====== QUICK ACTION CARDS ====== */}
        {!isFinal && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionCard, styles.actionGoal, !canScore && styles.actionDisabled]}
              onPress={() => {
                if (!canScore) { Alert.alert('Not Available', 'Game must be in progress to record a goal.'); return; }
                resetGoalForm();
                setGoalModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="football" size={28} color={canScore ? colors.white : 'rgba(255,255,255,0.5)'} />
              <Text style={[styles.actionCardText, !canScore && styles.actionCardTextDisabled]}>Goal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionCard, styles.actionPenalty, !canScore && styles.actionDisabled]}
              onPress={() => {
                if (!canScore) { Alert.alert('Not Available', 'Game must be in progress to record a penalty.'); return; }
                resetPenaltyForm();
                setPenaltyModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="alert-circle" size={28} color={canScore ? colors.white : 'rgba(255,255,255,0.5)'} />
              <Text style={[styles.actionCardText, !canScore && styles.actionCardTextDisabled]}>Penalty</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionCard, styles.actionShots]}
              onPress={openShotsModal}
              activeOpacity={0.7}
            >
              <Ionicons name="analytics" size={28} color={colors.white} />
              <Text style={styles.actionCardText}>Shots</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ====== EVENT LOG ====== */}
        <View style={styles.eventLogSection}>
          <Text style={styles.sectionTitle}>Event Log</Text>
          {sortedEvents.length === 0 ? (
            <View style={styles.emptyLog}>
              <Ionicons name="document-text-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyLogText}>No events recorded yet</Text>
            </View>
          ) : (
            sortedEvents.map((event) => (
              <View key={event.id} style={styles.eventItem}>
                <View style={[styles.eventIconCircle, { backgroundColor: getEventIconColor(event.event_type) + '20' }]}>
                  <Ionicons
                    name={getEventIcon(event.event_type)}
                    size={16}
                    color={getEventIconColor(event.event_type)}
                  />
                </View>
                <View style={styles.eventContent}>
                  <Text style={styles.eventPeriodBadge}>P{event.period}</Text>
                  <Text style={styles.eventDescription} numberOfLines={2}>
                    {getEventDescription(event, game)}
                  </Text>
                </View>
                {!isFinal && (event.event_type === 'goal' || event.event_type === 'penalty') && (
                  <TouchableOpacity
                    style={styles.undoButton}
                    onPress={() => deleteEvent(event.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="arrow-undo" size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>

        {/* Bottom padding */}
        <View style={{ height: spacing.xxxxl }} />
      </ScrollView>

      {/* Submitting overlay */}
      {submitting && (
        <View style={styles.submittingOverlay}>
          <ActivityIndicator size="large" color={colors.white} />
        </View>
      )}

      {/* ====== GOAL MODAL ====== */}
      <Modal visible={goalModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Goal</Text>
              <TouchableOpacity onPress={() => setGoalModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              {/* Team selector */}
              <Text style={styles.fieldLabel}>Team</Text>
              <View style={styles.teamToggle}>
                <TouchableOpacity
                  style={[styles.teamToggleBtn, goalTeam === 'home' && styles.teamToggleBtnActive]}
                  onPress={() => setGoalTeam('home')}
                >
                  <Text style={[styles.teamToggleText, goalTeam === 'home' && styles.teamToggleTextActive]}>
                    {truncateTeamName(game.home_team_name, 20)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.teamToggleBtn, goalTeam === 'away' && styles.teamToggleBtnActive]}
                  onPress={() => setGoalTeam('away')}
                >
                  <Text style={[styles.teamToggleText, goalTeam === 'away' && styles.teamToggleTextActive]}>
                    {truncateTeamName(game.away_team_name, 20)}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Goal Scorer */}
              <Text style={styles.fieldLabel}>Goal Scorer *</Text>
              <View style={styles.jerseyInputRow}>
                <TextInput
                  style={styles.jerseyInput}
                  placeholder="#"
                  value={goalJersey}
                  onChangeText={setGoalJersey}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <TouchableOpacity
                  style={styles.rosterPickerButton}
                  onPress={() => openRosterPicker(goalTeam, 'goalJersey')}
                >
                  <Ionicons name="people" size={18} color={colors.navy} />
                  <Text style={styles.rosterPickerText}>Roster</Text>
                </TouchableOpacity>
              </View>

              {/* Assist 1 */}
              <Text style={styles.fieldLabel}>Assist 1 (optional)</Text>
              <View style={styles.jerseyInputRow}>
                <TextInput
                  style={styles.jerseyInput}
                  placeholder="#"
                  value={assist1Jersey}
                  onChangeText={setAssist1Jersey}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <TouchableOpacity
                  style={styles.rosterPickerButton}
                  onPress={() => openRosterPicker(goalTeam, 'assist1')}
                >
                  <Ionicons name="people" size={18} color={colors.navy} />
                  <Text style={styles.rosterPickerText}>Roster</Text>
                </TouchableOpacity>
              </View>

              {/* Assist 2 */}
              <Text style={styles.fieldLabel}>Assist 2 (optional)</Text>
              <View style={styles.jerseyInputRow}>
                <TextInput
                  style={styles.jerseyInput}
                  placeholder="#"
                  value={assist2Jersey}
                  onChangeText={setAssist2Jersey}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <TouchableOpacity
                  style={styles.rosterPickerButton}
                  onPress={() => openRosterPicker(goalTeam, 'assist2')}
                >
                  <Ionicons name="people" size={18} color={colors.navy} />
                  <Text style={styles.rosterPickerText}>Roster</Text>
                </TouchableOpacity>
              </View>

              {/* Period */}
              <Text style={styles.fieldLabel}>Period</Text>
              <View style={styles.periodDisplay}>
                <Text style={styles.periodDisplayText}>{getPeriodLabel(game.period)}</Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalSubmitButton, { backgroundColor: colors.success }]}
              onPress={handleRecordGoal}
              disabled={submitting}
              activeOpacity={0.7}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="football" size={20} color={colors.white} />
                  <Text style={styles.modalSubmitText}>Record Goal</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ====== PENALTY MODAL ====== */}
      <Modal visible={penaltyModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Penalty</Text>
              <TouchableOpacity onPress={() => setPenaltyModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              {/* Team selector */}
              <Text style={styles.fieldLabel}>Team</Text>
              <View style={styles.teamToggle}>
                <TouchableOpacity
                  style={[styles.teamToggleBtn, penaltyTeam === 'home' && styles.teamToggleBtnActive]}
                  onPress={() => setPenaltyTeam('home')}
                >
                  <Text style={[styles.teamToggleText, penaltyTeam === 'home' && styles.teamToggleTextActive]}>
                    {truncateTeamName(game.home_team_name, 20)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.teamToggleBtn, penaltyTeam === 'away' && styles.teamToggleBtnActive]}
                  onPress={() => setPenaltyTeam('away')}
                >
                  <Text style={[styles.teamToggleText, penaltyTeam === 'away' && styles.teamToggleTextActive]}>
                    {truncateTeamName(game.away_team_name, 20)}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Player */}
              <Text style={styles.fieldLabel}>Player *</Text>
              <View style={styles.jerseyInputRow}>
                <TextInput
                  style={styles.jerseyInput}
                  placeholder="#"
                  value={penaltyJersey}
                  onChangeText={setPenaltyJersey}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <TouchableOpacity
                  style={styles.rosterPickerButton}
                  onPress={() => openRosterPicker(penaltyTeam, 'penaltyJersey')}
                >
                  <Ionicons name="people" size={18} color={colors.navy} />
                  <Text style={styles.rosterPickerText}>Roster</Text>
                </TouchableOpacity>
              </View>

              {/* Penalty Type */}
              <Text style={styles.fieldLabel}>Penalty Type *</Text>
              <TouchableOpacity
                style={styles.penaltySelector}
                onPress={() => setPenaltyPickerVisible(true)}
              >
                <Text style={penaltyCode ? styles.penaltySelectorText : styles.penaltySelectorPlaceholder}>
                  {penaltyCode ? `${penaltyCode} - ${penaltyName}` : 'Select penalty...'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
              </TouchableOpacity>

              {/* Penalty Minutes */}
              <Text style={styles.fieldLabel}>Minutes</Text>
              <View style={styles.minuteRow}>
                {PENALTY_MINUTE_OPTIONS.map((mins) => (
                  <TouchableOpacity
                    key={mins}
                    style={[styles.minuteButton, penaltyMinutes === mins && styles.minuteButtonActive]}
                    onPress={() => setPenaltyMinutes(mins)}
                  >
                    <Text style={[styles.minuteButtonText, penaltyMinutes === mins && styles.minuteButtonTextActive]}>
                      {mins}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Period */}
              <Text style={styles.fieldLabel}>Period</Text>
              <View style={styles.periodDisplay}>
                <Text style={styles.periodDisplayText}>{getPeriodLabel(game.period)}</Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalSubmitButton, { backgroundColor: colors.error }]}
              onPress={handleRecordPenalty}
              disabled={submitting}
              activeOpacity={0.7}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="alert-circle" size={20} color={colors.white} />
                  <Text style={styles.modalSubmitText}>Record Penalty</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ====== PENALTY TYPE PICKER MODAL ====== */}
      <Modal visible={penaltyPickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Penalty</Text>
              <TouchableOpacity onPress={() => setPenaltyPickerVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={COMMON_PENALTIES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.penaltyListItem, penaltyCode === item.code && styles.penaltyListItemActive]}
                  onPress={() => {
                    setPenaltyCode(item.code);
                    setPenaltyName(item.name);
                    setPenaltyMinutes(item.minutes);
                    setPenaltyPickerVisible(false);
                  }}
                >
                  <View style={styles.penaltyListLeft}>
                    <Text style={styles.penaltyListCode}>{item.code}</Text>
                    <Text style={styles.penaltyListName}>{item.name}</Text>
                  </View>
                  <Text style={styles.penaltyListMinutes}>{item.minutes} min</Text>
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.penaltyListContent}
            />
          </View>
        </View>
      </Modal>

      {/* ====== SHOTS MODAL ====== */}
      <Modal visible={shotsModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Shots on Goal</Text>
              <TouchableOpacity onPress={() => setShotsModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Column headers */}
              <View style={styles.shotsHeaderRow}>
                <View style={styles.shotsPeriodCol} />
                <Text style={styles.shotsTeamHeader} numberOfLines={1}>
                  {truncateTeamName(game.home_team_name, 12)}
                </Text>
                <Text style={styles.shotsTeamHeader} numberOfLines={1}>
                  {truncateTeamName(game.away_team_name, 12)}
                </Text>
              </View>

              {shotsData.map((s) => (
                <View key={s.period} style={styles.shotsRow}>
                  <View style={styles.shotsPeriodCol}>
                    <Text style={styles.shotsPeriodLabel}>P{s.period}</Text>
                  </View>
                  {/* Home */}
                  <View style={styles.shotCounterGroup}>
                    <TouchableOpacity
                      style={styles.shotButton}
                      onPress={() => adjustShot(s.period, 'home', -1)}
                    >
                      <Ionicons name="remove" size={18} color={colors.navy} />
                    </TouchableOpacity>
                    <Text style={styles.shotCount}>{s.home}</Text>
                    <TouchableOpacity
                      style={styles.shotButton}
                      onPress={() => adjustShot(s.period, 'home', 1)}
                    >
                      <Ionicons name="add" size={18} color={colors.navy} />
                    </TouchableOpacity>
                  </View>
                  {/* Away */}
                  <View style={styles.shotCounterGroup}>
                    <TouchableOpacity
                      style={styles.shotButton}
                      onPress={() => adjustShot(s.period, 'away', -1)}
                    >
                      <Ionicons name="remove" size={18} color={colors.navy} />
                    </TouchableOpacity>
                    <Text style={styles.shotCount}>{s.away}</Text>
                    <TouchableOpacity
                      style={styles.shotButton}
                      onPress={() => adjustShot(s.period, 'away', 1)}
                    >
                      <Ionicons name="add" size={18} color={colors.navy} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Totals */}
              <View style={styles.shotsTotalRow}>
                <View style={styles.shotsPeriodCol}>
                  <Text style={styles.shotsTotalLabel}>TOTAL</Text>
                </View>
                <Text style={styles.shotsTotalCount}>
                  {shotsData.reduce((s, d) => s + d.home, 0)}
                </Text>
                <Text style={styles.shotsTotalCount}>
                  {shotsData.reduce((s, d) => s + d.away, 0)}
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalSubmitButton, { backgroundColor: colors.navy }]}
              onPress={handleSaveShots}
              disabled={submitting}
              activeOpacity={0.7}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="save" size={20} color={colors.white} />
                  <Text style={styles.modalSubmitText}>Save Shots</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ====== ROSTER PICKER MODAL ====== */}
      <Modal visible={rosterPickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Player</Text>
              <TouchableOpacity onPress={() => setRosterPickerVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            {rosterForTeam(rosterPickerTeam).length === 0 ? (
              <View style={styles.emptyRoster}>
                <Ionicons name="people-outline" size={36} color={colors.textMuted} />
                <Text style={styles.emptyRosterText}>No roster loaded</Text>
                <Text style={styles.emptyRosterSubtext}>Enter jersey number manually</Text>
              </View>
            ) : (
              <FlatList
                data={rosterForTeam(rosterPickerTeam).sort(
                  (a, b) => parseInt(a.jersey_number || '999') - parseInt(b.jersey_number || '999'),
                )}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.rosterItem}
                    onPress={() => selectPlayerFromRoster(item)}
                  >
                    <View style={styles.rosterJerseyCircle}>
                      <Text style={styles.rosterJerseyText}>
                        {item.jersey_number || '?'}
                      </Text>
                    </View>
                    <View style={styles.rosterPlayerInfo}>
                      <Text style={styles.rosterPlayerName}>
                        {item.first_name} {item.last_name}
                      </Text>
                      <Text style={styles.rosterPlayerPosition}>{item.position || ''}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                contentContainerStyle={styles.rosterListContent}
              />
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.medium,
  },
  errorText: {
    marginTop: spacing.md,
    fontSize: 15,
    color: colors.error,
    ...fonts.medium,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  retryButtonText: {
    color: colors.white,
    ...fonts.bold,
    fontSize: 15,
  },
  headerMeta: {
    alignItems: 'flex-end',
  },
  headerRink: {
    color: colors.cyanLight,
    fontSize: 12,
    ...fonts.semibold,
  },

  // ==========================================
  // Game Info Bar
  // ==========================================
  gameInfoBar: {
    backgroundColor: colors.navyDark,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gameInfoText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    ...fonts.medium,
  },

  // ==========================================
  // Scoreboard
  // ==========================================
  scoreboard: {
    backgroundColor: colors.navyDark,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  teamSide: {
    flex: 1,
    alignItems: 'center',
  },
  teamLabel: {
    color: colors.cyan,
    fontSize: 10,
    ...fonts.extrabold,
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
  },
  teamName: {
    color: colors.white,
    fontSize: 13,
    ...fonts.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
    minHeight: 36,
  },
  score: {
    color: colors.white,
    fontSize: 52,
    ...fonts.extrabold,
    lineHeight: 56,
  },
  shotsLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    ...fonts.semibold,
    marginTop: spacing.xs,
  },
  scoreCenter: {
    width: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  statusPillText: {
    color: colors.white,
    fontSize: 10,
    ...fonts.extrabold,
    letterSpacing: 0.5,
  },
  periodIndicator: {
    marginTop: spacing.sm,
  },
  periodText: {
    color: colors.cyan,
    fontSize: 18,
    ...fonts.extrabold,
  },
  finalBanner: {
    marginTop: spacing.sm,
  },

  // ==========================================
  // Control Bar
  // ==========================================
  controlBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  controlButtonStart: {
    backgroundColor: colors.success,
  },
  controlButtonPeriod: {
    backgroundColor: colors.warning,
  },
  controlButtonEnd: {
    backgroundColor: colors.error,
  },
  controlButtonText: {
    color: colors.white,
    fontSize: 14,
    ...fonts.bold,
  },

  // Final bar
  finalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successBg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  finalBarText: {
    color: colors.success,
    fontSize: 16,
    ...fonts.extrabold,
    letterSpacing: 2,
  },

  // ==========================================
  // Action Cards
  // ==========================================
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    borderRadius: radii.lg,
    gap: spacing.sm,
  },
  actionGoal: {
    backgroundColor: colors.success,
  },
  actionPenalty: {
    backgroundColor: '#d32f2f',
  },
  actionShots: {
    backgroundColor: colors.navy,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionCardText: {
    color: colors.white,
    fontSize: 14,
    ...fonts.bold,
  },
  actionCardTextDisabled: {
    opacity: 0.7,
  },

  // ==========================================
  // Event Log
  // ==========================================
  eventLogSection: {
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: 17,
    ...fonts.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyLog: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyLogText: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.medium,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  eventContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eventPeriodBadge: {
    backgroundColor: colors.navy,
    color: colors.white,
    fontSize: 10,
    ...fonts.extrabold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  eventDescription: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    ...fonts.medium,
  },
  undoButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },

  // ==========================================
  // Submitting Overlay
  // ==========================================
  submittingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ==========================================
  // Modals (shared)
  // ==========================================
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.lg,
  },
  pickerContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    ...fonts.bold,
    color: colors.text,
  },
  modalBody: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  modalSubmitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  modalSubmitText: {
    color: colors.white,
    fontSize: 16,
    ...fonts.bold,
  },

  // ==========================================
  // Form Fields
  // ==========================================
  fieldLabel: {
    fontSize: 13,
    ...fonts.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  teamToggle: {
    flexDirection: 'row',
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamToggleBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  teamToggleBtnActive: {
    backgroundColor: colors.navy,
  },
  teamToggleText: {
    fontSize: 13,
    ...fonts.bold,
    color: colors.text,
  },
  teamToggleTextActive: {
    color: colors.white,
  },
  jerseyInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  jerseyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 20,
    ...fonts.bold,
    color: colors.text,
    backgroundColor: colors.white,
    textAlign: 'center',
  },
  rosterPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rosterPickerText: {
    fontSize: 13,
    ...fonts.semibold,
    color: colors.navy,
  },
  periodDisplay: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodDisplayText: {
    fontSize: 16,
    ...fonts.bold,
    color: colors.navy,
  },

  // ==========================================
  // Penalty Selector
  // ==========================================
  penaltySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
  },
  penaltySelectorText: {
    fontSize: 15,
    ...fonts.semibold,
    color: colors.text,
  },
  penaltySelectorPlaceholder: {
    fontSize: 15,
    ...fonts.regular,
    color: colors.textMuted,
  },
  minuteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  minuteButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  minuteButtonActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  minuteButtonText: {
    fontSize: 16,
    ...fonts.bold,
    color: colors.text,
  },
  minuteButtonTextActive: {
    color: colors.white,
  },

  // ==========================================
  // Penalty List (picker)
  // ==========================================
  penaltyListContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  penaltyListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  penaltyListItemActive: {
    backgroundColor: colors.highlight,
    borderRadius: radii.md,
  },
  penaltyListLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  penaltyListCode: {
    fontSize: 12,
    ...fonts.extrabold,
    color: colors.navy,
    backgroundColor: colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
    minWidth: 60,
    textAlign: 'center',
  },
  penaltyListName: {
    fontSize: 15,
    ...fonts.medium,
    color: colors.text,
  },
  penaltyListMinutes: {
    fontSize: 13,
    ...fonts.semibold,
    color: colors.textSecondary,
  },

  // ==========================================
  // Shots Modal
  // ==========================================
  shotsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  shotsPeriodCol: {
    width: 50,
  },
  shotsTeamHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    ...fonts.bold,
    color: colors.textSecondary,
  },
  shotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  shotsPeriodLabel: {
    fontSize: 14,
    ...fonts.bold,
    color: colors.navy,
  },
  shotCounterGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  shotButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  shotCount: {
    fontSize: 20,
    ...fonts.extrabold,
    color: colors.text,
    minWidth: 30,
    textAlign: 'center',
  },
  shotsTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 2,
    borderTopColor: colors.navy,
    marginTop: spacing.sm,
  },
  shotsTotalLabel: {
    fontSize: 13,
    ...fonts.extrabold,
    color: colors.navy,
  },
  shotsTotalCount: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    ...fonts.extrabold,
    color: colors.navy,
  },

  // ==========================================
  // Roster Picker
  // ==========================================
  emptyRoster: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyRosterText: {
    marginTop: spacing.md,
    fontSize: 16,
    ...fonts.semibold,
    color: colors.text,
  },
  emptyRosterSubtext: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.regular,
  },
  rosterListContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  rosterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rosterJerseyCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  rosterJerseyText: {
    color: colors.white,
    fontSize: 16,
    ...fonts.extrabold,
  },
  rosterPlayerInfo: {
    flex: 1,
  },
  rosterPlayerName: {
    fontSize: 15,
    ...fonts.semibold,
    color: colors.text,
  },
  rosterPlayerPosition: {
    fontSize: 12,
    ...fonts.regular,
    color: colors.textMuted,
    marginTop: 1,
  },
});
