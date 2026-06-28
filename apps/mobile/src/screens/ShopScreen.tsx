import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import ScreenHeader from '../components/ScreenHeader';

interface CategoryItem {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const CATEGORIES: CategoryItem[] = [
  { name: 'Hats', icon: 'shirt-outline' },
  { name: 'Pins', icon: 'ribbon-outline' },
  { name: 'T-Shirts', icon: 'shirt-outline' },
  { name: 'Accessories', icon: 'gift-outline' },
];

export default function ShopScreen() {
  return (
    <View style={styles.container}>
      <ScreenHeader title="Shop" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero banner */}
        <View style={styles.heroBanner}>
          <View style={styles.heroAccent} />
          <View style={styles.heroContent}>
            <Ionicons name="trophy" size={36} color={colors.cyan} />
            <Text style={styles.heroTitle}>Champions Locker</Text>
            <Text style={styles.heroSubtitle}>Official UHT merchandise</Text>
          </View>
        </View>

        {/* Coming Soon section */}
        <View style={styles.comingSoonCard}>
          <View style={styles.comingSoonBadge}>
            <Ionicons name="time-outline" size={16} color={colors.navy} />
            <Text style={styles.comingSoonBadgeText}>Coming Soon</Text>
          </View>
          <Text style={styles.comingSoonText}>
            The Champions Locker merch store is being built. Soon you'll be able
            to browse and purchase official UHT championship gear right from the
            app.
          </Text>
        </View>

        {/* Category grid */}
        <Text style={styles.sectionTitle}>Categories</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <View key={cat.name} style={styles.categoryCard}>
              <View style={styles.categoryIconWrap}>
                <Ionicons name={cat.icon} size={32} color={colors.navy} />
              </View>
              <Text style={styles.categoryName}>{cat.name}</Text>
            </View>
          ))}
        </View>

        {/* Footer text */}
        <Text style={styles.footerText}>
          Check back soon for UHT championship merchandise!
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },

  // Hero banner
  heroBanner: {
    backgroundColor: colors.navy,
    borderRadius: radii.lg,
    padding: spacing.xxl,
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  heroAccent: {
    position: 'absolute',
    top: -30,
    right: -50,
    width: 160,
    height: '160%',
    backgroundColor: colors.cyan,
    opacity: 0.12,
    transform: [{ rotate: '-15deg' }],
  },
  heroContent: {
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 24,
    color: colors.white,
    ...fonts.bold,
    marginTop: spacing.md,
  },
  heroSubtitle: {
    fontSize: 15,
    color: colors.cyanLight,
    ...fonts.medium,
    marginTop: spacing.xs,
  },

  // Coming Soon
  comingSoonCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xxl,
  },
  comingSoonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.highlight,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    marginBottom: spacing.md,
  },
  comingSoonBadgeText: {
    fontSize: 13,
    color: colors.navy,
    ...fonts.bold,
    marginLeft: spacing.xs,
  },
  comingSoonText: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    lineHeight: 22,
  },

  // Categories
  sectionTitle: {
    fontSize: 18,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.md,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.xxl,
  },
  categoryCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  categoryIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  categoryName: {
    fontSize: 15,
    color: colors.text,
    ...fonts.semibold,
  },

  // Footer
  footerText: {
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
});
