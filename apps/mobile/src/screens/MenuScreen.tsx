import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { clearAuth } from '../services/auth';
import ScreenHeader from '../components/ScreenHeader';

interface MenuGridItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface MenuListItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  subtitle?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  destructive?: boolean;
}

const MANAGE_ITEMS: MenuGridItem[] = [
  { label: 'Team Management', icon: 'people-outline' },
  { label: 'Player Management', icon: 'person-outline' },
  { label: 'Assign Scorekeepers', icon: 'clipboard-outline' },
];

const BROWSE_ITEMS: MenuGridItem[] = [
  { label: 'Events', icon: 'calendar-outline' },
  { label: 'Teams', icon: 'search-outline' },
];

const SHOP_ITEMS: MenuGridItem[] = [
  { label: 'Champions Locker', icon: 'trophy-outline' },
];

export default function MenuScreen({ navigation }: { navigation: any }) {
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

  const HELP_ITEMS: MenuListItem[] = [
    { label: 'App Support', icon: 'information-circle-outline' },
    {
      label: 'Log Out',
      icon: 'log-out-outline',
      onPress: handleLogOut,
      destructive: true,
    },
  ];

  function renderGridSection(title: string, items: MenuGridItem[]) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.grid}>
          {items.map((item) => (
            <View key={item.label} style={styles.gridCardWrapper}>
              <TouchableOpacity
                style={styles.gridCard}
                activeOpacity={0.7}
                onPress={() => console.log(`Tapped: ${item.label}`)}
              >
                <Ionicons name={item.icon} size={28} color={colors.navy} />
                <Text style={styles.gridLabel}>{item.label}</Text>
              </TouchableOpacity>
            </View>
          ))}
          {/* Add spacer if odd number of items so last card stays left-aligned */}
          {items.length % 2 !== 0 && <View style={styles.gridSpacer} />}
        </View>
      </View>
    );
  }

  function renderListSection(title: string, items: MenuListItem[]) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
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
                  size={22}
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
                size={20}
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
        {renderListSection('HELP', HELP_ITEMS)}
      </ScrollView>
    </View>
  );
}

const GRID_GAP = spacing.md;

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
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    fontSize: 12,
    color: colors.textMuted,
    ...fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },

  // Grid cards
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -(GRID_GAP / 2),
  },
  gridCardWrapper: {
    width: '50%',
    paddingHorizontal: GRID_GAP / 2,
    marginBottom: GRID_GAP,
  },
  gridCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  gridSpacer: {
    width: '50%',
  },
  gridLabel: {
    fontSize: 14,
    color: colors.text,
    ...fonts.semibold,
    marginTop: spacing.sm,
    textAlign: 'center',
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
    paddingVertical: spacing.lg,
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
    fontSize: 16,
    color: colors.text,
    ...fonts.medium,
  },
  listLabelDestructive: {
    color: colors.error,
  },
  listSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 2,
  },
});
