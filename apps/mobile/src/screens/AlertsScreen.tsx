import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { colors, fonts, spacing } from '../constants/theme';

export default function AlertsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Alerts</Text>
      </View>

      <View style={styles.emptyState}>
        <Text style={styles.bellText}>(( . ))</Text>
        <Text style={styles.emptyTitle}>No Notifications Yet</Text>
        <Text style={styles.emptyText}>
          You'll get alerts here when games are about to start, scores are
          posted, or schedules change.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 28,
    color: colors.text,
    ...fonts.bold,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingBottom: 60,
  },
  bellText: {
    fontSize: 40,
    color: colors.textMuted,
    ...fonts.regular,
    marginBottom: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 22,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    textAlign: 'center',
    lineHeight: 22,
  },
});
