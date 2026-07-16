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
  Share,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { getUser, authFetch, getActiveRole, setActiveRole, refreshUser, User } from '../services/auth';
import { getFollowedTeams } from '../services/api';
import { refreshBadgeCount } from '../services/notifications';
import AppHeader from '../components/AppHeader';
import RoleBar from '../components/RoleBar';

interface MyEvent {
  id: string;
  name: string;
  slug: string;
  city?: string;
  state?: string;
  start_date: string;
  end_date: string;
  logo_url?: string;
  teamNames: string[];
  paymentStatus: 'paid' | 'deposit' | 'due' | 'unknown';
  divisionName?: string;
  regIds: string[];
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (start.getMonth() === end.getMonth()) {
    return `${months[start.getMonth()]} ${start.getDate()}-${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${months[start.getMonth()]} ${start.getDate()} - ${months[end.getMonth()]} ${end.getDate()}, ${start.getFullYear()}`;
}

export default function MyEventsScreen({ navigation }: { navigation: any }) {
  const [events, setEvents] = useState<MyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [activeRole, setActiveRoleState] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [freshUser, myTeamsRes, followedTeams, badgeCount] = await Promise.all([
        refreshUser().catch(() => null),
        authFetch('/api/teams/my-teams').then(r => r.json()).catch(() => ({ success: false })),
        getFollowedTeams().catch(() => []),
        refreshBadgeCount().catch(() => 0),
      ]);

      const user = freshUser || await getUser();
      setUnreadCount(badgeCount as number);
      if (user?.roles) setUserRoles(user.roles);

      const savedRole = await getActiveRole();
      if (savedRole && user?.roles?.includes(savedRole)) {
        setActiveRoleState(savedRole);
      } else if (user?.roles?.length) {
        setActiveRoleState(user.roles[0]);
      }

      const eventMap = new Map<string, MyEvent>();
      const eventTeamNames = new Map<string, Set<string>>();
      const eventRegIds = new Map<string, Set<string>>();

      // Process owned teams
      const myTeamsJson = myTeamsRes as { success: boolean; data?: any[] };
      if (myTeamsJson.success && Array.isArray(myTeamsJson.data)) {
        for (const team of myTeamsJson.data) {
          const teamName = team.name || '';
          const regEvents = team.registered_events || [];
          for (const re of regEvents) {
            if (!re.event_id) continue;
            if (!eventMap.has(re.event_id)) {
              // Determine payment status
              let paymentStatus: 'paid' | 'deposit' | 'due' | 'unknown' = 'unknown';
              if (re.payment_status === 'paid') paymentStatus = 'paid';
              else if (re.payment_status === 'deposit') paymentStatus = 'deposit';
              else if (re.payment_status === 'pending' || re.payment_status === 'due') paymentStatus = 'due';
              else if (re.amount_paid > 0 && re.amount_paid < re.total_amount) paymentStatus = 'deposit';
              else if (re.amount_paid >= re.total_amount && re.total_amount > 0) paymentStatus = 'paid';
              else paymentStatus = 'due';

              eventMap.set(re.event_id, {
                id: re.event_id,
                name: re.event_name || '',
                slug: re.slug || '',
                city: re.city,
                state: re.state,
                start_date: re.start_date || '',
                end_date: re.end_date || '',
                logo_url: re.logo_url,
                teamNames: [],
                paymentStatus,
                divisionName: re.division_name,
                regIds: [],
              });
              eventTeamNames.set(re.event_id, new Set());
              eventRegIds.set(re.event_id, new Set());
            }
            if (teamName) eventTeamNames.get(re.event_id)!.add(teamName);
            // Track registration IDs for payment links
            const regId = re.reg_id || re.id;
            if (regId) eventRegIds.get(re.event_id)!.add(String(regId));
          }
        }
      }

      // Process followed teams
      if (Array.isArray(followedTeams)) {
        for (const ft of followedTeams as any[]) {
          const teamName = ft.team_name || '';
          const regEvents = ft.registered_events || [];
          for (const re of regEvents) {
            if (!re.event_id || eventMap.has(re.event_id)) continue;
            eventMap.set(re.event_id, {
              id: re.event_id,
              name: re.event_name || '',
              slug: re.slug || '',
              city: re.city,
              state: re.state,
              start_date: re.start_date || '',
              end_date: re.end_date || '',
              logo_url: re.logo_url,
              teamNames: [],
              paymentStatus: 'unknown',
              regIds: [],
            });
            eventTeamNames.set(re.event_id, new Set());
            eventRegIds.set(re.event_id, new Set());
            if (teamName) eventTeamNames.get(re.event_id)!.add(teamName);
          }
        }
      }

      // Merge team names and reg IDs
      const allEvents: MyEvent[] = [];
      for (const [eventId, event] of eventMap) {
        const names = eventTeamNames.get(eventId);
        event.teamNames = names ? Array.from(names) : [];
        const rIds = eventRegIds.get(eventId);
        event.regIds = rIds ? Array.from(rIds) : [];
        allEvents.push(event);
      }

      // Sort by start_date
      const today = new Date().toISOString().split('T')[0];
      const sorted = allEvents
        .filter(e => e.end_date >= today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));

