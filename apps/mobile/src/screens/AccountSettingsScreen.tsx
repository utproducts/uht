import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getUser, setUser, authFetch, User } from '../services/auth';
import ScreenHeader from '../components/ScreenHeader';

export default function AccountSettingsScreen({ navigation }: { navigation: any }) {
  const [user, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    const u = await getUser();
    if (u) {
      setCurrentUser(u);
      setName(u.name || '');
      setEmail(u.email || '');
      setPhone(u.phone || '');
    }
    setLoading(false);
  }

  function checkChanges(field: string, value: string) {
    if (field === 'name') {
      setName(value);
      setHasChanges(value !== user?.name || email !== user?.email || phone !== (user?.phone || ''));
    } else if (field === 'email') {
      setEmail(value);
      setHasChanges(name !== user?.name || value !== user?.email || phone !== (user?.phone || ''));
    } else if (field === 'phone') {
      setPhone(value);
      setHasChanges(name !== user?.name || email !== user?.email || value !== (user?.phone || ''));
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Error', 'Email is required.');
      return;
    }

    setSaving(true);
    try {
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const res = await authFetch('/api/auth/update-profile', {
        method: 'PUT',
        body: JSON.stringify({
          firstName,
          lastName,
          email: email.trim(),
          phone: phone.trim(),
        }),
      });
      const json = await res.json();

      if (json.success) {
        const updatedUser: User = {
          ...user!,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
        };
        await setUser(updatedUser);
        setCurrentUser(updatedUser);
        setHasChanges(false);
        Alert.alert('Saved', 'Your account has been updated.');
      } else {
        Alert.alert('Error', json.error || 'Failed to update account.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Network error');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Account Settings" showBack onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Account Settings" showBack onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Profile section */}
          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={40} color={colors.white} />
            </View>
            <Text style={styles.avatarName}>{user?.name || 'User'}</Text>
            <Text style={styles.avatarEmail}>{user?.email || ''}</Text>
            {user?.roles && user.roles.length > 0 && (
              <View style={styles.rolesRow}>
                {user.roles.map(role => (
                  <View key={role} style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{role.replace(/_/g, ' ')}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Form section */}
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>PERSONAL INFORMATION</Text>
            <View style={styles.formCard}>
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={v => checkChanges('name', v)}
                  placeholder="Your full name"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.fieldDivider} />

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={v => checkChanges('email', v)}
                  placeholder="your@email.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.fieldDivider} />

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={v => checkChanges('phone', v)}
                  placeholder="(555) 555-5555"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          </View>

          {/* Save button */}
          {hasChanges && (
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={colors.white} />
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Account ID (for support) */}
          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>ACCOUNT</Text>
            <View style={styles.formCard}>
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Account ID</Text>
                <Text style={styles.fieldValue}>{user?.id?.substring(0, 12) || '—'}...</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },

  // Avatar section
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingVertical: spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarName: {
    fontSize: 22,
    color: colors.text,
    ...fonts.bold,
  },
  avatarEmail: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 2,
  },
  rolesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  roleBadge: {
    backgroundColor: colors.cyan,
    borderRadius: radii.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  roleBadgeText: {
    color: colors.white,
    fontSize: 11,
    ...fonts.bold,
    textTransform: 'capitalize',
  },

  // Form section
  formSection: {
    marginBottom: spacing.xl,
  },
  infoSection: {
    marginBottom: spacing.xl,
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  fieldContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  fieldDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.textMuted,
    ...fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  input: {
    fontSize: 16,
    color: colors.text,
    ...fonts.medium,
    paddingVertical: spacing.xs,
  },
  fieldValue: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
  },

  // Save button
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 16,
    ...fonts.semibold,
  },
});
