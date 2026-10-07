import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Share, Alert, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts, spacing } from '../constants/theme';
import { authFetch } from '../services/auth';

/**
 * Tournament Director tools: check-in, scorekeeper PINs, champions photos,
 * rink addresses, team codes. Each screen shares the same event picker.
 */

interface DirEvent { id: string; name: string; start_date: string; city?: string; state?: string; }

function useDirectorEvents() {
  const [events, setEvents] = useState<DirEvent[]>([]);
  const [selected, setSelected] = useState<DirEvent | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    authFetch('/api/scoring/director-events')
      .then(r => r.json())
      .then((j: any) => {
        if (j.success) {
          setEvents(j.data || []);
          if (j.data?.length) setSelected(j.data[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return { events, selected, setSelected, loading };
}

function Header({ title, subtitle, navigation }: { title: string; subtitle?: string; navigation: any }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
        <Ionicons name="chevron-back" size={24} color={colors.white} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle}>{title}</Text>
        {subtitle ? <Text style={s.headerSub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function EventPills({ events, selected, onSelect }: { events: DirEvent[]; selected: DirEvent | null; onSelect: (e: DirEvent) => void }) {
  if (events.length <= 1) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pillScroll} contentContainerStyle={s.pillRow}>
      {events.map(ev => (
        <TouchableOpacity key={ev.id} style={[s.pill, selected?.id === ev.id && s.pillActive]} onPress={() => onSelect(ev)}>
          <Text style={[s.pillText, selected?.id === ev.id && s.pillTextActive]}>{ev.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────
// 1. Team Check-in
// ─────────────────────────────────────────────────────────
export function DirectorCheckinScreen({ navigation }: any) {
  const { events, selected, setSelected, loading } = useDirectorEvents();
  const [teams, setTeams] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!selected) return;
    try {
      const res = await authFetch(`/api/registrations/admin/checkin/${selected.id}`);
      const json = await res.json() as any;
      if (json.success) setTeams(json.data.teams || json.data || []);
    } catch {}
    setRefreshing(false);
  }, [selected]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (reg: any) => {
    setBusy(reg.id);
    try {
      await authFetch(`/api/registrations/admin/checkin/${selected!.id}/toggle/${reg.id}`, { method: 'POST' });
      await load();
    } catch {}
    setBusy(null);
  };

  const checkedCount = teams.filter(t => t.checked_in_at).length;
  const byAge: Record<string, any[]> = {};
  for (const t of teams) { const k = t.age_group || 'Other'; (byAge[k] = byAge[k] || []).push(t); }

  return (
    <View style={s.screen}>
      <Header title="Team Check-in" subtitle={`${checkedCount} of ${teams.length} teams checked in`} navigation={navigation} />
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} /> : (
        <ScrollView contentContainerStyle={s.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy]} />}>
          {Object.entries(byAge).map(([age, list]) => (
            <View key={age} style={{ marginBottom: spacing.md }}>
              <Text style={s.sectionLabel}>{age}</Text>
              {list.map(t => (
                <TouchableOpacity key={t.id} style={s.rowCard} activeOpacity={0.7} disabled={busy === t.id} onPress={() => toggle(t)}>
                  <View style={[s.checkCircle, t.checked_in_at ? s.checkCircleOn : null]}>
                    {busy === t.id
                      ? <ActivityIndicator size="small" color={t.checked_in_at ? colors.white : colors.navy} />
                      : <Ionicons name={t.checked_in_at ? 'checkmark' : 'ellipse-outline'} size={t.checked_in_at ? 18 : 16} color={t.checked_in_at ? colors.white : '#9aa7ba'} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{t.display_name || t.team_name}</Text>
                    <Text style={s.rowSub} numberOfLines={1}>
                      {t.checked_in_at ? `Checked in ${String(t.checked_in_at).slice(5, 16)}` : 'Not checked in'}
                      {t.missing_roster ? '  ·  NO ROSTER' : ''}
                      {t.balance_cents > 0 ? `  ·  owes $${(t.balance_cents / 100).toLocaleString()}` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))}
          {teams.length === 0 && <Text style={s.empty}>No approved teams yet.</Text>}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// 2. Scorekeeper PINs
// ─────────────────────────────────────────────────────────
export function DirectorPinsScreen({ navigation }: any) {
  const { events, selected, setSelected, loading } = useDirectorEvents();
  const [pins, setPins] = useState<any[]>([]);

  useEffect(() => {
    if (!selected) return;
    authFetch(`/api/scoring/events/${selected.id}/pins`)
      .then(r => r.json())
      .then((j: any) => { if (j.success) setPins(j.data || []); })
      .catch(() => {});
  }, [selected]);

  const copyPin = async (pin: string) => {
    await Clipboard.setStringAsync(pin);
    Alert.alert('Copied', `PIN ${pin} copied to clipboard.`);
  };

  return (
    <View style={s.screen}>
      <Header title="Scorekeeper PINs" subtitle="Tap a PIN to copy it" navigation={navigation} />
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} /> : (
        <ScrollView contentContainerStyle={s.body}>
          {pins.map(p => (
            <TouchableOpacity key={p.id} style={s.pinCard} activeOpacity={0.8} onPress={() => copyPin(String(p.pin_code))}>
              <View style={{ flex: 1 }}>
                <Text style={s.pinLabel}>{p.label || p.rink_name || 'Event PIN'}</Text>
                <Text style={s.pinCode}>{p.pin_code}</Text>
              </View>
              <Ionicons name="copy-outline" size={22} color={colors.cyan} />
            </TouchableOpacity>
          ))}
          {pins.length === 0 && <Text style={s.empty}>No scorekeeper PINs set for this event yet. PINs are created in the admin panel under Scorekeepers.</Text>}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// 3. Championship Photos
// ─────────────────────────────────────────────────────────
export function DirectorChampionsScreen({ navigation }: any) {
  const { events, selected, setSelected, loading } = useDirectorEvents();
  const [teams, setTeams] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posted, setPosted] = useState<any[]>([]);

  const load = useCallback(() => {
    if (!selected) return;
    fetch(`https://uht.chad-157.workers.dev/api/scoring/events/${selected.id}/standings`)
      .then(r => r.json())
      .then((j: any) => { if (j.success) setTeams((j.data || []).filter((r: any) => !String(r.team_id).startsWith('ph:'))); })
      .catch(() => {});
    fetch(`https://uht.chad-157.workers.dev/api/photos/events/${selected.id}/photos?kind=champion`)
      .then(r => r.json())
      .then((j: any) => { if (j.success) setPosted(j.data.photos || []); })
      .catch(() => {});
  }, [selected]);
  useEffect(load, [load]);

  const upload = async (team: any) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      setUploading(true);
      const res = await authFetch(`/api/photos/events/${selected!.id}/photos`, {
        method: 'POST',
        body: JSON.stringify({ data: result.assets[0].base64, mimeType: 'image/jpeg', kind: 'champion', teamId: team.team_id }),
      });
      const json = await res.json() as any;
      setUploading(false);
      if (json.success) { load(); Alert.alert('Posted!', `${team.team_name} champions photo is live in the gallery.`); }
      else Alert.alert('Upload Failed', json.error || 'Please try again.');
    } catch { setUploading(false); }
  };

  const postedTeamIds = new Set(posted.map(p => p.team_id));

  return (
    <View style={s.screen}>
      <Header title="Championship Photos" subtitle="Tap the winning team, then pick their photo" navigation={navigation} />
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} /> : (
        <ScrollView contentContainerStyle={s.body}>
          {uploading && <ActivityIndicator style={{ marginBottom: 10 }} color={colors.navy} />}
          {teams.map((t: any) => (
            <TouchableOpacity key={t.team_id} style={s.rowCard} activeOpacity={0.7} disabled={uploading} onPress={() => upload(t)}>
              <Text style={s.trophy}>🏆</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{t.team_name}</Text>
                <Text style={s.rowSub}>{[t.age_group, t.division_level].filter(Boolean).join(' ')}</Text>
              </View>
              {postedTeamIds.has(t.team_id) && (
                <View style={s.postedBadge}><Text style={s.postedBadgeText}>POSTED</Text></View>
              )}
            </TouchableOpacity>
          ))}
          {teams.length === 0 && <Text style={s.empty}>Teams appear once the schedule is uploaded.</Text>}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// 4. Rink Addresses
// ─────────────────────────────────────────────────────────
export function DirectorRinksScreen({ navigation }: any) {
  const { events, selected, setSelected, loading } = useDirectorEvents();
  const [venues, setVenues] = useState<any[]>([]);

  useEffect(() => {
    if (!selected) return;
    fetch(`https://uht.chad-157.workers.dev/api/events/${selected.id}`)
      .then(r => r.json())
      .then((j: any) => { if (j.success) setVenues(j.data.venues || []); })
      .catch(() => {});
  }, [selected]);

  const shareVenue = async (v: any) => {
    const addr = [v.address, v.city, v.state].filter(Boolean).join(', ');
    const maps = `https://maps.apple.com/?q=${encodeURIComponent(`${v.venue_name} ${addr}`)}`;
    try {
      await Share.share({ message: `${v.venue_name}\n${addr}\n${maps}` });
    } catch {}
  };

  const copyVenue = async (v: any) => {
    const addr = [v.address, v.city, v.state].filter(Boolean).join(', ');
    await Clipboard.setStringAsync(`${v.venue_name} - ${addr}`);
    Alert.alert('Copied', 'Address copied to clipboard.');
  };

  return (
    <View style={s.screen}>
      <Header title="Rink Addresses" subtitle="Share directions with parents in one tap" navigation={navigation} />
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} /> : (
        <ScrollView contentContainerStyle={s.body}>
          {venues.map((v: any) => (
            <View key={v.venue_id || v.venue_name} style={s.venueCard}>
              <Text style={s.rowTitle}>{v.venue_name}</Text>
              <Text style={s.rowSub}>{[v.address, v.city, v.state].filter(Boolean).join(', ') || 'No address on file'}</Text>
              {v.rinks?.length ? (
                <Text style={s.venueRinks}>{v.rinks.map((r: any) => r.name).join('  ·  ')}</Text>
              ) : null}
              <View style={s.venueBtnRow}>
                <TouchableOpacity style={s.venueBtn} onPress={() => shareVenue(v)}>
                  <Ionicons name="share-outline" size={15} color={colors.white} />
                  <Text style={s.venueBtnText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.venueBtn, s.venueBtnLight]} onPress={() => copyVenue(v)}>
                  <Ionicons name="copy-outline" size={15} color={colors.navy} />
                  <Text style={[s.venueBtnText, { color: colors.navy }]}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {venues.length === 0 && <Text style={s.empty}>No venues attached to this event yet.</Text>}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// 5. Team Codes
// ─────────────────────────────────────────────────────────
export function DirectorTeamCodesScreen({ navigation }: any) {
  const { events, selected, setSelected, loading } = useDirectorEvents();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!selected) return;
    authFetch(`/api/scoring/events/${selected.id}/team-codes`)
      .then(r => r.json())
      .then((j: any) => { if (j.success) setRows(j.data || []); })
      .catch(() => {});
  }, [selected]);

  const copyCode = async (row: any) => {
    const code = row.parent_invite_code || row.invite_code;
    if (!code) return;
    await Clipboard.setStringAsync(code);
    Alert.alert('Copied', `${row.team_name} code ${code} copied.`);
  };

  const byAge: Record<string, any[]> = {};
  for (const r of rows) {
    const k = [r.age_group, r.division_level].filter(Boolean).join(' ') || 'Other';
    (byAge[k] = byAge[k] || []).push(r);
  }

  return (
    <View style={s.screen}>
      <Header title="Team Codes" subtitle="Tap a code to copy it for a parent" navigation={navigation} />
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} /> : (
        <ScrollView contentContainerStyle={s.body}>
          {Object.entries(byAge).map(([div, list]) => (
            <View key={div} style={{ marginBottom: spacing.md }}>
              <Text style={s.sectionLabel}>{div}</Text>
              {list.map((r, i) => (
                <TouchableOpacity key={`${r.team_name}-${i}`} style={s.rowCard} activeOpacity={0.7} onPress={() => copyCode(r)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{r.team_name}</Text>
                  </View>
                  {(r.parent_invite_code || r.invite_code) ? (
                    <View style={s.codeChip}><Text style={s.codeChipText}>{r.parent_invite_code || r.invite_code}</Text></View>
                  ) : (
                    <Text style={s.rowSub}>no code</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
          {rows.length === 0 && <Text style={s.empty}>No approved teams yet.</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0a2240', paddingHorizontal: spacing.md, paddingBottom: 14 },
  backBtn: { padding: 4 },
  headerTitle: { color: colors.white, fontSize: 19, ...fonts.bold },
  headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 1 },
  pillScroll: { maxHeight: 54, backgroundColor: colors.bg },
  pillRow: { paddingHorizontal: spacing.lg, paddingVertical: 10, gap: 8 },
  pill: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#e9eef5' },
  pillActive: { backgroundColor: colors.navy },
  pillText: { fontSize: 12.5, color: '#5b6b83', ...fonts.semibold },
  pillTextActive: { color: colors.white },
  body: { padding: spacing.lg, paddingBottom: 60 },
  sectionLabel: { fontSize: 11, color: '#7a8699', letterSpacing: 1.2, ...fonts.bold, textTransform: 'uppercase', marginBottom: 6 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 14, padding: 13, marginBottom: 8, shadowColor: '#0f2747', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  rowTitle: { fontSize: 15, color: '#101c30', ...fonts.semibold },
  rowSub: { fontSize: 12, color: '#7a8699', marginTop: 1 },
  checkCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#eef2f7', alignItems: 'center', justifyContent: 'center' },
  checkCircleOn: { backgroundColor: '#1e9e55' },
  empty: { textAlign: 'center', color: '#7a8699', fontSize: 14, marginTop: 30, lineHeight: 20 },
  pinCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.navy, borderRadius: 16, padding: 18, marginBottom: 10 },
  pinLabel: { color: colors.cyan, fontSize: 11, letterSpacing: 1.2, ...fonts.bold, textTransform: 'uppercase' },
  pinCode: { color: colors.white, fontSize: 32, letterSpacing: 6, marginTop: 2, ...fonts.bold },
  trophy: { fontSize: 22 },
  postedBadge: { backgroundColor: '#eaf8f0', borderWidth: 1, borderColor: '#bfe6cd', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  postedBadgeText: { color: '#1e7a44', fontSize: 10, ...fonts.bold },
  venueCard: { backgroundColor: colors.white, borderRadius: 14, padding: 15, marginBottom: 10, shadowColor: '#0f2747', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  venueRinks: { fontSize: 12, color: colors.navy, ...fonts.semibold, marginTop: 5 },
  venueBtnRow: { flexDirection: 'row', gap: 8, marginTop: 11 },
  venueBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.navy, borderRadius: 10, paddingVertical: 9 },
  venueBtnLight: { backgroundColor: '#eef2f7' },
  venueBtnText: { color: colors.white, fontSize: 13, ...fonts.semibold },
  codeChip: { backgroundColor: '#f0f7ff', borderWidth: 1, borderColor: '#bcd9f5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  codeChipText: { color: colors.navy, fontSize: 14, letterSpacing: 2, ...fonts.bold },
});