      setEvents(sorted);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => { loadData(); }, [loadData])
  );

  async function handleSwitchRole(role: string) {
    setActiveRoleState(role);
    await setActiveRole(role);
  }

  function renderPaymentBadge(status: string) {
    let label = '';
    let style: any = {};
    switch (status) {
      case 'paid':
        label = 'Paid';
        style = styles.payPaid;
        break;
      case 'deposit':
        label = 'Deposit';
        style = styles.payDeposit;
        break;
      case 'due':
        label = 'Balance due';
        style = styles.payDue;
        break;
      default:
        return null;
    }
    return (
      <View style={[styles.payBadge, style]}>
        <Text style={[styles.payBadgeText, { color: style.color }]}>{label}</Text>
      </View>
    );
  }

  async function handleSharePaymentLink(item: MyEvent) {
    if (!item.regIds.length) return;
    const payUrl = `https://ultimatetournaments.com/pay?reg=${item.regIds.join(',')}`;
    try {
      await Share.share({
        message: `Pay for ${item.teamNames.join(', ')} at ${item.name}:\n${payUrl}`,
        url: payUrl,
      });
    } catch {
      // Fallback: copy to clipboard
      await Clipboard.setStringAsync(payUrl);
      Alert.alert('Copied!', 'Payment link copied to clipboard.');
    }
  }

  async function handleCopyPaymentLink(item: MyEvent) {
    if (!item.regIds.length) return;
    const payUrl = `https://ultimatetournaments.com/pay?reg=${item.regIds.join(',')}`;
    await Clipboard.setStringAsync(payUrl);
    Alert.alert('Copied!', 'Payment link copied to clipboard.');
  }

  const isPaymentRole = ['coach', 'manager', 'org_admin', 'admin'].includes(activeRole);

  function renderEvent({ item }: { item: MyEvent }) {
    const showPayLink = isPaymentRole && item.regIds.length > 0 && (item.paymentStatus === 'due' || item.paymentStatus === 'deposit');
    return (
      <View style={styles.eventCard}>
        <TouchableOpacity
          style={styles.eventRow}
          onPress={() => navigation.navigate('EventDetail', { eventId: item.id, slug: item.slug })}
          activeOpacity={0.7}
        >
          <View style={styles.eventLogo}>
            {item.logo_url ? (
              <Image source={{ uri: item.logo_url }} style={styles.eventLogoImg} />
            ) : (
              <Ionicons name="trophy" size={20} color="#854F0B" />
            )}
          </View>
          <View style={styles.eventInfo}>
            <Text style={styles.eventName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.eventDate}>
              {formatDateRange(item.start_date, item.end_date)}
              {item.city ? ` · ${item.city}, ${item.state || ''}` : ''}
            </Text>
            {item.teamNames.length > 0 && (
              <Text style={styles.eventTeams} numberOfLines={1}>
                {item.teamNames.join(', ')}
              </Text>
            )}
          </View>
          {renderPaymentBadge(item.paymentStatus)}
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
        {showPayLink && (
          <View style={styles.payLinkRow}>
            <TouchableOpacity
              style={styles.payLinkBtn}
              onPress={() => handleCopyPaymentLink(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="copy-outline" size={14} color={colors.navy} />
              <Text style={styles.payLinkText}>Copy payment link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.payShareBtn}
              onPress={() => handleSharePaymentLink(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={14} color={colors.navy} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AppHeader
        onNotificationPress={() => navigation.navigate('NotificationsInbox')}
        onRolePress={() => {}}
        unreadCount={unreadCount}
        hasMultipleRoles={userRoles.length > 1}
      />
      <RoleBar
        activeRole={activeRole}
        userRoles={userRoles}
        onSwitchRole={handleSwitchRole}
      />
      <View style={styles.titleRow}>
        <Text style={styles.title}>My events</Text>
      </View>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No upcoming events</Text>
          <Text style={styles.emptyText}>Register a team for an event to see it here</Text>
          <TouchableOpacity
            style={styles.findBtn}
            onPress={() => navigation.navigate('Find Events' as never)}
            activeOpacity={0.7}
          >
            <Text style={styles.findBtnText}>Find events</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={events}
          renderItem={renderEvent}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} colors={[colors.navy]} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  titleRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 20,
  },
  eventCard: {
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  eventLogo: {
    width: 40,
    height: 40,
    borderRadius: radii.xs,
    backgroundColor: '#FAEEDA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  eventLogoImg: {
    width: 40,
    height: 40,
    borderRadius: radii.xs,
  },
  eventInfo: {
    flex: 1,
    marginRight: 8,
  },
  eventName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  eventDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  eventTeams: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  payBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  payBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  payPaid: {
    backgroundColor: '#EAF3DE',
    color: '#3B6D11',
  },
  payDeposit: {
    backgroundColor: '#FAEEDA',
    color: '#854F0B',
  },
  payDue: {
    backgroundColor: '#FCEBEB',
    color: '#A32D2D',
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.lg,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  findBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.navy,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radii.sm,
  },
  findBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  payLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
  },
  payLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  payLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navy,
  },
  payShareBtn: {
    padding: 6,
  },
});
