import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';

const API = 'https://uht.chad-157.workers.dev/api';

// Official game scoresheet — the GameSheet-style record coaches and managers
// open from the "Scoresheet Ready" push or from My Schedule's completed games.
export default function ScoresheetScreen({ route, navigation }: any) {
  const gameId = route?.params?.gameId;
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!gameId) return;
    try {
      const res = await fetch(`${API}/scoring/games/${gameId}/sheet`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch { /* keep whatever we have */ }
    setLoading(false);
    setRefreshing(false);
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  if (!data?.game) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Scoresheet Not Available</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const g = data.game;
  const teams = [
    { id: g.home_team_id, name: g.home_team_name || 'Home', tag: 'HOME', score: g.home_score },
    { id: g.away_team_id, name: g.away_team_name || 'Visitor', tag: 'VISITOR', score: g.away_score },
  ];
  const goals = data.goals || [];
  const penalties = data.penalties || [];
  const shots = data.shots || [];
  const lineupFor = (teamId: string) => (teamId === g.home_team_id ? data.homeLineup : data.awayLineup) || [];
  const coaches = data.coaches || [];
  const officials = data.officials || [];
  const stars = data.threeStars || [];

  const shotsByTeam: Record<string, Record<number, number>> = {};
  for (const s of shots) {
    (shotsByTeam[s.team_id] = shotsByTeam[s.team_id] || {})[s.period] = s.shot_count;
  }
  const maxPeriod = Math.max(3, ...goals.map((e: any) => e.period || 0), ...penalties.map((e: any) => e.period || 0));
  const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1);

  const signoffFor = (teamId: string) =>
    coaches.find((c: any) => c.team_id === teamId && c.role === 'roster_signoff' && c.signed_off_at);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Official Scoresheet</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {g.event_name}{g.game_number ? ` · Game #${g.game_number}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.navy} />}
      >
        {/* Score banner */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreRow}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.scoreTeam} numberOfLines={2}>{teams[0].name}</Text>
              <Text style={styles.scoreTag}>HOME</Text>
            </View>
            <Text style={styles.scoreNums}>{teams[0].score ?? 0} - {teams[1].score ?? 0}</Text>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.scoreTeam} numberOfLines={2}>{teams[1].name}</Text>
              <Text style={styles.scoreTag}>VISITOR</Text>
            </View>
          </View>
          <Text style={styles.scoreMeta}>
            {[g.age_group, g.division_level].filter(Boolean).join(' ')}
            {g.venue_name ? ` · ${g.venue_name}` : ''}{g.rink_name ? ` (${g.rink_name})` : ''}
          </Text>
          {g.status === 'final' && <View style={styles.finalPill}><Text style={styles.finalPillText}>FINAL</Text></View>}
        </View>

        {/* SCORING */}
        <Text style={styles.sectionTitle}>SCORING</Text>
        {teams.map(team => {
          const tGoals = goals.filter((e: any) => e.team_id === team.id);
          return (
            <View key={`sc-${team.tag}`} style={styles.card}>
              <Text style={styles.cardHeader}>{team.tag} - {team.name}</Text>
              <View style={styles.tableHead}>
                <Text style={[styles.th, { width: 40 }]}>PER</Text>
                <Text style={[styles.th, { width: 56 }]}>TIME</Text>
                <Text style={[styles.th, { width: 40 }]}>G</Text>
                <Text style={[styles.th, { width: 40 }]}>A</Text>
                <Text style={[styles.th, { width: 40 }]}>A</Text>
                <Text style={[styles.th, { width: 46 }]}>GOALIE</Text>
              </View>
              {tGoals.length === 0 ? (
                <Text style={styles.emptyRow}>No goals</Text>
              ) : tGoals.map((e: any) => (
                <View key={e.id} style={styles.tableRow}>
                  <Text style={[styles.td, { width: 40 }]}>{e.period ?? '-'}</Text>
                  <Text style={[styles.td, { width: 56 }]}>{e.game_time || '-'}</Text>
                  <Text style={[styles.td, { width: 40, fontWeight: '800' }]}>{e.jersey_number || '?'}</Text>
                  <Text style={[styles.td, { width: 40, color: colors.textMuted }]}>{e.assist1_jersey || ''}</Text>
                  <Text style={[styles.td, { width: 40, color: colors.textMuted }]}>{e.assist2_jersey || ''}</Text>
                  <Text style={[styles.td, { width: 46, fontWeight: '700' }, e.goalie_jersey === 'EN' ? { color: '#d97706' } : { color: colors.textMuted }]}>{e.goalie_jersey || ''}</Text>
                </View>
              ))}
            </View>
          );
        })}

        {/* PENALTIES */}
        <Text style={styles.sectionTitle}>PENALTIES</Text>
        {teams.map(team => {
          const tPens = penalties.filter((e: any) => e.team_id === team.id);
          return (
            <View key={`pe-${team.tag}`} style={styles.card}>
              <Text style={[styles.cardHeader, { color: '#b45309' }]}>{team.tag} - {team.name}</Text>
              <View style={styles.tableHead}>
                <Text style={[styles.th, { width: 36 }]}>PER</Text>
                <Text style={[styles.th, { width: 32 }]}>#</Text>
                <Text style={[styles.th, { width: 36 }]}>MIN</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'left' }]}>PENALTY</Text>
                <Text style={[styles.th, { width: 50 }]}>OFF</Text>
              </View>
              {tPens.length === 0 ? (
                <Text style={styles.emptyRow}>No penalties</Text>
              ) : tPens.map((e: any) => (
                <View key={e.id} style={styles.tableRow}>
                  <Text style={[styles.td, { width: 36 }]}>{e.period ?? '-'}</Text>
                  <Text style={[styles.td, { width: 32, fontWeight: '800' }]}>{e.jersey_number || '?'}</Text>
                  <Text style={[styles.td, { width: 36 }]}>{e.penalty_minutes ?? '-'}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: 'left' }]} numberOfLines={1}>{e.penalty_type || 'Penalty'}</Text>
                  <Text style={[styles.td, { width: 50 }]}>{e.game_time || '-'}</Text>
                </View>
              ))}
            </View>
          );
        })}

        {/* SHOTS */}
        <Text style={styles.sectionTitle}>SHOTS</Text>
        <View style={styles.card}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 1, textAlign: 'left' }]}>TEAM</Text>
            {periods.map(p => <Text key={p} style={[styles.th, { width: 36 }]}>P{p}</Text>)}
            <Text style={[styles.th, { width: 48 }]}>TOT</Text>
          </View>
          {teams.map(team => {
            const per = shotsByTeam[team.id] || {};
            const total = Object.values(per).reduce((a: number, b: any) => a + (b || 0), 0);
            return (
              <View key={`sh-${team.tag}`} style={styles.tableRow}>
                <Text style={[styles.td, { flex: 1, textAlign: 'left' }]} numberOfLines={1}>{team.name}</Text>
                {periods.map(p => <Text key={p} style={[styles.td, { width: 36 }]}>{per[p] || 0}</Text>)}
                <Text style={[styles.td, { width: 48, fontWeight: '800', color: colors.navy }]}>{total}</Text>
              </View>
            );
          })}
        </View>

        {/* LINEUPS */}
        <Text style={styles.sectionTitle}>LINEUPS</Text>
        {teams.map(team => {
          const lineup = lineupFor(team.id);
          const so = signoffFor(team.id);
          return (
            <View key={`lu-${team.tag}`} style={styles.card}>
              <Text style={styles.cardHeader}>{team.tag} - {team.name}</Text>
              {so ? (
                <View style={styles.signRow}>
                  <Ionicons name="checkmark-circle" size={15} color="#059669" />
                  <Text style={styles.signText}>Roster signed off by {so.coach_name}</Text>
                </View>
              ) : (
                <View style={styles.signRow}>
                  <Ionicons name="alert-circle-outline" size={15} color="#d97706" />
                  <Text style={[styles.signText, { color: '#b45309' }]}>No coach sign-off recorded</Text>
                </View>
              )}
              {lineup.length === 0 ? (
                <Text style={styles.emptyRow}>No lineup recorded</Text>
              ) : lineup.map((p: any) => {
                const st = p.status || (p.is_scratched ? 'not_playing' : 'playing');
                return (
                  <View key={p.id} style={styles.tableRow}>
                    <Text style={[styles.td, { width: 34, fontWeight: '800', color: colors.navy }]}>{p.jersey_number}</Text>
                    <Text style={[styles.td, { flex: 1, textAlign: 'left' }]} numberOfLines={1}>
                      {p.first_name} {p.last_name}{p.is_starting_goalie ? '  ★G' : ''}
                    </Text>
                    <Text style={[styles.td, { width: 90, fontSize: 11, fontWeight: '700' },
                      st === 'playing' ? { color: '#059669' } : st === 'suspended' ? { color: '#dc2626' } : { color: colors.textMuted }]}>
                      {st === 'playing' ? 'Playing' : st === 'suspended' ? 'Suspended' : 'Not Playing'}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* THREE STARS */}
        {stars.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>THREE STARS</Text>
            <View style={styles.card}>
              {stars.map((s: any) => (
                <View key={s.star_number} style={styles.tableRow}>
                  <Text style={[styles.td, { width: 40 }]}>{'⭐'.repeat(s.star_number)}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: 'left' }]}>
                    #{s.jersey_number || '?'} {s.player_name || ''}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* OFFICIALS */}
        <Text style={styles.sectionTitle}>OFFICIALS</Text>
        <View style={styles.card}>
          {officials.length === 0 ? (
            <Text style={styles.emptyRow}>No officials recorded</Text>
          ) : officials.map((o: any) => (
            <View key={o.id} style={styles.tableRow}>
              <Text style={[styles.td, { flex: 1, textAlign: 'left', fontWeight: '600' }]}>{o.official_name}</Text>
              <Text style={[styles.td, { width: 90, color: colors.textMuted, textTransform: 'capitalize' }]}>{o.role}</Text>
            </View>
          ))}
          {g.officials_signed_by ? (
            <View style={[styles.signRow, { marginTop: 6 }]}>
              <Ionicons name="checkmark-circle" size={15} color="#059669" />
              <Text style={styles.signText}>Game signed off by {g.officials_signed_by}</Text>
            </View>
          ) : null}
          {g.scorekeeper_name ? (
            <Text style={[styles.emptyRow, { textAlign: 'left', paddingTop: 4 }]}>Scorekeeper: {g.scorekeeper_name}</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  backBtn: { marginTop: 10, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.navy, borderRadius: 999 },
  backBtnText: { color: '#fff', fontWeight: '700' },
  header: { backgroundColor: colors.navy, flexDirection: 'row', alignItems: 'center', paddingBottom: 12, paddingHorizontal: 8 },
  headerBack: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 },
  scoreCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 6 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  scoreTeam: { fontSize: 13, fontWeight: '800', color: colors.text, textAlign: 'center' },
  scoreTag: { fontSize: 9, fontWeight: '700', color: colors.textMuted, marginTop: 2 },
  scoreNums: { fontSize: 30, fontWeight: '900', color: colors.navy, paddingHorizontal: 12 },
  scoreMeta: { fontSize: 11, color: colors.textMuted, marginTop: 8, textAlign: 'center' },
  finalPill: { marginTop: 8, backgroundColor: colors.text, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 4 },
  finalPillText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 2, textAlign: 'center', marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 8 },
  cardHeader: { fontSize: 12, fontWeight: '800', color: colors.navy, marginBottom: 6 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eef0f3', paddingBottom: 4 },
  th: { fontSize: 9, fontWeight: '800', color: colors.textMuted, textAlign: 'center' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f4f5f7' },
  td: { fontSize: 12.5, color: colors.text, textAlign: 'center' },
  emptyRow: { fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingVertical: 8 },
  signRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  signText: { fontSize: 12, fontWeight: '600', color: '#047857' },
});
