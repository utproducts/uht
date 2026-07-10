import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Share,
  Image,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch, getToken } from '../services/auth';
import { API_URL } from '../constants/api';
import ScreenHeader from '../components/ScreenHeader';

interface TeamDetail {
  id: string;
  name: string;
  age_group: string;
  division_level?: string;
  city?: string;
  state?: string;
  organization_name?: string;
  head_coach_name?: string;
  head_coach_email?: string;
  head_coach_phone?: string;
  invite_code?: string;
  roster_share_token?: string;
  logo_url?: string;
}

interface RosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number?: string;
  position?: string;
}

interface TeamEvent {
  id: string;
  event_id: string;
  event_name?: string;
  status?: string;
}

export default function TeamDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { teamId, teamName } = route.params || {};
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    try {
      const [teamRes, rosterRes, eventsRes] = await Promise.all([
        authFetch(`/api/teams/${teamId}`),
        authFetch(`/api/teams/${teamId}/roster`),
        authFetch(`/api/teams/${teamId}/events`),
      ]);

      const teamJson = await teamRes.json() as any;
      if (teamJson.success && teamJson.data) {
        setTeam(teamJson.data);
      }

      const rosterJson = await rosterRes.json() as any;
      if (rosterJson.success && Array.isArray(rosterJson.data)) {
        setRoster(rosterJson.data);
      }

      const eventsJson = await eventsRes.json() as any;
      if (eventsJson.success && Array.isArray(eventsJson.data)) {
        setEvents(eventsJson.data);
      }
    } catch {}
    setLoading(false);
  }, [teamId]);

  useFocusEffect(
    useCallback(() => {
      loadTeam();
    }, [loadTeam]),
  );

  async function shareInviteCode() {
    if (!team?.invite_code) return;
    try {
      await Share.share({
        message: `Join ${team.name} on UHT!\n\nTeam code: ${team.invite_code}\n\nDownload the UHT app and use this code to join.`,
      });
    } catch {}
  }

  async function shareRosterLink() {
    if (!team?.roster_share_token) return;
    try {
      await Share.share({
        message: `You've been invited to join ${team.name} on UHT! Claim your spot:\nhttps://ultimatetournaments.com/roster/${team.roster_share_token}`,
      });
    } catch {}
  }

  async function handleLogoUpload() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploading(true);

      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const token = await getToken();

      // Use FileSystem.uploadAsync for native multipart upload
      const uploadResult = await FileSystem.uploadAsync(
        `${API_URL}/api/teams/${teamId}/logo`,
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
        setTeam((prev) => prev ? { ...prev, logo_url: json.data.logo_url } : prev);
        Alert.alert('Logo Updated', 'Your team logo has been uploaded.');
      } else {
        Alert.alert('Error', json.error || 'Failed to upload logo');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={teamName || 'Team'} showBack onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </View>
    );
  }

  const displayTeam = team || { name: teamName, age_group: '', id: teamId };

  return (
    <View style={styles.container}>
      <ScreenHeader title={displayTeam.name || 'Team'} showBack onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Team Logo + Info Card */}
        <View style={styles.infoCard}>
          <TouchableOpacity
            style={styles.logoContainer}
            activeOpacity={0.7}
            onPress={handleLogoUpload}
            disabled={uploading}
          >
            {team?.logo_url ? (
              <Image source={{ uri: team.logo_url }} style={styles.teamLogo} resizeMode="cover" />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
              </View>
            )}
            {uploading ? (
              <View style={styles.logoOverlay}>
                <ActivityIndicator color={colors.white} />
              </View>
            ) : (
              <View style={styles.logoEditBadge}>
                <Ionicons name="pencil" size={12} color={colors.white} />
              </View>
            )}
          </TouchableOpacity>

          {displayTeam.age_group ? (
            <View style={styles.badgeRow}>
              <View style={styles.ageGroupBadge}>
                <Text style={styles.ageGroupText}>{displayTeam.age_group}</Text>
              </View>
              {(team?.division_level) ? (
                <View style={[styles.ageGroupBadge, { backgroundColor: colors.navy }]}>
                  <Text style={styles.ageGroupText}>{team.division_level}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {(team?.city || team?.state) ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={16} color={colors.textMuted} />
              <Text style={styles.locationText}>
                {[team.city, team.state].filter(Boolean).join(', ')}
              </Text>
            </View>
          ) : null}

          {team?.organization_name ? (
            <View style={styles.detailRow}>
              <Ionicons name="business-outline" size={16} color={colors.textMuted} />
              <Text style={styles.detailText}>{team.organization_name}</Text>
            </View>
          ) : null}

          {team?.head_coach_name ? (
            <View style={styles.detailRow}>
              <Ionicons name="person-outline" size={16} color={colors.textMuted} />
              <Text style={styles.detailText}>Coach {team.head_coach_name}</Text>
            </View>
          ) : null}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          {team?.invite_code ? (
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={shareInviteCode}>
              <Ionicons name="key-outline" size={18} color={colors.navy} />
              <Text style={styles.actionBtnText}>Share Code</Text>
            </TouchableOpacity>
          ) : null}
          {team?.roster_share_token ? (
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={shareRosterLink}>
              <Ionicons name="link-outline" size={18} color={colors.navy} />
              <Text style={styles.actionBtnText}>Roster Link</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Roster */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Roster ({roster.length})</Text>
          </View>
          {roster.length > 0 ? (
            roster.map((player) => (
              <View key={player.id} style={styles.rosterRow}>
                <Text style={styles.jerseyNumber}>
                  {player.jersey_number || '--'}
                </Text>
                <Text style={styles.playerName}>
                  {player.first_name} {player.last_name}
                </Text>
                {player.position ? (
                  <Text style={styles.playerPosition}>{player.position}</Text>
                ) : null}
              </View>
            ))
          ) : (
            <View style={styles.emptySection}>
              <Ionicons name="people-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptySectionText}>No players on roster yet</Text>
            </View>
          )}
        </View>

        {/* Registered Events */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Events ({events.length})</Text>
          </View>
          {events.length > 0 ? (
            events.map((evt) => (
              <TouchableOpacity
                key={evt.id}
                style={styles.eventRow}
                activeOpacity={0.7}
                onPress={() => {
                  const parent = navigation.getParent?.();
                  if (parent) {
                    parent.navigate('EventDetail', { eventId: evt.event_id, eventName: evt.event_name });
                  } else {
                    navigation.navigate('EventDetail', { eventId: evt.event_id, eventName: evt.event_name });
                  }
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventName}>{evt.event_name || 'Event'}</Text>
                  {evt.status ? (
                    <Text style={styles.eventStatus}>{evt.status}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptySection}>
              <Ionicons name="calendar-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptySectionText}>Not registered for any events yet</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },

  // Info card
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  logoContainer: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  teamLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bg,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  locationText: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.medium,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  detailText: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  actionBtnText: {
    fontSize: 14,
    color: colors.navy,
    ...fonts.semibold,
  },

  // Section
  section: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    color: colors.text,
    ...fonts.bold,
  },

  // Roster
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  jerseyNumber: {
    width: 32,
    fontSize: 15,
    color: colors.navy,
    ...fonts.bold,
    textAlign: 'center',
  },
  playerName: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    ...fonts.medium,
    marginLeft: spacing.md,
  },
  playerPosition: {
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.regular,
  },

  // Events
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eventName: {
    fontSize: 15,
    color: colors.text,
    ...fonts.semibold,
  },
  eventStatus: {
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.regular,
    marginTop: 2,
    textTransform: 'capitalize',
  },

  // Empty
  emptySection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptySectionText: {
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.regular,
  },
});
