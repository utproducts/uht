import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { colors, fonts, spacing, radii } from '../constants/theme';

export default function WelcomeScreen({ navigation }: { navigation: any }) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        <View style={styles.brandSection}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>UHT</Text>
          </View>
          <Text style={styles.title}>Ultimate Hockey{'\n'}Tournaments</Text>
          <Text style={styles.subtitle}>
            Follow your teams, track schedules, and never miss a game.
          </Text>
        </View>

        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('SignUp')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Create Account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: 80,
    paddingBottom: 48,
  },
  brandSection: {
    alignItems: 'center',
    marginTop: 40,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoText: {
    fontSize: 36,
    color: colors.navy,
    ...fonts.bold,
    letterSpacing: 2,
  },
  title: {
    fontSize: 32,
    color: colors.white,
    ...fonts.bold,
    textAlign: 'center',
    lineHeight: 40,
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
    ...fonts.regular,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: spacing.lg,
  },
  buttonSection: {
    gap: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.navy,
    fontSize: 17,
    ...fonts.semibold,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.white,
    fontSize: 17,
    ...fonts.semibold,
  },
});
