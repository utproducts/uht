import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Image,
  Linking,
  Dimensions,
  Share,
  Modal,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import SignaturePad, { serializeStrokes, Stroke } from '../components/SignaturePad';
import { getEventDetail, getEventSchedule, getEventScores, getEventStandings, getMyTeamIds } from '../services/api';
import { getUser, User, authFetch } from '../services/auth';
import { API_URL } from '../constants/api';
import { HeicConverterHost, convertIfHeic, processChampionPhoto } from '../utils/heicConvert';
import { sortByAgeGroup, getOrderedAgeGroups, ageGroupSortKey } from '../utils/ageGroups';

// ==================
// Tab configuration matching USSSA layout
// ==================
type TabKey =
  | 'info'
  | 'merchandise'
  | 'my_schedule'
  | 'game_center'
  | 'three_stars'
  | 'photos'
  | 'updates'
  | 'promotions'
  | 'venues'
  | 'lodging'
  | 'whos_coming'
  | 'contact';

interface TabDef {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const EVENT_TABS: TabDef[] = [
  { key: 'info', label: 'Event Info', icon: 'information-circle-outline' },
  { key: 'my_schedule', label: 'My Schedule', icon: 'calendar-outline' },
  { key: 'game_center', label: 'Game Center', icon: 'trophy-outline' },
  { key: 'three_stars', label: '3 Stars', icon: 'star-outline' },
  { key: 'photos', label: 'Photos', icon: 'images-outline' },
  { key: 'venues', label: 'Venues', icon: 'location-outline' },
  { key: 'lodging', label: 'Lodging', icon: 'bed-outline' },
  { key: 'updates', label: 'Event Updates', icon: 'notifications-outline' },
  { key: 'promotions', label: 'Promotions', icon: 'star-outline' },
  { key: 'whos_coming', label: "Who's Coming", icon: 'people-outline' },
  { key: 'merchandise', label: 'Merchandise', icon: 'cart-outline' },
  { key: 'contact', label: 'Contact', icon: 'mail-outline' },
];

// ==================
// Interfaces
// ==================
interface GameSlot {
  game_type?: string;
  id: string;
  time?: string;
  date?: string;
  start_time?: string;
  rink_name?: string;
  rink?: string;
  home_team_id?: string;
  away_team_id?: string;
  home_team_name?: string;
  away_team_name?: string;
  home_team?: string;
  away_team?: string;
  home_team_logo?: string;
  away_team_logo?: string;
  home_score?: number | null;
  away_score?: number | null;
  division_name?: string;
  three_stars_str?: string;
  period?: number;
  announcement?: string;
  age_group?: string;
  division_level?: string;
  event_division_id?: string;
  home_locker_room?: string;
  away_locker_room?: string;
  status?: string;
  delay_minutes?: number;
  is_overtime?: number;
  is_shootout?: number;
  delay_note?: string;
  venue_name?: string;
  round?: string;
  pool_name?: string;
  bracket_round?: string;
  game_number?: number;
}

interface ScoreGame {
  id: string;
  game_number?: number;
  start_time?: string;
  home_team_name?: string;
  away_team_name?: string;
  home_team_logo?: string;
  away_team_logo?: string;
  home_score: number;
  away_score: number;
  status: string;
  rink_name?: string;
  venue_name?: string;
  age_group?: string;
  division_level?: string;
  period?: number;
  is_overtime?: number;
  is_shootout?: number;
}

interface StandingEntry {
  team_id: string;
  team_name: string;
  team_logo?: string;
  age_group: string;
  division_level: string;
  pool_name?: string;
  event_division_id: string;
  games_played: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  goals_for: number;
  goals_against: number;
  goal_differential: number;
}

interface VenueRink {
  id: string;
  name: string;
  surface_type?: string;
}

interface EventVenue {
  venue_id: string;
  venue_name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  rinks?: VenueRink[];
}

interface EventHotel {
  id: string;
  hotel_name: string;
  city?: string;
  state?: string;
  rate_description?: string;
  booking_url?: string;
  price_per_night?: number;
  image_url?: string;
}

interface RegisteredTeam {
  team_name: string;
  city?: string;
  state?: string;
  org_name?: string;
  age_group?: string;
  division_level?: string;
}

interface EventDivision {
  id: string;
  age_group: string;
  division_level?: string;
  price_cents?: number;
  game_format?: string;
  period_length_minutes?: number;
  num_periods?: number;
}

interface EventInfo {
  id: string;
  name: string;
  slug?: string;
  logo_url?: string;
  banner_url?: string;
  city?: string;
  state?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  information?: string;
  status?: string;
  age_groups?: string;
  venues?: EventVenue[];
  hotels?: EventHotel[];
  registered_teams?: RegisteredTeam[];
  divisions?: EventDivision[];
  price_min_cents?: number;
  price_max_cents?: number;
}

interface NavEventParam {
  logo_url?: string;
  city?: string;
  state?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  status?: string;
}

export default function EventDetailScreen({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { eventId, eventName, event: navEvent, initialTab, pushTitle, pushBody } = route.params || {};
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab || 'info');
  // Full text of the push that brought the user here, shown as a card so
  // the message survives the tap (Chad: "the second it opens... it goes away")
  const [pushCard, setPushCard] = useState<{ title: string; body: string } | null>(
    pushTitle || pushBody ? { title: pushTitle || 'Notification', body: pushBody || '' } : null
  );
  const [event, setEvent] = useState<EventInfo | null>(
    navEvent
      ? {
          id: eventId,
          name: eventName || '',
          logo_url: (navEvent as NavEventParam).logo_url,
          city: (navEvent as NavEventParam).city,
          state: (navEvent as NavEventParam).state,
          start_date: (navEvent as NavEventParam).start_date,
          end_date: (navEvent as NavEventParam).end_date,
          description: (navEvent as NavEventParam).description,
          status: (navEvent as NavEventParam).status,
        }
      : null,
  );
  const [schedule, setSchedule] = useState<GameSlot[]>([]);
  const [scores, setScores] = useState<ScoreGame[]>([]);
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [scoresLoaded, setScoresLoaded] = useState(false);
  const [standingsLoaded, setStandingsLoaded] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [myTeamIds, setMyTeamIds] = useState<string[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  // PER-GAME check-in: teams check in before every game. Coaches check their
  // own team in; admins/directors can check in (and undo) either side.
  const [gameCheckins, setGameCheckins] = useState<Record<string, string>>({});
  const [coachTeamIds, setCoachTeamIds] = useState<string[]>([]);
  const isStaffUser = !!currentUser?.roles?.some(r => ['admin', 'director', 'tournament_director'].includes(r));
  useEffect(() => {
    if (!eventId) return;
    const loadCheckins = () => authFetch(`/api/registrations/game-checkins/${eventId}`)
      .then((r) => r.json())
      .then((j: any) => {
        if (!j.success) return;
        const map: Record<string, string> = {};
        for (const row of j.data || []) map[`${row.game_id}|${row.team_id}`] = row.checked_in_at;
        setGameCheckins(map);
      })
      .catch(() => {});
    loadCheckins();
    // Live-ish: other coaches' check-ins appear without a manual refresh
    const iv = setInterval(loadCheckins, 20000);
    authFetch('/api/teams/my-stats')
      .then((r) => r.json())
      .then((j: any) => { if (j.success) setCoachTeamIds((j.data?.teams || []).map((t: any) => t.id)); })
      .catch(() => {});
    return () => clearInterval(iv);
  }, [eventId]);
  // Check-in opens the game roster: every player defaults to Playing, the
  // coach flips anyone to Out or Suspended, and saving checks the team in.
  const [ciSheet, setCiSheet] = useState<{ gameId: string; teamId: string; teamName: string; gameLabel: string } | null>(null);
  const [ciRoster, setCiRoster] = useState<any[]>([]);
  const [ciLoading, setCiLoading] = useState(false);
  const [ciSaving, setCiSaving] = useState(false);
  const [ciGoalie, setCiGoalie] = useState<string | null>(null);
  const [ciGoalieError, setCiGoalieError] = useState(false);
  const [ciStep, setCiStep] = useState<'roster' | 'sign'>('roster');
  const [ciSignName, setCiSignName] = useState('');
  const [ciStrokes, setCiStrokes] = useState<Stroke[]>([]);
  const [ciPadSize, setCiPadSize] = useState({ w: 0, h: 140 });
  const [ciSignError, setCiSignError] = useState('');
  const openCheckinRoster = async (item: GameSlot, teamId: string, teamName: string) => {
    setCiSheet({ gameId: item.id as string, teamId, teamName, gameLabel: `${item.game_number ? `Game #${item.game_number} · ` : ''}${gameTimeLabel(item)}` });
    setCiLoading(true); setCiRoster([]);
    try {
      const r = await authFetch(`/api/registrations/game-checkins/${item.id}/${teamId}/roster`);
      const j = await r.json() as any;
      if (j.success) {
        const players = j.data.players || [];
        setCiRoster(players);
        const preset = players.find((pl: any) => pl.is_starting_goalie);
        const goalies = players.filter((pl: any) => String(pl.position || '').toUpperCase() === 'G');
        setCiGoalie(preset ? preset.lineup_id : (goalies.length === 1 ? goalies[0].lineup_id : null));
        setCiGoalieError(false);
        setCiStep('roster');
        const prevName = j.data?.signoff?.coach_name || currentUser?.name || '';
        setCiSignName(prevName || '');
        setCiStrokes([]); setCiSignError('');
      }
      else { Alert.alert('Could not load roster', j.error || 'Try again at the rink desk.'); setCiSheet(null); }
    } catch { Alert.alert('Could not load roster', 'Check your connection and try again.'); setCiSheet(null); }
    setCiLoading(false);
  };
  const saveCheckinRoster = async () => {
    if (!ciSheet) return;
    const drawn = ciStrokes.some(st => st.length > 1);
    if (!drawn) { setCiSignError('Please sign with your finger in the box'); return; }
    setCiSaving(true);
    try {
      const r = await authFetch(`/api/registrations/game-checkins/${ciSheet.gameId}/${ciSheet.teamId}/roster`, {
        method: 'PUT',
        body: JSON.stringify({
          statuses: ciRoster.map(pl => ({ lineup_id: pl.lineup_id, status: pl.status })),
          starting_goalie_lineup_id: ciGoalie,
          signoff: {
            name: ciSignName.trim(),
            signature: serializeStrokes(ciStrokes, ciPadSize.w || 320, ciPadSize.h),
          },
        }),
      });
      const j = await r.json() as any;
      if (j.success) {
        setGameCheckins(prev => ({ ...prev, [`${ciSheet.gameId}|${ciSheet.teamId}`]: new Date().toISOString() }));
        setCiSheet(null);
      } else Alert.alert('Check-in failed', j.error || 'Please try again.');
    } catch { Alert.alert('Check-in failed', 'Please try again.'); }
    setCiSaving(false);
  };
  const undoCheckin = () => {
    if (!ciSheet || !isStaffUser) return;
    const { gameId, teamId, teamName } = ciSheet;
    Alert.alert('Undo check-in?', `${teamName} will show as NOT checked in for this game.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo', style: 'destructive', onPress: async () => {
        setGameCheckins(prev => { const n = { ...prev }; delete n[`${gameId}|${teamId}`]; return n; });
        setCiSheet(null);
        try { await authFetch(`/api/registrations/game-checkins/${gameId}/${teamId}`, { method: 'DELETE' }); } catch {}
      } },
    ]);
  };
  // Blue/Grey pool per team from standings - shown on My Schedule so
  // families don't have to open Standings to find their bracket
  const poolByTeam: Record<string, string> = {};
  for (const st of standings) {
    if (st.team_id && st.pool_name) poolByTeam[st.team_id] = st.pool_name;
  }
  const poolChip = (teamId?: string | null) => {
    const pool = teamId ? poolByTeam[teamId] : null;
    if (!pool) return null;
    const isBlue = /blue/i.test(pool);
    return (
      <View style={[styles.poolChip, isBlue ? styles.poolChipBlue : styles.poolChipGrey]}>
        <Text style={[styles.poolChipText, isBlue ? styles.poolChipTextBlue : styles.poolChipTextGrey]} maxFontSizeMultiplier={1.1}>{pool.toUpperCase()}</Text>
      </View>
    );
  };

  function renderGameCheckinRow(item: GameSlot) {
    if (!item.id || item.status === 'final') return null;
    const sides = [
      { teamId: item.home_team_id, name: item.home_team_name || 'Home team' },
      { teamId: item.away_team_id, name: item.away_team_name || 'Away team' },
    ].filter(s0 => s0.teamId && (isStaffUser || coachTeamIds.includes(s0.teamId as string)));
    if (sides.length === 0) return null;
    // Game underway and everyone's checked in: get out of the way of the
    // live score and play-by-play
    const started = !['scheduled', 'delayed'].includes(String(item.status || 'scheduled'));
    if (started && sides.every(s0 => !!gameCheckins[`${item.id}|${s0.teamId}`])) return null;
    return (
      <View style={styles.gcRow}>
        {sides.map(s0 => {
          const key = `${item.id}|${s0.teamId}`;
          const done = !!gameCheckins[key];
          return (
            <TouchableOpacity
              key={key}
              style={[styles.gcChip, done && styles.gcChipDone]}
              activeOpacity={0.8}
              onPress={() => openCheckinRoster(item, s0.teamId as string, s0.name)}
            >
              <Ionicons name={done ? 'checkmark-circle' : 'log-in-outline'} size={14} color={done ? '#047857' : colors.navy} />
              <Text numberOfLines={1} style={[styles.gcChipText, done && styles.gcChipTextDone]} maxFontSizeMultiplier={1.2}>
                {done ? `${s0.name} checked in` : `Check in ${s0.name}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }
  // Event photo gallery
  const [photos, setPhotos] = useState<any[]>([]);
  const [photosTotal, setPhotosTotal] = useState(0);
  const [photosPage, setPhotosPage] = useState(1);
  const [photosLoadingMore, setPhotosLoadingMore] = useState(false);
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [photosUploading, setPhotosUploading] = useState(false);
  const [viewerPhoto, setViewerPhoto] = useState<any | null>(null);
  // Teams of mine already registered for THIS event (name + registration status)
  const [myRegs, setMyRegs] = useState<{ teamName: string; status: string }[]>([]);

  useEffect(() => {
    loadData();
    getUser().then(u => setCurrentUser(u));
    getMyTeamIds().then(ids => setMyTeamIds(ids));
    // Check whether any of my teams are registered for this event
    authFetch('/api/teams/my-teams')
      .then(r => r.json())
      .then((json: any) => {
        if (!json.success || !Array.isArray(json.data)) return;
        const regs: { teamName: string; status: string }[] = [];
        for (const team of json.data) {
          const ev = (team.registered_events || []).find((e: any) => e.event_id === eventId);
          if (ev) regs.push({ teamName: team.name, status: ev.status || 'pending' });
        }
        setMyRegs(regs);
      })
      .catch(() => {});
  }, [eventId]);

  useEffect(() => {
    if (activeTab === 'photos' && !photosLoaded) {
      loadPhotos();
    }
    if (activeTab === 'three_stars' && !scoresLoaded) {
      loadScores();
    }
    if (activeTab === 'game_center' && !scoresLoaded) {
      loadScores();
    }
    if ((activeTab === 'game_center' || activeTab === 'my_schedule') && !standingsLoaded) {
      loadStandings();
    }
  }, [activeTab]);

  async function loadData(isRefresh = false) {
    if (!isRefresh) setLoading(true);
    setError('');
    try {
      const [eventData, scheduleData] = await Promise.all([
        getEventDetail(eventId),
        getEventSchedule(eventId),
      ]);
      setEvent(eventData);
      setSchedule(scheduleData || []);
    } catch {
      setError('Failed to load event details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadScores() {
    setScoresLoading(true);
    try {
      const data = await getEventScores(eventId);
      setScores((data as ScoreGame[]) || []);
      setScoresLoaded(true);
    } catch {
      setScores([]);
      setScoresLoaded(true);
    } finally {
      setScoresLoading(false);
    }
  }

  async function loadStandings() {
    setStandingsLoading(true);
    try {
      const data = await getEventStandings(eventId);
      setStandings((data as StandingEntry[]) || []);
      setStandingsLoaded(true);
    } catch {
      setStandings([]);
      setStandingsLoaded(true);
    } finally {
      setStandingsLoading(false);
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    loadData(true);
    if (scoresLoaded) {
      setScoresLoaded(false);
      loadScores();
    }
    if (standingsLoaded) {
      setStandingsLoaded(false);
      loadStandings();
    }
  }

  // ==================
  // Date Helpers
  // ==================
  function formatDateRangeShort(startDate?: string, endDate?: string): string {
    if (!startDate) return 'Dates TBD';
    try {
      // Append T00:00:00 to prevent UTC timezone shift (bare date strings parse as UTC)
      const startStr2 = startDate.includes('T') ? startDate : startDate + 'T00:00:00';
      const start = new Date(startStr2);
      const shortOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      const startStr = start.toLocaleDateString('en-US', shortOpts);
      if (!endDate) return startStr;
      const endStr2 = endDate.includes('T') ? endDate : endDate + 'T00:00:00';
      const end = new Date(endStr2);
      const yearOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
      const endStr = end.toLocaleDateString('en-US', yearOpts);
      return `${startStr} - ${endStr}`;
    } catch {
      return startDate;
    }
  }

  function formatGameTime(time?: string, date?: string): string {
    if (!time && !date) return 'TBD';
    const parts: string[] = [];
    if (date) {
      try {
        const d = new Date(date);
        parts.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
      } catch {
        parts.push(date);
      }
    }
    if (time) parts.push(time);
    return parts.join(' at ');
  }

  // iOS cannot parse "YYYY-MM-DD HH:MM:SS" (needs the T) - the site works
  // because Chrome is lenient. Normalize before constructing Date.
  function parseGameDate(s?: string): Date | null {
    if (!s) return null;
    const normalized = s.includes('T') || !s.includes(' ') ? s : s.replace(' ', 'T');
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
  }

  // Schedule feeds send start_time; older data may have separate time/date.
  // Falls back so freshly uploaded schedules never show TBD.
  function gameTimeLabel(item: any): string {
    if (item.time || item.date) return formatGameTime(item.time, item.date);
    if (item.start_time) {
      const d = formatScoreDate(item.start_time);
      const t = formatScoreTime(item.start_time);
      if (t === 'TBD') return 'TBD';
      return d ? `${d} at ${t}` : t;
    }
    return 'TBD';
  }

  function formatScoreTime(startTime?: string): string {
    const d = parseGameDate(startTime);
    if (!d) return 'TBD';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function formatScoreDate(startTime?: string): string {
    const d = parseGameDate(startTime);
    if (!d) return '';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function getDateKey(startTime?: string): string {
    const d = parseGameDate(startTime);
    if (!d) return 'TBD';
    try {
      return d.toISOString().split('T')[0];
    } catch {
      return 'TBD';
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'final': return 'Final';
      case 'in_progress': return 'Live';
      case 'intermission': return 'Intermission';
      case 'warmup': return 'Warmup';
      case 'scheduled': return 'Scheduled';
      case 'delayed': return 'Delayed';
      default: return status;
    }
  }

  function periodLabel(p?: number): string {
    if (!p) return '';
    return p === 1 ? '1st Period' : p === 2 ? '2nd Period' : p === 3 ? '3rd Period' : 'Overtime';
  }

  function renderStarsStrip(item: any) {
    if (!item.three_stars_str || item.status !== 'final') return null;
    const parts = String(item.three_stars_str).split(';').map((seg: string) => {
      const [n, jersey, name] = seg.split('|');
      const ord = n === '1' ? '1st' : n === '2' ? '2nd' : '3rd';
      return `${ord} ${name || `#${jersey}`}`;
    });
    return (
      <View style={styles.starsStrip}>
        <Ionicons name="star" size={12} color="#b8860b" />
        <Text style={styles.starsStripText} numberOfLines={2}>Three Stars: {parts.join(' · ')}</Text>
      </View>
    );
  }

  function renderAnnouncementStrip(item: any) {
    if (!item.announcement) return null;
    const live = item.status === 'in_progress' || item.status === 'intermission' || item.status === 'warmup';
    if (!live) return null;
    return (
      <View style={styles.announceStrip}>
        <Ionicons name="megaphone-outline" size={13} color={colors.navy} />
        <Text style={styles.announceText} numberOfLines={3}>{item.announcement}</Text>
      </View>
    );
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'final': return colors.navy;
      case 'in_progress': return colors.success;
      case 'intermission': return '#f57c00';
      case 'warmup': return colors.info;
      case 'delayed': return colors.warning;
      default: return colors.textMuted;
    }
  }

  function getEventStatusLabel(status?: string): string {
    if (!status) return '';
    switch (status) {
      case 'upcoming': return 'Upcoming';
      case 'active': return 'Active';
      case 'in_progress': return 'In Progress';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'registration_open': return 'Registration Open';
      default: return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
    }
  }

  function getEventStatusColor(status?: string): string {
    if (!status) return colors.textMuted;
    switch (status) {
      case 'upcoming': return colors.info;
      case 'active':
      case 'in_progress': return colors.success;
      case 'completed': return colors.navy;
      case 'cancelled': return colors.error;
      case 'registration_open': return colors.cyan;
      default: return colors.textMuted;
    }
  }

  // ==================
  // Derived data
  // ==================
  const displayEvent = event;
  const eventVenues: EventVenue[] = displayEvent?.venues || [];
  const eventHotels: EventHotel[] = displayEvent?.hotels || [];
  const registeredTeams: RegisteredTeam[] = displayEvent?.registered_teams || [];
  const eventDivisions: EventDivision[] = sortByAgeGroup(
    (displayEvent?.divisions || []) as EventDivision[],
    d => d.age_group
  );

  // Group scores by date
  const scoresByDate = scores.reduce<Record<string, ScoreGame[]>>((acc, game) => {
    const key = getDateKey(game.start_time);
    if (!acc[key]) acc[key] = [];
    acc[key].push(game);
    return acc;
  }, {});
  const sortedDateKeys = Object.keys(scoresByDate).sort();

  // Group standings by division + pool
  interface StandingsGroup { label: string; key: string; entries: StandingEntry[]; }
  const standingsGroups: StandingsGroup[] = [];
  const groupMap: Record<string, StandingEntry[]> = {};
  standings.forEach((entry) => {
    const poolLabel = entry.pool_name || 'Pool';
    const key = `${entry.age_group || ''}|${entry.division_level || ''}|${poolLabel}`;
    if (!groupMap[key]) groupMap[key] = [];
    groupMap[key].push(entry);
  });
  Object.keys(groupMap).sort((a, b) => {
    // Same order as the division pills: age order first, then level/pool
    const [agA, lvA = '', plA = ''] = a.split('|');
    const [agB, lvB = '', plB = ''] = b.split('|');
    const ka = ageGroupSortKey(agA);
    const kb = ageGroupSortKey(agB);
    if (ka !== kb) return ka - kb;
    return `${lvA}|${plA}`.localeCompare(`${lvB}|${plB}`);
  }).forEach((key) => {
    const parts = key.split('|');
    const label = [parts[0], parts[1], parts[2]].filter(Boolean).join(' ');
    const entries = groupMap[key].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.goal_differential - a.goal_differential;
    });
    standingsGroups.push({ label, key, entries });
  });

  // Group registered teams by age group
  const teamsByAge = registeredTeams.reduce<Record<string, RegisteredTeam[]>>((acc, team) => {
    const key = team.age_group || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(team);
    return acc;
  }, {});

  // ==================
  // HERO
  // ==================
  function renderHero() {
    if (!displayEvent) return null;
    return (
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          {displayEvent.logo_url ? (
            <Image source={{ uri: displayEvent.logo_url }} style={styles.heroLogo} resizeMode="contain" />
          ) : (
            <View style={styles.heroLogoPlaceholder}>
              <Text style={styles.heroLogoPlaceholderText}>UHT</Text>
            </View>
          )}
          <View style={styles.heroInfo}>
            <Text style={styles.heroEventName} numberOfLines={2}>
              {displayEvent.name || eventName || 'Event'}
            </Text>
            <View style={styles.heroMetaRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.heroDateText}>
                {formatDateRangeShort(displayEvent.start_date, displayEvent.end_date)}
              </Text>
            </View>
            {(displayEvent.city || displayEvent.state) ? (
              <View style={styles.heroMetaRow}>
                <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.heroLocationText}>
                  {[displayEvent.city, displayEvent.state].filter(Boolean).join(', ')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {displayEvent.status ? (
          <View style={styles.heroStatusRow}>
            <View style={[styles.heroStatusBadge, { backgroundColor: getEventStatusColor(displayEvent.status) }]}>
              <Text style={styles.heroStatusText}>{getEventStatusLabel(displayEvent.status)}</Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  // ==================
  // TAB BAR (USSSA-style horizontal scrollable with icons)
  // ==================
  function renderTabBar() {
    return (
      <View style={styles.tabBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarScroll}
        >
          {EVENT_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabItem}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={tab.icon}
                  size={22}
                  color={isActive ? colors.navy : '#999999'}
                />
                <Text
                  style={[styles.tabLabel, isActive ? styles.tabLabelActive : null]}
                  numberOfLines={1}
                >
                  {tab.key === 'info' && eventEnded ? 'Recap' : tab.label}
                </Text>
                {isActive ? <View style={styles.tabIndicator} /> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  // ==================
  // TAB: Event Info
  // ==================
  const eventEnded = (() => {
    const end = String(displayEvent?.end_date || '').slice(0, 10);
    if (!end) return false;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return end < todayStr;
  })();
  const [recap, setRecap] = useState<any>(null);
  useEffect(() => {
    if (!eventEnded || recap || !eventId) return;
    authFetch(`/api/events/${eventId}/recap`).then((r: any) => r.json())
      .then((j: any) => { if (j.success) setRecap(j.data); }).catch(() => {});
  }, [eventEnded, eventId, recap]);

  function renderInfoTab() {
    return (
      <ScrollView
        contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
      >
        {/* EVENT RECAP - replaces the top of Event Info once the event ends */}
        {eventEnded && recap ? (
          <View style={styles.recapWrap}>
            <View style={styles.recapHero}>
              <Text style={styles.recapKicker} maxFontSizeMultiplier={1.2}>EVENT RECAP</Text>
              <View style={styles.recapStatsRow}>
                {[[recap.totals.games, 'GAMES'], [recap.totals.goals, 'GOALS'], [recap.totals.teams, 'TEAMS']].map(([n, l]) => (
                  <View key={String(l)} style={{ alignItems: 'center' }}>
                    <Text style={styles.recapStatNum} maxFontSizeMultiplier={1.1}>{n}</Text>
                    <Text style={styles.recapStatLabel} maxFontSizeMultiplier={1.1}>{l}</Text>
                  </View>
                ))}
              </View>
            </View>
            <Text style={styles.recapSummary} maxFontSizeMultiplier={1.3}>{recap.summary}</Text>
            {recap.champions.map((ch: any) => (
              <View key={ch.team_id + ch.division} style={styles.recapChampCard}>
                {ch.photo_url ? <Image source={{ uri: ch.photo_url }} style={styles.recapChampPhoto} resizeMode="cover" /> : null}
                <Text style={styles.recapChampDiv} maxFontSizeMultiplier={1.2}>{String(ch.division).toUpperCase()} CHAMPIONS</Text>
                <Text style={styles.recapChampName} maxFontSizeMultiplier={1.2}>{ch.team_name}</Text>
                <Text style={styles.recapChampSub} maxFontSizeMultiplier={1.3}>won {ch.score} over {ch.runner_up}</Text>
              </View>
            ))}
            <TouchableOpacity style={styles.recapBtn} activeOpacity={0.8}
              onPress={() => Linking.openURL(`https://ultimatetournaments.com/recap?event=${displayEvent?.slug || eventId}`)}>
              <Ionicons name="trophy-outline" size={16} color="#fff" />
              <Text style={styles.recapBtnText} maxFontSizeMultiplier={1.2}>Full Recap: Three Stars & Every Goal</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Banner Image */}
        {displayEvent?.banner_url ? (
          <Image source={{ uri: displayEvent.banner_url }} style={styles.infoBanner} resizeMode="cover" />
        ) : null}

        {/* 4-Game Guarantee badge */}
        <View style={styles.guaranteeBadge}>
          <Ionicons name="shield-checkmark" size={18} color={colors.navy} />
          <Text style={styles.guaranteeText}>4 Game Guarantee</Text>
        </View>

        {/* Register / Share CTA */}
        {currentUser && (
          <View style={styles.ctaContainer}>
            {myRegs.length > 0 ? (
              <View>
                {myRegs.map((r, i) => (
                  <View key={`${r.teamName}-${i}`} style={[styles.registeredCard, i > 0 && { marginTop: 8 }]}>
                    <Ionicons
                      name={r.status === 'approved' ? 'checkmark-circle' : 'time'}
                      size={26}
                      color={r.status === 'approved' ? '#1e9e55' : '#d97706'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.registeredTitle}>You're Registered</Text>
                      <Text style={styles.registeredSub} numberOfLines={1}>{r.teamName}</Text>
                    </View>
                    <View style={[styles.registeredPill, r.status !== 'approved' && styles.registeredPillPending]}>
                      <Text style={[styles.registeredPillText, r.status !== 'approved' && styles.registeredPillTextPending]}>
                        {r.status === 'approved' ? 'Approved' : r.status === 'waitlisted' ? 'Waitlisted' : 'Pending'}
                      </Text>
                    </View>
                  </View>
                ))}
                {currentUser.roles?.some(r => ['coach', 'manager', 'admin', 'tournament_director'].includes(r)) && (
                  <TouchableOpacity
                    style={styles.regAnotherLink}
                    activeOpacity={0.6}
                    onPress={() => {
                      navigation.navigate('RegisterEvent', {
                        eventId: displayEvent?.id || eventId,
                        eventName: displayEvent?.name || 'Tournament',
                        eventSlug: displayEvent?.slug || displayEvent?.id || eventId,
                      });
                    }}
                  >
                    <Text style={styles.regAnotherLinkText}>Register another team</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : currentUser.roles?.some(r => ['coach', 'manager', 'admin', 'tournament_director'].includes(r)) ? (
              <TouchableOpacity
                style={styles.registerBtn}
                activeOpacity={0.7}
                onPress={() => {
                  navigation.navigate('RegisterEvent', {
                    eventId: displayEvent?.id || eventId,
                    eventName: displayEvent?.name || 'Tournament',
                    eventSlug: displayEvent?.slug || displayEvent?.id || eventId,
                  });
                }}
              >
                <Ionicons name="clipboard-outline" size={20} color={colors.white} />
                <Text style={styles.registerBtnText}>Register Now</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.shareCoachBtn}
                activeOpacity={0.7}
                onPress={async () => {
                  const slug = displayEvent?.slug || displayEvent?.id || eventId;
                  const eventName = displayEvent?.name || 'this tournament';
                  try {
                    await Share.share({
                      message: `Hey Coach! Check out ${eventName} on UHT and register our team: https://ultimatetournaments.com/events/${slug}`,
                    });
                  } catch {}
                }}
              >
                <Ionicons name="share-outline" size={20} color={colors.navy} />
                <Text style={styles.shareCoachBtnText}>Share with Coach</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Age Groups */}
        {displayEvent?.age_groups ? (
          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Ionicons name="people-circle-outline" size={20} color={colors.navy} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoRowLabel}>Age Groups</Text>
              <View style={styles.ageGroupPills}>
                {displayEvent.age_groups.replace(/[\[\]"]/g, '').split(',').map((ag: string) => ag.trim()).filter((ag: string) => ag.length > 0).map((ag: string, i: number) => (
                  <View key={i} style={styles.ageGroupPill}>
                    <Text style={styles.ageGroupPillText}>{ag}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : eventDivisions.length > 0 ? (
          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Ionicons name="people-circle-outline" size={20} color={colors.navy} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoRowLabel}>Age Groups</Text>
              <View style={styles.ageGroupPills}>
                {[...new Set(eventDivisions.map(d => d.age_group))].map((ag, i) => (
                  <View key={i} style={styles.ageGroupPill}>
                    <Text style={styles.ageGroupPillText}>{ag}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {/* Venues section */}
        {eventVenues.length > 0 ? (
          <View style={styles.infoSection}>
            <View style={styles.infoSectionHeader}>
              <Ionicons name="location-outline" size={20} color={colors.navy} />
              <Text style={styles.infoSectionTitle}>Venues</Text>
            </View>
            {eventVenues.map((venue) => (
              <View key={venue.venue_id} style={styles.venueInfoCard}>
                <Text style={styles.venueInfoName}>{venue.venue_name}</Text>
                {venue.address || venue.city ? (
                  <Text style={styles.venueInfoAddress}>
                    {[venue.address, venue.city, venue.state].filter(Boolean).join(', ')}
                  </Text>
                ) : null}
                {venue.rinks && venue.rinks.length > 0 ? (
                  <View style={styles.rinkPillRow}>
                    {venue.rinks.map((r) => (
                      <View key={r.id} style={styles.rinkPill}>
                        <Text style={styles.rinkPillText}>{r.name}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[styles.directionsBtn, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                  activeOpacity={0.8}
                  onPress={() => {
                    const dest = encodeURIComponent([venue.venue_name, venue.address, venue.city, venue.state].filter(Boolean).join(', '));
                    const url = Platform.OS === 'ios'
                      ? `https://maps.apple.com/?daddr=${dest}`
                      : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
                    Linking.openURL(url).catch(() => {});
                  }}
                >
                  <Ionicons name="navigate-outline" size={15} color="#fff" />
                  <Text style={styles.directionsBtnText} maxFontSizeMultiplier={1.2}>Get Directions</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {/* Entry Fee section */}
        <View style={styles.infoSection}>
          <View style={styles.infoSectionHeader}>
            <Ionicons name="pricetag-outline" size={20} color={colors.navy} />
            <Text style={styles.infoSectionTitle}>Entry Fee</Text>
          </View>
          {eventDivisions.length > 0 && eventDivisions.some(d => d.price_cents && d.price_cents > 0) ? (
            eventDivisions.filter(d => d.price_cents && d.price_cents > 0).map((div) => (
              <View key={div.id} style={styles.feeRow}>
                <Text style={styles.feeDivision}>{div.age_group} {div.division_level || ''}</Text>
                <Text style={styles.feeAmount}>${((div.price_cents || 0) / 100).toFixed(0)}</Text>
              </View>
            ))
          ) : displayEvent?.price_min_cents ? (
            <View style={styles.feeRow}>
              <Text style={styles.feeDivision}>Entry Fee</Text>
              <Text style={styles.feeAmount}>
                {displayEvent.price_min_cents === displayEvent.price_max_cents
                  ? `$${(displayEvent.price_min_cents / 100).toFixed(0)}`
                  : `$${(displayEvent.price_min_cents / 100).toFixed(0)} - $${((displayEvent.price_max_cents || displayEvent.price_min_cents) / 100).toFixed(0)}`}
              </Text>
            </View>
          ) : (
            <Text style={styles.placeholderText}>Pricing will be announced soon.</Text>
          )}
        </View>

        {/* Event Details section */}
        {(displayEvent?.description || displayEvent?.information) ? (
          <View style={styles.infoSection}>
            <View style={styles.infoSectionHeader}>
              <Ionicons name="document-text-outline" size={20} color={colors.navy} />
              <Text style={styles.infoSectionTitle}>Event Details</Text>
            </View>
            {displayEvent.description ? (
              <Text style={styles.descriptionText}>{displayEvent.description}</Text>
            ) : null}
            {displayEvent.information ? (
              <Text style={styles.descriptionText}>{displayEvent.information}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Hotels quick preview */}
        {eventHotels.length > 0 ? (
          <View style={styles.infoSection}>
            <View style={styles.infoSectionHeader}>
              <Ionicons name="bed-outline" size={20} color={colors.navy} />
              <Text style={styles.infoSectionTitle}>Lodging ({eventHotels.length} hotels)</Text>
            </View>
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => setActiveTab('lodging')}
              activeOpacity={0.7}
            >
              <Text style={styles.viewAllBtnText}>View All Hotels</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.cyan} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Tournament Rules PDF */}
        {(event as any)?.rules_pdf_key ? (
          <TouchableOpacity
            style={styles.infoRow}
            activeOpacity={0.7}
            onPress={() => Linking.openURL(`https://ultimatetournaments.com/rules/${(event as any)?.slug || event?.id}`)}
          >
            <View style={styles.infoIconBox}>
              <Ionicons name="document-text-outline" size={20} color={colors.navy} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoRowLabel} maxFontSizeMultiplier={1.3}>Tournament Rules</Text>
              <Text style={styles.infoRowSub} maxFontSizeMultiplier={1.3}>Tap to open the official event rules (PDF)</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.cyan} />
          </TouchableOpacity>
        ) : null}

        {/* Locker Room Assignments */}
        <View style={styles.infoRow}>
          <View style={styles.infoIconBox}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.navy} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoRowLabel}>Locker Room Assignments</Text>
            <Text style={styles.infoRowSub}>Check your game in the Schedule tab for locker room info</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ==================
  // TAB: Merchandise (Champions Locker)
  // ==================
  function renderMerchandiseTab() {
    return (
      <ScrollView contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
      >
        <View style={styles.merchandiseContainer}>
          <Image
            source={require('../../assets/uht-logo.png')}
            style={styles.merchandiseLogo}
            resizeMode="contain"
          />
          <Text style={styles.merchandiseTitle}>Champions Locker</Text>
          <Text style={styles.merchandiseSubtitle}>
            Official UHT merchandise and custom team gear for this event.
          </Text>
          <TouchableOpacity
            style={styles.merchandiseBtn}
            onPress={() => Linking.openURL('https://championslocker.com')}
            activeOpacity={0.8}
          >
            <Text style={styles.merchandiseBtnText}>Shop Now</Text>
          </TouchableOpacity>
          <Text style={styles.merchandiseNote}>
            Custom jerseys, hoodies, hats, and more available with your team logo.
          </Text>
        </View>
      </ScrollView>
    );
  }

  // ==================
  // TAB: My Schedule (filtered to followed/owned teams)
  // ==================
  function renderMyScheduleTab() {
    const myGames = myTeamIds.length > 0
      ? schedule.filter(g => myTeamIds.includes(g.home_team_id || '') || myTeamIds.includes(g.away_team_id || ''))
      : [];

    // Bracket games in my divisions that still have an open seed - games my
    // team COULD land in once standings decide (shown until teams assign)
    const myDivIds = new Set(myGames.map(g => g.event_division_id).filter(Boolean));
    const possibleGames = schedule
      .filter(g =>
        (g.game_type && g.game_type !== 'pool') &&
        (!g.home_team_id || !g.away_team_id) &&
        myDivIds.has(g.event_division_id) &&
        !(myTeamIds.includes(g.home_team_id || '') || myTeamIds.includes(g.away_team_id || '')))
      .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));

    return (
      <FlatList
        data={myGames}
        keyExtractor={(item, index) => item.id || String(index)}
        contentContainerStyle={styles.tabContent}
        ListFooterComponent={possibleGames.length > 0 ? (
          <View style={{ marginTop: 14 }}>
            <Text style={styles.possibleHeader} maxFontSizeMultiplier={1.2}>POSSIBLE BRACKET GAMES</Text>
            <Text style={styles.possibleSub} maxFontSizeMultiplier={1.2}>
              Depending on standings, your team could play in these games. Matchups fill in automatically as pool play finishes.
            </Text>
            {possibleGames.map((g, i) => (
              <View key={g.id || i} style={styles.possibleCard}>
                <View style={styles.possibleChip}>
                  <Ionicons name="git-branch-outline" size={11} color={colors.navy} />
                  <Text style={styles.possibleChipText} maxFontSizeMultiplier={1.2}>
                    {g.game_type === 'championship' ? 'CHAMPIONSHIP' : g.game_type === 'placement' ? 'PLACEMENT' : 'BRACKET'}
                  </Text>
                </View>
                <Text style={styles.possibleMatchup} maxFontSizeMultiplier={1.2}>
                  {g.away_team_name} at {g.home_team_name}
                </Text>
                <Text style={styles.possibleMeta} maxFontSizeMultiplier={1.2}>
                  {[gameTimeLabel(g), [g.venue_name, g.rink_name || g.rink].filter(Boolean).join(' - ')].filter(Boolean).join('  ·  ')}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
        renderItem={({ item }) => {
          const isMyHome = myTeamIds.includes(item.home_team_id || '');
          const isMyAway = myTeamIds.includes(item.away_team_id || '');
          const gameStatus = item.status || 'scheduled';
          const isLive = gameStatus === 'in_progress' || gameStatus === 'intermission' || gameStatus === 'warmup';
          const isDelayed = gameStatus === 'delayed';
          const isFinal = gameStatus === 'final';

          return (
            <View style={[styles.gameCard, item.game_type === 'championship' ? styles.gameCardChampionship : null, (item.game_type === 'consolation' || item.game_type === 'placement') ? styles.gameCardConsolation : null, isLive ? styles.gameCardLive : null, isDelayed ? styles.gameCardDelayed : null]}>
              {item.game_type === 'championship' ? (
                <View style={styles.champGameRow}>
                  <View style={styles.champGameChip}>
                    <Ionicons name="trophy" size={11} color="#fff" />
                    <Text style={styles.champGameChipText} maxFontSizeMultiplier={1.2}>CHAMPIONSHIP GAME</Text>
                  </View>
                </View>
              ) : (item.game_type === 'consolation' || item.game_type === 'placement') ? (
                <View style={styles.champGameRow}>
                  <View style={[styles.champGameChip, { backgroundColor: '#9c6b3c' }]}>
                    <Ionicons name="medal" size={11} color="#fff" />
                    <Text style={styles.champGameChipText} maxFontSizeMultiplier={1.2}>{item.game_type === 'consolation' ? 'CONSOLATION GAME' : 'PLACEMENT GAME'}</Text>
                  </View>
                </View>
              ) : null}
              {/* Status badge */}
              {gameStatus !== 'scheduled' && (
                <View style={styles.gameStatusRow}>
                  <View style={[styles.gameStatusBadge, { backgroundColor: getStatusColor(gameStatus) }]}>
                    {isLive && <View style={styles.gameStatusDot} />}
                    <Text style={styles.gameStatusText}>{getStatusLabel(gameStatus)}{isFinal && item.is_shootout ? ' - SO' : isFinal && item.is_overtime ? ' - OT' : ''}</Text>
                  </View>
                  {isLive && item.period ? (
                    <Text style={styles.livePeriodText}>{periodLabel(item.period)}</Text>
                  ) : null}
                  {isDelayed && item.delay_note && (
                    <Text style={styles.delayNoteText}>{item.delay_note}</Text>
                  )}
                </View>
              )}
              <View style={styles.gameTimeRow}>
                <Text style={styles.gameTime}>{gameTimeLabel(item)}</Text>
              </View>
              {item.venue_name || item.rink_name || item.rink ? (
                <Text style={styles.gameRink}>{[item.venue_name, item.rink_name || item.rink].filter(Boolean).join(' - ')}</Text>
              ) : null}
              {item.division_name ? <Text style={styles.gameDivision}>{item.division_name?.trim()}</Text> : null}
              <View style={styles.matchup}>
                <View style={styles.teamRow}>
                  <Text style={styles.teamLabel}>HOME</Text>
                  {item.home_team_logo ? (
                    <Image source={{ uri: item.home_team_logo }} style={styles.teamLogo} />
                  ) : null}
                  <Text style={[styles.teamName, isMyHome ? styles.myTeamHighlight : null]}>
                    {item.home_team_name || item.home_team || 'TBD'}
                  </Text>
                  {poolChip(item.home_team_id)}
                  {(isFinal || isLive) && item.home_score != null && (
                    <Text style={[styles.inlineScore, isLive ? { color: '#e74c3c' } : null]}>{item.home_score}</Text>
                  )}
                </View>
                {item.home_locker_room ? (
                  <View style={styles.lockerRow}>
                    <Ionicons name="lock-closed-outline" size={11} color={colors.cyan} />
                    <Text style={styles.lockerText}>{item.home_locker_room}</Text>
                  </View>
                ) : null}
                <Text style={styles.vsText}>vs</Text>
                <View style={styles.teamRow}>
                  <Text style={styles.teamLabel}>AWAY</Text>
                  {item.away_team_logo ? (
                    <Image source={{ uri: item.away_team_logo }} style={styles.teamLogo} />
                  ) : null}
                  <Text style={[styles.teamName, isMyAway ? styles.myTeamHighlight : null]}>
                    {item.away_team_name || item.away_team || 'TBD'}
                  </Text>
                  {poolChip(item.away_team_id)}
                  {(isFinal || isLive) && item.away_score != null && (
                    <Text style={[styles.inlineScore, isLive ? { color: '#e74c3c' } : null]}>{item.away_score}</Text>
                  )}
                </View>
                {item.away_locker_room ? (
                  <View style={styles.lockerRow}>
                    <Ionicons name="lock-closed-outline" size={11} color={colors.cyan} />
                    <Text style={styles.lockerText}>{item.away_locker_room}</Text>
                  </View>
                ) : null}
              </View>
              {renderAnnouncementStrip(item)}
              {renderStarsStrip(item)}
              {renderGameCheckinRow(item)}
              {isFinal && item.id ? (
                <TouchableOpacity
                  style={styles.scoresheetBtn}
                  onPress={() => navigation.navigate('Scoresheet', { gameId: item.id })}
                >
                  <Ionicons name="document-text-outline" size={15} color={colors.navy} />
                  <Text style={styles.scoresheetBtnText}>View Scoresheet</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.navy} />
                </TouchableOpacity>
              ) : null}
              {isLive && item.id ? (
                <TouchableOpacity
                  style={styles.liveFeedBtn}
                  onPress={() => navigation.navigate('LiveGame', { gameId: item.id })}
                >
                  <View style={styles.liveFeedDot} />
                  <Text style={styles.liveFeedBtnText}>Live Play-by-Play</Text>
                  <Ionicons name="chevron-forward" size={14} color="#e74c3c" />
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {myTeamIds.length === 0 ? (
              <>
                <Ionicons name="people-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Follow a Team First</Text>
                <Text style={styles.emptyText}>
                  Follow or create a team to see your personalized schedule here. Go to the Home tab and tap "Follow a Team" to get started.
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No Games Scheduled</Text>
                <Text style={styles.emptyText}>
                  Your team's schedule will appear here once it's been published. Check back closer to event day.
                </Text>
              </>
            )}
          </View>
        }
      />
    );
  }

  // ==================
  // TAB: 3 Stars (per-game MVPs from every final, with the selection rules)
  // ==================
  async function loadPhotos(page: number = 1) {
    try {
      const res = await fetch(`https://uht.chad-157.workers.dev/api/photos/events/${eventId}/photos?page=${page}&per_page=60`);
      const json = await res.json();
      if (json.success) {
        const batch = json.data.photos || [];
        setPhotos(prev => page === 1 ? batch : [...prev, ...batch.filter((b: any) => !prev.some((x: any) => x.id === b.id))]);
        setPhotosPage(page);
        setPhotosTotal(json.data.total || 0);
      }
    } catch {}
    setPhotosLoaded(true);
  }

  async function uploadEventPhotos(kind: 'fan' | 'champion' = 'fan', teamId?: string) {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: kind === 'fan',
        selectionLimit: 10,
        quality: 0.5,
        base64: true,
      });
      if (result.canceled || !result.assets?.length) return;
      setPhotosUploading(true);
      let ok = 0;
      for (const asset of result.assets) {
        if (!asset.base64) continue;
        try {
          // iPhones hand over HEIC originals - convert to real JPEG; the
          // champions shot also gets the UHT logo stamped bottom-right
          const jpegB64 = kind === 'champion' ? await processChampionPhoto(asset.base64) : await convertIfHeic(asset.base64);
          const res = await authFetch(`/api/photos/events/${eventId}/photos`, {
            method: 'POST',
            body: JSON.stringify({ data: jpegB64, mimeType: 'image/jpeg', kind, teamId }),
          });
          const json = await res.json() as any;
          if (json.success) ok++;
        } catch {}
      }
      setPhotosUploading(false);
      if (ok > 0) {
        loadPhotos();
        Alert.alert(kind === 'champion' ? 'Champions Photo Added!' : 'Photos Added!',
          kind === 'champion' ? 'The champions photo is live in the gallery.' : `${ok} photo${ok !== 1 ? 's' : ''} added to the event gallery. Keep them coming all weekend!`);
      } else {
        Alert.alert('Upload Failed', 'Could not upload. Please try again.');
      }
    } catch {
      setPhotosUploading(false);
    }
  }

  function deletePhoto(photoId: string) {
    Alert.alert('Delete Photo', 'Permanently remove this photo from the gallery?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const res = await authFetch(`/api/photos/${photoId}`, { method: 'DELETE' });
          const json = await res.json() as any;
          if (json.success) { setViewerPhoto(null); loadPhotos(); }
          else Alert.alert('Error', json.error || 'Could not delete.');
        } catch { Alert.alert('Error', 'Could not delete.'); }
      } },
    ]);
  }

  function reportPhoto(photoId: string) {
    Alert.alert('Report Photo', 'Flag this photo for review by event staff?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: async () => {
        try { await authFetch(`/api/photos/${photoId}/report`, { method: 'POST', body: JSON.stringify({}) }); } catch {}
        setViewerPhoto(null);
        Alert.alert('Thanks', 'Our staff will take a look.');
      } },
    ]);
  }

  function renderPhotosTab() {
    const champs = photos.filter(p => p.kind === 'champion');
    const fans = photos.filter(p => p.kind !== 'champion');
    const thumb = (SCREEN_WIDTH - spacing.lg * 2 - 8) / 3;

    return (
      <ScrollView contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { loadPhotos(); }} tintColor={colors.navy} colors={[colors.navy]} />}
      >
        {/* Upload CTA */}
        <View style={styles.photoCta}>
          <Ionicons name="images" size={26} color={colors.cyan} />
          <View style={{ flex: 1 }}>
            <Text style={styles.photoCtaTitle}>Share your weekend</Text>
            <Text style={styles.photoCtaSub}>Upload photos all weekend - after the event every photo becomes part of the official event mosaic.</Text>
          </View>
        </View>
        {pushCard ? (
          <View style={styles.pushCard}>
            <Text style={styles.pushCardTitle} maxFontSizeMultiplier={1.2}>{pushCard.title}</Text>
            <Text style={styles.pushCardBody} maxFontSizeMultiplier={1.3}>{pushCard.body}</Text>
            <View style={styles.pushCardBtnRow}>
              <TouchableOpacity style={styles.pushCardUploadBtn} activeOpacity={0.85}
                onPress={() => { setPushCard(null); uploadEventPhotos('fan'); }}>
                <Ionicons name="cloud-upload-outline" size={16} color={colors.white} />
                <Text style={styles.pushCardUploadText} maxFontSizeMultiplier={1.2}>Upload Now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pushCardLaterBtn} activeOpacity={0.8} onPress={() => setPushCard(null)}>
                <Text style={styles.pushCardLaterText} maxFontSizeMultiplier={1.2}>Later</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        <TouchableOpacity style={styles.photoUploadBtn} activeOpacity={0.85} disabled={photosUploading}
          onPress={() => uploadEventPhotos('fan')}>
          {photosUploading ? <ActivityIndicator color={colors.white} size="small" /> : <Ionicons name="cloud-upload-outline" size={19} color={colors.white} />}
          <Text style={styles.photoUploadBtnText}>{photosUploading ? 'Uploading...' : 'Add Your Photos'}</Text>
        </TouchableOpacity>

        {photosTotal > 0 && (
          <Text style={styles.photoCount}>{photosTotal} photo{photosTotal !== 1 ? 's' : ''} and counting</Text>
        )}

        {/* Champions spotlight */}
        {champs.length > 0 && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.champSectionTitle}>CHAMPIONS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {champs.map(p => (
                <TouchableOpacity key={p.id} style={styles.champCard} activeOpacity={0.85} onPress={() => setViewerPhoto(p)}>
                  <Image source={{ uri: p.url }} style={styles.champImg} resizeMode="cover" />
                  <View style={styles.champCardFooter}>
                    <Text style={styles.champCardTrophy}>🏆</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.champCardTeam} numberOfLines={1}>{p.team_name || 'Champions'}</Text>
                      {(p.age_group || p.division_level) ? (
                        <Text style={styles.champCardDiv} numberOfLines={1}>{[p.age_group, p.division_level].filter(Boolean).join(' ')} Champions</Text>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Gallery grid */}
        {fans.length === 0 && champs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No photos yet</Text>
            <Text style={styles.emptyText}>Be the first - add a photo from the rink!</Text>
          </View>
        ) : (
          <View style={styles.photoGrid}>
            {fans.map(p => (
              <TouchableOpacity key={p.id} activeOpacity={0.8} onPress={() => setViewerPhoto(p)}>
                <Image source={{ uri: `${p.url}${String(p.url).includes('?') ? '&' : '?'}thumb=1` }} style={{ width: thumb, height: thumb, borderRadius: 10, backgroundColor: '#e8ecf1' }} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        {photos.length < photosTotal && (
          <TouchableOpacity style={styles.photoLoadMoreBtn} activeOpacity={0.85} disabled={photosLoadingMore}
            onPress={async () => { setPhotosLoadingMore(true); await loadPhotos(photosPage + 1); setPhotosLoadingMore(false); }}>
            {photosLoadingMore
              ? <ActivityIndicator size="small" color={colors.navy} />
              : <Text style={styles.photoLoadMoreText} maxFontSizeMultiplier={1.2}>Load {Math.min(60, photosTotal - photos.length)} more photos</Text>}
          </TouchableOpacity>
        )}

        {/* Full-screen viewer */}
        <Modal visible={!!viewerPhoto} transparent animationType="fade" onRequestClose={() => setViewerPhoto(null)}>
          <View style={styles.viewerBackdrop}>
            <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerPhoto(null)}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            {viewerPhoto ? (
              <>
                <Image source={{ uri: viewerPhoto.url }} style={styles.viewerImg} resizeMode="contain" />
                {viewerPhoto.kind === 'champion' && (
                  <Text style={styles.viewerChampLabel}>🏆 {viewerPhoto.team_name || 'Champions'}</Text>
                )}
                <View style={styles.viewerActions}>
                  <TouchableOpacity style={styles.viewerReport} onPress={() => reportPhoto(viewerPhoto.id)}>
                    <Ionicons name="flag-outline" size={14} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.viewerReportText}>Report</Text>
                  </TouchableOpacity>
                  {(currentUser?.roles || []).some(r => ['admin', 'director', 'tournament_director'].includes(r)) && (
                    <TouchableOpacity style={styles.viewerReport} onPress={() => deletePhoto(viewerPhoto.id)}>
                      <Ionicons name="trash-outline" size={14} color="#ff8b8b" />
                      <Text style={[styles.viewerReportText, { color: '#ff8b8b' }]}>Delete</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            ) : null}
          </View>
        </Modal>

      </ScrollView>
    );
  }

  function renderThreeStarsTab() {
    const starGames = schedule.filter(g => g.status === 'final' && g.three_stars_str);
    return (
      <FlatList
        data={starGames}
        keyExtractor={(item, index) => item.id || String(index)}
        contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
        ListHeaderComponent={
          <TouchableOpacity style={styles.starsRulesCard} activeOpacity={0.8}
            onPress={() => Linking.openURL('https://ultimatetournaments.com/three-stars')}>
            <Ionicons name="star" size={18} color="#b8860b" />
            <View style={{ flex: 1 }}>
              <Text style={styles.starsRulesTitle}>How are the Three Stars picked?</Text>
              <Text style={styles.starsRulesSub}>Selected automatically from the official scoresheet by a fixed formula - same math for every team. Tap to read the rules.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#b8860b" />
          </TouchableOpacity>
        }
        renderItem={({ item }) => {
          const stars = String(item.three_stars_str || '').split(';').map(seg => {
            const [n, jersey, name] = seg.split('|');
            return { n: parseInt(n || '0'), jersey, name };
          }).sort((a, b) => a.n - b.n);
          return (
            <View style={styles.gameCard}>
              <View style={styles.gameTimeRow}>
                <Text style={styles.gameTime}>{item.home_team_name || 'Home'} vs {item.away_team_name || 'Away'}</Text>
              </View>
              {item.division_name ? <Text style={styles.gameDivision}>{item.division_name?.trim()}</Text> : null}
              <View style={{ marginTop: 8, gap: 6 }}>
                {stars.map(st => (
                  <View key={st.n} style={styles.starRow}>
                    <Text style={styles.starOrd} numberOfLines={1} maxFontSizeMultiplier={1}>{'★'.repeat(Math.max(1, 4 - st.n))}</Text>
                    <Text style={styles.starName} numberOfLines={1} maxFontSizeMultiplier={1.3}>{st.name || `#${st.jersey}`}</Text>
                    {st.jersey ? <Text style={styles.starJersey} maxFontSizeMultiplier={1.2}>#{st.jersey}</Text> : null}
                  </View>
                ))}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="star-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No Stars Yet</Text>
            <Text style={styles.emptyText}>The Three Stars of each game appear here the moment the game goes final.</Text>
          </View>
        }
      />
    );
  }

  // ==================
  // TAB: Game Center (division picker + full schedule + scores + standings)
  // ==================
  const [gameCenterSub, setGameCenterSub] = useState<'schedule' | 'scores' | 'standings'>('schedule');
  const [gameTimeFilter, setGameTimeFilter] = useState<'upcoming' | 'past' | 'all' | 'live'>('all');

  // Get unique divisions from schedule data
  const divisions = (() => {
    const divMap = new Map<string, { id: string; label: string }>();
    schedule.forEach(g => {
      if (g.event_division_id) {
        const label = [g.age_group, g.division_level].filter(Boolean).join(' ');
        if (!divMap.has(g.event_division_id)) {
          divMap.set(g.event_division_id, { id: g.event_division_id, label });
        }
      }
    });
    // Pills come from the schedule only - a division with no games gets no pill
    return sortByAgeGroup([...divMap.values()], d => d.label);
  })();

  function getFilteredSchedule() {
    let filtered = schedule;
    if (selectedDivision !== 'all') {
      filtered = filtered.filter(g => g.event_division_id === selectedDivision);
    }
    const liveNow = (g: GameSlot) => g.status === 'in_progress' || g.status === 'intermission' || g.status === 'warmup';
    if (gameTimeFilter === 'live') {
      filtered = filtered.filter(liveNow);
    } else if (gameTimeFilter === 'upcoming') {
      filtered = filtered.filter(g => g.status !== 'final' && !liveNow(g));
    } else if (gameTimeFilter === 'past') {
      filtered = filtered.filter(g => g.status === 'final');
    }
    return filtered;
  }

  function renderDivisionPicker() {
    if (divisions.length === 0) return null;
    return (
      <View style={styles.divisionPickerContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.divisionPickerScroll}>
          <TouchableOpacity
            style={[styles.divisionPill, selectedDivision === 'all' ? styles.divisionPillActive : null]}
            onPress={() => setSelectedDivision('all')}
            activeOpacity={0.7}
          >
            <Text style={[styles.divisionPillText, selectedDivision === 'all' ? styles.divisionPillTextActive : null]}>All Divisions</Text>
          </TouchableOpacity>
          {divisions.map(div => (
            <TouchableOpacity
              key={div.id}
              style={[styles.divisionPill, selectedDivision === div.id ? styles.divisionPillActive : null]}
              onPress={() => setSelectedDivision(div.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.divisionPillText, selectedDivision === div.id ? styles.divisionPillTextActive : null]}>{div.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  function renderGameCenterTab() {
    return (
      <View style={{ flex: 1 }}>
        {/* Division picker */}
        {renderDivisionPicker()}

        {/* Sub-tabs */}
        <View style={styles.subTabBar}>
          {(['schedule', 'scores', 'standings'] as const).map((sub) => {
            const isActive = gameCenterSub === sub;
            const label = sub === 'schedule' ? 'Schedule' : sub === 'scores' ? 'Scores' : 'Standings';
            return (
              <TouchableOpacity
                key={sub}
                style={[styles.subTab, isActive ? styles.subTabActive : null]}
                onPress={() => {
                  setGameCenterSub(sub);
                  if (sub === 'scores' && !scoresLoaded) loadScores();
                  if (sub === 'standings' && !standingsLoaded) loadStandings();
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.subTabText, isActive ? styles.subTabTextActive : null]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {gameCenterSub === 'schedule' ? renderFullSchedule() : null}
        {gameCenterSub === 'scores' ? renderScoresContent() : null}
        {gameCenterSub === 'standings' ? renderStandingsContent() : null}
      </View>
    );
  }

  function renderFullSchedule() {
    const filteredSchedule = getFilteredSchedule();

    return (
      <FlatList
        data={filteredSchedule}
        keyExtractor={(item, index) => item.id || String(index)}
        contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
        ListHeaderComponent={
          <View style={styles.timeFilterRow}>
            {(['all', 'live', 'upcoming', 'past'] as const).map(f => {
              const liveCount = f === 'live'
                ? schedule.filter(g => (selectedDivision === 'all' || g.event_division_id === selectedDivision)
                    && (g.status === 'in_progress' || g.status === 'intermission' || g.status === 'warmup')).length
                : 0;
              const isActive = gameTimeFilter === f;
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.timeFilterBtn, isActive ? (f === 'live' ? styles.timeFilterBtnLive : styles.timeFilterBtnActive) : null]}
                  onPress={() => setGameTimeFilter(f)}
                  activeOpacity={0.7}
                >
                  {f === 'live' && liveCount > 0 && !isActive ? <View style={styles.liveFilterDot} /> : null}
                  <Text style={[styles.timeFilterText, isActive ? styles.timeFilterTextActive : null]}>
                    {f === 'all' ? 'All' : f === 'live' ? `Live${liveCount ? ` (${liveCount})` : ''}` : f === 'upcoming' ? 'Upcoming' : 'Past'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        }
        renderItem={({ item }) => {
          const gameStatus = item.status || 'scheduled';
          const isLive = gameStatus === 'in_progress' || gameStatus === 'intermission' || gameStatus === 'warmup';
          const isDelayed = gameStatus === 'delayed';
          const isFinal = gameStatus === 'final';
          const isMyHome = myTeamIds.includes(item.home_team_id || '');
          const isMyAway = myTeamIds.includes(item.away_team_id || '');

          return (
            <View style={[styles.gameCard, item.game_type === 'championship' ? styles.gameCardChampionship : null, (item.game_type === 'consolation' || item.game_type === 'placement') ? styles.gameCardConsolation : null, isLive ? styles.gameCardLive : null, isDelayed ? styles.gameCardDelayed : null]}>
              {item.game_type === 'championship' ? (
                <View style={styles.champGameRow}>
                  <View style={styles.champGameChip}>
                    <Ionicons name="trophy" size={11} color="#fff" />
                    <Text style={styles.champGameChipText} maxFontSizeMultiplier={1.2}>CHAMPIONSHIP GAME</Text>
                  </View>
                </View>
              ) : (item.game_type === 'consolation' || item.game_type === 'placement') ? (
                <View style={styles.champGameRow}>
                  <View style={[styles.champGameChip, { backgroundColor: '#9c6b3c' }]}>
                    <Ionicons name="medal" size={11} color="#fff" />
                    <Text style={styles.champGameChipText} maxFontSizeMultiplier={1.2}>{item.game_type === 'consolation' ? 'CONSOLATION GAME' : 'PLACEMENT GAME'}</Text>
                  </View>
                </View>
              ) : null}
              {gameStatus !== 'scheduled' && (
                <View style={styles.gameStatusRow}>
                  <View style={[styles.gameStatusBadge, { backgroundColor: getStatusColor(gameStatus) }]}>
                    {isLive && <View style={styles.gameStatusDot} />}
                    <Text style={styles.gameStatusText}>{getStatusLabel(gameStatus)}{isFinal && item.is_shootout ? ' - SO' : isFinal && item.is_overtime ? ' - OT' : ''}</Text>
                  </View>
                  {isLive && item.period ? (
                    <Text style={styles.livePeriodText}>{periodLabel(item.period)}</Text>
                  ) : null}
                  {isDelayed && item.delay_minutes && (
                    <Text style={styles.delayMinText}>{item.delay_minutes} min delay</Text>
                  )}
                </View>
              )}
              <View style={styles.gameTimeRow}>
                <Text style={styles.gameTime}>{gameTimeLabel(item)}</Text>
              </View>
              {item.venue_name || item.rink_name || item.rink ? (
                <Text style={styles.gameRink}>{[item.venue_name, item.rink_name || item.rink].filter(Boolean).join(' - ')}</Text>
              ) : null}
              {item.division_name && selectedDivision === 'all' ? (
                <Text style={styles.gameDivision}>{item.division_name?.trim()}</Text>
              ) : null}
              <View style={styles.matchup}>
                <View style={styles.teamRow}>
                  <Text style={styles.teamLabel}>HOME</Text>
                  {item.home_team_logo ? (
                    <Image source={{ uri: item.home_team_logo }} style={styles.teamLogo} />
                  ) : null}
                  <Text style={[styles.teamName, isMyHome ? styles.myTeamHighlight : null]}>{item.home_team_name || item.home_team || 'TBD'}</Text>
                  {(isFinal || isLive) && item.home_score != null && (
                    <Text style={[styles.inlineScore, isFinal && (item.home_score ?? 0) > (item.away_score ?? 0) ? styles.inlineScoreWin : null]}>{item.home_score}</Text>
                  )}
                </View>
                {item.home_locker_room ? (
                  <View style={styles.lockerRow}>
                    <Ionicons name="lock-closed-outline" size={11} color={colors.cyan} />
                    <Text style={styles.lockerText}>{item.home_locker_room}</Text>
                  </View>
                ) : null}
                <Text style={styles.vsText}>vs</Text>
                <View style={styles.teamRow}>
                  <Text style={styles.teamLabel}>AWAY</Text>
                  {item.away_team_logo ? (
                    <Image source={{ uri: item.away_team_logo }} style={styles.teamLogo} />
                  ) : null}
                  <Text style={[styles.teamName, isMyAway ? styles.myTeamHighlight : null]}>{item.away_team_name || item.away_team || 'TBD'}</Text>
                  {(isFinal || isLive) && item.away_score != null && (
                    <Text style={[styles.inlineScore, isFinal && (item.away_score ?? 0) > (item.home_score ?? 0) ? styles.inlineScoreWin : null]}>{item.away_score}</Text>
                  )}
                </View>
                {item.away_locker_room ? (
                  <View style={styles.lockerRow}>
                    <Ionicons name="lock-closed-outline" size={11} color={colors.cyan} />
                    <Text style={styles.lockerText}>{item.away_locker_room}</Text>
                  </View>
                ) : null}
              </View>
              {renderAnnouncementStrip(item)}
              {renderStarsStrip(item)}
              {renderGameCheckinRow(item)}
              {isLive && item.id ? (
                <TouchableOpacity
                  style={styles.liveFeedBtn}
                  onPress={() => navigation.navigate('LiveGame', { gameId: item.id })}
                >
                  <View style={styles.liveFeedDot} />
                  <Text style={styles.liveFeedBtnText}>Live Play-by-Play</Text>
                  <Ionicons name="chevron-forward" size={14} color="#e74c3c" />
                </TouchableOpacity>
              ) : null}
              {isFinal && item.id ? (
                <TouchableOpacity
                  style={styles.scoresheetBtn}
                  onPress={() => navigation.navigate('Scoresheet', { gameId: item.id })}
                >
                  <Ionicons name="document-text-outline" size={15} color={colors.navy} />
                  <Text style={styles.scoresheetBtnText}>View Scoresheet</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.navy} />
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Games Found</Text>
            <Text style={styles.emptyText}>
              {gameTimeFilter !== 'all' ? 'Try switching to "All" to see all games.' : 'The schedule for this event hasn\'t been published yet.'}
            </Text>
          </View>
        }
      />
    );
  }

  function renderScoresContent() {
    if (scoresLoading) {
      return <View style={styles.centerContent}><ActivityIndicator size="large" color={colors.navy} /></View>;
    }

    // Filter scores by selected division
    const filteredScores = selectedDivision === 'all'
      ? scores
      : scores.filter(g => {
          const divLabel = [g.age_group, g.division_level].filter(Boolean).join(' ');
          const matchDiv = divisions.find(d => d.id === selectedDivision);
          return matchDiv ? divLabel === matchDiv.label : true;
        });

    // Rebuild scoresByDate with filtered scores
    const filteredScoresByDate = filteredScores.reduce<Record<string, ScoreGame[]>>((acc, game) => {
      const key = getDateKey(game.start_time);
      if (!acc[key]) acc[key] = [];
      acc[key].push(game);
      return acc;
    }, {});
    const filteredDateKeys = Object.keys(filteredScoresByDate).sort();

    if (filteredScores.length === 0) {
      return (
        <ScrollView contentContainerStyle={styles.tabContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
        >
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Scores Yet</Text>
            <Text style={styles.emptyText}>Scores will appear here once games have started.</Text>
          </View>
        </ScrollView>
      );
    }
    return (
      <ScrollView contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
      >
        {filteredDateKeys.map((dateKey) => {
          const gamesForDate = filteredScoresByDate[dateKey];
          const dateLabel = dateKey === 'TBD' ? 'Date TBD' : formatScoreDate(gamesForDate[0].start_time);
          return (
            <View key={dateKey}>
              <Text style={styles.dateSectionHeader}>{dateLabel}</Text>
              {gamesForDate.map((game) => {
                const isFinal = game.status === 'final';
                const isLive = game.status === 'in_progress' || game.status === 'intermission';
                const homeWins = isFinal && game.home_score > game.away_score;
                const awayWins = isFinal && game.away_score > game.home_score;
                const statusColor = getStatusColor(game.status);
                return (
                  <View key={game.id} style={styles.scoreCard}>
                    <View style={styles.scoreCardTopRow}>
                      <View style={styles.scoreCardMeta}>
                        <Text style={styles.scoreCardTime}>{formatScoreTime(game.start_time)}</Text>
                        {((game as any).venue_name || game.rink_name) ? <Text style={styles.scoreCardRink} numberOfLines={2}>{[(game as any).venue_name, game.rink_name].filter(Boolean).join(' - ')}</Text> : null}
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                        <Text style={styles.statusBadgeText}>{getStatusLabel(game.status)}</Text>
                        {isLive ? <View style={styles.liveDot} /> : null}
                      </View>
                    </View>
                    {game.age_group || game.division_level ? (
                      <Text style={styles.scoreCardDivision}>{[game.age_group, game.division_level].filter(Boolean).join(' ')}</Text>
                    ) : null}
                    <View style={styles.scoreMatchup}>
                      <View style={styles.scoreTeamCol}>
                        <Text style={styles.scoreTeamLabel}>AWAY</Text>
                        {game.away_team_logo ? (
                          <Image source={{ uri: game.away_team_logo }} style={styles.scoreTeamLogo} />
                        ) : null}
                        <Text style={[styles.scoreTeamName, awayWins ? styles.scoreTeamWinner : null]} numberOfLines={2}>
                          {game.away_team_name || 'TBD'}
                        </Text>
                      </View>
                      <View style={styles.scoreCenter}>
                        {game.status === 'scheduled' ? (
                          <Text style={styles.scoreVs}>vs</Text>
                        ) : (
                          <View style={styles.scoreNumbers}>
                            <Text style={[styles.scoreValue, awayWins ? styles.scoreValueWinner : null]}>{game.away_score}</Text>
                            <Text style={styles.scoreDash}>-</Text>
                            <Text style={[styles.scoreValue, homeWins ? styles.scoreValueWinner : null]}>{game.home_score}</Text>
                          </View>
                        )}
                        {isFinal && (game.is_overtime || game.is_shootout) ? (
                          <Text style={styles.otLabel}>{game.is_shootout ? 'SO' : 'OT'}</Text>
                        ) : null}
                        {isLive && game.period ? (
                          <Text style={styles.periodLabel}>{game.status === 'intermission' ? `INT ${game.period}` : `P${game.period}`}</Text>
                        ) : null}
                      </View>
                      <View style={[styles.scoreTeamCol, styles.scoreTeamColRight]}>
                        <Text style={styles.scoreTeamLabel}>HOME</Text>
                        {game.home_team_logo ? (
                          <Image source={{ uri: game.home_team_logo }} style={styles.scoreTeamLogo} />
                        ) : null}
                        <Text style={[styles.scoreTeamName, homeWins ? styles.scoreTeamWinner : null]} numberOfLines={2}>
                          {game.home_team_name || 'TBD'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    );
  }

  function renderStandingsContent() {
    if (standingsLoading) {
      return <View style={styles.centerContent}><ActivityIndicator size="large" color={colors.navy} /></View>;
    }

    // Filter standings by selected division
    const filteredStandingsGroups = selectedDivision === 'all'
      ? standingsGroups
      : standingsGroups.filter(g => g.entries.some(e => e.event_division_id === selectedDivision));

    if (filteredStandingsGroups.length === 0) {
      return (
        <ScrollView contentContainerStyle={styles.tabContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
        >
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Standings Available</Text>
            <Text style={styles.emptyText}>Standings will be updated as pool play games are completed.</Text>
          </View>
        </ScrollView>
      );
    }
    // Division -> pools (UHT: 6+ team divisions split into Gray/Blue pools)
    const divisionCards: { div: string; pools: { pool: string; entries: any[] }[] }[] = [];
    for (const group of filteredStandingsGroups) {
      const first = group.entries[0] || {};
      const div = [first.age_group, first.division_level].filter((v: any) => v && v !== 'null').join(' ') || group.label;
      const pool = first.pool_name && first.pool_name !== 'null' ? String(first.pool_name) : '';
      let card = divisionCards.find(c => c.div === div);
      if (!card) { card = { div, pools: [] }; divisionCards.push(card); }
      card.pools.push({ pool, entries: group.entries });
    }
    const poolColor = (name: string, idx: number): string => {
      const n = name.toLowerCase();
      if (n.includes('blue') || (!/gr[ae]y/.test(n) && idx === 1)) return '#2563eb';
      if (/gr[ae]y/.test(n) || idx === 0) return '#6b7280';
      return '#00a0cc';
    };

    return (
      <ScrollView contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
      >
        {divisionCards.map((card) => (
          <View key={card.div} style={styles.standingsCard}>
            <View style={styles.standingsCardHeader}>
              <Text style={styles.standingsCardTitle}>{card.div}</Text>
              <Text style={styles.standingsCardSub}>
                {card.pools.reduce((n, p) => n + p.entries.length, 0)} teams{card.pools.length > 1 ? ` · ${card.pools.length} pools` : ''}
              </Text>
            </View>
            {/* One column header per division - pools share it */}
            <View style={styles.standingsHeaderRow}>
              <Text style={[styles.standingsHeaderCell, styles.standingsRankCol]}>#</Text>
              <Text style={[styles.standingsHeaderCell, styles.standingsTeamCol]}>TEAM</Text>
              <Text style={[styles.standingsHeaderCell, styles.standingsRecCol]}>W-L-T</Text>
              <Text style={[styles.standingsHeaderCell, styles.standingsStatColWide]}>PTS</Text>
              <Text style={[styles.standingsHeaderCell, styles.standingsStatColWide]}>+/-</Text>
              <Text style={[styles.standingsHeaderCell, styles.standingsStatCol]}>GA</Text>
              <Text style={[styles.standingsHeaderCell, styles.standingsStatColWide]}>PIMS</Text>
            </View>
            {card.pools.map((poolGroup, pi) => {
              const accent = poolColor(poolGroup.pool, pi);
              const tint = /gr[ae]y/.test((poolGroup.pool || '').toLowerCase()) ? '#f1f3f6'
                : (poolGroup.pool || '').toLowerCase().includes('blue') ? '#eaf2fe' : '#e9f6fc';
              return (
                <View key={poolGroup.pool || String(pi)}>
                  {card.pools.length > 1 && (
                    <View style={[styles.poolStrip, { backgroundColor: tint }]}>
                      <View style={[styles.poolStripDot, { backgroundColor: accent }]} />
                      <Text style={[styles.poolStripText, { color: accent }]}>
                        {(poolGroup.pool || `Pool ${pi + 1}`).toUpperCase()}{/POOL/i.test(poolGroup.pool) ? '' : ' POOL'}
                      </Text>
                    </View>
                  )}
                  {poolGroup.entries.map((entry: any, idx: number) => (
                    <View key={entry.team_id} style={[styles.standingsRow, idx === poolGroup.entries.length - 1 && pi === card.pools.length - 1 ? styles.standingsRowLast : null]}>
                      <Text style={[styles.standingsCell, styles.standingsRankCol, styles.standingsRankText, card.pools.length > 1 ? { color: accent } : null]}>{idx + 1}</Text>
                      <Text style={[styles.standingsCell, styles.standingsTeamCol, styles.standingsTeamText]} numberOfLines={1}>{entry.team_name}{(entry as any).team_state ? <Text style={{ color: '#8a94a3', fontSize: 11 }}> {(entry as any).team_state}</Text> : null}</Text>
                      <Text style={[styles.standingsCell, styles.standingsRecCol]}>{entry.wins}-{entry.losses}-{entry.ties}</Text>
                      <Text style={[styles.standingsCell, styles.standingsStatColWide, styles.standingsPointsText]}>{entry.points}</Text>
                      <Text style={[styles.standingsCell, styles.standingsStatColWide, styles.standingsDiffText]}>
                        {entry.goal_differential > 0 ? `+${entry.goal_differential}` : entry.goal_differential}
                      </Text>
                      <Text style={[styles.standingsCell, styles.standingsStatCol]}>{entry.goals_against}</Text>
                      <Text style={[styles.standingsCell, styles.standingsStatColWide]}>{entry.pims ?? 0}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    );
  }

  // ==================
  // TAB: Event Updates
  // ==================
  function renderUpdatesTab() {
    return (
      <ScrollView contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
      >
        <View style={styles.emptyState}>
          <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Updates Yet</Text>
          <Text style={styles.emptyText}>
            Event updates, weather alerts, delays, and important announcements will appear here. Pull down to refresh.
          </Text>
        </View>
      </ScrollView>
    );
  }

  // ==================
  // TAB: Promotions
  // ==================
  function renderPromotionsTab() {
    return (
      <ScrollView contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
      >
        <View style={styles.emptyState}>
          <Ionicons name="star-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Promotions & Sponsors</Text>
          <Text style={styles.emptyText}>
            Sponsor deals, coupons, and special offers for this event will be posted here.
          </Text>
        </View>
      </ScrollView>
    );
  }

  // ==================
  // TAB: Venues
  // ==================
  function renderVenuesTab() {
    return (
      <ScrollView contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
      >
        {eventVenues.length > 0 ? (
          eventVenues.map((venue) => (
            <View key={venue.venue_id} style={styles.venueCard}>
              <View style={styles.venueHeader}>
                <Text style={styles.venueIcon}>{'🏒'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.venueName}>{venue.venue_name}</Text>
                  {venue.address || venue.city || venue.state ? (
                    <Text style={styles.venueAddress}>
                      {[venue.address, venue.city, venue.state].filter(Boolean).join(', ')}
                      {venue.zip ? ` ${venue.zip}` : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
              {venue.address ? (
                <TouchableOpacity
                  style={styles.directionsBtn}
                  onPress={() => {
                    const addr = encodeURIComponent([venue.address, venue.city, venue.state, venue.zip].filter(Boolean).join(', '));
                    Linking.openURL(`https://maps.apple.com/?q=${addr}`);
                  }}
                >
                  <Text style={styles.directionsBtnText}>Get Directions</Text>
                </TouchableOpacity>
              ) : null}
              {venue.rinks && venue.rinks.length > 0 ? (
                <View style={styles.rinksContainer}>
                  <Text style={styles.rinksLabel}>Rinks</Text>
                  {venue.rinks.map((rink) => (
                    <View key={rink.id} style={styles.rinkBadge}>
                      <Text style={styles.rinkBadgeText}>{rink.name}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="location-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Venues Coming Soon</Text>
            <Text style={styles.emptyText}>Venue and rink information will be posted when the schedule is published.</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ==================
  // TAB: Lodging
  // ==================
  function renderLodgingTab() {
    return (
      <ScrollView contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
      >
        {eventHotels.length > 0 ? (
          eventHotels.map((hotel) => (
            <View key={hotel.id} style={styles.hotelFullCard}>
              {hotel.image_url ? (
                <Image source={{ uri: hotel.image_url }} style={styles.hotelImage} resizeMode="cover" />
              ) : null}
              <View style={styles.hotelFullBody}>
                <Text style={styles.hotelFullName}>{hotel.hotel_name}</Text>
                {hotel.city || hotel.state ? (
                  <Text style={styles.hotelFullLocation}>{[hotel.city, hotel.state].filter(Boolean).join(', ')}</Text>
                ) : null}
                {hotel.price_per_night ? (
                  <Text style={styles.hotelFullPrice}>${(hotel.price_per_night / 100).toFixed(0)}/night</Text>
                ) : null}
                {hotel.rate_description ? (
                  <Text style={styles.hotelFullRate}>{hotel.rate_description}</Text>
                ) : null}
                {hotel.booking_url ? (
                  <TouchableOpacity
                    style={styles.hotelFullBookBtn}
                    onPress={() => Linking.openURL(hotel.booking_url!)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.hotelFullBookBtnText}>Book Now</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="bed-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Lodging Information</Text>
            <Text style={styles.emptyText}>Hotel information and booking links will be available once lodging partners are confirmed.</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ==================
  // TAB: Who's Coming
  // ==================
  function renderWhosComingTab() {
    // Check if event is more than 1 month away
    const eventStart = displayEvent?.start_date ? new Date(displayEvent.start_date) : null;
    const now = new Date();
    const oneMonthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const isTooEarly = eventStart && eventStart > oneMonthFromNow;

    if (isTooEarly) {
      return (
        <ScrollView contentContainerStyle={styles.tabContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
        >
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Coming Soon</Text>
            <Text style={styles.emptyText}>
              The team list for this event will be available 1 month prior to the event date. Check back closer to the event!
            </Text>
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
      >
        {registeredTeams.length > 0 ? (
          <>
            <Text style={styles.whosComingCount}>{registeredTeams.length} Teams Registered</Text>
            {Object.entries(teamsByAge).map(([ageGroup, teams]) => (
              <View key={ageGroup} style={styles.ageGroupSection}>
                <Text style={styles.ageGroupHeader}>{ageGroup} ({teams.length})</Text>
                {teams.map((team, idx) => (
                  <View key={idx} style={styles.teamCard}>
                    <Text style={styles.teamCardName}>{team.team_name}</Text>
                    {team.org_name ? <Text style={styles.teamCardOrg}>{team.org_name}</Text> : null}
                    {team.city || team.state ? (
                      <Text style={styles.teamCardLocation}>{[team.city, team.state].filter(Boolean).join(', ')}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No Teams Yet</Text>
            <Text style={styles.emptyText}>Teams that have registered will appear here once approved.</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ==================
  // TAB: Contact
  // ==================
  function renderContactTab() {
    return (
      <ScrollView contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
      >
        <View style={styles.contactContainer}>
          <Text style={styles.contactTitle}>Contact Us</Text>
          <Text style={styles.contactSubtitle}>Have questions about this event? Reach out to the UHT team.</Text>

          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => Linking.openURL('mailto:info@ultimatetournaments.com?subject=' + encodeURIComponent(`Question about ${displayEvent?.name || 'event'}`))}
            activeOpacity={0.8}
          >
            <Text style={styles.contactBtnIcon}>{'✉️'}</Text>
            <View>
              <Text style={styles.contactBtnTitle}>Email Us</Text>
              <Text style={styles.contactBtnSub}>info@ultimatetournaments.com</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => Linking.openURL('https://ultimatetournaments.com')}
            activeOpacity={0.8}
          >
            <Text style={styles.contactBtnIcon}>{'🌐'}</Text>
            <View>
              <Text style={styles.contactBtnTitle}>Visit Website</Text>
              <Text style={styles.contactBtnSub}>ultimatetournaments.com</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ==================
  // Tab Content Router
  // ==================
  function renderTabContent() {
    switch (activeTab) {
      case 'info': return renderInfoTab();
      case 'merchandise': return renderMerchandiseTab();
      case 'my_schedule': return renderMyScheduleTab();
      case 'game_center': return renderGameCenterTab();
      case 'three_stars': return renderThreeStarsTab();
      case 'photos': return renderPhotosTab();
      case 'updates': return renderUpdatesTab();
      case 'promotions': return renderPromotionsTab();
      case 'venues': return renderVenuesTab();
      case 'lodging': return renderLodgingTab();
      case 'whos_coming': return renderWhosComingTab();
      case 'contact': return renderContactTab();
      default: return renderInfoTab();
    }
  }

  // ==================
  // Loading State
  // ==================
  if (loading && !displayEvent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>{'‹ Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{eventName || 'Event'}</Text>
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </SafeAreaView>
    );
  }

  // ==================
  // Main Render
  // ==================
  return (
    <SafeAreaView style={styles.container}>
      <HeicConverterHost />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>{'‹ Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {displayEvent?.name || eventName || 'Event'}
        </Text>
      </View>

      {renderHero()}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {renderTabBar()}

      {loading && !displayEvent ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : (
        renderTabContent()
      )}

      {/* Game check-in roster sheet: set each player Playing / Out / Suspended */}
      <Modal visible={!!ciSheet} transparent animationType="slide" onRequestClose={() => setCiSheet(null)}>
        <KeyboardAvoidingView style={styles.ciOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.ciSheet} onStartShouldSetResponder={() => { Keyboard.dismiss(); return false; }}>
            <View style={styles.ciHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.ciTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>{ciSheet?.teamName}</Text>
                <Text style={styles.ciSub} numberOfLines={1} maxFontSizeMultiplier={1.2}>{ciSheet?.gameLabel}</Text>
              </View>
              <TouchableOpacity onPress={() => setCiSheet(null)} style={{ padding: 6 }}>
                <Ionicons name="close" size={22} color={colors.navy} />
              </TouchableOpacity>
            </View>
            {ciStep === 'sign' ? (
              <View>
                <Text style={styles.ciSignTitle} maxFontSizeMultiplier={1.2}>Coach Sign-Off</Text>
                <Text style={styles.ciSignLegal} maxFontSizeMultiplier={1.2}>
                  By signing, you confirm this roster, the player statuses, and the starting goalie are accurate for this game. Your sign-off goes to the scorekeeper and appears on the official scoresheet.
                </Text>
                <SignaturePad height={140} onChange={(st, size) => { setCiStrokes(st); setCiPadSize(size); if (st.length > 0) setCiSignError(''); }} />
                {ciSignError ? <Text style={styles.ciGoalieErrorText} maxFontSizeMultiplier={1.2}>{ciSignError}</Text> : null}
                <TextInput
                  style={[styles.ciSignInput, { marginTop: 10 }]}
                  value={ciSignName}
                  onChangeText={setCiSignName}
                  placeholder="Type your full name"
                  placeholderTextColor="#9aa7ba"
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  maxFontSizeMultiplier={1.2}
                />
                <TouchableOpacity
                  style={[styles.ciSaveBtn, ciSignName.trim().length < 2 && { opacity: 0.5 }]}
                  disabled={ciSaving || ciSignName.trim().length < 2}
                  onPress={saveCheckinRoster}
                  activeOpacity={0.85}
                >
                  <Text style={styles.ciSaveBtnText} maxFontSizeMultiplier={1.2}>{ciSaving ? 'Saving...' : 'Sign & Check In'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCiStep('roster')} style={{ paddingVertical: 10 }}>
                  <Text style={styles.ciBackText} maxFontSizeMultiplier={1.2}>Back to roster</Text>
                </TouchableOpacity>
              </View>
            ) : ciLoading ? (
              <ActivityIndicator style={{ marginVertical: 30 }} color={colors.navy} />
            ) : ciRoster.length === 0 ? (
              <Text style={styles.ciEmpty}>No player list on file for this team yet. Add players on the team page, then check in.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {ciRoster.map((pl, i) => (
                  <View key={pl.lineup_id} style={[styles.ciRow, i === ciRoster.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={styles.ciJersey} maxFontSizeMultiplier={1.2}>#{pl.jersey_number}</Text>
                    <Text style={styles.ciName} numberOfLines={1} maxFontSizeMultiplier={1.2}>{pl.first_name} {pl.last_name}</Text>
                    <View style={styles.ciPills}>
                      {(['playing', 'out', 'suspended'] as const).map(st => (
                        <TouchableOpacity
                          key={st}
                          style={[styles.ciPill, pl.status === st && (st === 'playing' ? styles.ciPillPlaying : st === 'out' ? styles.ciPillOut : styles.ciPillSusp)]}
                          onPress={() => setCiRoster(prev => prev.map(q => q.lineup_id === pl.lineup_id ? { ...q, status: st } : q))}
                        >
                          <Text style={[styles.ciPillText, pl.status === st && styles.ciPillTextOn]} maxFontSizeMultiplier={1.1}>
                            {st === 'playing' ? 'Playing' : st === 'out' ? 'Out' : 'Susp'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
            {ciStep === 'roster' && ciRoster.length > 0 && (
              <View style={[{ marginTop: 12 }, ciGoalieError && styles.ciGoalieErrorBox]}>
                <Text style={[styles.ciGoalieLabel, ciGoalieError && { color: '#b91c1c' }]} maxFontSizeMultiplier={1.2}>STARTING GOALIE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                  {[...ciRoster].sort((a, b) =>
                    (String(b.position || '').toUpperCase() === 'G' ? 1 : 0) - (String(a.position || '').toUpperCase() === 'G' ? 1 : 0)
                  ).map(pl => (
                    <TouchableOpacity
                      key={pl.lineup_id}
                      style={[styles.ciGoalieChip, ciGoalie === pl.lineup_id && styles.ciGoalieChipOn]}
                      onPress={() => { setCiGoalieError(false); setCiGoalie(prev => (prev === pl.lineup_id ? null : pl.lineup_id)); }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.ciGoalieChipText, ciGoalie === pl.lineup_id && styles.ciGoalieChipTextOn]} maxFontSizeMultiplier={1.1}>
                        {ciGoalie === pl.lineup_id ? '★ ' : ''}#{pl.jersey_number} {pl.last_name}{String(pl.position || '').toUpperCase() === 'G' ? ' (G)' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {ciGoalieError ? (
              <Text style={styles.ciGoalieErrorText} maxFontSizeMultiplier={1.2}>You must select a starting goalie</Text>
            ) : null}
            {ciStep === 'roster' && ciRoster.length > 0 && (
              <TouchableOpacity
                style={styles.ciSaveBtn}
                disabled={ciSaving}
                onPress={() => {
                  if (!ciGoalie) { setCiGoalieError(true); return; }
                  setCiStep('sign');
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.ciSaveBtnText} maxFontSizeMultiplier={1.2}>
                  {ciSheet && gameCheckins[`${ciSheet.gameId}|${ciSheet.teamId}`] ? 'Save Roster' : 'Check In Team'}
                </Text>
              </TouchableOpacity>
            )}
            {isStaffUser && ciSheet && gameCheckins[`${ciSheet.gameId}|${ciSheet.teamId}`] ? (
              <TouchableOpacity onPress={undoCheckin} style={{ paddingVertical: 10 }}>
                <Text style={styles.ciUndoText} maxFontSizeMultiplier={1.2}>Undo check-in</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ==================
// Collapsible Section Component
// ==================
function CollapsibleSection({ title, iconName, children }: { title: string; iconName: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.collapsibleContainer}>
      <TouchableOpacity
        style={styles.collapsibleHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.collapsibleLeft}>
          <View style={styles.infoIconBox}>
            <Ionicons name={iconName} size={18} color={colors.navy} />
          </View>
          <Text style={styles.collapsibleTitle}>{title}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {expanded ? <View style={styles.collapsibleBody}>{children as any}</View> : null}
    </View>
  );
}

// ==================
// Styles
// ==================
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  poolChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6, borderWidth: 1 },
  poolChipBlue: { backgroundColor: '#e3edff', borderColor: '#93b8f5' },
  poolChipGrey: { backgroundColor: '#eceff3', borderColor: '#c3ccd8' },
  poolChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  poolChipTextBlue: { color: '#1d4ed8' },
  poolChipTextGrey: { color: '#51627a' },
  // Possible bracket games (My Schedule footer)
  possibleHeader: { fontSize: 11, color: '#7a8699', letterSpacing: 1.2, ...fonts.bold, marginBottom: 4 },
  possibleSub: { fontSize: 11.5, color: '#8a96a8', ...fonts.semibold, lineHeight: 16, marginBottom: 10 },
  possibleCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#cfd9e6', borderStyle: 'dashed' },
  possibleChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, backgroundColor: 'rgba(0,204,255,0.12)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 7 },
  possibleChipText: { fontSize: 9.5, color: colors.navy, letterSpacing: 0.8, ...fonts.bold },
  possibleMatchup: { fontSize: 14.5, color: colors.navy, ...fonts.bold },
  possibleMeta: { fontSize: 11.5, color: '#7a8699', ...fonts.semibold, marginTop: 3 },
  // Game check-in roster sheet
  ciOverlay: { flex: 1, backgroundColor: 'rgba(10,20,35,0.55)', justifyContent: 'flex-end' },
  ciSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28 },
  ciHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  ciTitle: { fontSize: 16, color: colors.navy, ...fonts.bold },
  ciSub: { fontSize: 12, color: '#7a8699', ...fonts.semibold, marginTop: 1 },
  ciEmpty: { fontSize: 13, color: '#5b6b83', ...fonts.semibold, textAlign: 'center', marginVertical: 24, lineHeight: 19 },
  ciRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f0f2f5' },
  ciJersey: { width: 34, fontSize: 12.5, color: '#7a8699', ...fonts.bold },
  ciName: { flex: 1, minWidth: 0, fontSize: 13.5, color: colors.navy, ...fonts.semibold },
  ciPills: { flexDirection: 'row', gap: 4 },
  ciPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#eef2f7' },
  ciPillPlaying: { backgroundColor: '#10b981' },
  ciPillOut: { backgroundColor: '#f59e0b' },
  ciPillSusp: { backgroundColor: '#dc2626' },
  ciPillText: { fontSize: 11, color: '#5b6b83', ...fonts.bold },
  ciPillTextOn: { color: '#fff' },
  ciGoalieLabel: { fontSize: 10, color: '#7a8699', letterSpacing: 1, ...fonts.bold, marginBottom: 6 },
  ciGoalieChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#eef2f7', borderWidth: 1, borderColor: '#dfe6ee' },
  ciGoalieChipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  ciGoalieChipText: { fontSize: 11.5, color: '#44536a', ...fonts.bold },
  ciGoalieChipTextOn: { color: '#00ccff' },
  ciGoalieErrorBox: { borderWidth: 1.5, borderColor: '#fca5a5', backgroundColor: '#fef2f2', borderRadius: 12, padding: 10 },
  ciGoalieErrorText: { color: '#b91c1c', fontSize: 12.5, ...fonts.bold, marginTop: 8, textAlign: 'center' },
  ciSignTitle: { fontSize: 15, color: colors.navy, ...fonts.bold, marginTop: 4, marginBottom: 8 },
  ciSignLegal: { fontSize: 12, color: '#5b6b83', ...fonts.semibold, lineHeight: 18, marginBottom: 14 },
  ciSignInput: { borderWidth: 1.5, borderColor: '#c9d6e4', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 17, color: colors.navy, fontStyle: 'italic', backgroundColor: '#fafcff' },
  ciBackText: { color: '#5b6b83', fontSize: 12.5, ...fonts.bold, textAlign: 'center' },
  ciSaveBtn: { backgroundColor: colors.navy, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  ciSaveBtnText: { color: '#fff', fontSize: 15, ...fonts.bold },
  ciUndoText: { color: '#b91c1c', fontSize: 12.5, ...fonts.bold, textAlign: 'center' },
  // Per-game check-in chips
  gcRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  gcChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#e9eef5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  gcChipDone: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' },
  gcChipText: { fontSize: 12, color: colors.navy, ...fonts.bold, flexShrink: 1 },
  gcChipTextDone: { color: '#047857' },
  container: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: { paddingVertical: spacing.xs, paddingRight: spacing.sm },
  backText: { color: colors.navy, fontSize: 16, ...fonts.semibold },
  headerTitle: { fontSize: 18, color: colors.text, ...fonts.bold, flex: 1 },

  // Hero
  heroCard: { backgroundColor: colors.navy, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  heroLogo: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: colors.white },
  heroLogoPlaceholder: {
    width: 64, height: 64, borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  heroLogoPlaceholderText: { color: colors.cyan, fontSize: 18, ...fonts.extrabold, letterSpacing: 1 },
  heroInfo: { flex: 1 },
  heroEventName: { fontSize: 18, color: colors.white, ...fonts.bold, marginBottom: spacing.xs },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  heroMetaIcon: { fontSize: 14 },
  heroDateText: { fontSize: 13, color: 'rgba(255,255,255,0.85)', ...fonts.medium },
  heroLocationText: { fontSize: 13, color: 'rgba(255,255,255,0.85)', ...fonts.medium },
  heroStatusRow: { marginTop: spacing.md, flexDirection: 'row' },
  heroStatusBadge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.full },
  heroStatusText: { fontSize: 11, color: colors.white, ...fonts.bold, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Tab Bar (USSSA-style)
  tabBarContainer: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBarScroll: {
    paddingHorizontal: spacing.sm,
  },
  tabItem: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    minWidth: 72,
    position: 'relative',
  },
  tabIcon: {
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.medium,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: colors.navy,
    ...fonts.bold,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: spacing.md,
    right: spacing.md,
    height: 3,
    backgroundColor: colors.navy,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },

  // Sub-tabs (Game Center)
  subTabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    backgroundColor: '#e4e9f0',
    borderRadius: 12,
    padding: 3,
  },
  subTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 9,
  },
  subTabActive: {
    backgroundColor: colors.white,
    shadowColor: '#0f2747', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  subTabText: {
    fontSize: 13,
    color: '#5b6b83',
    ...fonts.semibold,
  },
  subTabTextActive: {
    color: colors.navy,
  },

  // Common
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBanner: { backgroundColor: colors.errorBg, padding: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.sm, borderRadius: radii.sm },
  errorBannerText: { color: colors.error, fontSize: 14, ...fonts.medium },
  tabContent: {
    padding: spacing.lg,
    paddingBottom: 40,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },

  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: spacing.lg },
  emptyTitle: { fontSize: 18, color: colors.text, ...fonts.bold, marginBottom: spacing.sm, marginTop: spacing.md, textAlign: 'center' },
  emptyText: { fontSize: 14, color: colors.textSecondary, ...fonts.regular, textAlign: 'center', lineHeight: 22 },

  // Info Tab — banner + guarantee
  infoBanner: { width: '100%', height: 180, borderRadius: radii.md, marginBottom: spacing.md },
  guaranteeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.highlight, borderRadius: radii.sm,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.cyan,
  },
  guaranteeText: { fontSize: 15, color: colors.navy, ...fonts.bold },

  registeredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#eaf8f0',
    borderWidth: 1,
    borderColor: '#bfe6cd',
    borderRadius: 14,
    padding: 14,
  },
  registeredTitle: {
    fontSize: 15,
    color: '#14532d',
    ...fonts.bold,
  },
  registeredSub: {
    fontSize: 13,
    color: '#3f6e52',
    marginTop: 1,
  },
  registeredPill: {
    backgroundColor: '#1e9e55',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  registeredPillPending: {
    backgroundColor: '#fef3c7',
  },
  registeredPillText: {
    color: colors.white,
    fontSize: 11,
    ...fonts.bold,
  },
  registeredPillTextPending: {
    color: '#b45309',
  },
  regAnotherLink: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  regAnotherLinkText: {
    color: colors.navy,
    fontSize: 13,
    textDecorationLine: 'underline',
    ...fonts.semibold,
  },
  // Register / Share CTA
  ctaContainer: {
    marginBottom: spacing.md,
  },
  registerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  registerBtnText: {
    color: colors.white,
    fontSize: 17,
    ...fonts.bold,
  },
  shareCoachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.highlight,
    borderRadius: radii.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  shareCoachBtnText: {
    color: colors.navy,
    fontSize: 17,
    ...fonts.bold,
  },

  // Info Tab rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoIconBox: {
    width: 40, height: 40, borderRadius: radii.sm,
    backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center',
  },
  infoRowLabel: { fontSize: 14, color: colors.text, ...fonts.bold },
  infoRowValue: { fontSize: 14, color: colors.textSecondary, ...fonts.regular, marginTop: 2 },
  infoRowSub: { fontSize: 12, color: colors.textMuted, ...fonts.regular, marginTop: 2 },
  ageGroupPills: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6,
  },
  ageGroupPill: {
    backgroundColor: colors.navy, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  ageGroupPillText: {
    color: colors.white, fontSize: 12, ...fonts.bold,
  },

  // Info Tab — sections
  infoSection: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md,
  },
  infoSectionTitle: { fontSize: 16, color: colors.text, ...fonts.bold },
  venueInfoCard: {
    backgroundColor: colors.bg, borderRadius: radii.sm, padding: spacing.md, marginBottom: spacing.sm,
  },
  venueInfoName: { fontSize: 15, color: colors.text, ...fonts.semibold },
  venueInfoAddress: { fontSize: 13, color: colors.textSecondary, ...fonts.regular, marginTop: 4 },
  rinkPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  rinkPill: {
    backgroundColor: colors.white, borderRadius: radii.full, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  rinkPillText: { fontSize: 11, color: colors.textSecondary, ...fonts.medium },
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  viewAllBtnText: { fontSize: 14, color: colors.cyan, ...fonts.semibold },
  comingSoonBadge: {
    backgroundColor: colors.infoBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  comingSoonText: { fontSize: 10, color: colors.info, ...fonts.bold },

  // Collapsible
  collapsibleContainer: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  collapsibleLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  collapsibleTitle: { fontSize: 14, color: colors.text, ...fonts.bold },
  collapsibleChevron: { fontSize: 12, color: colors.textMuted },
  collapsibleBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },

  // Hotels in Info tab (compact)
  hotelCard: {
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  hotelName: { fontSize: 14, color: colors.text, ...fonts.semibold },
  hotelLocation: { fontSize: 12, color: colors.textMuted, ...fonts.regular, marginTop: 2 },
  hotelRate: { fontSize: 12, color: colors.textSecondary, ...fonts.regular, marginTop: 4 },
  hotelPrice: { fontSize: 14, color: colors.navy, ...fonts.bold, marginTop: 4 },
  hotelBookBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.navy,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
  },
  hotelBookBtnText: { fontSize: 12, color: colors.white, ...fonts.bold },

  // Description
  descriptionText: { fontSize: 14, color: colors.textSecondary, ...fonts.regular, lineHeight: 22 },
  placeholderText: { fontSize: 14, color: colors.textMuted, ...fonts.regular, fontStyle: 'italic' },

  // Fee rows
  feeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  feeDivision: { fontSize: 14, color: colors.text, ...fonts.medium },
  feeAmount: { fontSize: 14, color: colors.navy, ...fonts.bold },

  // Merchandise
  merchandiseContainer: { alignItems: 'center', paddingVertical: spacing.xxl },
  merchandiseLogo: { width: 80, height: 80, marginBottom: spacing.lg },
  merchandiseTitle: { fontSize: 22, color: colors.navy, ...fonts.bold, marginBottom: spacing.sm },
  merchandiseSubtitle: { fontSize: 14, color: colors.textSecondary, ...fonts.regular, textAlign: 'center', marginBottom: spacing.xxl, paddingHorizontal: spacing.xl },
  merchandiseBtn: {
    backgroundColor: colors.navy,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxl,
    borderRadius: radii.full,
    marginBottom: spacing.lg,
  },
  merchandiseBtnText: { fontSize: 16, color: colors.white, ...fonts.bold },
  merchandiseNote: { fontSize: 12, color: colors.textMuted, ...fonts.regular, textAlign: 'center', paddingHorizontal: spacing.xxl },

  // Game cards
  gameCard: {
    backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  gameCardChampionship: { borderWidth: 2, borderColor: '#d4af37', backgroundColor: '#fffdf4' },
  gameCardConsolation: { borderWidth: 2, borderColor: '#b08968', backgroundColor: '#fffaf5' },
  champGameRow: { flexDirection: 'row', marginBottom: 8 },
  champGameChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#b8860b', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  champGameChipText: { color: '#fff', fontSize: 10, letterSpacing: 1.5, ...fonts.bold },
  gameTimeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  gameTime: { fontSize: 13, color: colors.textMuted, ...fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.3 },
  gameRink: { fontSize: 13, color: colors.info, ...fonts.medium, marginBottom: spacing.sm },
  gameDivision: { fontSize: 12, color: colors.navy, ...fonts.semibold, marginBottom: spacing.sm },
  matchup: { gap: spacing.xs },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  teamLabel: { fontSize: 11, color: colors.textMuted, ...fonts.semibold, letterSpacing: 0.5, width: 40 },
  teamName: { fontSize: 15, color: colors.text, ...fonts.semibold, flex: 1 },
  teamLogo: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#f0f0f0' },
  lockerText: { fontSize: 11, color: colors.cyan, ...fonts.semibold },
  lockerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 48, marginTop: 2 },
  vsText: { fontSize: 12, color: colors.textMuted, ...fonts.regular, textAlign: 'center', marginLeft: 48 },
  myTeamHighlight: { color: colors.navy, ...fonts.bold },
  timeFilterBtnLive: { backgroundColor: '#e74c3c' },
  liveFilterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#e74c3c', marginRight: 5 },
  livePeriodText: { marginLeft: 'auto', fontSize: 11, color: colors.success, ...fonts.bold },
  starsStrip: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#fff8e6', borderWidth: 1, borderColor: '#f5d98d', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginTop: 8 },
  starsStripText: { flex: 1, fontSize: 11, color: '#8a6d1a', ...fonts.medium, lineHeight: 15 },
  announceStrip: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#eef4fb', borderWidth: 1, borderColor: '#c9def5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginTop: 8 },
  announceText: { flex: 1, fontSize: 11.5, color: colors.navy, ...fonts.semibold, lineHeight: 15 },
  standingsCard: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: 14, borderWidth: 1, borderColor: '#e8eaee' },
  standingsCardHeader: { backgroundColor: colors.navy, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  standingsCardTitle: { color: '#fff', fontSize: 14, ...fonts.bold },
  standingsCardSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, ...fonts.semibold },
  poolStrip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 6 },
  poolStripDot: { width: 7, height: 7, borderRadius: 4 },
  poolStripText: { fontSize: 10.5, letterSpacing: 1.5, ...fonts.bold },
  starsRulesCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff8e6', borderWidth: 1, borderColor: '#f5d98d', borderRadius: 14, padding: 14, marginBottom: 12 },
  starsRulesTitle: { fontSize: 13.5, color: '#6b520f', ...fonts.bold },
  starsRulesSub: { fontSize: 11.5, color: '#8a6d1a', marginTop: 2, lineHeight: 15 },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  starOrd: { minWidth: 44, flexShrink: 0, fontSize: 12, color: '#b8860b', ...fonts.bold },
  starName: { flex: 1, fontSize: 14, color: colors.text, ...fonts.semibold },
  starJersey: { fontSize: 12, color: colors.textMuted, ...fonts.bold },
  inlineScore: { fontSize: 18, color: colors.textSecondary, ...fonts.semibold, marginLeft: 'auto', paddingLeft: spacing.sm },
  inlineScoreWin: { color: colors.navy, ...fonts.bold },
  scoresheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#eef4fb',
  },
  liveFeedBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#fdecea', borderWidth: 1, borderColor: '#f5b7b1',
  },
  liveFeedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#e74c3c' },
  liveFeedBtnText: { fontSize: 13, color: '#c0392b', ...fonts.semibold },
  scoresheetBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  gameVenue: { fontSize: 11, color: colors.textMuted, ...fonts.regular, marginTop: spacing.sm, textAlign: 'right' },

  // Game status
  gameCardLive: { borderColor: colors.success, borderWidth: 2 },
  gameCardDelayed: { borderColor: colors.warning, borderWidth: 2 },
  gameStatusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  gameStatusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.full, gap: 4 },
  gameStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  gameStatusText: { fontSize: 11, color: colors.white, ...fonts.bold, textTransform: 'uppercase', letterSpacing: 0.3 },
  delayNoteText: { fontSize: 11, color: colors.warning, ...fonts.medium, flex: 1 },
  delayMinText: { fontSize: 11, color: colors.warning, ...fonts.medium },

  // Division picker
  divisionPickerContainer: { backgroundColor: colors.bg, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  divisionPickerScroll: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  divisionPill: {
    paddingVertical: 7, paddingHorizontal: spacing.md + 2, borderRadius: radii.full,
    backgroundColor: '#e9eef5',
  },
  divisionPillActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  divisionPillText: { fontSize: 12, color: colors.textSecondary, ...fonts.semibold },
  divisionPillTextActive: { color: colors.white },

  // Time filter
  timeFilterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  timeFilterBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 5, paddingHorizontal: spacing.md, borderRadius: radii.full,
    backgroundColor: '#e9eef5',
  },
  timeFilterBtnActive: { backgroundColor: colors.navy },
  timeFilterText: { fontSize: 12, color: colors.textSecondary, ...fonts.semibold },
  timeFilterTextActive: { color: colors.white },

  // Scores
  dateSectionHeader: { fontSize: 15, color: colors.navy, ...fonts.bold, marginTop: spacing.md, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  scoreCard: {
    backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  scoreCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  scoreCardMeta: { flexDirection: 'column', alignItems: 'flex-start', gap: 2, flex: 1, paddingRight: 8 },
  scoreCardTime: { fontSize: 13, color: colors.textMuted, ...fonts.semibold },
  scoreCardRink: { fontSize: 12, color: colors.info, ...fonts.medium },
  scoreCardDivision: { fontSize: 12, color: colors.navy, ...fonts.semibold, marginBottom: spacing.sm },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.full, gap: 4 },
  statusBadgeText: { fontSize: 11, color: colors.white, ...fonts.bold, textTransform: 'uppercase', letterSpacing: 0.3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  scoreMatchup: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.sm },
  scoreTeamCol: { flex: 1 },
  scoreTeamColRight: { alignItems: 'flex-end' },
  scoreTeamLabel: { fontSize: 10, color: colors.textMuted, ...fonts.semibold, letterSpacing: 0.5, marginBottom: 2, textTransform: 'uppercase' },
  scoreTeamName: { fontSize: 14, color: colors.text, ...fonts.semibold },
  scoreTeamLogo: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f0f0f0', marginBottom: 4 },
  scoreTeamWinner: { ...fonts.bold, color: colors.navy },
  scoreCenter: { alignItems: 'center', paddingHorizontal: spacing.md, minWidth: 70 },
  scoreNumbers: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  scoreValue: { fontSize: 24, color: colors.textSecondary, ...fonts.semibold },
  scoreValueWinner: { color: colors.navy, ...fonts.bold },
  scoreDash: { fontSize: 20, color: colors.textMuted, ...fonts.regular, marginHorizontal: 2 },
  scoreVs: { fontSize: 14, color: colors.textMuted, ...fonts.medium },
  otLabel: { fontSize: 10, color: colors.textMuted, ...fonts.bold, marginTop: 2, textTransform: 'uppercase' },
  periodLabel: { fontSize: 10, color: colors.success, ...fonts.bold, marginTop: 2, textTransform: 'uppercase' },

  // Standings
  standingsSection: { marginBottom: spacing.xxl },
  standingsSectionHeader: { fontSize: 15, color: colors.navy, ...fonts.bold, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.3 },
  standingsTable: {
    backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  standingsHeaderRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f7fa', paddingVertical: 7, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#e8ecf1' },
  standingsHeaderCell: { fontSize: 10, color: '#7a8699', ...fonts.bold, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },
  standingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#f0f2f5' },
  standingsRowLast: { borderBottomWidth: 0 },

  // Event photos
  photoCta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.navy, borderRadius: 14, padding: 14, marginBottom: spacing.sm },
  photoCtaTitle: { color: colors.white, fontSize: 15, ...fonts.bold },
  photoCtaSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2, lineHeight: 16 },
  pushCard: {
    backgroundColor: '#f0f7ff', borderWidth: 1.5, borderColor: '#9fd4f5', borderRadius: 14,
    padding: 14, marginBottom: 12,
  },
  pushCardTitle: { fontSize: 15, color: colors.navy, ...fonts.bold, marginBottom: 4 },
  pushCardBody: { fontSize: 13.5, color: '#2a3c52', lineHeight: 19 },
  pushCardBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pushCardUploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.navy,
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
  },
  pushCardUploadText: { color: colors.white, fontSize: 13, ...fonts.bold },
  pushCardLaterBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#e3ecf5' },
  pushCardLaterText: { color: '#44576e', fontSize: 13, ...fonts.semibold },
  photoLoadMoreBtn: {
    marginTop: 12, alignSelf: 'center', backgroundColor: '#e8f1fa', borderRadius: 999,
    paddingHorizontal: 20, paddingVertical: 11, borderWidth: 1, borderColor: '#bcd8ee',
  },
  photoLoadMoreText: { color: colors.navy, fontSize: 13, ...fonts.bold },
  photoUploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.navy, borderRadius: 12, paddingVertical: 13, marginBottom: spacing.sm },
  photoUploadBtnText: { color: colors.white, fontSize: 15, ...fonts.bold },
  champUploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#fff4d6', borderWidth: 1, borderColor: '#f0d58a', borderRadius: 12, paddingVertical: 11, marginBottom: spacing.sm },
  champUploadBtnText: { color: '#8a6d1a', fontSize: 14, ...fonts.bold },
  photoCount: { fontSize: 12, color: colors.textMuted, ...fonts.semibold, textAlign: 'center', marginBottom: spacing.md },
  champSectionTitle: { fontSize: 11, color: '#8a6d1a', letterSpacing: 1.5, ...fonts.bold, marginBottom: 8 },
  champCard: { width: 210, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 2, borderColor: '#e7c45e' },
  champImg: { width: 210, height: 140, backgroundColor: '#e8ecf1' },
  champCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fffaf0' },
  champCardTrophy: { fontSize: 18 },
  champCardTeam: { fontSize: 13, color: '#1d2a3d', ...fonts.bold },
  champCardDiv: { fontSize: 11, color: '#8a6d1a', ...fonts.semibold, marginTop: 1 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.96)', justifyContent: 'center', alignItems: 'center' },
  viewerClose: { position: 'absolute', top: 54, right: 20, zIndex: 2, padding: 8 },
  viewerImg: { width: '100%', height: '70%' },
  viewerChampLabel: { color: '#f5d98d', fontSize: 16, ...fonts.bold, marginTop: 12 },
  viewerActions: { position: 'absolute', bottom: 40, flexDirection: 'row', gap: 26 },
  viewerReport: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 10 },
  viewerReportText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, ...fonts.semibold },
  champPickerBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.5)', justifyContent: 'flex-end' },
  champPickerSheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
  champPickerTitle: { fontSize: 19, color: '#101c30', ...fonts.bold },
  champPickerSub: { fontSize: 13, color: '#5b6b83', marginTop: 3, marginBottom: 12 },
  champPickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f2f5' },
  champPickerTeam: { flex: 1, fontSize: 15, color: '#101c30', ...fonts.semibold },
  champPickerDiv: { fontSize: 12, color: '#5b6b83' },
  champPickerCancel: { marginTop: 14, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#eef2f7' },
  champPickerCancelText: { fontSize: 15, color: '#101c30', ...fonts.bold },
  standingsRowAlt: { backgroundColor: '#f8f9fa' },
  standingsCell: { fontSize: 12, color: colors.text, ...fonts.regular, textAlign: 'center' },
  standingsRankCol: { width: 24 },
  standingsTeamCol: { flex: 1, textAlign: 'left', paddingRight: 4 },
  standingsRecCol: { width: 44, textAlign: 'center' as const },
  standingsStatCol: { width: 24 },
  standingsStatColWide: { width: 32 },
  standingsRankText: { ...fonts.bold, color: colors.navy },
  standingsTeamText: { ...fonts.semibold, textAlign: 'left' },
  standingsPointsText: { ...fonts.bold, color: colors.navy },
  standingsDiffText: { ...fonts.semibold },

  // Venues Tab
  venueCard: {
    backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  venueHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  venueIcon: { fontSize: 24 },
  venueName: { fontSize: 16, color: colors.text, ...fonts.bold },
  venueAddress: { fontSize: 13, color: colors.textSecondary, ...fonts.regular, marginTop: 4 },
  directionsBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.navy,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
  },
  directionsBtnText: { fontSize: 13, color: colors.white, ...fonts.bold },
  rinksContainer: { marginTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  rinksLabel: { fontSize: 12, color: colors.textMuted, ...fonts.semibold, marginRight: spacing.xs },
  rinkBadge: {
    backgroundColor: colors.highlight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.cyan,
  },
  rinkBadgeText: { fontSize: 12, color: colors.navy, ...fonts.semibold },

  // Lodging Tab (full cards)
  hotelFullCard: {
    backgroundColor: colors.card, borderRadius: radii.md,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  hotelImage: { width: '100%', height: 160 },
  hotelFullBody: { padding: spacing.lg },
  hotelFullName: { fontSize: 18, color: colors.text, ...fonts.bold },
  hotelFullLocation: { fontSize: 13, color: colors.textSecondary, ...fonts.regular, marginTop: 4 },
  hotelFullPrice: { fontSize: 16, color: colors.navy, ...fonts.bold, marginTop: spacing.sm },
  hotelFullRate: { fontSize: 13, color: colors.textMuted, ...fonts.regular, marginTop: 4 },
  hotelFullBookBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.navy,
    paddingVertical: spacing.md,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  hotelFullBookBtnText: { fontSize: 14, color: colors.white, ...fonts.bold },

  // Who's Coming
  whosComingCount: { fontSize: 16, color: colors.navy, ...fonts.bold, marginBottom: spacing.lg },
  ageGroupSection: { marginBottom: spacing.xl },
  ageGroupHeader: { fontSize: 14, color: colors.navy, ...fonts.bold, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.3 },
  teamCard: {
    backgroundColor: colors.card, borderRadius: radii.sm, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  teamCardName: { fontSize: 14, color: colors.text, ...fonts.semibold },
  teamCardOrg: { fontSize: 12, color: colors.textSecondary, ...fonts.regular, marginTop: 2 },
  teamCardLocation: { fontSize: 12, color: colors.textMuted, ...fonts.regular, marginTop: 2 },

  // Contact
  contactContainer: { paddingVertical: spacing.xxl },
  contactTitle: { fontSize: 22, color: colors.navy, ...fonts.bold, marginBottom: spacing.sm, textAlign: 'center' },
  contactSubtitle: { fontSize: 14, color: colors.textSecondary, ...fonts.regular, textAlign: 'center', marginBottom: spacing.xxl },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  contactBtnIcon: { fontSize: 28 },
  contactBtnTitle: { fontSize: 16, color: colors.text, ...fonts.bold },
  contactBtnSub: { fontSize: 13, color: colors.textSecondary, ...fonts.regular, marginTop: 2 },
  recapWrap: { marginBottom: spacing.lg },
  recapHero: { backgroundColor: colors.navy, borderRadius: 14, padding: spacing.lg, alignItems: 'center' },
  recapKicker: { color: colors.cyan, fontSize: 11, letterSpacing: 3, ...fonts.bold },
  recapStatsRow: { flexDirection: 'row', gap: 34, marginTop: 10 },
  recapStatNum: { color: '#fff', fontSize: 26, ...fonts.bold },
  recapStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 9, letterSpacing: 2, ...fonts.bold, marginTop: 2 },
  recapSummary: { fontSize: 13.5, lineHeight: 20, color: '#33465c', ...fonts.regular, marginTop: spacing.md, marginBottom: spacing.sm },
  recapChampCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 2, borderColor: '#e8d9a8', overflow: 'hidden', marginTop: spacing.md, alignItems: 'center', paddingBottom: spacing.md },
  recapChampPhoto: { width: '100%', aspectRatio: 4 / 3 },
  recapChampDiv: { fontSize: 10, letterSpacing: 2, color: '#b8860b', ...fonts.bold, marginTop: 10 },
  recapChampName: { fontSize: 19, color: colors.navy, ...fonts.bold, marginTop: 2, textAlign: 'center', paddingHorizontal: 12 },
  recapChampSub: { fontSize: 12, color: '#6b7a90', ...fonts.regular, marginTop: 2 },
  recapBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.navy, borderRadius: 12, paddingVertical: 13, marginTop: spacing.md },
  recapBtnText: { color: '#fff', fontSize: 14, ...fonts.semibold },
});
