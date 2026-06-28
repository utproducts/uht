import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../constants/theme';

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export default function ScreenHeader({ title, showBack, onBack, rightAction }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Diagonal cyan accent */}
      <View style={styles.accentSlash} />

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
