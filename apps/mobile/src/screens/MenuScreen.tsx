import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import Constants from 'expo-constants';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { clearAuth, getUser, User } from '../services/auth';
import ScreenHeader from '../components/ScreenHeader';

interface MenuGridItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  adminOnly?: boolean;
  scorekeeperOnly?: boolean;
}

interface MenuListItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  subtitle?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  destructive?: boolean;
}

const SITE_URL = 'https://ultimatetournaments.com';

export default function MenuScreen({ navigation }: { navigation: any }) {
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    getUser().then(setCurrentUser);
  }, []);

  const isAdmin = currentUser?.roles?.some(r =>
    ['admin', 'tournament_director', 'director'].includes(r)
  ) || false;

  const isScorekeeper = currentUser?.roles?.some(r =>
    ['scorekeeper'].includes(r)
  ) || false;

  function handleLogOut() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearAuth();
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'Welcome' }],
              })
            );
          } catch {
            Alert.alert('Error', 'Failed to log out. Please try again.');
          }
        },
      },
    ]);
  }

  function openURL(url: string) {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open link.');
    });
  }

  const MANAGE_ITEMS: MenuGridItem[] = [
    {
      label: 'Team Management',
      icon: 'people-outline',
      onPress: () => navigation.navigate('My Teams'),
    },
    {
      label: 'Player Management',
      icon: 'person-outline',
      onPress: () => navigation.navigate('My Teams'),
    },
    {
      label: 'Assign Scorekeepers',
      icon: 'clipboard-outline',
      adminOnly: true,
      onPress: () => navigation.navigate('Scorekeeper'),
    },
  ];

  const BROWSE_ITEMS: MenuGridItem[] = [
    { label: 'Events', icon: 'calendar-outline', onPress: () => navigation.navigate('Events') },
    { label: 'Teams', icon: 'search-outline', onPress: () => navigation.navigate('My Teams') },
  ];

  const SHOP_ITEMS: MenuGridItem[] = [
    { label: 'Champions Locker', icon: 'trophy-outline', onPress: () => navigation.navigate('Shop') },
    { label: 'Merch', icon: 'shirt-outline', onPress: () => navigation.navigate('Shop') },
  ];

  const ACCOUNT_ITEMS: MenuListItem[] = [
    { label: 'Account Settings', icon: 'person-circle-outline' },
    { label: 'Notifications', icon: 'notifications-outline' },
    {
      label: 'Add to Calendar',
      icon: 'calendar-outline',
      subtitle: 'Sync all upcoming events to Calendar',
      rightIcon: 'sync-outline',
    },
  ];

  const SUPPORT_ITEMS: MenuListItem[] = [
    {
      label: 'Contact Support',
      icon: 'mail-outline',
      subtitle: 'info@ultimatetournaments.com',
      onPress: () => openURL('mailto:info@ultimatetournaments.com'),
    },
    {
      label: 'FAQ',
      icon: 'help-circle-outline',
      onPress: () => openURL(`${SITE_URL}/faq`),
    },
    {
      label: 'Visit Website',
      icon: 'globe-outline',
      onPress: () => openURL(SITE_URL),
    },
  ];

  const LEGAL_ITEMS: MenuListItem[] = [
    {
      label: 'Privacy Policy',
      icon: 'shield-checkmark-outline',
      onPress: () => openURL(`${SITE_URL}/privacy`),
    },
    {
      label: 'Terms of Service',
      icon: 'document-text-outline',
      onPress: () => openURL(`${SITE_URL}/terms`),
    },
  ];

  const LOGOUT_ITEMS: MenuListItem[] = [
    {
      label: 'Log Out',
      icon: 'log-out-outline',
      onPress: handleLogOut,
      destructive: true,
    },
  ];

  function renderGridSection(title: string, items: MenuGridItem[]) {
    // Filter out admin/scorekeeper-only items for regular users
    const visibleItems = items.filter(item => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.scorekeeperOnly && !isScorekeeper && !isAdmin) return false;
      return true;
    });

    if (visibleItems.length === 0) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.grid}>
          {visibleItems.map((item) => (
            <View key={item.label} style={styles.gridCardWrapper}>
              <TouchableOpacity
                style={styles.gridCard}
                activeOpacity={0.7}
                onPress={item.onPress || (() => console.log(`Tapped: ${item.label}`))}
              >
                <Ionicons name={item.icon} size={22} color={colors.navy} />
                <Text style={styles.gridLabel}>{item.label}</Text>
              </TouchableOpacity>
            </View>
          ))}
          {visibleItems.length % 3 === 1 && (
            <>
              <View style={styles.gridCardWrapper} />
              <View style={styles.gridCardWrapper} />
            </>
          )}
          {visibleItems.length % 3 === 2 && (
            <View style={styles.gridCardWrapper} />
          )}
        </View>
      </View>
    );
  }

  function renderListSection(title: string, items: MenuListItem[]) {
    return (
      <View style={styles.section}>
        {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
        <View style={styles.listContainer}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.listItem,
                index === 0 && styles.listItemFirst,
                index === items.length - 1 && styles.listItemLast,
              ]}
              activeOpacity={0.7}
              onPress={item.onPress || (() => console.log(`Tapped: ${item.label}`))}
            >
              <View style={styles.listItemLeft}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.destructive ? colors.error : colors.navy}
                  style={styles.listIcon}
                />
                <View style={styles.listTextContainer}>
                  <Text
                    style={[
                      styles.listLabel,
                      item.destructive && styles.listLabelDestructive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.subtitle ? (
                    <Text style={styles.listSubtitle}>{item.subtitle}</Text>
                  ) : null}
                </View>
              </View>
              <Ionicons
                name={item.rightIcon || 'chevron-forward'}
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Menu" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderGridSection('MANAGE', MANAGE_ITEMS)}
        {renderGridSection('BROWSE', BROWSE_ITEMS)}
        {renderGridSection('SHOP', SHOP_ITEMS)}
        {renderListSection('YOUR ACCOUNT', ACCOUNT_ITEMS)}
        {renderListSection('SUPPORT', SUPPORT_ITEMS)}
        {renderListSection('LEGAL', LEGAL_ITEMS)}
        {renderListSection('', LOGOUT_ITEMS)}

        {/* App version */}
        <Text style={styles.versionText}>
          Ultimate Tournaments v{appVersion}
        </Text>
      </ScrollView>
    </View>
  );
}

const GRID_GAP = 8;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 80,
  },

  // Sections
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
    paddingHorizontal: 2,
  },

  // Grid cards — compact 3-column layout
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -(GRID_GAP / 2),
  },
  gridCardWrapper: {
    width: '33.33%',
    paddingHorizontal: GRID_GAP / 2,
    marginBottom: GRID_GAP,
  },
  gridCard: {
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
  },
  gridLabel: {
    fontSize: 11,
    color: colors.text,
    ...fonts.semibold,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 14,
  },

  // List items
  listContainer: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listItemFirst: {
    // no special styling needed
  },
  listItemLast: {
    borderBottomWidth: 0,
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  listIcon: {
    marginRight: spacing.md,
  },
  listTextContainer: {
    flex: 1,
  },
  listLabel: {
    fontSize: 15,
    color: colors.text,
    ...fonts.medium,
  },
  listLabelDestructive: {
    color: colors.error,
  },
  listSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 1,
  },

  // Version footer
  versionText: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.regular,
    marginTop: spacing.xs,
    marginBottom: spacing.xxxl,
  },
});
