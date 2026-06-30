import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../constants/theme';

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  hideLogo?: boolean;
}

export default function ScreenHeader({ title, showBack, onBack, rightAction, hideLogo }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Diagonal cyan accent */}
      <View style={styles.accentSlash} />

      {/* UHT Letters Logo */}
      {!hideLogo && (
        <View style={styles.logoRow}>
          <Image
            source={require('../../assets/uht-letters.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      )}

      <View style={styles.content}>
        <View style={styles.leftSection}>
          {showBack ? (
            <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={24} color={colors.white} />
            </TouchableOpacity>
          ) : null}
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        {rightAction ? <View style={styles.rightSection}>{rightAction}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.navy,
    paddingBottom: spacing.lg,
    overflow: 'hidden',
  },
  accentSlash: {
    position: 'absolute',
    top: -20,
    right: -40,
    width: 140,
    height: '140%',
    backgroundColor: colors.cyan,
    opacity: 0.15,
    transform: [{ rotate: '-15deg' }],
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  logo: {
    width: 120,
    height: 40,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  backButton: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  title: {
    fontSize: 22,
    color: colors.white,
    ...fonts.bold,
    flex: 1,
  },
  rightSection: {
    marginLeft: spacing.md,
  },
});
