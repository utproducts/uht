import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { searchOrganizations, getTeamsByOrg, followTeam } from '../services/api';

interface Organization {
  id: string;
  name: string;
  city?: string;
  state?: string;
}

interface Team {
  id: string;
  name: string;
  age_group?: string;
  division?: string;
}

type ScreenState = 'search' | 'teams';

export default function FollowTeamsScreen({ navigation }: { navigation: any }) {
  const [screenState, setScreenState] = useState<ScreenState>('search');
  const [query, setQuery] = useState('');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setError('');
    setSearching(true);
    try {
      const results = await searchOrganizations(query.trim());
      setOrgs(results);
      if (results.length === 0) {
        setError('No organizations found. Try a different search.');
      }
    } catch {
      setError('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  }, [query]);

  async function handleSelectOrg(org: Organization) {
    setSelectedOrg(org);
    setLoadingTeams(true);
    setError('');
    try {
      const orgTeams = await getTeamsByOrg(org.id);
      setTeams(orgTeams);
      setSelectedTeamIds(new Set());
      setScreenState('teams');
      if (orgTeams.length === 0) {
        setError('No active teams found for this organization.');
      }
    } catch {
      setError('Failed to load teams. Please try again.');
    } finally {
      setLoadingTeams(false);
    }
  }

  function toggleTeam(teamId: string) {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  }

  async function handleFollowSelected() {
    if (selectedTeamIds.size === 0) return;
    setSaving(true);
    setError('');
    try {
      const promises = Array.from(selectedTeamIds).map((id) => followTeam(id));
      await Promise.all(promises);
      navigation.replace('Main');
    } catch {
      setError('Failed to follow teams. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    setScreenState('search');
    setSelectedOrg(null);
    setTeams([]);
    setSelectedTeamIds(new Set());
    setError('');
  }

  if (screenState === 'teams') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {selectedOrg?.name}
          </Text>
        </View>

        <Text style={styles.instruction}>
          Select the teams you want to follow.
        </Text>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {loadingTeams ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : (
          <FlatList
            data={teams}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const selected = selectedTeamIds.has(item.id);
              return (
                <TouchableOpacity
                  style={[styles.teamCard, selected ? styles.teamCardSelected : null]}
                  onPress={() => toggleTeam(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.teamInfo}>
                    <Text style={styles.teamName}>{item.name}</Text>
                    {item.age_group || item.division ? (
                      <Text style={styles.teamMeta}>
                        {[item.age_group, item.division].filter(Boolean).join(' - ')}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      selected ? styles.checkboxSelected : null,
                    ]}
                  >
                    {selected ? (
                      <Text style={styles.checkmark}>
                        {'✓'}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              !loadingTeams ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No Teams Found</Text>
                  <Text style={styles.emptyText}>
                    This organization doesn't have any active teams yet.
                  </Text>
                </View>
              ) : null
            }
          />
        )}

        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={[
              styles.followButton,
              selectedTeamIds.size === 0 ? styles.followButtonDisabled : null,
            ]}
            onPress={handleFollowSelected}
            disabled={selectedTeamIds.size === 0 || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.followButtonText}>
                Follow Selected Teams ({selectedTeamIds.size})
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Follow Your Teams</Text>
        <Text style={styles.subtitle}>
          Search for your organization to find and follow your teams.
        </Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search organizations..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearch}
            disabled={searching || !query.trim()}
            activeOpacity={0.85}
          >
            {searching ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.searchButtonText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        <FlatList
          data={orgs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.orgCard}
              onPress={() => handleSelectOrg(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.orgName}>{item.name}</Text>
              {item.city || item.state ? (
                <Text style={styles.orgLocation}>
                  {[item.city, item.state].filter(Boolean).join(', ')}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            !searching && query.length > 0 && orgs.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No Results</Text>
                <Text style={styles.emptyText}>
                  Try searching with a different name.
                </Text>
              </View>
            ) : null
          }
        />
      </View>

      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => navigation.replace('Main')}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
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
  title: {
    fontSize: 24,
    color: colors.text,
    ...fonts.bold,
    flex: 1,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    marginBottom: spacing.xxl,
    lineHeight: 22,
  },
  instruction: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xxl,
  },
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
    ...fonts.regular,
  },
  searchButton: {
    backgroundColor: colors.navy,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  searchButtonText: {
    color: colors.white,
    fontSize: 15,
    ...fonts.semibold,
  },
  errorBanner: {
    backgroundColor: colors.errorBg,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    marginHorizontal: spacing.xxl,
  },
  errorBannerText: {
    color: colors.error,
    fontSize: 14,
    ...fonts.medium,
  },
  listContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  orgCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orgName: {
    fontSize: 16,
    color: colors.text,
    ...fonts.semibold,
  },
  orgLocation: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: spacing.xs,
  },
  teamCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamCardSelected: {
    borderColor: colors.navy,
    backgroundColor: colors.highlight,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 16,
    color: colors.text,
    ...fonts.semibold,
  },
  teamMeta: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: spacing.xs,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.md,
  },
  checkboxSelected: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  checkmark: {
    color: colors.white,
    fontSize: 14,
    ...fonts.bold,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyTitle: {
    fontSize: 18,
    color: colors.text,
    ...fonts.semibold,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    textAlign: 'center',
  },
  bottomSection: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  followButton: {
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  followButtonDisabled: {
    opacity: 0.5,
  },
  followButtonText: {
    color: colors.white,
    fontSize: 17,
    ...fonts.semibold,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  skipText: {
    color: colors.textSecondary,
    fontSize: 16,
    ...fonts.medium,
  },
});
