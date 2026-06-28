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
} from 'react-native';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getEventDetail, getEventSchedule, getEventScores, getEventStandings } from '../services/api';

type TabKey = 'schedule' | 'scores' | 'standings' | 'info';

interface GameSlot {
  id: string;
  time?: string;
  date?: string;
  rink_name?: string;
  rink?: string;
  home_team_name?: string;
  away_team_name?: string;
  home_team?: string;
  away_team?: string;
  home_score?: number | null;
  away_score?: number | null;
  division_name?: string;
}

interface ScoreGame {
  id: string;
  game_number?: number;
  start_time?: string;
  home_team_name?: string;
  away_team_name?: string;
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
  rinks?: VenueRink[];
}

interface EventInfo {
  id: string;
  name: string;
  logo_url?: string;
  city?: string;
  state?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  status?: string;
  venues?: EventVenue[];
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
  const { eventId, eventName, event: navEvent } = route.params || {};
  const [activeTab, setActiveTab] = useState<TabKey>('schedule');
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

  useEffect(() => {
    loadData();
  }, [eventId]);

  useEffect(() => {
    if (activeTab === 'scores' && !scoresLoaded) {
      loadScores();
    } else if (activeTab === 'standings' && !standingsLoaded) {
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
    if (activeTab === 'schedule') {
      loadData(true);
    } else if (activeTab === 'scores') {
      setScoresLoaded(false);
      loadScores().then(() => setRefreshing(false));
    } else if (activeTab === 'standings') {
      setStandingsLoaded(false);
      loadStandings().then(() => setRefreshing(false));
    } else {
      // Info tab - refresh event data
      loadData(true);
    }
  }

  function formatDateRange(startDate?: string, endDate?: string): string {
    if (!startDate) return 'Dates TBD';
    try {
      const start = new Date(startDate);
      const opts: Intl.DateTimeFormatOptions = {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      };
      const startStr = start.toLocaleDateString('en-US', opts);

      if (!endDate) return startStr;

      const end = new Date(endDate);
      const endStr = end.toLocaleDateString('en-US', opts);

      return `${startStr} - ${endStr}`;
    } catch {
      return startDate;
    }
  }

  function formatDateRangeShort(startDate?: string, endDate?: string): string {
    if (!startDate) return 'Dates TBD';
    try {
      const start = new Date(startDate);
      const shortOpts: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
      };
      const startStr = start.toLocaleDateString('en-US', shortOpts);

      if (!endDate) return startStr;

      const end = new Date(endDate);
      const yearOpts: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      };
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
        parts.push(
          d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        );
      } catch {
        parts.push(date);
      }
    }
    if (time) {
      parts.push(time);
    }
    return parts.join(' at ');
  }

  // --- Scores helpers ---

  function formatScoreTime(startTime?: string): string {
    if (!startTime) return 'TBD';
    try {
      const d = new Date(startTime);
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch {
      return 'TBD';
    }
  }

  function formatScoreDate(startTime?: string): string {
    if (!startTime) return '';
    try {
      const d = new Date(startTime);
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  function getDateKey(startTime?: string): string {
    if (!startTime) return 'TBD';
    try {
      const d = new Date(startTime);
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

  // Group scores by date
  const scoresByDate = scores.reduce<Record<string, ScoreGame[]>>((acc, game) => {
    const key = getDateKey(game.start_time);
    if (!acc[key]) acc[key] = [];
    acc[key].push(game);
    return acc;
  }, {});

  const sortedDateKeys = Object.keys(scoresByDate).sort();

  // Group standings by division + pool
  interface StandingsGroup {
    label: string;
    key: string;
    entries: StandingEntry[];
  }

  const standingsGroups: StandingsGroup[] = [];
  const groupMap: Record<string, StandingEntry[]> = {};

  standings.forEach((entry) => {
    const poolLabel = entry.pool_name || 'Pool';
    const key = `${entry.age_group || ''}|${entry.division_level || ''}|${poolLabel}`;
    if (!groupMap[key]) groupMap[key] = [];
    groupMap[key].push(entry);
  });

  Object.keys(groupMap).sort().forEach((key) => {
    const parts = key.split('|');
    const label = [parts[0], parts[1], parts[2]].filter(Boolean).join(' ');
    const entries = groupMap[key].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.goal_differential - a.goal_differential;
    });
    standingsGroups.push({ label, key, entries });
  });

  // Get venues from event data (API now returns venues with rinks)
  const eventVenues: EventVenue[] = (event as any)?.venues || [];

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'schedule', label: 'Schedule' },
    { key: 'scores', label: 'Scores' },
    { key: 'standings', label: 'Standings' },
    { key: 'info', label: 'Info' },
  ];

  // Display data: prefer loaded API event, fall back to nav params
  const displayEvent = event;

  // --- Render Hero Section ---
  function renderHero() {
    if (!displayEvent) return null;

    return (
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          {/* Logo */}
          {displayEvent.logo_url ? (
            <Image
              source={{ uri: displayEvent.logo_url }}
              style={styles.heroLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.heroLogoPlaceholder}>
              <Text style={styles.heroLogoPlaceholderText}>UHT</Text>
            </View>
          )}

          {/* Event Info */}
          <View style={styles.heroInfo}>
            <Text style={styles.heroEventName} numberOfLines={2}>
              {displayEvent.name || eventName || 'Event'}
            </Text>

            {/* Date Range */}
            <View style={styles.heroMetaRow}>
              <Text style={styles.heroMetaIcon}>{'📅'}</Text>
              <Text style={styles.heroDateText}>
                {formatDateRangeShort(displayEvent.start_date, displayEvent.end_date)}
              </Text>
            </View>

            {/* Location */}
            {(displayEvent.city || displayEvent.state) ? (
              <View style={styles.heroMetaRow}>
                <Text style={styles.heroMetaIcon}>{'📍'}</Text>
                <Text style={styles.heroLocationText}>
                  {[displayEvent.city, displayEvent.state].filter(Boolean).join(', ')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Status Badge */}
        {displayEvent.status ? (
          <View style={styles.heroStatusRow}>
            <View
              style={[
                styles.heroStatusBadge,
                { backgroundColor: getEventStatusColor(displayEvent.status) },
              ]}
            >
              <Text style={styles.heroStatusText}>
                {getEventStatusLabel(displayEvent.status)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  if (loading && !displayEvent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {eventName || 'Event'}
          </Text>
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </SafeAreaView>
    );
  }

  // --- Render Scores Tab ---
  function renderScoresTab() {
    if (scoresLoading) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      );
    }

    if (scores.length === 0) {
      return (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.navy}
              colors={[colors.navy]}
            />
          }
        >
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Scores Yet</Text>
            <Text style={styles.emptyText}>
              Scores will appear here once games have started. Pull down to refresh.
            </Text>
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.navy}
            colors={[colors.navy]}
          />
        }
      >
        {sortedDateKeys.map((dateKey) => {
          const gamesForDate = scoresByDate[dateKey];
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
                    {/* Top row: time + rink + status */}
                    <View style={styles.scoreCardTopRow}>
                      <View style={styles.scoreCardMeta}>
                        <Text style={styles.scoreCardTime}>{formatScoreTime(game.start_time)}</Text>
                        {game.rink_name ? (
                          <Text style={styles.scoreCardRink}>{game.rink_name}</Text>
                        ) : null}
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                        <Text style={styles.statusBadgeText}>{getStatusLabel(game.status)}</Text>
                        {isLive ? <View style={styles.liveDot} /> : null}
                      </View>
                    </View>

                    {/* Division label */}
                    {game.age_group || game.division_level ? (
                      <Text style={styles.scoreCardDivision}>
                        {[game.age_group, game.division_level].filter(Boolean).join(' ')}
                      </Text>
                    ) : null}

                    {/* Matchup row */}
                    <View style={styles.scoreMatchup}>
                      {/* Away team */}
                      <View style={styles.scoreTeamCol}>
                        <Text style={styles.scoreTeamLabel}>AWAY</Text>
                        <Text
                          style={[
                            styles.scoreTeamName,
                            awayWins ? styles.scoreTeamWinner : null,
                          ]}
                          numberOfLines={2}
                        >
                          {game.away_team_name || 'TBD'}
                        </Text>
                      </View>

                      {/* Score */}
                      <View style={styles.scoreCenter}>
                        {game.status === 'scheduled' ? (
                          <Text style={styles.scoreVs}>vs</Text>
                        ) : (
                          <View style={styles.scoreNumbers}>
                            <Text
                              style={[
                                styles.scoreValue,
                                awayWins ? styles.scoreValueWinner : null,
                              ]}
                            >
                              {game.away_score}
                            </Text>
                            <Text style={styles.scoreDash}>-</Text>
                            <Text
                              style={[
                                styles.scoreValue,
                                homeWins ? styles.scoreValueWinner : null,
                              ]}
                            >
                              {game.home_score}
                            </Text>
                          </View>
                        )}
                        {isFinal && (game.is_overtime || game.is_shootout) ? (
                          <Text style={styles.otLabel}>
                            {game.is_shootout ? 'SO' : 'OT'}
                          </Text>
                        ) : null}
                        {isLive && game.period ? (
                          <Text style={styles.periodLabel}>
                            {game.status === 'intermission' ? `INT ${game.period}` : `P${game.period}`}
                          </Text>
                        ) : null}
                      </View>

                      {/* Home team */}
                      <View style={[styles.scoreTeamCol, styles.scoreTeamColRight]}>
                        <Text style={styles.scoreTeamLabel}>HOME</Text>
                        <Text
                          style={[
                            styles.scoreTeamName,
                            homeWins ? styles.scoreTeamWinner : null,
                          ]}
                          numberOfLines={2}
                        >
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

  // --- Render Standings Tab ---
  function renderStandingsTab() {
    if (standingsLoading) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      );
    }

    if (standings.length === 0) {
      return (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.navy}
              colors={[colors.navy]}
            />
          }
        >
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Standings Available</Text>
            <Text style={styles.emptyText}>
              Standings will be updated as pool play games are completed. Pull down to refresh.
            </Text>
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.navy}
            colors={[colors.navy]}
          />
        }
      >
        {standingsGroups.map((group) => (
          <View key={group.key} style={styles.standingsSection}>
            <Text style={styles.standingsSectionHeader}>{group.label}</Text>
            <View style={styles.standingsTable}>
              {/* Header row */}
              <View style={styles.standingsHeaderRow}>
                <Text style={[styles.standingsHeaderCell, styles.standingsRankCol]}>#</Text>
                <Text style={[styles.standingsHeaderCell, styles.standingsTeamCol]}>Team</Text>
                <Text style={[styles.standingsHeaderCell, styles.standingsStatCol]}>GP</Text>
                <Text style={[styles.standingsHeaderCell, styles.standingsStatCol]}>W</Text>
                <Text style={[styles.standingsHeaderCell, styles.standingsStatCol]}>L</Text>
                <Text style={[styles.standingsHeaderCell, styles.standingsStatCol]}>T</Text>
                <Text style={[styles.standingsHeaderCell, styles.standingsStatColWide]}>PTS</Text>
                <Text style={[styles.standingsHeaderCell, styles.standingsStatCol]}>GF</Text>
                <Text style={[styles.standingsHeaderCell, styles.standingsStatCol]}>GA</Text>
                <Text style={[styles.standingsHeaderCell, styles.standingsStatColWide]}>DIFF</Text>
              </View>

              {/* Data rows */}
              {group.entries.map((entry, idx) => (
                <View
                  key={entry.team_id}
                  style={[
                    styles.standingsRow,
                    idx % 2 === 1 ? styles.standingsRowAlt : null,
                  ]}
                >
                  <Text style={[styles.standingsCell, styles.standingsRankCol, styles.standingsRankText]}>
                    {idx + 1}
                  </Text>
                  <Text
                    style={[styles.standingsCell, styles.standingsTeamCol, styles.standingsTeamText]}
                    numberOfLines={1}
                  >
                    {entry.team_name}
                  </Text>
                  <Text style={[styles.standingsCell, styles.standingsStatCol]}>{entry.games_played}</Text>
                  <Text style={[styles.standingsCell, styles.standingsStatCol]}>{entry.wins}</Text>
                  <Text style={[styles.standingsCell, styles.standingsStatCol]}>{entry.losses}</Text>
                  <Text style={[styles.standingsCell, styles.standingsStatCol]}>{entry.ties}</Text>
                  <Text style={[styles.standingsCell, styles.standingsStatColWide, styles.standingsPointsText]}>
                    {entry.points}
                  </Text>
                  <Text style={[styles.standingsCell, styles.standingsStatCol]}>{entry.goals_for}</Text>
                  <Text style={[styles.standingsCell, styles.standingsStatCol]}>{entry.goals_against}</Text>
                  <Text style={[styles.standingsCell, styles.standingsStatColWide, styles.standingsDiffText]}>
                    {entry.goal_differential > 0 ? `+${entry.goal_differential}` : entry.goal_differential}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  // --- Render Info Tab ---
  function renderInfoTab() {
    return (
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.navy}
            colors={[colors.navy]}
          />
        }
      >
        {/* Event Description */}
        {displayEvent?.description ? (
          <View style={styles.infoSection}>
            <Text style={styles.infoSectionTitle}>About This Event</Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoDescriptionText}>{displayEvent.description}</Text>
            </View>
          </View>
        ) : null}

        {/* Locker Room Assignments */}
        <View style={styles.infoSection}>
          <Text style={styles.infoSectionTitle}>Locker Room Assignments</Text>
          <View style={styles.infoCard}>
            <View style={styles.lockerRoomContent}>
              <View style={styles.lockerRoomIconContainer}>
                <Text style={styles.lockerRoomIcon}>{'🔒'}</Text>
              </View>
              <View style={styles.lockerRoomTextContainer}>
                <View style={styles.lockerRoomHeaderRow}>
                  <Text style={styles.lockerRoomTitle}>Locker Room Info</Text>
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonBadgeText}>Coming Soon</Text>
                  </View>
                </View>
                <Text style={styles.lockerRoomDescription}>
                  Locker room assignments will be posted before event day
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Venues / Rinks */}
        <View style={styles.infoSection}>
          <Text style={styles.infoSectionTitle}>Venues & Rinks</Text>
          {eventVenues.length > 0 ? (
            eventVenues.map((venue) => (
              <View key={venue.venue_id} style={[styles.infoCard, { marginBottom: spacing.sm }]}>
                <View style={styles.venueRow}>
                  <Text style={styles.venueIcon}>{'🏟️'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.venueName}>{venue.venue_name}</Text>
                    {venue.city || venue.state ? (
                      <Text style={styles.venueAddress}>
                        {[venue.address, venue.city, venue.state].filter(Boolean).join(', ')}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {venue.rinks && venue.rinks.length > 0 ? (
                  <View style={styles.rinksContainer}>
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
            <View style={styles.infoCard}>
              <Text style={styles.infoPlaceholderText}>
                Venue information will be available once the schedule is published.
              </Text>
            </View>
          )}
        </View>

      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
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

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key ? styles.tabActive : null]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key ? styles.tabTextActive : null,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !displayEvent ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : activeTab === 'schedule' ? (
        <FlatList
          data={schedule}
          keyExtractor={(item, index) => item.id || String(index)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.navy}
              colors={[colors.navy]}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.gameCard}>
              <View style={styles.gameTimeRow}>
                <Text style={styles.gameTime}>
                  {formatGameTime(item.time, item.date)}
                </Text>
                {item.rink_name || item.rink ? (
                  <Text style={styles.gameRink}>
                    {item.rink_name || item.rink}
                  </Text>
                ) : null}
              </View>

              {item.division_name ? (
                <Text style={styles.gameDivision}>{item.division_name}</Text>
              ) : null}

              <View style={styles.matchup}>
                <View style={styles.teamRow}>
                  <Text style={styles.teamLabel}>HOME</Text>
                  <Text style={styles.teamName}>
                    {item.home_team_name || item.home_team || 'TBD'}
                  </Text>
                </View>
                <Text style={styles.vsText}>vs</Text>
                <View style={styles.teamRow}>
                  <Text style={styles.teamLabel}>AWAY</Text>
                  <Text style={styles.teamName}>
                    {item.away_team_name || item.away_team || 'TBD'}
                  </Text>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Schedule Not Yet Published</Text>
              <Text style={styles.emptyText}>
                The schedule for this event hasn't been published yet. Check back
                closer to the event date.
              </Text>
            </View>
          }
        />
      ) : activeTab === 'scores' ? (
        renderScoresTab()
      ) : activeTab === 'standings' ? (
        renderStandingsTab()
      ) : (
        renderInfoTab()
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
  },
  backText: {
    color: colors.navy,
    fontSize: 16,
    ...fonts.semibold,
  },
  headerTitle: {
    fontSize: 20,
    color: colors.text,
    ...fonts.bold,
    flex: 1,
  },

  // ===========================
  // Hero Section
  // ===========================
  heroCard: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  heroLogo: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    backgroundColor: colors.white,
  },
  heroLogoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroLogoPlaceholderText: {
    color: colors.cyan,
    fontSize: 18,
    ...fonts.extrabold,
    letterSpacing: 1,
  },
  heroInfo: {
    flex: 1,
  },
  heroEventName: {
    fontSize: 20,
    color: colors.white,
    ...fonts.bold,
    marginBottom: spacing.xs,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  heroMetaIcon: {
    fontSize: 14,
  },
  heroDateText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    ...fonts.medium,
  },
  heroLocationText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    ...fonts.medium,
  },
  heroStatusRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
  },
  heroStatusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  heroStatusText: {
    fontSize: 12,
    color: colors.white,
    ...fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBanner: {
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    marginHorizontal: spacing.xxl,
    marginTop: spacing.md,
    borderRadius: radii.sm,
  },
  errorBannerText: {
    color: colors.error,
    fontSize: 14,
    ...fonts.medium,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  tabText: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.semibold,
  },
  tabTextActive: {
    color: colors.white,
  },
  listContent: {
    padding: spacing.xxl,
    paddingBottom: 40,
  },
  gameCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  gameTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  gameTime: {
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  gameRink: {
    fontSize: 13,
    color: colors.info,
    ...fonts.medium,
  },
  gameDivision: {
    fontSize: 12,
    color: colors.navy,
    ...fonts.semibold,
    marginBottom: spacing.sm,
  },
  matchup: {
    gap: spacing.xs,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  teamLabel: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.semibold,
    letterSpacing: 0.5,
    width: 40,
  },
  teamName: {
    fontSize: 15,
    color: colors.text,
    ...fonts.semibold,
    flex: 1,
  },
  vsText: {
    fontSize: 12,
    color: colors.textMuted,
    ...fonts.regular,
    textAlign: 'center',
    marginLeft: 48,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    textAlign: 'center',
    lineHeight: 22,
  },

  // ===========================
  // Scores styles
  // ===========================
  dateSectionHeader: {
    fontSize: 15,
    color: colors.navy,
    ...fonts.bold,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scoreCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  scoreCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  scoreCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  scoreCardTime: {
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.semibold,
  },
  scoreCardRink: {
    fontSize: 12,
    color: colors.info,
    ...fonts.medium,
  },
  scoreCardDivision: {
    fontSize: 12,
    color: colors.navy,
    ...fonts.semibold,
    marginBottom: spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    color: colors.white,
    ...fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  scoreMatchup: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  scoreTeamCol: {
    flex: 1,
  },
  scoreTeamColRight: {
    alignItems: 'flex-end',
  },
  scoreTeamLabel: {
    fontSize: 10,
    color: colors.textMuted,
    ...fonts.semibold,
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  scoreTeamName: {
    fontSize: 14,
    color: colors.text,
    ...fonts.semibold,
  },
  scoreTeamWinner: {
    ...fonts.bold,
    color: colors.navy,
  },
  scoreCenter: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minWidth: 70,
  },
  scoreNumbers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  scoreValue: {
    fontSize: 24,
    color: colors.textSecondary,
    ...fonts.semibold,
  },
  scoreValueWinner: {
    color: colors.navy,
    ...fonts.bold,
  },
  scoreDash: {
    fontSize: 20,
    color: colors.textMuted,
    ...fonts.regular,
    marginHorizontal: 2,
  },
  scoreVs: {
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.medium,
  },
  otLabel: {
    fontSize: 10,
    color: colors.textMuted,
    ...fonts.bold,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  periodLabel: {
    fontSize: 10,
    color: colors.success,
    ...fonts.bold,
    marginTop: 2,
    textTransform: 'uppercase',
  },

  // ===========================
  // Standings styles
  // ===========================
  standingsSection: {
    marginBottom: spacing.xxl,
  },
  standingsSectionHeader: {
    fontSize: 15,
    color: colors.navy,
    ...fonts.bold,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  standingsTable: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  standingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  standingsHeaderCell: {
    fontSize: 10,
    color: colors.white,
    ...fonts.bold,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  standingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  standingsRowAlt: {
    backgroundColor: '#f8f9fa',
  },
  standingsCell: {
    fontSize: 12,
    color: colors.text,
    ...fonts.regular,
    textAlign: 'center',
  },
  standingsRankCol: {
    width: 22,
  },
  standingsTeamCol: {
    flex: 1,
    textAlign: 'left',
    paddingLeft: spacing.xs,
  },
  standingsStatCol: {
    width: 26,
  },
  standingsStatColWide: {
    width: 32,
  },
  standingsRankText: {
    ...fonts.bold,
    color: colors.navy,
  },
  standingsTeamText: {
    ...fonts.semibold,
    textAlign: 'left',
  },
  standingsPointsText: {
    ...fonts.bold,
    color: colors.navy,
  },
  standingsDiffText: {
    ...fonts.semibold,
    fontSize: 11,
  },

  // ===========================
  // Info Tab styles
  // ===========================
  infoSection: {
    marginBottom: spacing.xxl,
  },
  infoSectionTitle: {
    fontSize: 15,
    color: colors.navy,
    ...fonts.bold,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  infoDescriptionText: {
    fontSize: 15,
    color: colors.text,
    ...fonts.regular,
    lineHeight: 23,
  },
  infoPlaceholderText: {
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.regular,
    lineHeight: 21,
  },
  lockerRoomContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  lockerRoomIconContainer: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockerRoomIcon: {
    fontSize: 24,
  },
  lockerRoomTextContainer: {
    flex: 1,
  },
  lockerRoomHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  lockerRoomTitle: {
    fontSize: 15,
    color: colors.text,
    ...fonts.semibold,
  },
  comingSoonBadge: {
    backgroundColor: colors.cyan,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  comingSoonBadgeText: {
    fontSize: 10,
    color: colors.white,
    ...fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  lockerRoomDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
    lineHeight: 19,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  venueRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  venueIcon: {
    fontSize: 18,
  },
  venueName: {
    fontSize: 15,
    color: colors.text,
    ...fonts.semibold,
    flex: 1,
  },
  venueAddress: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 2,
  },
  rinksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingLeft: 30,
  },
  rinkBadge: {
    backgroundColor: colors.highlight,
    borderRadius: radii.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.cyan,
  },
  rinkBadgeText: {
    fontSize: 12,
    color: colors.cyanDark,
    ...fonts.semibold,
  },
});
