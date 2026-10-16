import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch } from '../services/auth';
import ScreenHeader from '../components/ScreenHeader';

// Read-only live play-by-play for coaches, managers, and fans. The same
// commentary the admin panel shows, polled every 10 seconds while the
// game is live. No scoring controls here - viewing only.

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

interface GameData {
  id: string;
  status: string;
  period?: number;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
  home_team_logo?: string;
  away_team_logo?: string;
  home_score: number;
  away_score: number;
  is_overtime?: number;
  is_shootout?: number;
  rink_name?: string;
  venue_name?: string;
  age_group?: string;
  division_level?: string;
  start_time?: string;
  events: GameEvent[];
}

function periodLabel(p?: number | null): string {
  if (!p) return '';
  if (p >= 4) return 'OVERTIME';
  return `PERIOD ${p}`;
}

function shortPeriod(p?: number | null): string {
  if (!p) return '';
  return p >= 4 ? 'OT' : `P${p}`;
}

function statusLabel(g: GameData): string {
  switch (g.status) {
    case 'in_progress': return 'LIVE';
    case 'intermission': return 'INTERMISSION';
    case 'warmup': return 'WARMUP';
    case 'final': return g.is_shootout ? 'FINAL - SO' : g.is_overtime ? 'FINAL - OT' : 'FINAL';
    case 'delayed': return 'DELAYED';
    default: return 'SCHEDULED';
  }
}

function eventIcon(t: string): keyof typeof Ionicons.glyphMap {
  switch (t) {
    case 'goal': return 'flash';
    case 'penalty': return 'alert-circle-outline';
    case 'period_start':
    case 'period_end': return 'time-outline';
    case 'game_start':
    case 'game_end': return 'flag-outline';
    case 'timeout': return 'pause-circle-outline';
    case 'goalie_pull':
    case 'goalie_return': return 'swap-horizontal-outline';
    default: return 'ellipse-outline';
  }
}

function eventColor(t: string): string {
  switch (t) {
    case 'goal': return '#1fa855';
    case 'penalty': return '#e67e22';
    case 'game_start':
    case 'game_end': return colors.navy;
    default: return '#7a8aa0';
  }
}

