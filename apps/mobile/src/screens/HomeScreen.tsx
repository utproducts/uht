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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getFollowedTeams } from '../services/api';

interface FollowedTeam {
  id: string;
  team_id: string;
  team_name: string;
  org_name?: string;
  age_group?: string;
  next_event_name?: string;
  next_event_date?: string;
}

export default function HomeScreen({ navigation }: { navigation: any }) {
  const [teams, setTeams] = useState<FollowedTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  function formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>UHT</Text>
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
        <Text style={styles.headerTitle}>UHT</Text>
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
        renderItem={({ item }) => (
          <View style={styles.teamCard}>
            <Text style={styles.teamName}>{item.team_name}</Text>
            {item.org_name ? (
              <Text style={styles.orgName}>{item.org_name}</Text>
            ) : null}
            {item.age_group ? (
              <Text style={styles.ageGroup}>{item.age_group}</Text>
            ) : null}
            {item.next_event_name ? (
              <View style={styles.eventInfo}>
                <Text style={styles.eventLabel}>Next Event</Text>
                <Text style={styles.eventName}>{item.next_event_name}</Text>
                {item.next_event_date ? (
                  <Text style={styles.eventDate}>
                    {formatDate(item.next_event_date)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Teams Followed</Text>
            <Text style={styles.emptyText}>
              Follow your teams to see their schedules, scores, and updates all
              in one place.
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate('FollowTeams')}
              activeOpacity={0.85}
            >
              <Text style={styles.emptyButtonText}>Find a Team to Follow</Text>
            </TouchableOpacity>
          </View>
        }
        ListFooterComponent={
          teams.length > 0 ? (
            <TouchableOpacity
              style={styles.addTeamButton}
              onPress={() => navigation.navigate('FollowTeams')}
              activeOpacity={0.85}
            >
              <Text style={styles.addTeamButtonText}>Follow Another Team</Text>
            </TouchableOpacity>
          ) : null
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
    color: colors.navy,
    ...fonts.bold,
    letterSpacing: 1,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  teamName: {
    fontSize: 18,
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
  eventInfo: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  eventLabel: {
    fontSize: 12,
    color: colors.textMuted,
    ...fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  eventName: {
    fontSize: 15,
    color: colors.text,
    ...fonts.semibold,
  },
  eventDate: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 2,
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
    marginBottom: spacing.xxl,
  },
  emptyButton: {
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  emptyButtonText: {
    color: colors.white,
    fontSize: 16,
    ...fonts.semibold,
  },
  addTeamButton: {
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.navy,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  addTeamButtonText: {
    color: colors.navy,
    fontSize: 16,
    ...fonts.semibold,
  },
});
