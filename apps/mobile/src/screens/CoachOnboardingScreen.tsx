import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch } from '../services/auth';

type Step = 'choose' | 'join';

export default function CoachOnboardingScreen({ navigation }: { navigation: any }) {
  const [step, setStep] = useState<Step>('choose');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  async function handleJoinTeam() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError('Please enter an invite code.');
      return;
    }
    setJoining(true);
    setError('');
    try {
      const res = await authFetch('/api/teams/join', {
        method: 'POST',
        body: JSON.stringify({ code: trimmed }),
      });
      const json = await res.json();
      if (json.success) {
        Alert.alert(
          'Joined!',
          `You've been added to ${json.data?.teamName || 'the team'} as a ${json.data?.role || 'coach'}.`,
          [{ text: 'OK', onPress: () => navigation.replace('Main') }],
        );
      } else {
        setError(json.error || 'Invalid invite code. Please check and try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setJoining(false);
    }
  }

  // Step 2: Enter invite code
  if (step === 'join') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => { setStep('choose'); setError(''); setCode(''); }} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.navy} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Join a Team</Text>
          </View>

          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <Ionicons name="key-outline" size={48} color={colors.navy} />
            </View>

            <Text style={styles.joinTitle}>Enter Invite Code</Text>
            <Text style={styles.joinSubtitle}>
              Ask your head coach or organization admin for the team invite code.
            </Text>

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={(t) => { setCode(t.toUpperCase()); if (error) setError(''); }}
              placeholder="e.g. ABC123"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              returnKeyType="go"
              onSubmitEditing={handleJoinTeam}
            />

            <TouchableOpacity
              style={[styles.joinButton, (!code.trim() || joining) && styles.buttonDisabled]}
              activeOpacity={0.85}
              onPress={handleJoinTeam}
              disabled={!code.trim() || joining}
            >
              {joining ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.joinButtonText}>Join Team</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.bottomSection}>
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => navigation.replace('FollowTeams')}
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Step 1: Choose path
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome, Coach!</Text>
        <Text style={styles.subtitle}>
          How would you like to get started?
        </Text>

        <TouchableOpacity
          style={styles.optionCard}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('FollowTeams')}
        >
          <View style={styles.optionIconWrap}>
            <Ionicons name="add-circle" size={36} color={colors.navy} />
          </View>
          <View style={styles.optionInfo}>
            <Text style={styles.optionTitle}>Create a Team</Text>
            <Text style={styles.optionDesc}>
              Set up your team, add your roster, and register for tournaments.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionCard}
          activeOpacity={0.8}
          onPress={() => setStep('join')}
        >
          <View style={styles.optionIconWrap}>
            <Ionicons name="key" size={36} color={colors.cyan} />
          </View>
          <View style={styles.optionInfo}>
            <Text style={styles.optionTitle}>Join a Team</Text>
            <Text style={styles.optionDesc}>
              Have an invite code? Enter it to join an existing team as a coach.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => navigation.replace('FollowTeams')}
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
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: 20,
    color: colors.text,
    ...fonts.bold,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl,
  },
  title: {
    fontSize: 28,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    ...fonts.regular,
    marginBottom: spacing.xxxl,
    lineHeight: 24,
  },

  // Option cards
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  optionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  optionInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  optionTitle: {
    fontSize: 17,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.xs,
  },
  optionDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    lineHeight: 20,
  },

  // Join step
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.highlight || '#e6f0ff',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  joinTitle: {
    fontSize: 24,
    color: colors.text,
    ...fonts.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  joinSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  codeInput: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: 24,
    color: colors.text,
    ...fonts.bold,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: spacing.xl,
  },
  joinButton: {
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  joinButtonText: {
    color: colors.white,
    fontSize: 17,
    ...fonts.semibold,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Error
  errorBanner: {
    backgroundColor: colors.errorBg,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    ...fonts.medium,
    textAlign: 'center',
  },

  // Bottom
  bottomSection: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  skipText: {
    color: colors.textSecondary,
    fontSize: 16,
    ...fonts.medium,
  },
});
