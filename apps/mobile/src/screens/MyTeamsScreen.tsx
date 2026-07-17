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
      <View style={styles.teamRow}>
        {/* Main row — tap to view team detail */}
        <TouchableOpacity
          style={styles.teamRowMain}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('TeamDetail' as never, { teamId: item.id, teamName: item.name } as never)}
        >
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
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Actions moved to TeamDetailScreen — clean card view */}
      </View>
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
          activeOpacity={0.7}
          onPress={() => navigation.navigate('FollowTeams')}
        >
          <Ionicons name="search-outline" size={18} color={colors.navy} />
          <Text style={styles.followAnotherText}>Follow Another Team</Text>
        </TouchableOpacity>

        {isCoach && (
          <TouchableOpacity
            style={styles.createAnotherBtn}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('CreateTeam' as never, {} as never)}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.cyan} />
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

      {/* Title row with create button */}
      <View style={styles.titleRow}>
        <Text style={styles.titleText}>My teams</Text>
        {renderHeaderRight()}
      </View>

      {/* Team code input — always visible above the list */}
      <View style={styles.teamCodeBar}>
        <View style={styles.teamCodeInputRow}>
          <TextInput
            style={styles.teamCodeInput}
            value={joinCode}
            onChangeText={(t) => setJoinCode(t.toUpperCase())}
            placeholder="Enter team code"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
            editable={!joiningByCode}
            returnKeyType="go"
            onSubmitEditing={handleJoinByCode}
          />
          <TouchableOpacity
            style={[styles.teamCodeJoinBtn, joiningByCode && { opacity: 0.7 }]}
            activeOpacity={0.7}
            onPress={handleJoinByCode}
            disabled={joiningByCode}
          >
            {joiningByCode ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.teamCodeJoinBtnText}>Join</Text>
            )}
          </TouchableOpacity>
          {/* Dismiss keyboard button */}
          <TouchableOpacity
            style={styles.teamCodeDismissBtn}
            activeOpacity={0.7}
            onPress={() => Keyboard.dismiss()}
          >
            <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={teams}
        keyExtractor={(item) => item.id}
        renderItem={renderTeamCard}
        contentContainerStyle={[
          styles.listContent,
          teams.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        keyboardShouldPersistTaps="handled"
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
    padding: spacing.lg,
    paddingBottom: 80,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },

  // Title row
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  titleText: {
    fontSize: 20,
    color: colors.text,
    ...fonts.bold,
  },

  // Header right button
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    gap: spacing.xs,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 13,
    ...fonts.semibold,
  },

  // Team list row
  teamRow: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: 'hidden' as const,
  },
  teamRowMain: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: spacing.md,
    gap: spacing.md,
  },
  logoContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
  },
  teamLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: 16,
    color: colors.text,
    ...fonts.bold,
  },
  badgeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
  },
  ageGroupBadge: {
    backgroundColor: colors.cyan,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ageGroupText: {
    color: colors.white,
    fontSize: 10,
    ...fonts.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  divisionBadge: {
    backgroundColor: colors.navy,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  divisionBadgeText: {
    color: colors.white,
    fontSize: 10,
    ...fonts.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  rosterCount: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.regular,
    marginLeft: 2,
  },
  metaText: {
    fontSize: 13,
    color: colors.textSecondary,
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

  // Team code bar (above the list, always visible)
  teamCodeBar: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  teamCodeInputRow: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
  },
  teamCodeInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.text,
    ...fonts.semibold,
    letterSpacing: 1,
  },
  teamCodeJoinBtn: {
    backgroundColor: colors.navy,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  teamCodeJoinBtnText: {
    color: colors.white,
    fontSize: 15,
    ...fonts.semibold,
  },
  teamCodeDismissBtn: {
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },

  // Footer actions (when teams exist)
  footerActions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  followAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  followAnotherText: {
    color: colors.navy,
    fontSize: 15,
    ...fonts.semibold,
  },
  createAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.cyan,
    borderStyle: 'dashed' as any,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  createAnotherText: {
    color: colors.cyan,
    fontSize: 15,
    ...fonts.semibold,
  },
});
