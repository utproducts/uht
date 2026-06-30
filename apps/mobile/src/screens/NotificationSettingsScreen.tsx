import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { colors, fonts, spacing, radii } from '../constants/theme';
import ScreenHeader from '../components/ScreenHeader';

interface NotifPref {
  key: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  enabled: boolean;
}

export default function NotificationSettingsScreen({ navigation }: { navigation: any }) {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [checking, setChecking] = useState(true);

  const [prefs, setPrefs] = useState<NotifPref[]>([
    {
      key: 'game_reminders',
      label: 'Game Reminders',
      description: 'Get notified before your games start',
      icon: 'alarm-outline',
      enabled: true,
    },
    {
      key: 'locker_rooms',
      label: 'Locker Room Assignments',
      description: 'Notifications when locker rooms are assigned',
      icon: 'business-outline',
      enabled: true,
    },
    {
      key: 'score_updates',
      label: 'Score Updates',
      description: 'Live score updates for followed teams',
      icon: 'football-outline',
      enabled: true,
    },
    {
      key: 'schedule_changes',
      label: 'Schedule Changes',
      description: 'Game time or rink changes',
      icon: 'swap-horizontal-outline',
      enabled: true,
    },
    {
      key: 'event_updates',
      label: 'Event Updates',
      description: 'Tournament announcements and info',
      icon: 'megaphone-outline',
      enabled: true,
    },
  ]);

  useEffect(() => {
    checkPushStatus();
  }, []);

  async function checkPushStatus() {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPushEnabled(status === 'granted');
    } catch {}
    setChecking(false);
  }

  async function handleEnablePush() {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      setPushEnabled(true);
    } else {
      Alert.alert(
        'Notifications Disabled',
        'To enable push notifications, go to your device Settings > Notifications > UHT and turn on Allow Notifications.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    }
  }

  function togglePref(key: string) {
    setPrefs(prev =>
      prev.map(p => (p.key === key ? { ...p, enabled: !p.enabled } : p))
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Notifications" showBack onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Push status card */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, pushEnabled ? styles.statusDotOn : styles.statusDotOff]} />
            <Text style={styles.statusText}>
              Push Notifications: {pushEnabled ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
          {!pushEnabled && (
            <TouchableOpacity
              style={styles.enableButton}
              onPress={handleEnablePush}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications" size={18} color={colors.white} />
              <Text style={styles.enableButtonText}>Enable Notifications</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Notification preferences */}
        <Text style={styles.sectionTitle}>NOTIFICATION PREFERENCES</Text>
        <View style={styles.prefsCard}>
          {prefs.map((pref, index) => (
            <View key={pref.key}>
              <View style={styles.prefRow}>
                <View style={styles.prefLeft}>
                  <View style={styles.prefIconContainer}>
                    <Ionicons name={pref.icon} size={20} color={colors.navy} />
                  </View>
                  <View style={styles.prefTextContainer}>
                    <Text style={styles.prefLabel}>{pref.label}</Text>
                    <Text style={styles.prefDescription}>{pref.description}</Text>
                  </View>
                </View>
                <Switch
                  value={pref.enabled}
                  onValueChange={() => togglePref(pref.key)}
                  trackColor={{ false: colors.border, true: colors.cyan }}
                  thumbColor={colors.white}
                  ios_backgroundColor={colors.border}
                />
              </View>
              {index < prefs.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        {/* Info note */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
          <Text style={styles.infoText}>
            Notification preferences are stored on your device. You can also manage notifications through your device's Settings app.
          </Text>
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
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },

  // Status card
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDotOn: {
    backgroundColor: colors.success,
  },
  statusDotOff: {
    backgroundColor: colors.error,
  },
  statusText: {
    fontSize: 15,
    color: colors.text,
    ...fonts.semibold,
  },
  enableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  enableButtonText: {
    color: colors.white,
    fontSize: 15,
    ...fonts.semibold,
  },

  // Section
  sectionTitle: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },

  // Preferences card
  prefsCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  prefLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.md,
  },
  prefIconContainer: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  prefTextContainer: {
    flex: 1,
  },
  prefLabel: {
    fontSize: 15,
    color: colors.text,
    ...fonts.medium,
  },
  prefDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },

  // Info box
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
    ...fonts.regular,
    lineHeight: 18,
  },
});
