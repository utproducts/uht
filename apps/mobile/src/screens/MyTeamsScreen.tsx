import React, { useState, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch, getUser, getToken, User } from '../services/auth';
import { API_URL } from '../constants/api';
import { unfollowTeam } from '../services/api';
import ScreenHeader from '../components/ScreenHeader';

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

  const isCoach = currentUser?.roles?.some(r =>
    ['coach', 'manager', 'admin', 'director', 'tournament_director'].includes(r)
  ) ?? false;

  const lastLoadRef = React.useRef<number>(0);
  const STALE_MS = 30000; // 30 seconds

  useEffect(() => {
    getUser().then(u => setCurrentUser(u));
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
        setTeams(json.data);
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
      // Skip if loaded recently (pull-to-refresh always refetches)
      if (lastLoadRef.current && Date.now() - lastLoadRef.current < STALE_MS) {
        return;
      }
      fetchTeams();
    }, [fetchTeams]),
  );

  function handleRefresh() {
    fetchTeams(true);
  }

  function handleUnfollowTeam(team: Team) {
    Alert.alert(
      'Unfollow Team',
      `Are you sure you want to unfollow ${team.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            try {
              await unfollowTeam(team.id);
              setTeams((prev) => prev.filter((t) => t.id !== team.id));
            } catch {
              Alert.alert('Error', 'Failed to unfollow team. Please try again.');
            }
          },
        },
      ]
    );
  }

  async function handleJoinByCode() {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      Alert.alert('Enter a Code', 'Please enter a team code to continue.');
      return;
    }
    setJoiningByCode(true);
    try {
      // Try follow-by-code first (for parents/fans)
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
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploadingTeamId(team.id);

      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const token = await getToken();

      // Use FileSystem.uploadAsync for native multipart upload
      // This bypasses all FormData/Blob compatibility issues in RN/Hermes
      const uploadResult = await FileSystem.uploadAsync(
        `${API_URL}/api/teams/${team.id}/logo`,
        asset.uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: 'logo',
          mimeType,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      const json = JSON.parse(uploadResult.body) as any;
      if (json.success) {
        setTeams((prev) =>
          prev.map((t) =>
            t.id === team.id ? { ...t, logo_url: json.data.logo_url } : t
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
        style={styles.teamCard}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('TeamDetail' as never, { teamId: item.id, teamName: item.name } as never)}
        onLongPress={() => handleUnfollowTeam(item)}
      >
        {/* Unfollow button */}
        <TouchableOpacity
          style={styles.unfollowBtn}
          onPress={() => handleUnfollowTeam(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="close-circle" size={22} color="#8e919e" />
        </TouchableOpacity>

        {/* Logo + Edit Pencil */}
        <View style={styles.logoSection}>
          <View style={styles.logoContainer}>
            {item.logo_url ? (
              <Image source={{ uri: item.logo_url }} style={styles.teamLogo} />
            ) : (
              <Image source={require('../../assets/uht-logo.png')} style={styles.teamLogoFallback} resizeMode="contain" />
            )}
            {uploadingTeamId === item.id && (
              <View style={styles.logoOverlay}>
                <ActivityIndicator color={colors.white} />
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.editPencil}
            onPress={() => handleLogoUpload(item)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={uploadingTeamId === item.id}
          >
            <Ionicons name="pencil" size={14} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Age Group + Division Pills */}
        <View style={styles.badgeRow}>
          <View style={styles.ageGroupBadge}>
            <Text style={styles.ageGroupText}>{item.age_group}</Text>
          </View>
          {item.division_level ? (
            <View style={styles.divisionBadge}>
              <Text style={styles.divisionBadgeText}>{item.division_level}</Text>
            </View>
          ) : null}
        </View>

        {/* Team Name */}
        <Text style={styles.teamName}>{item.name}</Text>

        {/* Location + Org */}
        {(item.city || item.organization_name) ? (
          <View style={styles.metaSection}>
            {item.city ? (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <Text style={styles.metaText}>{item.city}{item.state ? `, ${item.state}` : ''}</Text>
              </View>
            ) : null}
            {item.organization_name ? (
              <View style={styles.metaRow}>
                <Ionicons name="business-outline" size={14} color={colors.textMuted} />
                <Text style={styles.metaText}>{item.organization_name}</Text>
              </View>
            ) : null}
            {item.head_coach_name ? (
              <View style={styles.metaRow}>
                <Ionicons name="person-outline" size={14} color={colors.textMuted} />
                <Text style={styles.metaText}>Coach {item.head_coach_name}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Bottom actions row */}
        <View style={styles.cardActions}>
          {item.invite_code ? (
            <TouchableOpacity
              style={styles.cardActionBtn}
              onPress={async () => {
                try {
                  await Share.share({
                    message: `You're invited to coach ${item.name} on Ultimate Hockey Tournaments!\n\nTeam code: ${item.invite_code}\n\n1. Download the UHT app: https://apps.apple.com/app/id6786085393\n2. Create your account as Coach / Asst Coach / Manager\n3. Enter the team code when prompted: ${item.invite_code}`,
                  });
                } catch {}
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="clipboard-outline" size={16} color={colors.navy} />
              <Text style={styles.cardActionText}>Invite Coaches</Text>
            </TouchableOpacity>
          ) : null}
          {item.invite_code ? (
            <TouchableOpacity
              style={styles.cardActionBtn}
              onPress={async () => {
                try {
                  await Share.share({
                    message: `Follow ${item.name} on Ultimate Hockey Tournaments!\n\nTeam code: ${item.invite_code}\n\n1. Download the UHT app: https://apps.apple.com/app/id6786085393\n2. Create your account as Parent / Player / Fan\n3. Enter the team code when prompted: ${item.invite_code}\n\nYou'll see all upcoming events, schedules, and scores!`,
                  });
                } catch {}
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={16} color={colors.navy} />
              <Text style={styles.cardActionText}>Invite Families</Text>
            </TouchableOpacity>
          ) : null}
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
        {/* Enter Team Code */}
        <View style={styles.teamCodeCard}>
          <Text style={styles.teamCodeCardTitle}>Have a team code?</Text>
          <Text style={styles.teamCodeCardSubtitle}>
            Enter a code from your coach or team manager to follow a team.
          </Text>
          <View style={styles.teamCodeInputRow}>
            <TextInput
              style={styles.teamCodeInput}
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              placeholder="Enter code"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              editable={!joiningByCode}
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
          </View>
        </View>

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

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader
          title="My Teams"
          rightAction={renderHeaderRight()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="My Teams"
        rightAction={renderHeaderRight()}
      />
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
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={teams.length > 0 ? renderListFooter : undefined}
      />
    </View>
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

  // Header right button
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    gap: spacing.xs,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 14,
    ...fonts.semibold,
  },

  // Team card
  teamCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center' as const,
    position: 'relative' as const,
  },
  unfollowBtn: {
    position: 'absolute' as const,
    top: spacing.xs,
    right: spacing.xs,
    padding: 4,
    zIndex: 5,
  },
  logoSection: {
    position: 'relative' as const,
    marginBottom: spacing.md,
  },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed' as any,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
  },
  teamLogo: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  teamLogoFallback: {
    width: 48,
    height: 48,
  },
  logoOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  editPencil: {
    position: 'absolute' as const,
    bottom: 0,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.navy,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 2,
    borderColor: colors.card,
  },
  badgeRow: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  ageGroupBadge: {
    backgroundColor: colors.cyan,
    borderRadius: radii.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  ageGroupText: {
    color: colors.white,
    fontSize: 12,
    ...fonts.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  divisionBadge: {
    backgroundColor: colors.navy,
    borderRadius: radii.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  divisionBadgeText: {
    color: colors.white,
    fontSize: 12,
    ...fonts.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  teamName: {
    fontSize: 20,
    color: colors.text,
    ...fonts.bold,
    textAlign: 'center' as const,
    marginBottom: spacing.sm,
  },
  metaSection: {
    alignSelf: 'stretch' as const,
    gap: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
  },
  metaText: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
  },
  cardActions: {
    flexDirection: 'row' as const,
    alignSelf: 'stretch' as const,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  cardActionText: {
    fontSize: 14,
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

  // Team code card
  teamCodeCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  teamCodeCardTitle: {
    fontSize: 16,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.xs,
  },
  teamCodeCardSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.regular,
    marginBottom: spacing.md,
    lineHeight: 18,
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
    paddingVertical: spacing.md,
    fontSize: 16,
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
