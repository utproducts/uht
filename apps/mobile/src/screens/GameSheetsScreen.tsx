import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { colors, fonts, spacing } from '../constants/theme';
import { authFetch } from '../services/auth';

// Scoresheet index for coaches/managers (their teams) and org admins (all
// org teams): every final game, one tap from the official scoresheet.
export default function GameSheetsScreen({ navigation, route }: any) {
  const scope = route?.params?.scope === 'org' ? 'org' : 'mine';
  const [orgId, setOrgId] = useState<string | null>(route?.params?.orgId || null);
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Org scope without an explicit org: resolve the user's own org first
  useEffect(() => {
    if (scope !== 'org' || orgId) return;
    authFetch('/api/organizations/mine')
      .then((r: any) => r.json())
      .then((j: any) => {
        if (j.success && j.data?.length) setOrgId(j.data[0].id);
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [scope, orgId]);

  const load = useCallback(() => {
    if (scope === 'org' && !orgId) return Promise.resolve();
    const url = scope === 'org' ? `/api/organizations/${orgId}/gamesheets` : '/api/teams/my-gamesheets';
    return authFetch(url)
      .then((r: any) => r.json())
      .then((j: any) => { if (j.success) setGames(j.data || []); })
      .catch(() => {});
  }, [scope, orgId]);

  useEffect(() => {
    if (scope === 'org' && !orgId) return;
    load().finally(() => setLoading(false));
  }, [load, scope, orgId]);
  const onRefresh = () => { setRefreshing(true); load().finally(() => setRefreshing(false)); };

  const fmtWhen = (s?: string) => {
    if (!s) return '';
    const d = new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  // group by event, newest first (rows already sorted by start_time DESC)
  const groups: { event: string; isTest: boolean; items: any[] }[] = [];
  for (const g of games) {
    const last = groups[groups.length - 1];
    if (last && last.event === g.event_name) last.items.push(g);
    else groups.push({ event: g.event_name, isTest: !!g.is_test, items: [g] });
  }

  return (
    <View style={s.screen}>
      <ScreenHeader title="Game Sheets" showBack onBack={() => navigation.goBack()} />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} /> : games.length === 0 ? (
        <Text style={s.emptyText}>No completed games yet. Scoresheets appear here as soon as games go final.</Text>
      ) : (
        <ScrollView
          contentContainerStyle={s.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}
        >
          {groups.map((grp, gi) => (
            <View key={gi} style={s.eventCard}>
              <View style={s.eventHead}>
                <Text style={s.eventHeadText} numberOfLines={1} maxFontSizeMultiplier={1.2}>{grp.event}</Text>
                {grp.isTest ? <Text style={s.testBadge} maxFontSizeMultiplier={1.2}>TEST</Text> : null}
              </View>
              {grp.items.map((g, i) => (
                <TouchableOpacity
                  key={g.id}
                  style={[s.row, i === grp.items.length - 1 && s.rowLast]}
                  activeOpacity={0.75}
                  onPress={() => navigation.navigate('Scoresheet', { gameId: g.id })}
                >
                  <View style={s.sheetIcon}>
                    <Ionicons name="document-text-outline" size={18} color={colors.navy} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.matchup} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                      {g.home_team_name} {g.home_score} - {g.away_score} {g.away_team_name}
                    </Text>
                    <Text style={s.meta} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                      {[g.game_number ? `#${g.game_number}` : null, g.division_name || null, fmtWhen(g.start_time)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#9aa7ba" />
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, paddingBottom: 40, gap: 12 },
  emptyText: { color: '#5b6b83', fontSize: 13, ...fonts.semibold, textAlign: 'center', marginTop: 40, paddingHorizontal: spacing.lg },
  eventCard: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: '#e3e9f1', overflow: 'hidden' },
  eventHead: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.navy, paddingHorizontal: 14, paddingVertical: 10 },
  eventHeadText: { flex: 1, color: colors.white, fontSize: 13, ...fonts.bold },
  testBadge: { color: '#132a4d', backgroundColor: '#d4af37', fontSize: 10, ...fonts.bold, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f0f2f5' },
  rowLast: { borderBottomWidth: 0 },
  sheetIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#e9eef5', alignItems: 'center', justifyContent: 'center' },
  matchup: { fontSize: 13.5, color: colors.navy, ...fonts.bold },
  meta: { fontSize: 11, color: '#7a8699', ...fonts.semibold, marginTop: 1 },
});
