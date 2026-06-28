import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch, getUser } from '../services/auth';
import ScreenHeader from '../components/ScreenHeader';

const AGE_GROUPS = [
  'Mite (8U)',
  'Squirt (10U)',
  'Pee Wee (12U)',
  'Bantam (14U)',
  '16u/JV',
  '18u/Var.',
  'Girls 10u',
  'Girls 12u',
  'Girls 14u',
  'Midget',
  'Adult',
];

const DIVISION_LEVELS = [
  'A',
  'AA',
  'AAA',
  'B',
  'BB',
  'House',
  'Rec',
  'Select',
  'Travel',
];

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

export default function CreateTeamScreen({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { organizationId, organizationName, fromOnboarding } = route.params || {};

  const [teamName, setTeamName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [divisionLevel, setDivisionLevel] = useState('');
  const [state, setState] = useState('');
  const [coachName, setCoachName] = useState('');
  const [coachEmail, setCoachEmail] = useState('');
  const [coachPhone, setCoachPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAgeGroupPicker, setShowAgeGroupPicker] = useState(false);
  const [showDivisionPicker, setShowDivisionPicker] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [createdTeam, setCreatedTeam] = useState<{ name: string; inviteCode?: string; rosterShareToken?: string } | null>(null);

  // Auto-fill coach info from logged-in user
  useEffect(() => {
    (async () => {
      const user = await getUser();
      if (user) {
        if (user.name && !coachName) setCoachName(user.name);
        if (user.email && !coachEmail) setCoachEmail(user.email);
      }
    })();
  }, []);

  async function handleCreate() {
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }
    if (!ageGroup) {
      setError('Age group is required');
      return;
    }
    if (!state) {
      setError('State is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Find the full state name from code for consistent DB storage
      const stateEntry = US_STATES.find((s) => s.code === state);
      const stateName = stateEntry ? stateEntry.name : state;

      const res = await authFetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: teamName.trim(),
          ageGroup,
          divisionLevel: divisionLevel || undefined,
          organizationId: organizationId || undefined,
          state: stateName || undefined,
          headCoachName: coachName.trim() || undefined,
          headCoachEmail: coachEmail.trim() || undefined,
          headCoachPhone: coachPhone.trim() || undefined,
        }),
      });

      const json = await res.json() as any;

      if (json.success) {
        setCreatedTeam({
          name: teamName.trim(),
          inviteCode: json.data?.inviteCode,
          rosterShareToken: json.data?.roster_share_token,
        });
      } else if (json.error === 'duplicate_team') {
        Alert.alert(
          'Team Already Exists',
          json.message || 'A team with that name and age group already exists.',
          [
            { text: 'Go Back', style: 'cancel' },
            {
              text: 'Create Anyway',
              onPress: async () => {
                setSaving(true);
                try {
                  const stEntry = US_STATES.find((s) => s.code === state);
                  const stName = stEntry ? stEntry.name : state;
                  const res2 = await authFetch('/api/teams', {
                    method: 'POST',
                    body: JSON.stringify({
                      name: teamName.trim(),
                      ageGroup,
                      divisionLevel: divisionLevel || undefined,
                      organizationId: organizationId || undefined,
                      state: stName || undefined,
                      headCoachName: coachName.trim() || undefined,
                      headCoachEmail: coachEmail.trim() || undefined,
                      headCoachPhone: coachPhone.trim() || undefined,
                      skipDuplicateCheck: true,
                    }),
                  });
                  const json2 = await res2.json() as any;
                  if (json2.success) {
                    if (fromOnboarding) {
                      navigation.replace('Main');
                    } else {
                      navigation.goBack();
                    }
                  } else {
                    setError(json2.error || 'Failed to create team');
                  }
                } catch {
                  setError('Network error. Please try again.');
                } finally {
                  setSaving(false);
                }
              },
            },
          ],
        );
      } else {
        setError(json.error || 'Failed to create team');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function renderPicker(
    items: string[],
    selected: string,
    onSelect: (v: string) => void,
    onClose: () => void,
    displayLabels?: string[],
  ) {
    return (
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerScroll}>
            {items.map((item, idx) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.pickerItem,
                  selected === item && styles.pickerItemSelected,
                ]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    selected === item && styles.pickerItemTextSelected,
                  ]}
                >
                  {displayLabels ? displayLabels[idx] : item}
                </Text>
                {selected === item && (
                  <Ionicons name="checkmark" size={20} color={colors.cyan} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    );
  }

  async function shareInvite(type: 'players' | 'coaches') {
    if (!createdTeam) return;
    if (type === 'players') {
      const rosterUrl = createdTeam.rosterShareToken
        ? `https://ultimatetournaments.com/roster/${createdTeam.rosterShareToken}`
        : null;
      const message = rosterUrl
        ? `You've been invited to join ${createdTeam.name} on UHT! Claim your spot:\n${rosterUrl}`
        : `You've been invited to join ${createdTeam.name} on Ultimate Hockey Tournaments! Download the UHT app to get started.`;
      try { await Share.share({ message }); } catch {}
    } else {
      const code = createdTeam.inviteCode || '';
      const message = `You've been invited to coach ${createdTeam.name} on UHT!\n\nJoin code: ${code}\n\nDownload the UHT app and use this code to join the team as a coach.`;
      try { await Share.share({ message }); } catch {}
    }
  }

  // Show success/invite screen after team creation
  if (createdTeam) {
    return (
      <View style={styles.container}>
        <ScreenHeader
          title="Team Created!"
          showBack={false}
        />
        <ScrollView contentContainerStyle={styles.successContent}>
          <View style={styles.successIconContainer}>
            <Ionicons name="checkmark-circle" size={80} color={colors.success} />
          </View>
          <Text style={styles.successTitle}>{createdTeam.name}</Text>
          <Text style={styles.successSubtitle}>Your team is ready! Now invite your players and coaches.</Text>

          {/* Invite Players/Parents */}
          <View style={styles.inviteCard}>
            <View style={styles.inviteCardHeader}>
              <Ionicons name="people-outline" size={24} color={colors.navy} />
              <Text style={styles.inviteCardTitle}>Invite Players & Parents</Text>
            </View>
            <Text style={styles.inviteCardDesc}>
              Share a link so parents can claim their player on the roster.
            </Text>
            <TouchableOpacity
              style={styles.inviteShareBtn}
              onPress={() => shareInvite('players')}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={18} color={colors.white} />
              <Text style={styles.inviteShareBtnText}>Share Roster Link</Text>
            </TouchableOpacity>
          </View>

          {/* Invite Coaches */}
          <View style={styles.inviteCard}>
            <View style={styles.inviteCardHeader}>
              <Ionicons name="shield-outline" size={24} color={colors.navy} />
              <Text style={styles.inviteCardTitle}>Invite Coaches</Text>
            </View>
            <Text style={styles.inviteCardDesc}>
              Share this code with assistant coaches so they can join your team.
            </Text>
            {createdTeam.inviteCode ? (
              <View style={styles.inviteCodeBox}>
                <Text style={styles.inviteCodeLabel}>TEAM CODE</Text>
                <Text style={styles.inviteCodeValue}>{createdTeam.inviteCode}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.inviteShareBtn, { backgroundColor: colors.cyan }]}
              onPress={() => shareInvite('coaches')}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={18} color={colors.white} />
              <Text style={styles.inviteShareBtnText}>Share Coach Invite</Text>
            </TouchableOpacity>
          </View>

          {/* Done button */}
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => {
              if (fromOnboarding) {
                navigation.replace('Main');
              } else {
                navigation.goBack();
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Create Team"
        showBack
        onBack={() => navigation.goBack()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {organizationName ? (
            <View style={styles.orgBanner}>
              <Ionicons name="business-outline" size={18} color={colors.navy} />
              <Text style={styles.orgBannerText}>{organizationName}</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Team Name */}
          <Text style={styles.label}>Team Name *</Text>
          <TextInput
            style={styles.input}
            value={teamName}
            onChangeText={setTeamName}
            placeholder="e.g. Chicago Jets"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          {/* Age Group */}
          <Text style={styles.label}>Age Group *</Text>
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => setShowAgeGroupPicker(true)}
          >
            <Text
              style={[
                styles.selectInputText,
                !ageGroup && styles.selectInputPlaceholder,
              ]}
            >
              {ageGroup || 'Select age group'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Division Level */}
          <Text style={styles.label}>Division Level</Text>
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => setShowDivisionPicker(true)}
          >
            <Text
              style={[
                styles.selectInputText,
                !divisionLevel && styles.selectInputPlaceholder,
              ]}
            >
              {divisionLevel || 'Select division (optional)'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {/* State */}
          <Text style={styles.label}>State *</Text>
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => setShowStatePicker(true)}
          >
            <Text
              style={[
                styles.selectInputText,
                !state && styles.selectInputPlaceholder,
              ]}
            >
              {state
                ? `${US_STATES.find((s) => s.code === state)?.name} (${state})`
                : 'Select state'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Coach Info Section */}
          <View style={styles.sectionDivider} />
          <Text style={styles.sectionTitle}>Head Coach Info</Text>
          <Text style={styles.sectionSubtitle}>
            Auto-filled from your account. Edit if creating for another coach.
          </Text>

          <Text style={styles.label}>Coach Name</Text>
          <TextInput
            style={styles.input}
            value={coachName}
            onChangeText={setCoachName}
            placeholder="Coach name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Coach Email</Text>
          <TextInput
            style={styles.input}
            value={coachEmail}
            onChangeText={setCoachEmail}
            placeholder="coach@email.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Coach Phone</Text>
          <TextInput
            style={styles.input}
            value={coachPhone}
            onChangeText={setCoachPhone}
            placeholder="(555) 555-5555"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
          />

          {/* Create Button */}
          <TouchableOpacity
            style={[
              styles.createButton,
              saving && styles.createButtonDisabled,
            ]}
            onPress={handleCreate}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="add-circle" size={20} color={colors.white} />
                <Text style={styles.createButtonText}>Create Team</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Pickers */}
      {showAgeGroupPicker &&
        renderPicker(
          AGE_GROUPS,
          ageGroup,
          setAgeGroup,
          () => setShowAgeGroupPicker(false),
        )}
      {showDivisionPicker &&
        renderPicker(
          DIVISION_LEVELS,
          divisionLevel,
          setDivisionLevel,
          () => setShowDivisionPicker(false),
        )}
      {showStatePicker &&
        renderPicker(
          US_STATES.map((s) => s.code),
          state,
          setState,
          () => setShowStatePicker(false),
          US_STATES.map((s) => `${s.name} (${s.code})`),
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  orgBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoBg,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  orgBannerText: {
    fontSize: 15,
    color: colors.navy,
    ...fonts.semibold,
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorBg,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    ...fonts.medium,
    flex: 1,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.semibold,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    ...fonts.regular,
  },
  selectInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectInputText: {
    fontSize: 16,
    color: colors.text,
    ...fonts.regular,
  },
  selectInputPlaceholder: {
    color: colors.textMuted,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.regular,
    lineHeight: 20,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginTop: spacing.xxxl,
    gap: spacing.sm,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 17,
    color: colors.white,
    ...fonts.bold,
  },

  // Picker overlay
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: {
    fontSize: 18,
    ...fonts.bold,
    color: colors.text,
  },
  pickerScroll: {
    paddingHorizontal: spacing.lg,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerItemSelected: {
    backgroundColor: colors.highlight,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  pickerItemText: {
    fontSize: 16,
    color: colors.text,
    ...fonts.medium,
  },
  pickerItemTextSelected: {
    color: colors.navy,
    ...fonts.bold,
  },

  // Success / Invite screen
  successContent: {
    padding: spacing.lg,
    paddingBottom: 100,
    alignItems: 'center' as const,
  },
  successIconContainer: {
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontSize: 24,
    color: colors.text,
    ...fonts.bold,
    textAlign: 'center' as const,
    marginBottom: spacing.sm,
  },
  successSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    textAlign: 'center' as const,
    lineHeight: 22,
    marginBottom: spacing.xxl,
  },
  inviteCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    width: '100%' as any,
  },
  inviteCardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  inviteCardTitle: {
    fontSize: 17,
    color: colors.text,
    ...fonts.bold,
  },
  inviteCardDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  inviteShareBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.navy,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  inviteShareBtnText: {
    fontSize: 15,
    color: colors.white,
    ...fonts.bold,
  },
  inviteCodeBox: {
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    padding: spacing.md,
    alignItems: 'center' as const,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviteCodeLabel: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.semibold,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  inviteCodeValue: {
    fontSize: 28,
    color: colors.navy,
    ...fonts.bold,
    letterSpacing: 3,
  },
  doneButton: {
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxxl,
    marginTop: spacing.xl,
  },
  doneButtonText: {
    fontSize: 16,
    color: colors.navy,
    ...fonts.bold,
  },
});
