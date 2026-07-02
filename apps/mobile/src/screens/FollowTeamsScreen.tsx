import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getOrganizationsByState, searchOrganizations, getTeamsByOrg, followTeam, searchTeams } from '../services/api';
import { getUser, User } from '../services/auth';
import { Ionicons } from '@expo/vector-icons';

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

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

type ScreenState = 'state' | 'orgs' | 'teams';

export default function FollowTeamsScreen({ navigation }: { navigation: any }) {
  const [screenState, setScreenState] = useState<ScreenState>('state');
  const [selectedState, setSelectedState] = useState<{ code: string; name: string } | null>(null);
  const [stateFilter, setStateFilter] = useState('');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgSearch, setOrgSearch] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [teamSearchResults, setTeamSearchResults] = useState<any[]>([]);
  const [searchingTeams, setSearchingTeams] = useState(false);
  const [teamSearchFollowed, setTeamSearchFollowed] = useState<Set<string>>(new Set());

  const isCoach = currentUser?.roles?.some(r =>
    ['coach', 'manager', 'admin', 'director', 'tournament_director'].includes(r)
  ) ?? false;

  useEffect(() => {
    getUser().then(u => setCurrentUser(u));
  }, []);

  // Direct team search with debounce
  useEffect(() => {
    if (teamSearchQuery.length < 2) {
      setTeamSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingTeams(true);
      try {
        const results = await searchTeams(teamSearchQuery);
        setTeamSearchResults(results);
      } catch {
        setTeamSearchResults([]);
      } finally {
        setSearchingTeams(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [teamSearchQuery]);

  async function handleFollowFromSearch(teamId: string) {
    try {
      await followTeam(teamId);
      setTeamSearchFollowed(prev => new Set([...prev, teamId]));
    } catch {}
  }

  // Filter state list as user types
  const filteredStates = stateFilter
    ? US_STATES.filter(
        (s) =>
          s.name.toLowerCase().includes(stateFilter.toLowerCase()) ||
          s.code.toLowerCase().includes(stateFilter.toLowerCase())
      )
    : US_STATES;

  // Load orgs when state is selected
  async function handleSelectState(state: { code: string; name: string }) {
    setSelectedState(state);
    setScreenState('orgs');
    setLoadingOrgs(true);
    setError('');
    try {
      const results = await getOrganizationsByState(state.code);
      setOrgs(results);
    } catch {
      setError('Failed to load organizations. Please try again.');
    } finally {
      setLoadingOrgs(false);
    }
  }

  // Search within selected state
  const handleOrgSearch = useCallback(async () => {
    if (!orgSearch.trim() || !selectedState) return;
    setError('');
    setLoadingOrgs(true);
    try {
      const results = await searchOrganizations(orgSearch.trim(), selectedState.code);
      setOrgs(results);
      if (results.length === 0) {
        setError('No organizations found. Try a different search.');
      }
    } catch {
      setError('Search failed. Please try again.');
    } finally {
      setLoadingOrgs(false);
    }
  }, [orgSearch, selectedState]);

  // Clear search and reload all orgs for state
  async function handleClearOrgSearch() {
    setOrgSearch('');
    if (!selectedState) return;
    setLoadingOrgs(true);
    try {
      const results = await getOrganizationsByState(selectedState.code);
      setOrgs(results);
    } catch {
      setError('Failed to load organizations.');
    } finally {
      setLoadingOrgs(false);
    }
  }

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

  function handleBackToStates() {
    setScreenState('state');
    setSelectedState(null);
    setOrgs([]);
    setOrgSearch('');
    setError('');
  }

  function handleBackToOrgs() {
    setScreenState('orgs');
    setSelectedOrg(null);
    setTeams([]);
    setSelectedTeamIds(new Set());
    setError('');
  }

  // ==================
  // STEP 3: Select Teams
  // ==================
  if (screenState === 'teams') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackToOrgs} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
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
                  style={[styles.card, selected ? styles.cardSelected : null]}
                  onPress={() => toggleTeam(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    {item.age_group || item.division ? (
                      <Text style={styles.cardSubtitle}>
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
                      <Text style={styles.checkmark}>{'✓'}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              !loadingTeams ? (
                <View style={styles.emptyState}>
                  {isCoach ? (
                    <>
                      <Text style={styles.emptyTitle}>No Teams Found</Text>
                      <Text style={styles.emptyText}>
                        This organization doesn't have any teams yet. Create one to get started!
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="time-outline" size={48} color={colors.textMuted} style={{ marginBottom: 12 }} />
                      <Text style={styles.emptyTitle}>Your Coach Hasn't Created This Team Yet</Text>
                      <Text style={styles.emptyText}>
                        In the meantime, check out our upcoming events! Once your coach creates the team, you can follow it right away.
                      </Text>
                      <TouchableOpacity
                        style={[styles.primaryButton, { backgroundColor: colors.cyan, marginTop: 20, alignSelf: 'center', paddingHorizontal: 32 }]}
                        activeOpacity={0.7}
                        onPress={() => navigation.replace('Main')}
                      >
                        <Text style={styles.primaryButtonText}>Browse Events</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              ) : null
            }
            ListFooterComponent={
              isCoach ? (
                <TouchableOpacity
                  style={styles.createTeamCard}
                  activeOpacity={0.7}
                  onPress={() =>
                    (navigation as any).navigate('CreateTeam', {
                      organizationId: selectedOrg?.id,
                      organizationName: selectedOrg?.name,
                      fromOnboarding: true,
                    })
                  }
                >
                  <View style={styles.createTeamIcon}>
                    <Text style={{ fontSize: 24, color: colors.cyan }}>+</Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardTitle, { color: colors.navy }]}>
                      Create a New Team
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      Coach? Set up your team here
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : null
            }
          />
        )}

        <View style={styles.bottomSection}>
          {selectedTeamIds.size > 0 ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleFollowSelected}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  Follow Selected Teams ({selectedTeamIds.size})
                </Text>
              )}
            </TouchableOpacity>
          ) : isCoach ? (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.cyan }]}
              onPress={() =>
                (navigation as any).navigate('CreateTeam', {
                  organizationId: selectedOrg?.id,
                  organizationName: selectedOrg?.name,
                  fromOnboarding: true,
                })
              }
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Create My Team</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.cyan }]}
              onPress={() => navigation.replace('Main')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Skip & Browse Events</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ==================
  // STEP 2: Select Organization
  // ==================
  if (screenState === 'orgs') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackToStates} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {selectedState?.name}
          </Text>
        </View>

        <View style={styles.searchSection}>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={orgSearch}
              onChangeText={setOrgSearch}
              placeholder="Search organizations..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleOrgSearch}
            />
            {orgSearch.length > 0 ? (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClearOrgSearch}
                activeOpacity={0.7}
              >
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.searchButton}
              onPress={handleOrgSearch}
              disabled={loadingOrgs || !orgSearch.trim()}
              activeOpacity={0.85}
            >
              {loadingOrgs ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.searchButtonText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {loadingOrgs && orgs.length === 0 ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : (
          <FlatList
            data={orgs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => handleSelectOrg(item)}
                activeOpacity={0.7}
              >
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  {item.city ? (
                    <Text style={styles.cardSubtitle}>{item.city}</Text>
                  ) : null}
                </View>
                <Text style={styles.chevron}>{'>'}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              !loadingOrgs ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No Organizations</Text>
                  <Text style={styles.emptyText}>
                    No organizations found in {selectedState?.name}. Try searching by name above.
                  </Text>
                </View>
              ) : null
            }
          />
        )}

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

  // ==================
  // STEP 1: Select Your State (with direct team search)
  // ==================
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Find Your Team</Text>
        <Text style={styles.subtitle}>
          Search for a team by name, or browse by state.
        </Text>

        {/* Direct Team Search */}
        <View style={styles.teamSearchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.teamSearchInput}
            value={teamSearchQuery}
            onChangeText={setTeamSearchQuery}
            placeholder="Search teams by name..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {teamSearchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => { setTeamSearchQuery(''); setTeamSearchResults([]); }}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Team Search Results */}
        {teamSearchQuery.length >= 2 ? (
          searchingTeams ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={colors.navy} />
            </View>
          ) : (
            <FlatList
              data={teamSearchResults}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.stateListContent}
              renderItem={({ item }) => {
                const alreadyFollowed = teamSearchFollowed.has(item.id);
                return (
                  <View style={styles.teamSearchCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      <Text style={styles.cardSubtitle}>
                        {[item.organization_name, item.age_group, item.city, item.state].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.followButton, alreadyFollowed ? styles.followedButton : null]}
                      onPress={() => !alreadyFollowed && handleFollowFromSearch(item.id)}
                      activeOpacity={0.7}
                      disabled={alreadyFollowed}
                    >
                      <Text style={[styles.followButtonText, alreadyFollowed ? styles.followedButtonText : null]}>
                        {alreadyFollowed ? 'Following' : 'Follow'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No Teams Found</Text>
                  <Text style={styles.emptyText}>Try a different search, or browse by state below.</Text>
                </View>
              }
            />
          )
        ) : (
          <>
            {/* State Browse */}
            <Text style={[styles.subtitle, { marginTop: 16, marginBottom: 8, fontWeight: '600', color: colors.navy }]}>
              Browse by State
            </Text>
            <FlatList
              data={filteredStates}
              keyExtractor={(item) => item.code}
              contentContainerStyle={styles.stateListContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.stateCard}
                  onPress={() => handleSelectState(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.stateCode}>{item.code}</Text>
                  <Text style={styles.stateName}>{item.name}</Text>
                  <Text style={styles.chevron}>{'>'}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No Match</Text>
                  <Text style={styles.emptyText}>No states match your search.</Text>
                </View>
              }
            />
          </>
        )}
      </View>

      <View style={styles.bottomSection}>
        {teamSearchFollowed.size > 0 ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.replace('Main')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => navigation.replace('Main')}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        )}
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
  title: {
    fontSize: 26,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  instruction: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.md,
  },
  // Team search
  teamSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    marginBottom: spacing.md,
  },
  teamSearchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    ...fonts.regular,
    paddingVertical: spacing.md,
  },
  teamSearchCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  followButton: {
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.sm,
    marginLeft: 12,
  },
  followButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  followedButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.navy,
  },
  followedButtonText: {
    color: colors.navy,
  },
  // State search
  stateSearchInput: {
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
    ...fonts.regular,
    marginBottom: spacing.md,
  },
  stateListContent: {
    paddingBottom: spacing.lg,
  },
  stateCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stateCode: {
    fontSize: 16,
    color: colors.navy,
    ...fonts.bold,
    width: 36,
  },
  stateName: {
    fontSize: 16,
    color: colors.text,
    ...fonts.medium,
    flex: 1,
  },
  chevron: {
    fontSize: 18,
    color: colors.textMuted,
    ...fonts.regular,
  },
  // Org search
  searchSection: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  clearButton: {
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  clearButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    ...fonts.medium,
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
  // Shared cards
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardSelected: {
    borderColor: colors.navy,
    backgroundColor: colors.highlight,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    color: colors.text,
    ...fonts.semibold,
  },
  cardSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: spacing.xs,
  },
  // Checkbox (teams)
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
  // Shared
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
    paddingTop: spacing.sm,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createTeamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoBg,
    borderWidth: 2,
    borderColor: colors.cyan,
    borderStyle: 'dashed',
    borderRadius: radii.md,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  createTeamIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    borderWidth: 2,
    borderColor: colors.cyan,
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
    paddingHorizontal: spacing.xxl,
  },
  bottomSection: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryButton: {
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
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
