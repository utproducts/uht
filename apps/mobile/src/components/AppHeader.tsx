import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../constants/theme';

interface AppHeaderProps {
  onNotificationPress?: () => void;
  onRolePress?: () => void;
  unreadCount?: number;
  showRoleIcon?: boolean;
  hasMultipleRoles?: boolean;
}

export default function AppHeader({
  onNotificationPress,
  onRolePress,
  unreadCount = 0,
  showRoleIcon = true,
  hasMultipleRoles = false,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 4 }]}>
      {/* Logo left */}
      <View style={styles.logoWrap}>
        <Image
          source={require('../../assets/uht-letters.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* Icons right */}
      <View style={styles.iconsRow}>
        {/* Notification bell */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onNotificationPress}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.white} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Role switcher icon — only if user has multiple roles */}
        {hasMultipleRoles && showRoleIcon && (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={onRolePress}
            activeOpacity={0.7}
          >
            <Ionicons name="person-circle-outline" size={24} color={colors.cyan} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: 8,
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 100,
    height: 32,
  },
  iconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBtn: {
    padding: 4,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: -2,
    backgroundColor: '#E53935',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
