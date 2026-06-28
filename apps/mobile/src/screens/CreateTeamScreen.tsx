import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch } from '../services/auth';
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
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [coachName, setCoachName] = useState('');
  const [coachEmail, setCoachEmail] = useState('');
  const [coachPhone, setCoachPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAgeGroupPicker, setShowAgeGroupPicker] = useState(false);
  const [showDivisionPicker, setShowDivisionPicker] = useState(false);

  async function handleCreate() {
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }
    if (!ageGroup) {
      setError('Age group is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await authFetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: teamName.trim(),
          ageGroup,
          divisionLevel: divisionLevel || undefined,
          organizationId: organizationId || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          headCoachName: coachName.trim() || undefined,
          headCoachEmail: coachEmail.trim() || undefined,
          headCoachPhone: coachPhone.trim() || undefined,
        }),
      });

      const json = await res.json() as any;

      if (json.success) {
        Alert.alert(
          'Team Created!',
          `${teamName} has been created successfully.${json.data?.inviteCode ? `\n\nInvite code: ${json.data.inviteCode}` : ''}`,
          [
            {
              text: 'OK',
              onPress: () => {
                if (fromOnboarding) {
                  navigation.replace('Main');
                } else {
                  navigation.goBack();
                }
              },
            },
          ],
        );
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
                  const res2 = await authFetch('/api/teams', {
                    method: 'POST',
                    body: JSON.stringify({
                      name: teamName.trim(),
                      ageGroup,
                      divisionLevel: divisionLevel || undefined,
                      organizationId: organizationId || undefined,
                      city: city.trim() || undefined,
                      state: state.trim() || undefined,
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
            {items.map((item) => (
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
                  {item}
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

          {/* City & State */}
          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholder="City"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>State</Text>
              <TextInput
                style={styles.input}
                value={state}
                onChangeText={setState}
                placeholder="State"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                maxLength={2}
              />
            </View>
          </View>

          {/* Coach Info Section */}
          <View style={styles.sectionDivider} />
          <Text style={styles.sectionTitle}>Head Coach Info</Text>
          <Text style={styles.sectionSubtitle}>
            Optional — fill in if you're creating for another coach
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
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfField: {
    flex: 1,
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
});
