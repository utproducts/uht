import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { colors, fonts, spacing } from '../constants/theme';
import { authFetch } from '../services/auth';

// ─────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────
function Header({ title, subtitle, navigation }: { title: string; subtitle?: string; navigation: any }) {
  return (
    <>
      <ScreenHeader title={title} showBack onBack={() => navigation.goBack()} />
      {subtitle ? <Text style={s.headerSubLine}>{subtitle}</Text> : null}
    </>
  );
}

function useMyOrg() {
  const [org, setOrg] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    authFetch(`/api/organizations/mine`)
      .then((r: any) => r.json())
      .then((j: any) => { if (j.success && j.data?.length) setOrg(j.data[0]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return { org, loading };
}

function fmtRange(start?: string, end?: string) {
  if (!start) return '';
  const f = (d: string) => {
    const dt = new Date(d.replace(' ', 'T'));
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  return end && end !== start ? `${f(start)} - ${f(end)}` : f(start);
}

// Shared W/L/GF/GA layout - used by Org Stats and the coach Team Stats screen
export function StatsBody({ url, emptyText }: { url: string; emptyText: string }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    return authFetch(url)
      .then((r: any) => r.json())
      .then((j: any) => { if (j.success) setData(j.data); })
      .catch(() => {});
  }, [url]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  const onRefresh = () => { setRefreshing(true); load().finally(() => setRefreshing(false)); };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} />;
  const totals = data?.totals || { gp: 0, wins: 0, losses: 0, ties: 0, goals_for: 0, goals_against: 0 };
  const teams: any[] = data?.teams || [];
  const diff = totals.goals_for - totals.goals_against;

  return (
    <ScrollView
      contentContainerStyle={s.body}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}
    >
      <View style={s.totalsCard}>
        <Text style={s.totalsRecord} maxFontSizeMultiplier={1.2}>
          {totals.wins}-{totals.losses}-{totals.ties}
        </Text>
        <Text style={s.totalsRecordLabel}>ALL-TIME RECORD AT UHT EVENTS</Text>
        <View style={s.totalsRow}>
          {[
            { label: 'GAMES', value: totals.gp },
            { label: 'GOALS FOR', value: totals.goals_for },
            { label: 'GOALS AGAINST', value: totals.goals_against },
            { label: '+/-', value: diff > 0 ? `+${diff}` : `${diff}` },
          ].map(st => (
            <View key={st.label} style={s.totalsStat}>
              <Text style={s.totalsStatValue} maxFontSizeMultiplier={1.2}>{st.value}</Text>
              <Text style={s.totalsStatLabel} maxFontSizeMultiplier={1.2}>{st.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {teams.length === 0 ? (
        <Text style={s.emptyText}>{emptyText}</Text>
      ) : (
        <View style={s.tableCard}>
          <View style={s.tableHead}>
            <Text style={[s.th, { flex: 1 }]}>TEAM</Text>
            <Text style={[s.th, s.thNum]}>GP</Text>
            <Text style={[s.th, s.thRec]}>W-L-T</Text>
            <Text style={[s.th, s.thNum]}>GF</Text>
            <Text style={[s.th, s.thNum]}>GA</Text>
            <Text style={[s.th, s.thNum]}>+/-</Text>
          </View>
          {teams.map((t, i) => {
            const d = t.goals_for - t.goals_against;
            return (
              <View key={t.id} style={[s.tr, i === teams.length - 1 && s.trLast]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.teamName} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t.name}</Text>
                  {t.age_group ? <Text style={s.teamAge} maxFontSizeMultiplier={1.2}>{t.age_group}</Text> : null}
                </View>
                <Text style={[s.td, s.thNum]} maxFontSizeMultiplier={1.2}>{t.gp}</Text>
                <Text style={[s.td, s.thRec]} maxFontSizeMultiplier={1.2}>{t.wins}-{t.losses}-{t.ties}</Text>
                <Text style={[s.td, s.thNum]} maxFontSizeMultiplier={1.2}>{t.goals_for}</Text>
                <Text style={[s.td, s.thNum]} maxFontSizeMultiplier={1.2}>{t.goals_against}</Text>
                <Text style={[s.td, s.thNum, d > 0 && { color: '#15803d' }, d < 0 && { color: '#b91c1c' }]} maxFontSizeMultiplier={1.2}>
                  {d > 0 ? `+${d}` : d}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      <Text style={s.footNote}>Stats count games scored at UHT events.</Text>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────
// 1. Organization Details
// ─────────────────────────────────────────────────────────
export function OrgDetailsScreen({ navigation }: any) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch(`/api/organizations/dashboard`)
      .then((r: any) => r.json())
      .then((j: any) => { if (j.success) setData(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const org = data?.org;
  const stats = data?.stats;
  return (
    <View style={s.screen}>
      <Header title="Organization" navigation={navigation} />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} /> : !org ? (
        <Text style={s.emptyText}>No organization is linked to your account yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={s.body}>
          <View style={s.orgCard}>
            {org.logo_url ? (
              <Image source={{ uri: org.logo_url }} style={s.orgLogo} resizeMode="contain" />
            ) : (
              <View style={s.orgLogoFallback}>
                <Ionicons name="shield-outline" size={30} color={colors.cyan} />
              </View>
            )}
            <Text style={s.orgName} maxFontSizeMultiplier={1.2}>{org.name}</Text>
            {(org.city || org.state) ? (
              <Text style={s.orgLoc}>{[org.city, org.state].filter(Boolean).join(', ')}</Text>
            ) : null}
          </View>
          {stats ? (
            <View style={s.countGrid}>
              {[
                { label: 'Teams', value: stats.teams, icon: 'people-outline' as const },
                { label: 'Players', value: stats.players, icon: 'person-outline' as const },
                { label: 'Coaches', value: stats.coaches, icon: 'clipboard-outline' as const },
                { label: 'Events', value: stats.events, icon: 'calendar-outline' as const },
              ].map(c0 => (
                <View key={c0.label} style={s.countCard}>
                  <Ionicons name={c0.icon} size={18} color={colors.navy} />
                  <Text style={s.countValue} maxFontSizeMultiplier={1.2}>{c0.value}</Text>
                  <Text style={s.countLabel} maxFontSizeMultiplier={1.2}>{c0.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {(data?.recentRegistrations || []).length > 0 && (
            <>
              <Text style={s.sectionLabel}>RECENT REGISTRATIONS</Text>
              <View style={s.tableCard}>
                {data.recentRegistrations.map((r0: any, i: number) => (
                  <View key={r0.id} style={[s.tr, i === data.recentRegistrations.length - 1 && s.trLast]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.teamName} numberOfLines={1} maxFontSizeMultiplier={1.2}>{r0.team_name}</Text>
                      <Text style={s.teamAge} numberOfLines={1} maxFontSizeMultiplier={1.2}>{r0.event_name}</Text>
                    </View>
                    <Text style={[s.statusChip, r0.status === 'approved' && s.statusChipOk]} maxFontSizeMultiplier={1.2}>
                      {String(r0.status || '').toUpperCase()}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// 2. Org Teams
// ─────────────────────────────────────────────────────────
export function OrgTeamsScreen({ navigation }: any) {
  const { org, loading: orgLoading } = useMyOrg();
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!org) { if (!orgLoading) setLoading(false); return; }
    authFetch(`/api/organizations/${org.id}/teams-full`)
      .then((r: any) => r.json())
      .then((j: any) => { if (j.success) setTeams(j.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [org, orgLoading]);

  return (
    <View style={s.screen}>
      <Header title="Teams" subtitle={org ? org.name : undefined} navigation={navigation} />
      {loading || orgLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} /> : teams.length === 0 ? (
        <Text style={s.emptyText}>No active teams in your organization yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={s.body}>
          {teams.map(t => {
            const coach = (t.coaches || []).find((c0: any) => c0.coach_role === 'head_coach') || (t.coaches || [])[0];
            return (
              <View key={t.id} style={s.teamCard}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.teamCardName} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t.name}</Text>
                  <Text style={s.teamAge} maxFontSizeMultiplier={1.2}>
                    {[t.age_group, `${t.player_count} players`].filter(Boolean).join(' · ')}
                  </Text>
                  {coach ? (
                    <Text style={s.teamCoach} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                      Coach: {coach.first_name} {coach.last_name}
                    </Text>
                  ) : null}
                </View>
                {t.registration_count > 0 ? (
                  <View style={s.regBadge}>
                    <Text style={s.regBadgeText} maxFontSizeMultiplier={1.2}>{t.registration_count} reg</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// 3. Org Events
// ─────────────────────────────────────────────────────────
export function OrgEventsScreen({ navigation }: any) {
  const { org, loading: orgLoading } = useMyOrg();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!org) { if (!orgLoading) setLoading(false); return; }
    authFetch(`/api/organizations/${org.id}/events`)
      .then((r: any) => r.json())
      .then((j: any) => { if (j.success) setEvents(j.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [org, orgLoading]);

  return (
    <View style={s.screen}>
      <Header title="Org Events" subtitle={org ? org.name : undefined} navigation={navigation} />
      {loading || orgLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} /> : events.length === 0 ? (
        <Text style={s.emptyText}>No events yet - register a team to see it here.</Text>
      ) : (
        <ScrollView contentContainerStyle={s.body}>
          {events.map(ev => (
            <TouchableOpacity
              key={ev.id}
              style={s.eventCard}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('EventDetail', { eventId: ev.id, eventName: ev.name })}
            >
              {ev.logo_url ? (
                <Image source={{ uri: ev.logo_url }} style={s.eventLogo} resizeMode="contain" />
              ) : (
                <View style={[s.eventLogo, s.orgLogoFallback]}>
                  <Ionicons name="trophy-outline" size={20} color={colors.cyan} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.teamCardName} numberOfLines={1} maxFontSizeMultiplier={1.2}>{ev.name}</Text>
                <Text style={s.teamAge} maxFontSizeMultiplier={1.2}>
                  {[fmtRange(ev.start_date, ev.end_date), [ev.city, ev.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                </Text>
                <Text style={s.teamCoach} maxFontSizeMultiplier={1.2}>
                  {ev.teams_registered} {ev.teams_registered === 1 ? 'team' : 'teams'} · {ev.teams_approved} approved
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9aa7ba" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// 4. Org Stats
// ─────────────────────────────────────────────────────────
export function OrgStatsScreen({ navigation }: any) {
  const { org, loading } = useMyOrg();
  return (
    <View style={s.screen}>
      <Header title="Org Stats" subtitle={org ? org.name : undefined} navigation={navigation} />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} /> : !org ? (
        <Text style={s.emptyText}>No organization is linked to your account yet.</Text>
      ) : (
        <StatsBody
          url={`/api/organizations/${org.id}/stats`}
          emptyText="No teams yet - stats build as your teams play UHT events."
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerSubLine: { color: '#5b6b83', fontSize: 12, ...fonts.semibold, paddingHorizontal: spacing.lg, paddingTop: 10 },
  body: { padding: spacing.lg, paddingBottom: 40, gap: 10 },
  emptyText: { color: '#5b6b83', fontSize: 13, ...fonts.semibold, textAlign: 'center', marginTop: 40, paddingHorizontal: spacing.lg },

  // Org details
  orgCard: { backgroundColor: colors.white, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#e3e9f1' },
  orgLogo: { width: 72, height: 72, marginBottom: 10 },
  orgLogoFallback: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  orgName: { fontSize: 18, color: colors.navy, ...fonts.bold, textAlign: 'center' },
  orgLoc: { fontSize: 12.5, color: '#5b6b83', ...fonts.semibold, marginTop: 3 },
  countGrid: { flexDirection: 'row', gap: 8 },
  countCard: { flex: 1, backgroundColor: colors.white, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e3e9f1', gap: 2 },
  countValue: { fontSize: 17, color: colors.navy, ...fonts.bold },
  countLabel: { fontSize: 10, color: '#7a8699', ...fonts.semibold, letterSpacing: 0.4 },
  sectionLabel: { fontSize: 10.5, color: '#7a8699', letterSpacing: 1, ...fonts.bold, marginTop: 6, marginBottom: -2 },

  // Stats
  totalsCard: { backgroundColor: colors.navy, borderRadius: 14, padding: 18, alignItems: 'center' },
  totalsRecord: { fontSize: 34, color: colors.white, ...fonts.bold },
  totalsRecordLabel: { fontSize: 10, color: 'rgba(255,255,255,0.65)', letterSpacing: 1, ...fonts.bold, marginTop: 2, marginBottom: 14 },
  totalsRow: { flexDirection: 'row', alignSelf: 'stretch' },
  totalsStat: { flex: 1, alignItems: 'center' },
  totalsStatValue: { fontSize: 16, color: colors.cyan, ...fonts.bold },
  totalsStatLabel: { fontSize: 8.5, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.4, ...fonts.semibold, marginTop: 2, textAlign: 'center' },
  tableCard: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: '#e3e9f1', overflow: 'hidden' },
  tableHead: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f7fa', paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  th: { fontSize: 10, color: '#7a8699', letterSpacing: 0.5, ...fonts.bold },
  thNum: { width: 32, textAlign: 'center' },
  thRec: { width: 52, textAlign: 'center' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f0f2f5', gap: 6 },
  trLast: { borderBottomWidth: 0 },
  td: { fontSize: 12.5, color: colors.navy, ...fonts.semibold },
  teamName: { fontSize: 13.5, color: colors.navy, ...fonts.bold },
  teamAge: { fontSize: 11, color: '#7a8699', ...fonts.semibold, marginTop: 1 },
  footNote: { fontSize: 11, color: '#9aa7ba', ...fonts.semibold, textAlign: 'center', marginTop: 4 },

  // Teams / events lists
  teamCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e3e9f1', gap: 10 },
  teamCardName: { fontSize: 14.5, color: colors.navy, ...fonts.bold },
  teamCoach: { fontSize: 11.5, color: '#5b6b83', ...fonts.semibold, marginTop: 2 },
  regBadge: { backgroundColor: 'rgba(0,204,255,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  regBadgeText: { fontSize: 11, color: colors.navy, ...fonts.bold },
  eventCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e3e9f1', gap: 12 },
  eventLogo: { width: 44, height: 44, borderRadius: 8 },
  statusChip: { fontSize: 10, color: '#7a8699', ...fonts.bold, letterSpacing: 0.4 },
  statusChipOk: { color: '#15803d' },
});
