import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Share,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
// Logo upload uses React Native's built-in FormData with { uri, type, name }
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch, getUser, getToken, getActiveRole, User } from '../services/auth';
import { API_URL } from '../constants/api';
import { unfollowTeam, leaveTeam } from '../services/api';
import AppHeader from '../components/AppHeader';
import RoleBar from '../components/RoleBar';
import { refreshBadgeCount } from '../services/notifications';
import { setActiveRole, refreshUser, addRoleToAccount } from '../services/auth';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HERO_H = Math.round(SCREEN_WIDTH * 366 / 851);
interface Team {
  id: string;
  name: string;
  age_group: string;
  division_level: string;
  city: string;
  state: string;
  organization_name: string;
  head_coach_name: string;
  logo_url?: string;
  player_count?: number;
  invite_code?: string;
  parent_invite_code?: string;
  roster_share_token?: string;
}

export default function MyTeamsScreen({ navigation }: { navigation: any }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [uploadingTeamId, setUploadingTeamId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joiningByCode, setJoiningByCode] = useState(false);
  const [activeRoleState, setActiveRoleState] = useState<string>('');
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Use activeRole for role-gating instead of raw roles array
  const isCoach = ['coach', 'manager', 'admin', 'director'].includes(activeRoleState);
  const isParent = activeRoleState === 'parent';

  const lastLoadRef = React.useRef<number>(0);
  const STALE_MS = 30000; // 30 seconds

  useEffect(() => {
    // Refresh user from API for latest roles, fall back to stored
    refreshUser().then(u => u || getUser()).then(u => {
      setCurrentUser(u);
      if (u?.roles) setUserRoles(u.roles);
    }).catch(() => {});
    getActiveRole().then(r => { if (r) setActiveRoleState(r); });
    refreshBadgeCount().then(c => setUnreadCount(c as number)).catch(() => {});
  }, []);

  const fetchTeams = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await authFetch('/api/teams/my-teams');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        // Use effective_logo_url (org fallback) if team has no direct logo
        setTeams(json.data.map((t: any) => ({
          ...t,
          logo_url: t.effective_logo_url || t.logo_url,
        })));
        lastLoadRef.current = Date.now();
      } else {
        setTeams([]);
      }
    } catch {
      setTeams([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Re-read active role every time screen gains focus (role may have changed)
      getActiveRole().then(r => { if (r) setActiveRoleState(r); });
      // Refresh user from API for latest roles
      refreshUser().then(u => u || getUser()).then(u => {
        setCurrentUser(u);
        if (u?.roles) setUserRoles(u.roles);
      }).catch(() => {});
      refreshBadgeCount().then(c => setUnreadCount(c as number)).catch(() => {});
      // Skip team fetch if loaded recently (pull-to-refresh always refetches)
      if (lastLoadRef.current && Date.now() - lastLoadRef.current < STALE_MS) {
        return;
      }
      fetchTeams();
    }, [fetchTeams]),
  );

  function handleRefresh() {
    fetchTeams(true);
  }

  function handleRemoveTeam(team: Team) {
    const actionLabel = isCoach ? 'Leave Team' : 'Unfollow Team';
    const confirmLabel = isCoach ? 'Leave' : 'Unfollow';
    const prompt = isCoach
      ? `Are you sure you want to leave ${team.name}? You will lose coach access to this team.`
      : `Are you sure you want to unfollow ${team.name}?`;

    Alert.alert(actionLabel, prompt, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: async () => {
          try {
            if (isCoach) {
              const result = await leaveTeam(team.id);
              if (result.success === false) {
                Alert.alert('Cannot Leave', result.error || 'Unable to leave this team.');
                return;
              }
            } else {
              await unfollowTeam(team.id);
            }
            setTeams((prev) => prev.filter((t) => t.id !== team.id));
          } catch {
            Alert.alert('Error', `Failed to ${isCoach ? 'leave' : 'unfollow'} team. Please try again.`);
          }
        },
      },
    ]);
  }

  async function handleJoinByCode() {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      Alert.alert('Enter a Code', 'Please enter a team code to continue.');
      return;
    }
    setJoiningByCode(true);
    try {
      if (isCoach) {
        // Coach/manager: join as staff via /api/teams/join
        const res = await authFetch('/api/teams/join', {
          method: 'POST',
          body: JSON.stringify({ inviteCode: code }),
        });
        const json = await res.json() as any;
        if (json.success) {
          setJoinCode('');
          Alert.alert('Joined!', `You've been added to ${json.data?.teamName || 'the team'} as a ${json.data?.role || 'coach'}.`);
          fetchTeams(true);
        } else {
          Alert.alert('Invalid Code', json.error || 'That team code was not found. Please check and try again.');
        }
      } else {
        // Parent/fan: follow by code
        const res = await authFetch('/api/follows/by-code', {
          method: 'POST',
          body: JSON.stringify({ inviteCode: code }),
        });
        const json = await res.json() as any;
        if (json.success) {
          setJoinCode('');
          Alert.alert('Team Followed!', `You're now following ${json.data.teamName}.`);
          fetchTeams(true);
        } else {
          Alert.alert('Invalid Code', json.error || 'That team code was not found. Please check and try again.');
        }
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setJoiningByCode(false);
    }
  }

  async function handleLogoUpload(team: Team) {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Error', 'Could not read image data');
        return;
      }
      setUploadingTeamId(team.id);

      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const base64Data = asset.base64;

      const token = await getToken();
      const uploadResult = await fetch(`${API_URL}/api/teams/${team.id}/logo-base64`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ data: base64Data, mimeType }),
      });

      const json = await uploadResult.json() as any;
      if (json.success) {
        const newLogoUrl = json.data.logo_url;
        setTeams((prev) =>
          prev.map((t) =>
            t.id === team.id ? { ...t, logo_url: newLogoUrl } : t
          )
        );
        Alert.alert('Logo Updated', 'Your team logo has been uploaded.');
      } else {
        Alert.alert('Error', json.error || 'Failed to upload logo');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Upload failed');
    } finally {
      setUploadingTeamId(null);
    }
  }

  function renderTeamCard({ item }: { item: Team }) {
    return (
      <TouchableOpacity
        style={styles.teamRow}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('TeamDetail' as never, { teamId: item.id, teamName: item.name } as never)}
      >
        <View style={styles.teamRowMain}>
          {/* Logo */}
          <TouchableOpacity
            style={styles.logoContainer}
            activeOpacity={isCoach ? 0.7 : 1}
            onPress={isCoach ? () => handleLogoUpload(item) : undefined}
            disabled={!isCoach || uploadingTeamId === item.id}
          >
            {item.logo_url ? (
              <Image source={{ uri: item.logo_url }} style={styles.teamLogo} />
            ) : (
              <Image source={require('../../assets/uht-logo.png')} style={styles.teamLogoFallback} resizeMode="contain" />
            )}
            {uploadingTeamId === item.id && (
              <View style={styles.logoOverlay}>
                <ActivityIndicator color={colors.white} size="small" />
              </View>
            )}
          </TouchableOpacity>

          {/* Info */}
          <View style={styles.teamInfo}>
            <Text style={styles.teamName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.ageGroupBadge}>
                <Text style={styles.ageGroupText}>{item.age_group}</Text>
              </View>
              {item.division_level ? (
                <View style={styles.divisionBadge}>
                  <Text style={styles.divisionBadgeText}>{item.division_level}</Text>
                </View>
              ) : null}
              {isCoach && (
                <Text style={styles.rosterCount}>
                  {(item.player_count || 0) > 0 ? `${item.player_count} players` : 'No roster'}
                </Text>
              )}
            </View>
            {item.city ? (
              <Text style={styles.metaText} numberOfLines={1}>
                {item.city}{item.state ? `, ${item.state}` : ''}{item.organization_name ? ` • ${item.organization_name}` : ''}
              </Text>
            ) : item.organization_name ? (
              <Text style={styles.metaText} numberOfLines={1}>{item.organization_name}</Text>
            ) : null}
          </View>

          {/* Chevron */}
          <View style={styles.chevronCircle}>
            <Ionicons name="chevron-forward" size={18} color="#16233b" />
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  function renderEmptyState() {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="people-outline" size={64} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>No Teams Yet</Text>
        <Text style={styles.emptySubtitle}>
          {isCoach
            ? 'Create a team or follow one to get started.'
            : 'Follow teams to track their schedules and scores.'}
        </Text>

        {isCoach && (
          <TouchableOpacity
            style={styles.createTeamButton}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('CreateTeam' as never, {} as never)}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.white} />
            <Text style={styles.createTeamButtonText}>Create a Team</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.findTeamsButton, isCoach && styles.findTeamsButtonOutline]}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('FollowTeams')}
        >
          <Ionicons name="search" size={18} color={isCoach ? colors.navy : colors.white} />
          <Text style={[styles.findTeamsButtonText, isCoach && styles.findTeamsButtonTextOutline]}>
            Follow a Team
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderHeaderRight() {
    if (isCoach) {
      return (
        <TouchableOpacity
          style={styles.addButton}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('CreateTeam' as never, {} as never)}
        >
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.addButtonText}>Create Team</Text>
        </TouchableOpacity>
      );
    }
    return null;
  }

  function renderListFooter() {
    return (
      <View style={styles.footerActions}>
        <TouchableOpacity
          style={styles.followAnotherBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('FollowTeams')}
        >
          <View style={styles.followIconCircle}>
            <Ionicons name="search" size={20} color={colors.navy} />
          </View>
          <Text style={styles.followAnotherText}>Follow Another Team</Text>
          <Ionicons name="chevron-forward" size={18} color="#9aa7ba" />
        </TouchableOpacity>

        {isCoach && (
          <TouchableOpacity
            style={styles.createAnotherBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('CreateTeam' as never, {} as never)}
          >
            <Ionicons name="add-circle-outline" size={22} color="#19b5f1" />
            <Text style={styles.createAnotherText}>Create a New Team</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  async function handleSwitchRole(role: string) {
    setActiveRoleState(role);
    await setActiveRole(role);
  }

  function handleAddRole() {
    const selfAddableRoles = [
      { key: 'coach', label: 'Coach' },
      { key: 'parent', label: 'Parent / Fan' },
      { key: 'referee', label: 'Referee' },
      { key: 'scorekeeper', label: 'Scorekeeper' },
    ];
    const available = selfAddableRoles.filter(r => !userRoles.includes(r.key));
    if (available.length === 0) {
      Alert.alert('All Roles Added', 'You already have all available roles.');
      return;
    }
    Alert.alert(
      'Add a Role',
      'Select a role to add to your account:',
      [
        ...available.map(r => ({
          text: r.label,
          onPress: async () => {
            const result = await addRoleToAccount(r.key);
            if (result.success && result.roles) {
              setUserRoles(result.roles);
              Alert.alert('Role Added', `${r.label} has been added to your account.`);
            } else {
              Alert.alert('Error', result.error || 'Failed to add role.');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader
          onNotificationPress={() => navigation.navigate('NotificationsInbox')}
          unreadCount={unreadCount}
          hasMultipleRoles={userRoles.length > 1}
        />
        <RoleBar activeRole={activeRoleState} userRoles={userRoles} onSwitchRole={handleSwitchRole} onAddRole={handleAddRole} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader
        onNotificationPress={() => navigation.navigate('NotificationsInbox')}
        unreadCount={unreadCount}
        hasMultipleRoles={userRoles.length > 1}
      />
      <RoleBar activeRole={activeRoleState} userRoles={userRoles} onSwitchRole={handleSwitchRole} />

      <FlatList
        data={teams}
        keyExtractor={(item) => item.id}
        renderItem={renderTeamCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {/* TEAMS DRIVE HOCKEY hero */}
            <Image
              source={require('../../assets/teams-hero.jpg')}
              style={styles.heroImage}
              resizeMode="cover"
            />

            {/* Join bar - overlaps the hero bottom like the mock */}
            <View style={styles.joinBar}>
              <View style={styles.joinInputWrap}>
                <Ionicons name="scan-outline" size={20} color="#5d7290" style={{ marginLeft: 14 }} />
                <TextInput
                  style={styles.joinInput}
                  value={joinCode}
                  onChangeText={(t) => setJoinCode(t.toUpperCase())}
                  placeholder="Enter team code"
                  placeholderTextColor="#5d7290"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={10}
                  editable={!joiningByCode}
                  returnKeyType="go"
                  onSubmitEditing={handleJoinByCode}
                />
              </View>
              <TouchableOpacity
                style={[styles.joinBtn, joiningByCode && { opacity: 0.7 }]}
                activeOpacity={0.8}
                onPress={handleJoinByCode}
                disabled={joiningByCode}
              >
                {joiningByCode ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.joinBtnText}>Join</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.joinDismissBtn}
                activeOpacity={0.7}
                onPress={() => Keyboard.dismiss()}
              >
                <Ionicons name="chevron-down" size={20} color="#9fb0c7" />
              </TouchableOpacity>
            </View>

            {/* Your Teams + Create */}
            {teams.length > 0 && (
              <View style={styles.titleRow}>
                <Text style={styles.titleText}>Your Teams</Text>
                {renderHeaderRight()}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={teams.length > 0 ? renderListFooter : undefined}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 90,
  },

  // Hero
  heroImage: {
    width: SCREEN_WIDTH,
    height: HERO_H,
  },

  // Join bar (overlaps hero bottom)
  joinBar: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    gap: 8,
    marginHorizontal: spacing.md,
    marginTop: -14,
    backgroundColor: '#0c1726',
    borderRadius: 20,
    padding: 10,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  joinInputWrap: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#15233a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a3c57',
  },
  joinInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.white,
    ...fonts.semibold,
    letterSpacing: 0.5,
  },
  joinBtn: {
    backgroundColor: '#1e9bf0',
    borderRadius: 14,
    paddingHorizontal: 24,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  joinBtnText: {
    color: colors.white,
    fontSize: 16,
    ...fonts.bold,
  },
  joinDismissBtn: {
    backgroundColor: '#101e33',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a3c57',
    width: 50,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },

  // Title row
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  titleText: {
    fontSize: 23,
    color: '#101c30',
    ...fonts.bold,
  },

  // Header right button
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    gap: spacing.xs,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 14,
    ...fonts.semibold,
  },

  // Team list row
  teamRow: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    overflow: 'hidden' as const,
    shadowColor: '#0f2747', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  teamRowMain: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: spacing.md,
    paddingVertical: spacing.md + 4,
    gap: spacing.md,
  },
  chevronCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f4f9',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  logoContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#eef2f8',
    borderWidth: 1.5,
    borderColor: '#dde5ef',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
  },
  teamLogo: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  teamLogoFallback: {
    width: 26,
    height: 26,
  },
  logoOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  teamInfo: {
    flex: 1,
    gap: 3,
  },
  teamName: {
    fontSize: 17,
    color: '#101c30',
    ...fonts.bold,
  },
  badgeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  ageGroupBadge: {
    backgroundColor: '#19b5f1',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  ageGroupText: {
    color: colors.white,
    fontSize: 12,
    ...fonts.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  divisionBadge: {
    backgroundColor: '#0d2b56',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  divisionBadgeText: {
    color: colors.white,
    fontSize: 12,
    ...fonts.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  rosterCount: {
    fontSize: 13,
    color: '#8a94a6',
    ...fonts.semibold,
    marginLeft: 2,
  },
  metaText: {
    fontSize: 13,
    color: '#5b6b83',
    ...fonts.regular,
  },
  // Quick actions row
  actionRow: {
    flexDirection: 'row' as const,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
    paddingVertical: 8,
  },
  actionBtnText: {
    fontSize: 11,
    color: colors.navy,
    ...fonts.semibold,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingTop: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 20,
    color: colors.text,
    ...fonts.bold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    textAlign: 'center',
    lineHeight: 22,
  },
  createTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  createTeamButtonText: {
    color: colors.white,
    fontSize: 16,
    ...fonts.semibold,
  },
  findTeamsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cyan,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  findTeamsButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  findTeamsButtonText: {
    color: colors.white,
    fontSize: 16,
    ...fonts.semibold,
  },
  findTeamsButtonTextOutline: {
    color: colors.navy,
  },

  // Footer actions (when teams exist)
  footerActions: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    gap: spacing.lg,
  },
  followAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    shadowColor: '#0f2747', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  followIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#edf1f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followAnotherText: {
    flex: 1,
    color: '#16233b',
    fontSize: 16,
    ...fonts.bold,
  },
  createAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(25,181,241,0.04)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#19b5f1',
    borderStyle: 'dashed' as any,
    paddingVertical: spacing.lg + 2,
    gap: spacing.sm,
  },
  createAnotherText: {
    color: '#19b5f1',
    fontSize: 16,
    ...fonts.semibold,
  },
});
