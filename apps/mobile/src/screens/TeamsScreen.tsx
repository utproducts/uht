import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getFollowedTeams, unfollowTeam } from '../services/api';

interface FollowedTeam {
  id: string;
  team_id: string;
  team_name: string;
  org_name?: string;
  age_group?: string;
}

export default function TeamsScreen({ navigation }: { navigation: any }) {
  const [teams, setTeams] = useState<FollowedTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unfollowingId, setUnfollowingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadTeams = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError('');
    try {
      const data = await getFollowedTeams();
      setTeams(data);
    } catch {
      setError('Failed to load your teams. Pull to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTeams();
    }, [loadTeams]),
  );

  function handleRefresh() {
    setRefreshing(true);
    loadTeams(true);
  }

  function handleUnfollow(team: FollowedTeam) {
    Alert.alert(
      'Unfollow Team',
      `Are you sure you want to unfollow ${team.team_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: () => confirmUnfollow(team),
        },
      ],
    );
  }

  async function confirmUnfollow(team: FollowedTeam) {
    const teamId = team.team_id || team.id;
    setUnfollowingId(teamId);
    try {
      await unfollowTeam(teamId);
      setTeams((prev) => prev.filter((t) => (t.team_id || t.id) !== teamId));
    } catch {
      Alert.alert('Error', 'Failed to unfollow team. Please try again.');
    } finally {
      setUnfollowingId(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Teams</Text>
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Teams</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={teams}
        keyExtractor={(item) => item.id || item.team_id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.navy}
            colors={[colors.navy]}
          />
        }
        renderItem={({ item }) => {
          const teamId = item.team_id || item.id;
          const isUnfollowing = unfollowingId === teamId;
          return (
            <View style={styles.teamCard}>
              <View style={styles.teamInfo}>
                <Text style={styles.teamName}>{item.team_name}</Text>
                {item.org_name ? (
                  <Text style={styles.orgName}>{item.org_name}</Text>
                ) : null}
                {item.age_group ? (
                  <Text style={styles.ageGroup}>{item.age_group}</Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={styles.unfollowButton}
                onPress={() => handleUnfollow(item)}
                disabled={isUnfollowing}
                activeOpacity={0.7}
              >
                {isUnfollowing ? (
                  <ActivityIndicator color={colors.error} size="small" />
                ) : (
                  <Text style={styles.unfollowText}>Unfollow</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Teams Followed</Text>
            <Text style={styles.emptyText}>
              You're not following any teams yet. Follow teams to get updates on
              their schedules and scores.
            </Text>
          </View>
        }
        ListFooterComponent={
          <TouchableOpacity
            style={styles.followButton}
            onPress={() => navigation.navigate('FollowTeams')}
            activeOpacity={0.85}
          >
            <Text style={styles.followButtonText}>Follow a Team</Text>
          </TouchableOpacity>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 28,
    color: colors.text,
    ...fonts.bold,
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
  listContent: {
    padding: spacing.xxl,
    paddingBottom: 40,
  },
  teamCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 17,
    color: colors.text,
    ...fonts.bold,
  },
  orgName: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: spacing.xs,
  },
  ageGroup: {
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.medium,
    marginTop: spacing.xs,
  },
  unfollowButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.error,
    marginLeft: spacing.md,
    minWidth: 80,
    alignItems: 'center',
  },
  unfollowText: {
    color: colors.error,
    fontSize: 14,
    ...fonts.semibold,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 22,
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
  followButton: {
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  followButtonText: {
    color: colors.white,
    fontSize: 16,
    ...fonts.semibold,
  },
});
