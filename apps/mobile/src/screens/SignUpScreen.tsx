import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { signup } from '../services/auth';

export default function SignUpScreen({ navigation }: { navigation: any }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!name.trim()) errors.name = 'Full name is required';
    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Enter a valid email address';
    }
    if (!phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (phone.replace(/\D/g, '').length < 10) {
      errors.phone = 'Enter a valid phone number';
    }
    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSignUp() {
    setError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const result = await signup({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
      });

      if (result.success) {
        navigation.replace('FollowTeams');
      } else {
        setError(result.error || 'Registration failed. Please try again.');
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            Sign up to follow your teams and stay updated.
          </Text>

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={[styles.input, fieldErrors.name ? styles.inputError : null]}
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  if (fieldErrors.name) setFieldErrors((e) => ({ ...e, name: '' }));
                }}
                placeholder="John Smith"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
              />
              {fieldErrors.name ? (
                <Text style={styles.fieldError}>{fieldErrors.name}</Text>
              ) : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, fieldErrors.email ? styles.inputError : null]}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (fieldErrors.email) setFieldErrors((e) => ({ ...e, email: '' }));
                }}
                placeholder="john@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {fieldErrors.email ? (
                <Text style={styles.fieldError}>{fieldErrors.email}</Text>
              ) : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={[styles.input, fieldErrors.phone ? styles.inputError : null]}
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  if (fieldErrors.phone) setFieldErrors((e) => ({ ...e, phone: '' }));
                }}
                placeholder="(555) 555-1234"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />
              {fieldErrors.phone ? (
                <Text style={styles.fieldError}>{fieldErrors.phone}</Text>
              ) : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={[styles.input, fieldErrors.password ? styles.inputError : null]}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: '' }));
                }}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
              />
              {fieldErrors.password ? (
                <Text style={styles.fieldError}>{fieldErrors.password}</Text>
              ) : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={[
                  styles.input,
                  fieldErrors.confirmPassword ? styles.inputError : null,
                ]}
                value={confirmPassword}
                onChangeText={(t) => {
                  setConfirmPassword(t);
                  if (fieldErrors.confirmPassword)
                    setFieldErrors((e) => ({ ...e, confirmPassword: '' }));
                }}
                placeholder="Re-enter your password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
              />
              {fieldErrors.confirmPassword ? (
                <Text style={styles.fieldError}>{fieldErrors.confirmPassword}</Text>
              ) : null}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, loading ? styles.submitButtonDisabled : null]}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkContainer}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.linkText}>
              Already have an account?{' '}
              <Text style={styles.linkTextBold}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    marginBottom: spacing.xxl,
    lineHeight: 22,
  },
  errorBanner: {
    backgroundColor: colors.errorBg,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorBannerText: {
    color: colors.error,
    fontSize: 14,
    ...fonts.medium,
  },
  form: {
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 14,
    color: colors.text,
    ...fonts.semibold,
  },
  input: {
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
  inputError: {
    borderColor: colors.error,
  },
  fieldError: {
    fontSize: 13,
    color: colors.error,
    ...fonts.regular,
  },
  submitButton: {
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 17,
    ...fonts.semibold,
  },
  linkContainer: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  linkText: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
  },
  linkTextBold: {
    color: colors.navy,
    ...fonts.semibold,
  },
});
