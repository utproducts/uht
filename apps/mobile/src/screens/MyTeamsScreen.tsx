import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch, getUser, User } from '../services/auth';
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
}

export default function MyTeamsScreen({ navigation }: { navigation: any }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const isCoach = currentUser?.roles?.some(r =>
    ['coach', 'manager', 'admin', 'director', 'tournament_director'].includes(r)
  ) ?? false;

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
      fetchTeams();
    }, [fetchTeams]),
  );

  function handleRefresh() {
    fetchTeams(true);
  }

  function renderTeamCard({ item }: { item: Team }) {
    return (
      <TouchableOpacity
        style={styles.teamCard}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('TeamDetail' as never, { teamId: item.id, teamName: item.name } as never)}
      >
        <View style={styles.teamCardRow}>
          <View style={{ flex: 1 }}>
            {/* Age Group Badge */}
            <View style={styles.badgeRow}>
              <View style={styles.ageGroupBadge}>
                <Text style={styles.ageGroupText}>{item.age_group}</Text>
              </View>
            </View>

            {/* Team Name */}
            <Text style={styles.teamName}>{item.name}</Text>

            {/* Location */}
            <View style={styles.locationRow}>
              {item.state ? (
                <View style={styles.stateBadge}>
                  <Text style={styles.stateBadgeText}>{item.state}</Text>
                </View>
              ) : null}
              {item.city ? (
                <Text style={styles.cityText}>{item.city}</Text>
              ) : null}
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Details */}
            <View style={styles.detailsRow}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Coach</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {item.head_coach_name || '--'}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Division</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {item.division_level || '--'}
                </Text>
              </View>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.textMuted} style={{ marginLeft: spacing.sm }} />
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
          showBack
          onBack={() => navigation.goBack()}
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
        showBack
        onBack={() => navigation.goBack()}
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
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  teamCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
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
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  teamName: {
    fontSize: 20,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  stateBadge: {
    backgroundColor: colors.bg,
    borderRadius: radii.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stateBadgeText: {
    fontSize: 12,
    color: colors.textSecondary,
    ...fonts.semibold,
  },
  cityText: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  detailsRow: {
    flexDirection: 'row',
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.textMuted,
    ...fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  detailValue: {
    fontSize: 15,
    color: colors.text,
    ...fonts.medium,
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
