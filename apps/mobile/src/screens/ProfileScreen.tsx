import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getUser, clearAuth, User } from '../services/auth';
import { getFollowedTeams } from '../services/api';

export default function ProfileScreen({ navigation }: { navigation: any }) {
  const [user, setUser] = useState<User | null>(null);
  const [followedCount, setFollowedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [userData, teams] = await Promise.all([
        getUser(),
        getFollowedTeams().catch(() => []),
      ]);
      setUser(userData);
      setFollowedCount(Array.isArray(teams) ? teams.length : 0);
    } catch {
      // Silently handle — user info from SecureStore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: confirmSignOut,
      },
    ]);
  }

  async function confirmSignOut() {
    setSigningOut(true);
    try {
      await clearAuth();
      navigation.reset({
        index: 0,
        routes: [{ name: 'Welcome' }],
      });
    } catch {
      Alert.alert('Error', 'Failed to sign out. Please try again.');
      setSigningOut(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
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
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Avatar / Initials */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name
                ? user.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                : '?'}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.name || 'Unknown User'}</Text>
        </View>

        {/* Account Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Info</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>{user?.name || '--'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user?.email || '--'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{user?.phone || '--'}</Text>
            </View>
          </View>
        </View>

        {/* Teams */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Teams</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Followed Teams</Text>
              <Text style={styles.infoValue}>{followedCount}</Text>
            </View>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.85}
        >
          {signingOut ? (
            <ActivityIndicator color={colors.error} />
          ) : (
            <Text style={styles.signOutText}>Sign Out</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  scrollContent: {
    padding: spacing.xxl,
    paddingBottom: 60,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
    marginTop: spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: 28,
    color: colors.white,
    ...fonts.bold,
  },
  userName: {
    fontSize: 22,
    color: colors.text,
    ...fonts.bold,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoLabel: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
  },
  infoValue: {
    fontSize: 15,
    color: colors.text,
    ...fonts.medium,
    textAlign: 'right',
    flex: 1,
    marginLeft: spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  signOutButton: {
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.error,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  signOutText: {
    color: colors.error,
    fontSize: 17,
    ...fonts.semibold,
  },
});
