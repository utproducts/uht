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
import { Share, Alert, Modal, TextInput } from 'react-native';
import { colors } from '../constants/theme';
import { authFetch } from '../services/auth';
import { StrokeDrawing } from '../components/SignaturePad';

// Official game scoresheet — the GameSheet-style record coaches and managers
// open from the "Scoresheet Ready" push or from My Schedule's completed games.
export default function ScoresheetScreen({ route, navigation }: any) {
  const gameId = route?.params?.gameId;
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const emailSheet = async () => {
    if (emailing) return;
    setEmailing(true);
    try {
      const res = await authFetch(`/api/scoring/games/${gameId}/sheet/email`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        Alert.alert('Sent', `Scoresheet emailed to ${json.data?.sentTo || 'your email'}. You can print or forward it from your mail app.`);
      } else {
        Alert.alert('Could not send', typeof json.error === 'string' ? json.error : 'Please try again.');
      }
    } catch {
      Alert.alert('Could not send', 'Check your connection and try again.');
    }
    setEmailing(false);
  };

  // Correction flow: coach taps a goal/penalty line, picks the right player,
  // change applies immediately (auto-approved) and staff get notified
  const [fix, setFix] = useState<{ ev: any; field: 'scorer' | 'assist1' | 'assist2' | 'player' } | null>(null);
  const [fixSaving, setFixSaving] = useState(false);

  const submitFix = async (jersey: string) => {
    if (!fix || fixSaving) return;
    setFixSaving(true);
    try {
      const res = await authFetch(`/api/scoring/games/${gameId}/sheet/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: fix.ev.id, field: fix.field, jerseyNumber: jersey }),
      });
      const json = await res.json() as any;
      if (json.success) {
        setFix(null);
        await load();
        Alert.alert('Correction applied', 'The scoresheet has been updated.');
      } else {
        Alert.alert('Could not apply', typeof json.error === 'string' ? json.error : 'Please try again.');
      }
    } catch {
      Alert.alert('Could not apply', 'Check your connection and try again.');
    }
    setFixSaving(false);
  };

  // Penalty change requests: unlike goal fixes these are NOT auto-applied.
  // The request goes to the tournament director for approval.
  const [penReq, setPenReq] = useState<{ ev: any; type: null | 'player' | 'penalty_type' | 'minutes' | 'remove'; value: string; note: string } | null>(null);
  const [penSaving, setPenSaving] = useState(false);

  const submitPenReq = async (value?: string) => {
    if (!penReq || !penReq.type || penSaving) return;
    setPenSaving(true);
    try {
      const res = await authFetch(`/api/scoring/games/${gameId}/sheet/penalty-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameEventId: penReq.ev.id,
          changeType: penReq.type,
          newValue: value ?? penReq.value,
          note: penReq.note || undefined,
        }),
      });
      const json = await res.json() as any;
      if (json.success) {
        setPenReq(null);
        if (json.data?.applied) { await load(); Alert.alert('Change applied', 'The scoresheet has been updated.'); }
        else if (json.data?.unchanged) Alert.alert('No change', 'That matches what is already on the sheet.');
        else Alert.alert('Request sent', 'A tournament director will review this penalty change. You will get an email once it is decided.');
      } else {
        Alert.alert('Could not send', typeof json.error === 'string' ? json.error : 'Please try again.');
      }
    } catch {
      Alert.alert('Could not send', 'Check your connection and try again.');
    }
    setPenSaving(false);
  };

  // Starting goalie correction: tap a lineup row, confirm, server handles
  // the lineup flag, goalie stats, and Three Stars recompute
  const fixGoalie = (teamId: string, p: any) => {
    if (!data?.share_url) return;
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || `#${p.jersey_number}`;
    Alert.alert(
      'Change Starting Goalie',
      `Make #${p.jersey_number} ${name} the starting goalie? Goalie stats move with the change, and the Three Stars are recomputed if the previous goalie held one.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set as Starting Goalie',
          onPress: async () => {
            try {
              const res = await authFetch(`/api/scoring/games/${gameId}/sheet/goalie`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamId, jerseyNumber: String(p.jersey_number || '') }),
              });
              const json = await res.json() as any;
              if (json.success) { await load(); Alert.alert('Updated', 'Starting goalie corrected.'); }
              else Alert.alert('Could not update', typeof json.error === 'string' ? json.error : 'Please try again.');
            } catch { Alert.alert('Could not update', 'Check your connection and try again.'); }
          },
        },
      ]
    );
  };

  const load = useCallback(async () => {
    if (!gameId) return;
    try {
      // Coach/manager gated - authFetch carries the signed-in user's token
      const res = await authFetch(`/api/scoring/games/${gameId}/sheet`);
      const json = await res.json();
      if (json.success) { setData(json.data); setRestricted(false); }
      else if (res.status === 403) setRestricted(true);
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

  if (restricted) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingHorizontal: 32 }]}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Coaches and Managers Only</Text>
        <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 }}>
          The official scoresheet is available to each team's coaches and managers.
          Players and families: ask your coach to share it with you.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
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
        {data.share_url ? (
          <TouchableOpacity onPress={emailSheet} style={{ padding: 8 }} disabled={emailing}>
            <Ionicons name={emailing ? 'hourglass-outline' : 'mail-outline'} size={22} color="#fff" />
          </TouchableOpacity>
        ) : null}
        {data.share_url ? (
          <TouchableOpacity
            onPress={() => Share.share({ message: `Official scoresheet - ${g.event_name}: ${data.share_url}`, url: data.share_url })}
            style={{ padding: 8 }}
          >
            <Ionicons name="share-outline" size={22} color="#fff" />
          </TouchableOpacity>
        ) : null}
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
                <TouchableOpacity key={e.id} style={styles.tableRow} disabled={!data.share_url}
                  onPress={() => setFix({ ev: e, field: 'scorer' })} activeOpacity={0.6}>
                  <Text style={[styles.td, { width: 40 }]}>{e.period ?? '-'}</Text>
                  <Text style={[styles.td, { width: 56 }]}>{e.game_time || '-'}</Text>
                  <Text style={[styles.td, { width: 40, fontWeight: '800' }]}>{e.jersey_number || '?'}</Text>
                  <Text style={[styles.td, { width: 40, color: colors.textMuted }]}>{e.assist1_jersey || ''}</Text>
                  <Text style={[styles.td, { width: 40, color: colors.textMuted }]}>{e.assist2_jersey || ''}</Text>
                  <Text style={[styles.td, { width: 46, fontWeight: '700' }, e.goalie_jersey === 'EN' ? { color: '#d97706' } : { color: colors.textMuted }]}>{e.goalie_jersey || ''}</Text>
                </TouchableOpacity>
              ))}
              {data.share_url && tGoals.length > 0 ? (
                <Text style={styles.fixHint} maxFontSizeMultiplier={1.3}>Wrong player on a goal? Tap the line to fix it.</Text>
              ) : null}
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
                <TouchableOpacity key={e.id} style={styles.tableRow} disabled={!data.share_url}
                  onPress={() => setPenReq({ ev: e, type: null, value: '', note: '' })} activeOpacity={0.6}>
                  <Text style={[styles.td, { width: 36 }]}>{e.period ?? '-'}</Text>
                  <Text style={[styles.td, { width: 32, fontWeight: '800' }]}>{e.jersey_number || '?'}</Text>
                  <Text style={[styles.td, { width: 36 }]}>{e.penalty_minutes ?? '-'}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: 'left' }]} numberOfLines={1}>{e.penalty_type || 'Penalty'}</Text>
                  <Text style={[styles.td, { width: 50 }]}>{e.game_time || '-'}</Text>
                </TouchableOpacity>
              ))}
              {data.share_url && tPens.length > 0 ? (
                <Text style={styles.fixHint} maxFontSizeMultiplier={1.3}>Penalty wrong? Tap the line to request a fix (a director approves it).</Text>
              ) : null}
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
                <View>
                  {typeof so.signature_data === 'string' && so.signature_data.startsWith('strokes:') ? (() => {
                    try {
                      const sig = JSON.parse(so.signature_data.slice(8));
                      const scale = Math.min(1, 220 / (sig.w || 320));
                      const strokes = (sig.s || []).map((st: number[]) => {
                        const pts: { x: number; y: number }[] = [];
                        for (let i = 0; i < st.length; i += 2) pts.push({ x: st[i], y: st[i + 1] });
                        return pts;
                      });
                      return (
                        <View style={{ width: (sig.w || 320) * scale, height: (sig.h || 140) * scale, marginBottom: 4 }}>
                          <StrokeDrawing strokes={strokes} scale={scale} width={2} />
                        </View>
                      );
                    } catch { return null; }
                  })() : null}
                  <View style={styles.signRow}>
                    <Ionicons name="checkmark-circle" size={15} color="#059669" />
                    <Text style={styles.signText}>Roster signed off by {so.coach_name}</Text>
                  </View>
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
                  <TouchableOpacity key={p.id} style={styles.tableRow} disabled={!data.share_url}
                    activeOpacity={0.6} onPress={() => fixGoalie(team.id, p)}>
                    <Text style={[styles.td, { width: 34, fontWeight: '800', color: colors.navy }]}>{p.jersey_number}</Text>
                    <Text style={[styles.td, { flex: 1, textAlign: 'left' }]} numberOfLines={1}>
                      {p.first_name} {p.last_name}{p.is_starting_goalie ? '  ★G' : ''}
                    </Text>
                    <Text style={[styles.td, { width: 90, fontSize: 11, fontWeight: '700' },
                      st === 'playing' ? { color: '#059669' } : st === 'suspended' ? { color: '#dc2626' } : st === 'out' ? { color: '#d97706' } : { color: colors.textMuted }]}>
                      {st === 'playing' ? 'Playing' : st === 'suspended' ? 'Suspended' : st === 'out' ? 'Out' : 'Not Playing'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {data.share_url && lineup.length > 0 ? (
                <Text style={styles.fixHint} maxFontSizeMultiplier={1.3}>Wrong starting goalie? Tap the right player to fix it.</Text>
              ) : null}
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
                  <Text style={[styles.td, { minWidth: 52, flexShrink: 0 }]} numberOfLines={1} maxFontSizeMultiplier={1}>{'★'.repeat(Math.max(1, 4 - (s.star_number || 3)))}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: 'left' }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
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

      {/* Correction modal */}
      <Modal visible={!!fix} transparent animationType="fade" onRequestClose={() => setFix(null)}>
        <View style={styles.fixBackdrop}>
          <View style={styles.fixCard}>
            {fix ? (() => {
              const isGoal = fix.ev.event_type === 'goal';
              const roster = lineupFor(fix.ev.team_id);
              const current = fix.field === 'assist1' ? fix.ev.assist1_jersey : fix.field === 'assist2' ? fix.ev.assist2_jersey : fix.ev.jersey_number;
              return (
                <>
                  <Text style={styles.fixTitle} maxFontSizeMultiplier={1.2}>Fix This Line</Text>
                  <Text style={styles.fixSub} maxFontSizeMultiplier={1.3}>
                    {isGoal ? `Goal - P${fix.ev.period ?? '?'} ${fix.ev.game_time || ''}` : `${fix.ev.penalty_type || 'Penalty'} - P${fix.ev.period ?? '?'}`}
                  </Text>
                  {isGoal ? (
                    <View style={styles.fixFieldRow}>
                      {([['scorer', 'Scorer'], ['assist1', 'Assist 1'], ['assist2', 'Assist 2']] as const).map(([k, label]) => (
                        <TouchableOpacity key={k} style={[styles.fixFieldBtn, fix.field === k && styles.fixFieldBtnActive]}
                          onPress={() => setFix({ ...fix, field: k })}>
                          <Text style={[styles.fixFieldText, fix.field === k && styles.fixFieldTextActive]} maxFontSizeMultiplier={1.2}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                  <Text style={styles.fixPrompt} maxFontSizeMultiplier={1.3}>
                    Who is the correct {fix.field === 'player' ? 'player' : fix.field === 'scorer' ? 'scorer' : 'assist'}? (currently {current ? `#${current}` : 'none'})
                  </Text>
                  <ScrollView style={{ maxHeight: 300 }}>
                    {(fix.field === 'assist1' || fix.field === 'assist2') ? (
                      <TouchableOpacity style={styles.fixPlayerRow} disabled={fixSaving} onPress={() => submitFix('')}>
                        <Text style={styles.fixPlayerName} maxFontSizeMultiplier={1.3}>No assist</Text>
                      </TouchableOpacity>
                    ) : null}
                    {roster.map((pl: any) => (
                      <TouchableOpacity key={pl.id || pl.jersey_number} disabled={fixSaving}
                        style={[styles.fixPlayerRow, String(pl.jersey_number) === String(current || '') && styles.fixPlayerRowCurrent]}
                        onPress={() => submitFix(String(pl.jersey_number || ''))}>
                        <Text style={styles.fixPlayerNum} maxFontSizeMultiplier={1.2}>#{pl.jersey_number || '?'}</Text>
                        <Text style={styles.fixPlayerName} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                          {[pl.first_name, pl.last_name].filter(Boolean).join(' ') || 'Unnamed'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={styles.fixCancel} onPress={() => setFix(null)}>
                    <Text style={styles.fixCancelText} maxFontSizeMultiplier={1.2}>{fixSaving ? 'Applying...' : 'Cancel'}</Text>
                  </TouchableOpacity>
                </>
              );
            })() : null}
          </View>
        </View>
      </Modal>

      {/* Penalty change request modal - goes to the director for approval */}
      <Modal visible={!!penReq} transparent animationType="fade" onRequestClose={() => setPenReq(null)}>
        <View style={styles.fixBackdrop}>
          <View style={styles.fixCard}>
            {penReq ? (() => {
              const ev = penReq.ev;
              const roster = lineupFor(ev.team_id);
              const TYPES: Array<[typeof penReq.type, string]> = [
                ['player', 'Wrong player'],
                ['penalty_type', 'Wrong penalty'],
                ['minutes', 'Wrong minutes'],
                ['remove', 'Should be removed'],
              ];
              const PENALTY_NAMES = ['Tripping', 'Hooking', 'Slashing', 'High-Sticking', 'Cross-Checking', 'Interference', 'Holding', 'Roughing', 'Boarding', 'Charging', 'Body Checking', 'Delay of Game', 'Too Many Players', 'Unsportsmanlike Conduct', 'Head Contact'];
              const MINUTES: Array<[string, string]> = [['1:30', '1.5'], ['2:00', '2'], ['4:00', '4'], ['5:00', '5'], ['6:00', '6'], ['10:00', '10']];
              return (
                <>
                  <Text style={styles.fixTitle} maxFontSizeMultiplier={1.2}>Request Penalty Change</Text>
                  <Text style={styles.fixSub} maxFontSizeMultiplier={1.3}>
                    {`P${ev.period ?? '?'} ${ev.game_time || ''} - ${ev.penalty_type || 'Penalty'} (${ev.penalty_minutes ?? '?'} min) on #${ev.jersey_number || '?'}`}
                  </Text>
                  <Text style={styles.fixPrompt} maxFontSizeMultiplier={1.3}>
                    Penalty changes are reviewed and approved by the tournament director before they appear on the sheet.
                  </Text>
                  <View style={styles.fixFieldRow}>
                    {TYPES.map(([k, label]) => (
                      <TouchableOpacity key={k} style={[styles.fixFieldBtn, penReq.type === k && styles.fixFieldBtnActive]}
                        onPress={() => setPenReq({ ...penReq, type: k, value: '' })}>
                        <Text style={[styles.fixFieldText, penReq.type === k && styles.fixFieldTextActive]} maxFontSizeMultiplier={1.2}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {penReq.type ? (
                    <TextInput
                      style={styles.penNote}
                      placeholder="Note for the director (optional)"
                      placeholderTextColor="#9aa7b8"
                      value={penReq.note}
                      onChangeText={t => setPenReq({ ...penReq, note: t })}
                      maxLength={400}
                    />
                  ) : null}
                  {penReq.type === 'player' ? (
                    <ScrollView style={{ maxHeight: 240 }}>
                      {roster.map((pl: any) => (
                        <TouchableOpacity key={pl.id || pl.jersey_number} disabled={penSaving}
                          style={[styles.fixPlayerRow, String(pl.jersey_number) === String(ev.jersey_number || '') && styles.fixPlayerRowCurrent]}
                          onPress={() => submitPenReq(String(pl.jersey_number || ''))}>
                          <Text style={styles.fixPlayerNum} maxFontSizeMultiplier={1.2}>#{pl.jersey_number || '?'}</Text>
                          <Text style={styles.fixPlayerName} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                            {[pl.first_name, pl.last_name].filter(Boolean).join(' ') || 'Unnamed'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : penReq.type === 'penalty_type' ? (
                    <ScrollView style={{ maxHeight: 240 }}>
                      {PENALTY_NAMES.map(name => (
                        <TouchableOpacity key={name} disabled={penSaving}
                          style={[styles.fixPlayerRow, name === (ev.penalty_type || '') && styles.fixPlayerRowCurrent]}
                          onPress={() => submitPenReq(name)}>
                          <Text style={styles.fixPlayerName} maxFontSizeMultiplier={1.3}>{name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : penReq.type === 'minutes' ? (
                    <View style={styles.fixFieldRow}>
                      {MINUTES.map(([label, val]) => (
                        <TouchableOpacity key={val} disabled={penSaving}
                          style={[styles.fixFieldBtn, String(ev.penalty_minutes ?? '') === val && styles.fixFieldBtnActive]}
                          onPress={() => submitPenReq(val)}>
                          <Text style={styles.fixFieldText} maxFontSizeMultiplier={1.2}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : penReq.type === 'remove' ? (
                    <TouchableOpacity style={styles.penRemoveBtn} disabled={penSaving} onPress={() => submitPenReq('')}>
                      <Text style={styles.penRemoveText} maxFontSizeMultiplier={1.2}>{penSaving ? 'Sending...' : 'Request Removal'}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.fixCancel} onPress={() => setPenReq(null)}>
                    <Text style={styles.fixCancelText} maxFontSizeMultiplier={1.2}>{penSaving ? 'Sending...' : 'Cancel'}</Text>
                  </TouchableOpacity>
                </>
              );
            })() : null}
          </View>
        </View>
      </Modal>
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
  fixHint: { fontSize: 11, color: '#7a8aa0', paddingHorizontal: 10, paddingVertical: 6 },
  penNote: { borderWidth: 1, borderColor: '#dbe3ec', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: '#1d2a3d', marginBottom: 10 },
  penRemoveBtn: { backgroundColor: '#b91c1c', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  penRemoveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  fixBackdrop: { flex: 1, backgroundColor: 'rgba(0,25,50,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  fixCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, width: '100%', maxWidth: 380 },
  fixTitle: { fontSize: 17, color: colors.navy, fontWeight: '800', textAlign: 'center' },
  fixSub: { fontSize: 13, color: '#5b6b80', textAlign: 'center', marginTop: 2 },
  fixFieldRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  fixFieldBtn: { flex: 1, borderRadius: 9, borderWidth: 1, borderColor: '#cfd9e5', paddingVertical: 8, alignItems: 'center' },
  fixFieldBtnActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  fixFieldText: { fontSize: 12.5, color: '#45566c', fontWeight: '700' },
  fixFieldTextActive: { color: '#fff' },
  fixPrompt: { fontSize: 13, color: '#334457', marginTop: 12, marginBottom: 6, fontWeight: '600' },
  fixPlayerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#eef2f6' },
  fixPlayerRowCurrent: { backgroundColor: '#eef7fd' },
  fixPlayerNum: { width: 40, fontSize: 14, color: colors.navy, fontWeight: '800' },
  fixPlayerName: { flex: 1, fontSize: 14, color: '#22384f' },
  fixCancel: { marginTop: 12, borderRadius: 10, borderWidth: 1, borderColor: '#cfd9e5', paddingVertical: 11, alignItems: 'center' },
  fixCancelText: { fontSize: 14, color: '#5b6b80', fontWeight: '700' },
});