export default function LiveGameScreen({ navigation, route }: any) {
  const gameId = route?.params?.gameId;
  const [game, setGame] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<any>(null);

  const load = useCallback(async (silent = false) => {
    if (!gameId) return;
    try {
      const res = await authFetch(`/api/scoring/games/${gameId}`);
      const json = await res.json();
      if (json.success && json.data) setGame(json.data);
    } catch {}
    if (!silent) setLoading(false);
  }, [gameId]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const isLive = game && (game.status === 'in_progress' || game.status === 'intermission' || game.status === 'warmup');

  const describe = (ev: GameEvent): string => {
    if (!game) return ev.event_type;
    const team = ev.team_id === game.home_team_id ? game.home_team_name
      : ev.team_id === game.away_team_id ? game.away_team_name : '';
    switch (ev.event_type) {
      case 'goal': {
        let d = `Goal - #${ev.jersey_number || '?'}`;
        const a: string[] = [];
        if (ev.assist1_jersey) a.push(`#${ev.assist1_jersey}`);
        if (ev.assist2_jersey) a.push(`#${ev.assist2_jersey}`);
        if (a.length) d += ` (assists ${a.join(', ')})`;
        return team ? `${d} - ${team}` : d;
      }
      case 'penalty': {
        const mins = ev.penalty_minutes || 2;
        const code = ev.penalty_type ? ` ${ev.penalty_type}` : '';
        return `Penalty - #${ev.jersey_number || '?'}${code} (${mins} min)${team ? ` - ${team}` : ''}`;
      }
      case 'period_start': return ev.period >= 4 ? 'Overtime started' : `Period ${ev.period} started`;
      case 'period_end': return ev.period >= 4 ? 'Overtime ended' : `Period ${ev.period} ended`;
      case 'game_start': return 'Game started';
      case 'game_end': return 'Final';
      case 'timeout': return `Timeout${team ? ` - ${team}` : ''}`;
      case 'goalie_pull': return `Goalie pulled${team ? ` - ${team}` : ''}`;
      case 'goalie_return': return `Goalie back in${team ? ` - ${team}` : ''}`;
      default: return ev.details || ev.event_type;
    }
  };

  // Newest first so the latest play is at the top
  const feed = (game?.events || []).slice().sort((a, b) => {
    if ((b.period || 0) !== (a.period || 0)) return (b.period || 0) - (a.period || 0);
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader compact showBack title="Live Game" onBack={() => navigation.goBack()} />
        <View style={styles.center}><ActivityIndicator size="large" color={colors.navy} /></View>
      </View>
    );
  }

  if (!game) {
    return (
      <View style={styles.container}>
        <ScreenHeader compact showBack title="Live Game" onBack={() => navigation.goBack()} />
        <View style={styles.center}><Text style={styles.emptyText}>Game not found.</Text></View>
      </View>
    );
  }

  const division = [game.age_group, game.division_level].filter(Boolean).join(' ');
  const where = [game.venue_name, game.rink_name].filter(Boolean).join(' - ');

  return (
    <View style={styles.container}>
      <ScreenHeader compact showBack title="Play-by-Play" onBack={() => navigation.goBack()} />
      <FlatList
        data={feed}
        keyExtractor={(ev) => ev.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
        ListHeaderComponent={
          <View style={styles.scoreboard}>
            <View style={styles.statusRow}>
              <View style={[styles.statusBadge, isLive ? styles.statusBadgeLive : null]}>
                {isLive ? <View style={styles.liveDot} /> : null}
                <Text style={styles.statusText} maxFontSizeMultiplier={1.2}>{statusLabel(game)}</Text>
              </View>
              {isLive && game.period ? (
                <Text style={styles.periodText} maxFontSizeMultiplier={1.2}>{periodLabel(game.period)}</Text>
              ) : null}
            </View>
            <View style={styles.teamsRow}>
              <View style={styles.teamCol}>
                {game.home_team_logo ? <Image source={{ uri: game.home_team_logo }} style={styles.logo} /> : null}
                <Text style={styles.teamName} maxFontSizeMultiplier={1.2} numberOfLines={3}>{game.home_team_name || 'TBD'}</Text>
              </View>
              <View style={styles.scoreCol}>
                <Text style={styles.score} maxFontSizeMultiplier={1.1}>{game.home_score ?? 0}</Text>
                <Text style={styles.scoreDash} maxFontSizeMultiplier={1.1}>-</Text>
                <Text style={styles.score} maxFontSizeMultiplier={1.1}>{game.away_score ?? 0}</Text>
              </View>
              <View style={styles.teamCol}>
                {game.away_team_logo ? <Image source={{ uri: game.away_team_logo }} style={styles.logo} /> : null}
                <Text style={styles.teamName} maxFontSizeMultiplier={1.2} numberOfLines={3}>{game.away_team_name || 'TBD'}</Text>
              </View>
            </View>
            {division || where ? (
              <Text style={styles.metaText} maxFontSizeMultiplier={1.2}>{[division, where].filter(Boolean).join('  ·  ')}</Text>
            ) : null}
            {isLive ? (
              <Text style={styles.autoText} maxFontSizeMultiplier={1.2}>Updates automatically</Text>
            ) : null}
            <Text style={styles.feedTitle} maxFontSizeMultiplier={1.2}>PLAY-BY-PLAY</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isGoal = item.event_type === 'goal';
          return (
            <View style={[styles.eventRow, isGoal ? styles.eventRowGoal : null]}>
              <View style={[styles.iconCircle, { backgroundColor: eventColor(item.event_type) + '1f' }]}>
                <Ionicons name={eventIcon(item.event_type)} size={15} color={eventColor(item.event_type)} />
              </View>
              <View style={styles.eventBody}>
                <Text style={[styles.eventText, isGoal ? styles.eventTextGoal : null]} maxFontSizeMultiplier={1.3}>
                  {describe(item)}
                </Text>
                <Text style={styles.eventMeta} maxFontSizeMultiplier={1.3}>
                  {[shortPeriod(item.period), item.game_time].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              {game.status === 'scheduled' ? 'This game has not started yet. Check back at puck drop.' : 'No plays recorded yet.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { padding: spacing.xxl, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#5b6b80', ...fonts.regular, textAlign: 'center' },
  listContent: { paddingBottom: 40 },
  scoreboard: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  statusBadgeLive: { backgroundColor: '#e74c3c' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  statusText: { color: '#fff', fontSize: 11, letterSpacing: 1, ...fonts.bold },
  periodText: { color: colors.cyan, fontSize: 11, letterSpacing: 1, ...fonts.bold },
  teamsRow: { flexDirection: 'row', alignItems: 'center' },
  teamCol: { flex: 1, alignItems: 'center', gap: 6 },
  logo: { width: 44, height: 44, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)' },
  teamName: { color: '#fff', fontSize: 13, textAlign: 'center', ...fonts.semibold },
  scoreCol: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md },
  score: { color: '#fff', fontSize: 40, ...fonts.bold },
  scoreDash: { color: 'rgba(255,255,255,0.5)', fontSize: 26, ...fonts.bold },
  metaText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'center', marginTop: spacing.md, ...fonts.regular },
  autoText: { color: colors.cyan, fontSize: 11, textAlign: 'center', marginTop: 4, ...fonts.regular },
  feedTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 11, letterSpacing: 1.5, marginTop: spacing.lg, ...fonts.bold },
  eventRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fff', marginHorizontal: spacing.md, marginTop: spacing.sm,
    borderRadius: radii.md, padding: spacing.md,
    borderWidth: 1, borderColor: '#e3eaf3',
  },
  eventRowGoal: { borderColor: '#bfe6cd', backgroundColor: '#f3fbf6' },
  iconCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  eventBody: { flex: 1 },
  eventText: { fontSize: 14, color: colors.navy, ...fonts.semibold },
  eventTextGoal: { color: '#157a40' },
  eventMeta: { fontSize: 11.5, color: '#7a8aa0', marginTop: 2, ...fonts.regular },
});
