import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  Share,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Calendar from 'expo-calendar';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { clearAuth, getUser, authFetch, User } from '../services/auth';
import ScreenHeader from '../components/ScreenHeader';

interface MenuGridItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  adminOnly?: boolean;
  scorekeeperOnly?: boolean;
}

interface MenuListItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  subtitle?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  destructive?: boolean;
}

const SITE_URL = 'https://ultimatetournaments.com';

interface ShareTeam {
  id: string;
  name: string;
  age_group: string;
  invite_code?: string;
  roster_share_token?: string;
  coaches?: { id: string }[];
  managers?: { id: string }[];
  created_by?: string;
}

export default function MenuScreen({ navigation }: { navigation: any }) {
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [myTeams, setMyTeams] = useState<ShareTeam[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  const lastLoadRef = React.useRef<number>(0);
  const STALE_MS = 30000; // 30 seconds

  useEffect(() => {
    getUser().then(setCurrentUser);
  }, []);

  // Reload teams when screen focuses, but skip if loaded recently
  useFocusEffect(
    useCallback(() => {
      if (lastLoadRef.current && Date.now() - lastLoadRef.current < STALE_MS) {
        return;
      }
      let cancelled = false;
      async function load() {
        setLoadingTeams(true);
        try {
          const res = await authFetch('/api/teams/my-teams');
          const json = await res.json() as any;
          if (!cancelled && json.success && Array.isArray(json.data)) {
            setMyTeams(json.data);
            lastLoadRef.current = Date.now();
          }
        } catch {}
        if (!cancelled) setLoadingTeams(false);
      }
      load();
      return () => { cancelled = true; };
    }, []),
  );

  const isAdmin = currentUser?.roles?.some(r =>
    ['admin', 'tournament_director', 'director'].includes(r)
  ) || false;

  const isScorekeeper = currentUser?.roles?.some(r =>
    ['scorekeeper'].includes(r)
  ) || false;

  const isCoach = currentUser?.roles?.some(r =>
    ['coach', 'manager', 'admin', 'director', 'tournament_director'].includes(r)
  ) || false;

  function handleLogOut() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearAuth();
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'Welcome' }],
              })
            );
          } catch {
            Alert.alert('Error', 'Failed to log out. Please try again.');
          }
        },
      },
    ]);
  }

  function openURL(url: string) {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open link.');
    });
  }

  const MANAGE_ITEMS: MenuGridItem[] = [
    {
      label: 'Team Management',
      icon: 'people-outline',
      onPress: () => navigation.navigate('My Teams'),
    },
    {
      label: 'Team Stats',
      icon: 'stats-chart-outline',
      onPress: () => navigation.navigate('My Teams'),
    },
    {
      label: 'Assign Scorekeepers',
      icon: 'clipboard-outline',
      adminOnly: true,
      onPress: () => navigation.navigate('Scorekeeper'),
    },
  ];

  const BROWSE_ITEMS: MenuGridItem[] = [
    { label: 'Events', icon: 'calendar-outline', onPress: () => navigation.navigate('Events') },
    { label: 'Teams', icon: 'search-outline', onPress: () => navigation.navigate('My Teams') },
  ];

  const SHOP_ITEMS: MenuGridItem[] = [
    { label: 'Champions Locker', icon: 'trophy-outline', onPress: () => navigation.navigate('Shop') },
    { label: 'Merch', icon: 'shirt-outline', onPress: () => navigation.navigate('Shop') },
  ];

  async function handleCalendarSync() {
    try {
      const { status } = await Calendar.requestCalendarPermissions();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Calendar access is needed to sync events.');
        return;
      }

      // Get or create UHT calendar
      const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
      let uhtCalendar = calendars.find(cal => cal.title === 'UHT Tournaments');

      if (!uhtCalendar) {
        uhtCalendar = await Calendar.createCalendar({
          title: 'UHT Tournaments',
          color: '#003e79',
          entityType: Calendar.EntityTypes.EVENT,
          name: 'uht-tournaments',
          ownerAccount: 'UHT',
          accessLevel: Calendar.CalendarAccessLevel.OWNER,
        });
      }

      // Fetch user's followed team schedules
      const res = await authFetch('/api/teams/my-teams');
      const json = await res.json();
      if (!json.success || !json.data?.length) {
        Alert.alert('No Teams', 'Follow some teams first to sync their schedules.');
        return;
      }

      // Fetch games for followed teams
      let totalAdded = 0;
      for (const team of json.data) {
        try {
          const gamesRes = await authFetch(`/api/teams/${team.id}/games`);
          const gamesJson = await gamesRes.json();
          const games = gamesJson.data || gamesJson.games || [];
          for (const game of games) {
            if (!game.start_time) continue;
            const start = new Date(game.start_time);
            const end = new Date(start.getTime() + 90 * 60 * 1000); // 90 min default
            try {
              await uhtCalendar.createEvent({
                title: `${game.home_team_name || 'Home'} vs ${game.away_team_name || 'Away'}`,
                startDate: start,
                endDate: end,
                location: game.rink_name || game.venue_name || '',
                notes: `Game #${game.game_number || ''} — ${[game.age_group, game.division_level].filter(Boolean).join(' ')}`,
              });
              totalAdded++;
            } catch {}
          }
        } catch {}
      }

      Alert.alert('Calendar Synced', `Added ${totalAdded} game${totalAdded !== 1 ? 's' : ''} to your UHT Tournaments calendar.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Calendar sync failed.');
    }
  }

  const ACCOUNT_ITEMS: MenuListItem[] = [
    {
      label: 'Account Settings',
      icon: 'person-circle-outline',
      onPress: () => navigation.navigate('AccountSettings'),
    },
    {
      label: 'Notifications',
      icon: 'notifications-outline',
      onPress: () => navigation.navigate('NotificationSettings'),
    },
    {
      label: 'Add to Calendar',
      icon: 'calendar-outline',
      subtitle: 'Sync all upcoming events to Calendar',
      rightIcon: 'sync-outline',
      onPress: handleCalendarSync,
    },
  ];

  const SUPPORT_ITEMS: MenuListItem[] = [
    {
      label: 'Contact Support',
      icon: 'mail-outline',
      subtitle: 'info@ultimatetournaments.com',
      onPress: () => openURL('mailto:info@ultimatetournaments.com'),
    },
    {
      label: 'FAQ',
      icon: 'help-circle-outline',
      onPress: () => openURL(`${SITE_URL}/faq`),
    },
    {
      label: 'Visit Website',
      icon: 'globe-outline',
      onPress: () => openURL(SITE_URL),
    },
  ];

  const LEGAL_ITEMS: MenuListItem[] = [
    {
      label: 'Privacy Policy',
      icon: 'shield-checkmark-outline',
      onPress: () => openURL(`${SITE_URL}/privacy`),
    },
    {
      label: 'Terms of Service',
      icon: 'document-text-outline',
      onPress: () => openURL(`${SITE_URL}/terms`),
    },
  ];

  const LOGOUT_ITEMS: MenuListItem[] = [
    {
      label: 'Log Out',
      icon: 'log-out-outline',
      onPress: handleLogOut,
      destructive: true,
    },
  ];

  async function handleShareTeamCode(team: ShareTeam) {
    if (!team.invite_code) return;
    try {
      await Share.share({
        message: `Join ${team.name} (${team.age_group}) on Ultimate Hockey Tournaments!\n\nTeam Code: ${team.invite_code}\n\nDownload the UHT app and use this code to join as a coach or manager.`,
      });
    } catch {}
  }

  async function handleShareRosterLink(team: ShareTeam) {
    if (!team.roster_share_token) return;
    try {
      await Share.share({
        message: `You're invited to join ${team.name} (${team.age_group}) on Ultimate Hockey Tournaments!\n\nClaim your player's spot on the roster:\nhttps://ultimatetournaments.com/roster/${team.roster_share_token}`,
      });
    } catch {}
  }

  // Determine if the current user is a coach/creator of a specific team
  function isTeamCoach(team: ShareTeam): boolean {
    if (!currentUser) return false;
    if (team.created_by === currentUser.id) return true;
    if (team.coaches?.some(c => c.id === currentUser.id)) return true;
    if (team.managers?.some(m => m.id === currentUser.id)) return true;
    if (isCoach || isAdmin) return true;
    return false;
  }

  function renderShareSection() {
    if (myTeams.length === 0 && !loadingTeams) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SHARE & INVITE</Text>

        {loadingTeams && myTeams.length === 0 ? (
          <View style={styles.shareLoadingRow}>
            <ActivityIndicator size="small" color={colors.navy} />
          </View>
        ) : (
          myTeams.map((team) => {
            const teamIsCoach = isTeamCoach(team);
            const hasInvite = !!team.invite_code;
            const hasRoster = !!team.roster_share_token;

            if (!hasInvite && !hasRoster) return null;

            return (
              <View key={team.id} style={styles.shareCard}>
                {/* Team header */}
                <View style={styles.shareCardHeader}>
                  <View style={styles.shareTeamBadge}>
                    <Text style={styles.shareTeamBadgeText}>{team.age_group}</Text>
                  </View>
                  <Text style={styles.shareTeamName} numberOfLines={1}>{team.name}</Text>
                </View>

                {/* Share buttons */}
                <View style={styles.shareButtonsRow}>
                  {teamIsCoach && hasInvite ? (
                    <TouchableOpacity
                      style={styles.shareButton}
                      activeOpacity={0.7}
                      onPress={() => handleShareTeamCode(team)}
                    >
                      <Ionicons name="person-add-outline" size={18} color={colors.white} />
                      <Text style={styles.shareButtonText}>Invite Coaches</Text>
                    </TouchableOpacity>
                  ) : null}

                  {hasRoster ? (
                    <TouchableOpacity
                      style={[styles.shareButton, styles.shareButtonRoster]}
                      activeOpacity={0.7}
                      onPress={() => handleShareRosterLink(team)}
                    >
                      <Ionicons name="link-outline" size={18} color={colors.white} />
                      <Text style={styles.shareButtonText}>
                        {teamIsCoach ? 'Send Roster Link' : 'Share with Team'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>
    );
  }

  function renderGridSection(title: string, items: MenuGridItem[]) {
    // Filter out admin/scorekeeper-only items for regular users
    const visibleItems = items.filter(item => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.scorekeeperOnly && !isScorekeeper && !isAdmin) return false;
      return true;
    });

    if (visibleItems.length === 0) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.grid}>
          {visibleItems.map((item) => (
            <View key={item.label} style={styles.gridCardWrapper}>
              <TouchableOpacity
                style={styles.gridCard}
                activeOpacity={0.7}
                onPress={item.onPress || (() => console.log(`Tapped: ${item.label}`))}
              >
                <Ionicons name={item.icon} size={22} color={colors.navy} />
                <Text style={styles.gridLabel}>{item.label}</Text>
              </TouchableOpacity>
            </View>
          ))}
          {visibleItems.length % 3 === 1 && (
            <>
              <View style={styles.gridCardWrapper} />
              <View style={styles.gridCardWrapper} />
            </>
          )}
          {visibleItems.length % 3 === 2 && (
            <View style={styles.gridCardWrapper} />
          )}
        </View>
      </View>
    );
  }

  function renderListSection(title: string, items: MenuListItem[]) {
    return (
      <View style={styles.section}>
        {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
        <View style={styles.listContainer}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.listItem,
                index === 0 && styles.listItemFirst,
                index === items.length - 1 && styles.listItemLast,
              ]}
              activeOpacity={0.7}
              onPress={item.onPress || (() => console.log(`Tapped: ${item.label}`))}
            >
              <View style={styles.listItemLeft}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.destructive ? colors.error : colors.navy}
                  style={styles.listIcon}
                />
                <View style={styles.listTextContainer}>
                  <Text
                    style={[
                      styles.listLabel,
                      item.destructive && styles.listLabelDestructive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.subtitle ? (
                    <Text style={styles.listSubtitle}>{item.subtitle}</Text>
                  ) : null}
                </View>
              </View>
              <Ionicons
                name={item.rightIcon || 'chevron-forward'}
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Menu" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderShareSection()}
        {renderGridSection('MANAGE', MANAGE_ITEMS)}
        {renderGridSection('BROWSE', BROWSE_ITEMS)}
        {renderGridSection('SHOP', SHOP_ITEMS)}
        {renderListSection('YOUR ACCOUNT', ACCOUNT_ITEMS)}
        {renderListSection('SUPPORT', SUPPORT_ITEMS)}
        {renderListSection('LEGAL', LEGAL_ITEMS)}
        {renderListSection('', LOGOUT_ITEMS)}

        {/* App version */}
        <Text style={styles.versionText}>
          Ultimate Tournaments v{appVersion}
        </Text>
      </ScrollView>
    </View>
  );
}

const GRID_GAP = 8;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 80,
  },

  // Sections
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
    paddingHorizontal: 2,
  },

  // Grid cards — compact 3-column layout
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -(GRID_GAP / 2),
  },
  gridCardWrapper: {
    width: '33.33%',
    paddingHorizontal: GRID_GAP / 2,
    marginBottom: GRID_GAP,
  },
  gridCard: {
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
  },
  gridLabel: {
    fontSize: 11,
    color: colors.text,
    ...fonts.semibold,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 14,
  },

  // List items
  listContainer: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listItemFirst: {
    // no special styling needed
  },
  listItemLast: {
    borderBottomWidth: 0,
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  listIcon: {
    marginRight: spacing.md,
  },
  listTextContainer: {
    flex: 1,
  },
  listLabel: {
    fontSize: 15,
    color: colors.text,
    ...fonts.medium,
  },
  listLabelDestructive: {
    color: colors.error,
  },
  listSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 1,
  },

  // Share & Invite section
  shareLoadingRow: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  shareCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  shareTeamBadge: {
    backgroundColor: colors.cyan,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.xs,
    marginRight: spacing.sm,
  },
  shareTeamBadgeText: {
    color: colors.white,
    fontSize: 11,
    ...fonts.bold,
    textTransform: 'uppercase',
  },
  shareTeamName: {
    fontSize: 15,
    color: colors.text,
    ...fonts.semibold,
    flex: 1,
  },
  shareButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    gap: 6,
  },
  shareButtonRoster: {
    backgroundColor: colors.cyan,
  },
  shareButtonText: {
    color: colors.white,
    fontSize: 13,
    ...fonts.semibold,
  },

  // Version footer
  versionText: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.regular,
    marginTop: spacing.xs,
    marginBottom: spacing.xxxl,
  },
});
