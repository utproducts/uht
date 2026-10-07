import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Share, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts, spacing } from '../constants/theme';
import { authFetch } from '../services/auth';
import ScreenHeader from '../components/ScreenHeader';

/**
 * Tournament Director tools: check-in, scorekeeper PINs, champions photos,
 * rink addresses, team codes. Each screen shares the same event picker.
 */

const SCORING_URL = 'https://ultimatetournaments.com/scoring';

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
  return (
    <>
      <ScreenHeader title={title} showBack onBack={() => navigation.goBack()} />
      {subtitle ? <Text style={s.headerSubLine}>{subtitle}</Text> : null}
    </>
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
                <TouchableOpacity key={t.id} style={[s.rowCard, (t.missing_roster || t.balance_cents > 0) ? s.rowCardAlert : null]} activeOpacity={0.7} disabled={busy === t.id} onPress={() => toggle(t)}>
                  <View style={[s.checkCircle, t.checked_in_at ? s.checkCircleOn : null]}>
                    {busy === t.id
                      ? <ActivityIndicator size="small" color={t.checked_in_at ? colors.white : colors.navy} />
                      : <Ionicons name={t.checked_in_at ? 'checkmark' : 'ellipse-outline'} size={t.checked_in_at ? 18 : 16} color={t.checked_in_at ? colors.white : '#9aa7ba'} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{t.display_name || t.team_name}</Text>
                    <Text style={s.rowSub} numberOfLines={1}>
                      {t.checked_in_at ? `Checked in ${String(t.checked_in_at).slice(5, 16)}` : 'Not checked in'}
                    </Text>
                    {(t.missing_roster || t.balance_cents > 0) ? (
                      <Text style={s.rowAlertText} numberOfLines={1}>
                        {[t.missing_roster ? 'NO ROSTER' : null, t.balance_cents > 0 ? `OWES $${(t.balance_cents / 100).toLocaleString()}` : null].filter(Boolean).join('  ·  ')}
                      </Text>
                    ) : null}
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

  const sharePin = async (p: any) => {
    const label = p.label || p.rink_name || 'the event';
    try {
      await Share.share({
        message: `Scorekeeping for ${selected?.name || 'the event'} (${label}):\n\n1. Open ${SCORING_URL}\n2. Enter PIN: ${p.pin_code}\n\nThat opens your assigned games.`,
      });
    } catch {}
  };

  const shareScoringLink = async () => {
    try {
      await Share.share({ message: `UHT scorekeeper console: ${SCORING_URL} - enter your PIN to see your games.` });
    } catch {}
  };

  return (
    <View style={s.screen}>
      <Header title="Scorekeeper PINs" subtitle="Tap a PIN to copy it" navigation={navigation} />
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} /> : (
        <ScrollView contentContainerStyle={s.body}>
          <TouchableOpacity style={s.scoringLinkRow} activeOpacity={0.8} onPress={shareScoringLink}>
            <Ionicons name="link-outline" size={18} color={colors.navy} />
            <View style={{ flex: 1 }}>
              <Text style={s.scoringLinkTitle}>Scoring page</Text>
              <Text style={s.scoringLinkUrl}>{SCORING_URL}</Text>
            </View>
            <Ionicons name="share-outline" size={19} color={colors.navy} />
          </TouchableOpacity>
          {pins.map(p => (
            <View key={p.id} style={s.pinCard}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.8} onPress={() => copyPin(String(p.pin_code))}>
                <Text style={s.pinLabel}>{p.label || p.rink_name || 'Event PIN'}</Text>
                <Text style={s.pinCode}>{p.pin_code}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.pinIconBtn} onPress={() => copyPin(String(p.pin_code))}>
                <Ionicons name="copy-outline" size={21} color={colors.cyan} />
              </TouchableOpacity>
              <TouchableOpacity style={s.pinIconBtn} onPress={() => sharePin(p)}>
                <Ionicons name="share-outline" size={21} color={colors.cyan} />
              </TouchableOpacity>
            </View>
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

  // Division label like the standings page: real event division first,
  // else the registration age with "(8U)" style noise stripped
  const divLabel = (r: any) => {
    if (r.ed_age) return [r.ed_age, r.ed_level].filter(Boolean).join(' ');
    return String(r.raw_age || 'Other').replace(/\s*\([^)]*\)/g, '').trim() || 'Other';
  };
  const AGE_ORDER = ['mite', 'squirt', 'pee wee', 'peewee', 'bantam', 'midget', 'girls'];
  const ageKey = (label: string) => {
    const l = label.toLowerCase();
    const i = AGE_ORDER.findIndex(a => l.startsWith(a));
    return i === -1 ? 999 : i;
  };
  const byDiv: Record<string, any[]> = {};
  for (const r of rows) { const k = divLabel(r); (byDiv[k] = byDiv[k] || []).push(r); }
  const divEntries = Object.entries(byDiv).sort((a, b) => ageKey(a[0]) - ageKey(b[0]) || a[0].localeCompare(b[0]));

  return (
    <View style={s.screen}>
      <Header title="Team Codes" subtitle="Tap a code to copy it for a parent" navigation={navigation} />
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} /> : (
        <ScrollView contentContainerStyle={s.body}>
          {divEntries.map(([div, list]) => (
            <View key={div} style={s.divCard}>
              <View style={s.divCardHeader}>
                <Text style={s.divCardTitle}>{div}</Text>
                <Text style={s.divCardSub}>{list.length} team{list.length !== 1 ? 's' : ''}</Text>
              </View>
              {list.sort((a: any, b: any) => String(a.team_name).localeCompare(String(b.team_name))).map((r: any, i: number) => (
                <TouchableOpacity key={`${r.team_name}-${i}`}
                  style={[s.divRow, i === list.length - 1 ? s.divRowLast : null]}
                  activeOpacity={0.7} onPress={() => copyCode(r)}>
                  <Text style={[s.rowTitle, { flex: 1, marginRight: 8 }]} numberOfLines={1}>{r.team_name}</Text>
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

// ─────────────────────────────────────────────────────────
// 6. Locker Room Assignments
// ─────────────────────────────────────────────────────────
export function DirectorLockerRoomsScreen({ navigation }: any) {
  const { events, selected, setSelected, loading } = useDirectorEvents();
  const [games, setGames] = useState<any[]>([]);
  const [venueRooms, setVenueRooms] = useState<Record<string, string[]>>({});
  const [selVenue, setSelVenue] = useState<string | null>(null);
  const [selRink, setSelRink] = useState<string | null>(null);
  const [selDay, setSelDay] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ game: any; side: 'home' | 'away' } | null>(null);
  const [pushing, setPushing] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!selected) return;
    fetch(`https://uht.chad-157.workers.dev/api/scoring/events/${selected.id}/games`)
      .then(r => r.json())
      .then((j: any) => { if (j.success) setGames(j.data || []); })
      .catch(() => {});
    fetch(`https://uht.chad-157.workers.dev/api/scoring/events/${selected.id}/locker-rooms`)
      .then(r => r.json())
      .then((j: any) => {
        if (!j.success) return;
        const map: Record<string, string[]> = {};
        for (const lr of j.data || []) {
          if (!lr.venue_id) continue;
          if (!map[lr.venue_id]) map[lr.venue_id] = [];
          if (!map[lr.venue_id].includes(lr.name)) map[lr.venue_id].push(lr.name);
        }
        setVenueRooms(map);
      })
      .catch(() => {});
  }, [selected]);
  useEffect(() => { setSelVenue(null); setSelRink(null); setSelDay(null); load(); }, [load]);

  const venues = Array.from(new Map(games.filter(g => g.venue_id).map(g => [g.venue_id, g.venue_name])).entries());
  const activeVenue = selVenue || (venues[0]?.[0] ?? null);
  const rinks = Array.from(new Map(games.filter(g => g.venue_id === activeVenue && g.rink_id).map(g => [g.rink_id, g.rink_name])).entries());
  const activeRink = selRink && rinks.some(r => r[0] === selRink) ? selRink : (rinks[0]?.[0] ?? null);
  const rinkGames = games.filter(g => g.venue_id === activeVenue && g.rink_id === activeRink);
  const days = Array.from(new Set(rinkGames.map(g => String(g.start_time || '').slice(0, 10)).filter(Boolean))).sort();
  const today = new Date().toISOString().slice(0, 10);
  const activeDay = selDay && days.includes(selDay) ? selDay : (days.includes(today) ? today : days[0] || null);
  const dayGames = rinkGames.filter(g => String(g.start_time || '').slice(0, 10) === activeDay)
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));

  const fmtTime = (t: string) => {
    const d = new Date(String(t).includes(' ') ? String(t).replace(' ', 'T') : t);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const fmtDay = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const saveRoom = async (game: any, side: 'home' | 'away', room: string | null) => {
    setSheet(null);
    const body = {
      home_locker_room: side === 'home' ? room : (game.home_locker_room || null),
      away_locker_room: side === 'away' ? room : (game.away_locker_room || null),
    };
    setGames(prev => prev.map(g => g.id === game.id ? { ...g, [`${side}_locker_room`]: room } : g));
    try {
      await authFetch(`/api/push/games/${game.id}/locker-rooms`, { method: 'PATCH', body: JSON.stringify(body) });
    } catch {
      Alert.alert('Save failed', 'Please try again.');
      load();
    }
  };

  const sendPush = async (game: any) => {
    setPushing(game.id);
    try {
      const res = await authFetch('/api/push/send-locker-room', { method: 'POST', body: JSON.stringify({ game_id: game.id }) });
      const json = await res.json() as any;
      Alert.alert(json.success ? 'Push Sent' : 'Push Failed', json.success ? `Locker rooms sent to ${json.data?.sent ?? 0} device(s).` : (json.error || 'Try again.'));
    } catch { Alert.alert('Push Failed', 'Try again.'); }
    setPushing(null);
  };

  const roomsForVenue = activeVenue ? (venueRooms[activeVenue] || []) : [];

  return (
    <View style={s.screen}>
      <Header title="Locker Rooms" subtitle="Pick a venue and rink, then assign rooms per game" navigation={navigation} />
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} /> : (
        <ScrollView contentContainerStyle={s.body}>
          {venues.length > 1 && (
            <View style={s.chipWrap}>
              {venues.map(([id, name]) => (
                <TouchableOpacity key={id} style={[s.pill, activeVenue === id && s.pillActive]} onPress={() => { setSelVenue(id as string); setSelRink(null); }}>
                  <Text style={[s.pillText, activeVenue === id && s.pillTextActive]}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {rinks.length > 1 && (
            <View style={s.chipWrap}>
              {rinks.map(([id, name]) => (
                <TouchableOpacity key={id} style={[s.pill, activeRink === id && s.pillActive]} onPress={() => setSelRink(id as string)}>
                  <Text style={[s.pillText, activeRink === id && s.pillTextActive]}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {days.length > 1 && (
            <View style={s.chipWrap}>
              {days.map(d => (
                <TouchableOpacity key={d} style={[s.pill, activeDay === d && s.pillActive]} onPress={() => setSelDay(d)}>
                  <Text style={[s.pillText, activeDay === d && s.pillTextActive]}>{fmtDay(d)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {dayGames.map(g => (
            <View key={g.id} style={s.lrCard}>
              <View style={s.lrTopRow}>
                <Text style={s.lrTime}>{fmtTime(g.start_time)}  ·  #{g.game_number}</Text>
                {(g.home_locker_room || g.away_locker_room) ? (
                  <TouchableOpacity style={s.lrPushBtn} disabled={pushing === g.id} onPress={() => sendPush(g)}>
                    <Ionicons name="notifications-outline" size={13} color={colors.white} />
                    <Text style={s.lrPushText}>{pushing === g.id ? 'Sending...' : 'Push'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {(['home', 'away'] as const).map(side => (
                <View key={side} style={s.lrSideRow}>
                  <Text style={s.lrSideLabel}>{side === 'home' ? 'HOME' : 'AWAY'}</Text>
                  <Text style={s.lrTeam} numberOfLines={1}>{side === 'home' ? (g.home_team_name || 'TBD') : (g.away_team_name || 'TBD')}</Text>
                  <TouchableOpacity style={[s.lrRoomBtn, (side === 'home' ? g.home_locker_room : g.away_locker_room) ? s.lrRoomBtnSet : null]}
                    onPress={() => setSheet({ game: g, side })}>
                    <Text style={[s.lrRoomText, (side === 'home' ? g.home_locker_room : g.away_locker_room) ? s.lrRoomTextSet : null]}>
                      {(side === 'home' ? g.home_locker_room : g.away_locker_room) || 'Assign'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))}
          {dayGames.length === 0 && <Text style={s.empty}>No games at this rink{activeDay ? ' on this day' : ''}.</Text>}
        </ScrollView>
      )}

      <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <View style={s.sheetBackdrop}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>
              {sheet ? `${sheet.side === 'home' ? 'Home' : 'Away'} locker - ${sheet.side === 'home' ? (sheet.game.home_team_name || 'TBD') : (sheet.game.away_team_name || 'TBD')}` : ''}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {roomsForVenue.map(room => (
                <TouchableOpacity key={room} style={s.sheetRow} onPress={() => sheet && saveRoom(sheet.game, sheet.side, room)}>
                  <Ionicons name="lock-closed-outline" size={16} color={colors.navy} />
                  <Text style={s.sheetRowText}>{room}</Text>
                </TouchableOpacity>
              ))}
              {roomsForVenue.length === 0 && (
                <Text style={s.empty}>No locker rooms defined for this venue yet. Add them on the admin Venues page, or use Custom below.</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={s.sheetRow} onPress={() => {
              if (!sheet) return;
              const target = sheet;
              setSheet(null);
              Alert.prompt('Custom room', 'Type the locker room name', (text) => {
                if (text && text.trim()) saveRoom(target.game, target.side, text.trim());
              });
            }}>
              <Ionicons name="create-outline" size={16} color={colors.navy} />
              <Text style={s.sheetRowText}>Custom...</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetRow} onPress={() => sheet && saveRoom(sheet.game, sheet.side, null)}>
              <Ionicons name="close-circle-outline" size={16} color="#c0392b" />
              <Text style={[s.sheetRowText, { color: '#c0392b' }]}>Clear assignment</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetCancel} onPress={() => setSheet(null)}>
              <Text style={s.sheetCancelText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerSubLine: { color: '#5b6b83', fontSize: 12, ...fonts.semibold, paddingHorizontal: spacing.lg, paddingTop: 10 },
  rowCardAlert: { backgroundColor: '#fdf0f0', borderWidth: 1.5, borderColor: '#f1b3b3' },
  rowAlertText: { color: '#c0392b', fontSize: 11.5, ...fonts.bold, marginTop: 2, letterSpacing: 0.3 },
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
  scoringLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f0f7ff', borderWidth: 1, borderColor: '#bcd9f5', borderRadius: 12, padding: 13, marginBottom: 12 },
  scoringLinkTitle: { fontSize: 13, color: colors.navy, ...fonts.bold },
  scoringLinkUrl: { fontSize: 12, color: '#3b6b9b', marginTop: 1 },
  pinIconBtn: { padding: 8 },
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
  divCard: { backgroundColor: colors.white, borderRadius: 14, overflow: 'hidden', marginBottom: 14, shadowColor: '#0f2747', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  divCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.navy, paddingHorizontal: 14, paddingVertical: 10 },
  divCardTitle: { color: colors.white, fontSize: 14, ...fonts.bold },
  divCardSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, ...fonts.semibold },
  divRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f0f2f5' },
  divRowLast: { borderBottomWidth: 0 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  lrCard: { backgroundColor: colors.white, borderRadius: 14, padding: 13, marginBottom: 10, shadowColor: '#0f2747', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  lrTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  lrTime: { fontSize: 12, color: '#7a8699', ...fonts.bold, textTransform: 'uppercase', letterSpacing: 0.4 },
  lrPushBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1e9e55', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  lrPushText: { color: colors.white, fontSize: 11, ...fonts.bold },
  lrSideRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  lrSideLabel: { width: 42, fontSize: 10, color: '#9aa7ba', ...fonts.bold, letterSpacing: 0.5 },
  lrTeam: { flex: 1, fontSize: 13.5, color: '#101c30', ...fonts.semibold },
  lrRoomBtn: { borderWidth: 1, borderColor: '#cfd8e3', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 6, minWidth: 84, alignItems: 'center' },
  lrRoomBtnSet: { backgroundColor: '#f0f7ff', borderColor: '#8fc1eb' },
  lrRoomText: { fontSize: 12.5, color: '#7a8699', ...fonts.semibold },
  lrRoomTextSet: { color: colors.navy, ...fonts.bold },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
  sheetTitle: { fontSize: 16, color: '#101c30', ...fonts.bold, marginBottom: 10 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f2f5' },
  sheetRowText: { fontSize: 15, color: '#101c30', ...fonts.semibold },
  sheetCancel: { marginTop: 14, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#eef2f7' },
  sheetCancelText: { fontSize: 15, color: '#101c30', ...fonts.bold },
  codeChip: { backgroundColor: '#f0f7ff', borderWidth: 1, borderColor: '#bcd9f5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  codeChipText: { color: colors.navy, fontSize: 14, letterSpacing: 2, ...fonts.bold },
});
