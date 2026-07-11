import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch } from '../services/auth';

interface UserNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  data: string | null;
  is_read: number;
  read_at: string | null;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function getNotifIcon(type: string): { name: keyof typeof Ionicons.glyphMap; color: string } {
  switch (type) {
    case 'broadcast': return { name: 'megaphone', color: colors.cyan };
    case 'event_update': return { name: 'calendar', color: colors.info };
    case 'division_update': return { name: 'trophy', color: colors.warning };
    case 'locker_room': return { name: 'key', color: colors.success };
    case 'team': return { name: 'people', color: colors.navy };
    default: return { name: 'notifications', color: colors.cyan };
  }
}

export default function NotificationsInboxScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [total, setTotal] = useState(0);

  const loadNotifications = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await authFetch('/api/push/user-notifications?limit=100');
      const json = await res.json() as any;
      if (json.success) {
        setNotifications(json.data.notifications || []);
        setTotal(json.data.total || 0);
      }
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
    setLoading(false);
    if (isRefresh) setRefreshing(false);
  }, []);

  // Load notifications and mark all as read when screen focuses
  useFocusEffect(
    useCallback(() => {
      loadNotifications();
      // Mark all as read + clear badge
      authFetch('/api/push/mark-all-read', { method: 'POST' }).catch(() => {});
      Notifications.setBadgeCountAsync(0).catch(() => {});
    }, [loadNotifications])
  );

  const markAsRead = async (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: 1 } : n)
    );
    try {
      await authFetch(`/api/push/mark-read/${id}`, { method: 'POST' });
    } catch {}
  };

  const renderNotification = ({ item }: { item: UserNotification }) => {
    const icon = getNotifIcon(item.type);
    const isUnread = !item.is_read;

    return (
      <TouchableOpacity
        style={[styles.notifCard, isUnread && styles.notifUnread]}
        activeOpacity={0.7}
        onPress={() => markAsRead(item.id)}
      >
        {/* Unread dot */}
        {isUnread && <View style={styles.unreadDot} />}

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: icon.color + '18' }]}>
          <Ionicons name={icon.name} size={20} color={icon.color} />
        </View>

        {/* Content */}
        <View style={styles.notifContent}>
          <Text style={[styles.notifTitle, isUnread && styles.notifTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.notifBody} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.notifTime}>{timeAgo(item.created_at)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>No notifications yet</Text>
        <Text style={styles.emptySubtitle}>
          When you receive push notifications, they'll appear here
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Image
          source={require('../../assets/uht-letters.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.headerRight}>
          {notifications.some(n => !n.is_read) && (
            <TouchableOpacity
              style={styles.markAllBtn}
              onPress={() => {
                setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
                authFetch('/api/push/mark-all-read', { method: 'POST' }).catch(() => {});
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Title bar */}
      <View style={styles.titleBar}>
        <Text style={styles.titleText}>Notifications</Text>
        {total > 0 && (
          <Text style={styles.countText}>{total} total</Text>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[
            styles.listContent,
            notifications.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadNotifications(true);
              }}
              tintColor={colors.navy}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    height: 28,
    width: 80,
    flex: 1,
  },
  headerRight: {
    minWidth: 36,
    alignItems: 'flex-end',
  },
  markAllBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(0, 204, 255, 0.15)',
  },
  markAllText: {
    fontSize: 12,
    color: colors.cyan,
    ...fonts.semibold,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  titleText: {
    fontSize: 20,
    color: colors.text,
    ...fonts.bold,
  },
  countText: {
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.medium,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: 40,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
    position: 'relative',
  },
  notifUnread: {
    backgroundColor: '#f0f8ff',
    borderLeftWidth: 3,
    borderLeftColor: colors.cyan,
  },
  unreadDot: {
    position: 'absolute',
    top: spacing.lg + 2,
    left: spacing.sm,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifContent: {
    flex: 1,
    gap: 2,
  },
  notifTitle: {
    fontSize: 15,
    color: colors.text,
    ...fonts.medium,
  },
  notifTitleUnread: {
    ...fonts.bold,
  },
  notifBody: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
    lineHeight: 18,
  },
  notifTime: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.regular,
    marginTop: 4,
  },
  separator: {
    height: spacing.sm,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 18,
    color: colors.text,
    ...fonts.semibold,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
});
