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
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getEventDetail, getEventSchedule, getEventScores, getEventStandings, getMyTeamIds } from '../services/api';
import { getUser, User, authFetch } from '../services/auth';
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
  const { eventId, eventName, event: navEvent, initialTab } = route.params || {};
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab || 'info');
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
  // Event photo gallery
  const [photos, setPhotos] = useState<any[]>([]);
  const [photosTotal, setPhotosTotal] = useState(0);
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
    if (activeTab === 'game_center' && !standingsLoaded) {
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
                  {tab.label}
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
  function renderInfoTab() {
    return (
      <ScrollView
        contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
      >
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

    return (
      <FlatList
        data={myGames}
        keyExtractor={(item, index) => item.id || String(index)}
        contentContainerStyle={styles.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
        renderItem={({ item }) => {
          const isMyHome = myTeamIds.includes(item.home_team_id || '');
          const isMyAway = myTeamIds.includes(item.away_team_id || '');
          const gameStatus = item.status || 'scheduled';
          const isLive = gameStatus === 'in_progress' || gameStatus === 'intermission' || gameStatus === 'warmup';
          const isDelayed = gameStatus === 'delayed';
          const isFinal = gameStatus === 'final';

          return (
            <View style={[styles.gameCard, isLive ? styles.gameCardLive : null, isDelayed ? styles.gameCardDelayed : null]}>
              {/* Status badge */}
              {gameStatus !== 'scheduled' && (
                <View style={styles.gameStatusRow}>
                  <View style={[styles.gameStatusBadge, { backgroundColor: getStatusColor(gameStatus) }]}>
                    {isLive && <View style={styles.gameStatusDot} />}
                    <Text style={styles.gameStatusText}>{getStatusLabel(gameStatus)}</Text>
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
              {item.rink_name || item.rink ? (
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
  async function loadPhotos() {
    try {
      const res = await fetch(`https://uht.chad-157.workers.dev/api/photos/events/${eventId}/photos`);
      const json = await res.json();
      if (json.success) {
        setPhotos(json.data.photos || []);
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
          const res = await authFetch(`/api/photos/events/${eventId}/photos`, {
            method: 'POST',
            body: JSON.stringify({ data: asset.base64, mimeType: 'image/jpeg', kind, teamId }),
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
                <Image source={{ uri: p.url }} style={{ width: thumb, height: thumb, borderRadius: 10, backgroundColor: '#e8ecf1' }} />
              </TouchableOpacity>
            ))}
          </View>
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
                <Text style={styles.gameTime}>{item.home_team_name || 'Home'} {item.home_score ?? ''} - {item.away_score ?? ''} {item.away_team_name || 'Away'}</Text>
              </View>
              {item.division_name ? <Text style={styles.gameDivision}>{item.division_name?.trim()}</Text> : null}
              <View style={{ marginTop: 8, gap: 6 }}>
                {stars.map(st => (
                  <View key={st.n} style={styles.starRow}>
                    <Text style={styles.starOrd}>{'★'.repeat(Math.max(1, 4 - st.n))}</Text>
                    <Text style={styles.starName}>{st.name || `#${st.jersey}`}</Text>
                    {st.jersey ? <Text style={styles.starJersey}>#{st.jersey}</Text> : null}
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
            <View style={[styles.gameCard, isLive ? styles.gameCardLive : null, isDelayed ? styles.gameCardDelayed : null]}>
              {gameStatus !== 'scheduled' && (
                <View style={styles.gameStatusRow}>
                  <View style={[styles.gameStatusBadge, { backgroundColor: getStatusColor(gameStatus) }]}>
                    {isLive && <View style={styles.gameStatusDot} />}
                    <Text style={styles.gameStatusText}>{getStatusLabel(gameStatus)}</Text>
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
              {item.rink_name || item.rink ? (
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
                        {game.rink_name ? <Text style={styles.scoreCardRink} numberOfLines={2}>{[(game as any).venue_name, game.rink_name].filter(Boolean).join(' - ')}</Text> : null}
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
                      <Text style={[styles.standingsCell, styles.standingsTeamCol, styles.standingsTeamText]} numberOfLines={1}>{entry.team_name}</Text>
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
  tabContent: { padding: spacing.lg, paddingBottom: 40 },

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
  starOrd: { width: 44, fontSize: 12, color: '#b8860b', ...fonts.bold },
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
});
