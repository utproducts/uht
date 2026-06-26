import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { login, getToken, getUser } from '../services/auth';

const BIOMETRIC_EMAIL_KEY = 'uht_biometric_email';
const BIOMETRIC_PASSWORD_KEY = 'uht_biometric_password';

export default function LoginScreen({ navigation }: { navigation: any }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [error, setError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [checkingBiometric, setCheckingBiometric] = useState(true);

  useEffect(() => {
    checkBiometricAndAutoLogin();
  }, []);

  async function checkBiometricAndAutoLogin() {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const canUseBiometric = hasHardware && isEnrolled;
      setBiometricAvailable(canUseBiometric);

      if (canUseBiometric) {
        const token = await getToken();
        const savedEmail = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
        if (token && savedEmail) {
          await attemptBiometricLogin();
        }
      }
    } catch {
      // Biometric check failed silently
    } finally {
      setCheckingBiometric(false);
    }
  }

  async function attemptBiometricLogin() {
    setBiometricLoading(true);
    try {
      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in to UHT',
        cancelLabel: 'Use Password',
        disableDeviceFallback: false,
      });

      if (authResult.success) {
        const savedEmail = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
        const savedPassword = await SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY);

        if (savedEmail && savedPassword) {
          const result = await login(savedEmail, savedPassword);
          if (result.success) {
            navigation.replace('Main');
            return;
          }
        }

        // If we have a valid token already, try navigating directly
        const token = await getToken();
        const user = await getUser();
        if (token && user) {
          navigation.replace('Main');
          return;
        }
      }
    } catch {
      // Biometric auth failed silently
    } finally {
      setBiometricLoading(false);
    }
  }

  async function handleLogin() {
    setError('');
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const result = await login(email.trim().toLowerCase(), password);

      if (result.success) {
        // Save credentials for biometric login
        if (biometricAvailable) {
          await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email.trim().toLowerCase());
          await SecureStore.setItemAsync(BIOMETRIC_PASSWORD_KEY, password);
        }
        navigation.replace('Main');
      } else {
        setError(result.error || 'Invalid email or password.');
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (checkingBiometric || biometricLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={styles.loadingText}>
            {biometricLoading ? 'Authenticating...' : 'Loading...'}
          </Text>
        </View>
      </SafeAreaView>
    );
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
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to your UHT account.</Text>

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (error) setError('');
                }}
                placeholder="john@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (error) setError('');
                }}
                placeholder="Enter your password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, loading ? styles.submitButtonDisabled : null]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {biometricAvailable ? (
            <TouchableOpacity
              style={styles.biometricButton}
              onPress={attemptBiometricLogin}
              activeOpacity={0.7}
            >
              <Text style={styles.biometricButtonText}>
                Sign in with Biometrics
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.linkContainer}
            onPress={() => navigation.navigate('SignUp')}
          >
            <Text style={styles.linkText}>
              Don't have an account?{' '}
              <Text style={styles.linkTextBold}>Create one</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    ...fonts.medium,
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
  submitButton: {
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 17,
    ...fonts.semibold,
  },
  biometricButton: {
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.navy,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  biometricButtonText: {
    color: colors.navy,
    fontSize: 16,
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
