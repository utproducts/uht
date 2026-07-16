import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch } from '../services/auth';
import ScreenHeader from '../components/ScreenHeader';

interface EventSummary {
  id: string;
  name: string;
  city: string;
  state: string;
  start_date: string;
  end_date: string;
  logo_url?: string;
  pending_count: number;
  approved_count: number;
  total_count: number;
}

interface Registration {
  id: string;
  team_name: string;
  age_group: string;
  division?: string;
  status: string;
  payment_status?: string;
  created_at: string;
  head_coach_name?: string;
  email1?: string;
  manager_first_name?: string;
  manager_last_name?: string;
  hotel_assigned?: string;
  amount_cents?: number;
  paid_cents?: number;
  event_division_id?: string;
  registered_by_name?: string;
  needs_hotel?: number;
}

interface Hotel {
  id: string;
  hotel_name: string;
  city?: string;
  state?: string;
  rate_description?: string;
  price_per_night?: string;
  booking_url?: string;
}

export default function AdminRegistrationsScreen({ navigation }: { navigation: any }) {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Detail view state
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loadingRegs, setLoadingRegs] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // Hotel assignment modal
  const [hotelModal, setHotelModal] = useState(false);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [approvingRegId, setApprovingRegId] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadEvents = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await authFetch('/api/events?per_page=100&season=2026-27');
      const json = await res.json() as any;
      if (json.success && Array.isArray(json.data)) {
        // For each event, get registration counts
        const eventsWithCounts: EventSummary[] = [];
        for (const evt of json.data) {
          try {
            const regRes = await authFetch(`/api/registrations/event/${evt.id}`);
            const regJson = await regRes.json() as any;
            const regs = regJson.data || [];
            const pending = regs.filter((r: any) => r.status === 'pending').length;
            const approved = regs.filter((r: any) => r.status === 'approved').length;
            if (regs.length > 0) {
              eventsWithCounts.push({
                id: evt.id,
                name: evt.name,
                city: evt.city || '',
                state: evt.state || '',
                start_date: evt.start_date || '',
                end_date: evt.end_date || '',
                logo_url: evt.logo_url,
                pending_count: pending,
                approved_count: approved,
                total_count: regs.length,
              });
            }
          } catch {}
        }
        // Sort: pending first, then by date
        eventsWithCounts.sort((a, b) => {
          if (a.pending_count > 0 && b.pending_count === 0) return -1;
          if (a.pending_count === 0 && b.pending_count > 0) return 1;
          return a.start_date.localeCompare(b.start_date);
        });
        setEvents(eventsWithCounts);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents]),
  );

  async function loadRegistrations(eventId: string) {
    setLoadingRegs(true);
    try {
      const res = await authFetch(`/api/registrations/event/${eventId}`);
      const json = await res.json() as any;
      setRegistrations(json.data || []);
    } catch {
      setRegistrations([]);
    }
    setLoadingRegs(false);
  }

  async function loadHotels(eventId: string) {
    setLoadingHotels(true);
    try {
      const res = await authFetch(`/api/events/${eventId}/hotels`);
      const json = await res.json() as any;
      setHotels(json.data || []);
    } catch {
      setHotels([]);
    }
    setLoadingHotels(false);
  }

  function handleSelectEvent(event: EventSummary) {
    setSelectedEvent(event);
    setFilter('all');
    loadRegistrations(event.id);
    loadHotels(event.id);
  }

  async function handleApprove(regId: string) {
    if (!selectedEvent) return;

    // If event has hotels, show hotel picker
    if (hotels.length > 0) {
      setApprovingRegId(regId);
      setHotelModal(true);
      return;
    }

    // No hotels, approve directly
    await doApprove(regId);
  }

  async function doApprove(regId: string, hotelId?: string) {
    setProcessing(regId);
    try {
      const body: any = {};
      if (hotelId) body.hotelId = hotelId;
      const res = await authFetch(`/api/registrations/${regId}/approve`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const json = await res.json() as any;
      if (json.success) {
        // Refresh registrations
        if (selectedEvent) {
          await loadRegistrations(selectedEvent.id);
          // Update event counts
          setEvents(prev => prev.map(e => {
            if (e.id === selectedEvent.id) {
              return {
                ...e,
                pending_count: Math.max(0, e.pending_count - 1),
                approved_count: e.approved_count + 1,
              };
            }
            return e;
          }));
        }
        const emailMsg = json.email_sent
          ? 'Team has been approved and notified via email.'
          : 'Team has been approved. Note: acceptance email could not be sent — please verify the contact email.';
        Alert.alert('Approved', emailMsg);
      } else if (json.requiresHotel) {
        // API says hotel selection required — open hotel picker
        setApprovingRegId(regId);
        if (selectedEvent) await loadHotels(selectedEvent.id);
        setHotelModal(true);
        setProcessing(null);
        return;
      } else {
        Alert.alert('Error', json.error || 'Failed to approve registration');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    }
    setProcessing(null);
    setHotelModal(false);
    setApprovingRegId(null);
  }

  async function handleReject(regId: string, teamName: string) {
    Alert.alert(
      'Reject Registration',
      `Are you sure you want to reject ${teamName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setProcessing(regId);
            try {
              const res = await authFetch(`/api/registrations/${regId}/reject`, {
                method: 'POST',
              });
              const json = await res.json() as any;
              if (json.success) {
                if (selectedEvent) {
                  await loadRegistrations(selectedEvent.id);
                  setEvents(prev => prev.map(e => {
                    if (e.id === selectedEvent.id) {
                      return { ...e, pending_count: Math.max(0, e.pending_count - 1) };
                    }
                    return e;
                  }));
                }
              } else {
                Alert.alert('Error', json.error || 'Failed to reject');
              }
            } catch {
              Alert.alert('Error', 'Network error');
            }
            setProcessing(null);
          },
        },
      ],
    );
  }

  async function handleAssignHotel(regId: string) {
    setApprovingRegId(regId);
    if (selectedEvent) {
      await loadHotels(selectedEvent.id);
    }
    setHotelModal(true);
  }

  async function handleHotelSelect(hotelId: string) {
    if (!approvingRegId) return;

    // Check if this is for approval or just hotel assignment
    const reg = registrations.find(r => r.id === approvingRegId);
    if (reg?.status === 'pending') {
      await doApprove(approvingRegId, hotelId);
    } else {
      // Just update hotel assignment on already-approved reg
      setProcessing(approvingRegId);
      try {
        const res = await authFetch(`/api/registrations/${approvingRegId}/approve`, {
          method: 'POST',
          body: JSON.stringify({ hotelId }),
        });
        const json = await res.json() as any;
        if (json.success || json.error?.includes('Cannot approve')) {
          // If already approved, try direct hotel update
          // For now the approve endpoint handles hotel assignment even if already approved
          if (selectedEvent) await loadRegistrations(selectedEvent.id);
        }
      } catch {}
      setProcessing(null);
      setHotelModal(false);
      setApprovingRegId(null);
    }
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'approved': return colors.success;
      case 'rejected': case 'denied': return colors.error;
      case 'waitlisted': return '#8b5cf6';
      default: return colors.textMuted;
    }
  }

  function getPaymentLabel(reg: Registration): string {
    if (reg.payment_status === 'paid') return 'Paid';
    if (reg.payment_status === 'partial' || (reg.paid_cents && reg.paid_cents > 0)) return 'Deposit Paid';
    return 'Unpaid';
  }

  function getPaymentColor(reg: Registration): string {
    if (reg.payment_status === 'paid') return colors.success;
    if (reg.payment_status === 'partial' || (reg.paid_cents && reg.paid_cents > 0)) return '#f59e0b';
    return colors.textMuted;
  }

  const filteredRegs = registrations.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'rejected') return r.status === 'rejected' || r.status === 'denied';
    return r.status === filter;
  });

  // ========== Detail view: registrations for a specific event ==========
  if (selectedEvent) {
    const pendingCount = registrations.filter(r => r.status === 'pending').length;
    const approvedCount = registrations.filter(r => r.status === 'approved').length;

    return (
      <View style={styles.container}>
        <ScreenHeader
          title={selectedEvent.name}
          showBack
          onBack={() => {
            setSelectedEvent(null);
            setRegistrations([]);
          }}
        />

        {/* Summary bar */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{registrations.length}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNumber, { color: '#f59e0b' }]}>{pendingCount}</Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNumber, { color: colors.success }]}>{approvedCount}</Text>
            <Text style={styles.summaryLabel}>Approved</Text>
          </View>
        </View>

        {/* Filter pills */}
        <View style={styles.filterRow}>
          {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterPill, filter === f && styles.filterPillActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loadingRegs ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : (
          <FlatList
            data={filteredRegs}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyText}>No {filter !== 'all' ? filter : ''} registrations</Text>
              </View>
            }
            renderItem={({ item }) => {
              const coachName = item.head_coach_name
                || item.registered_by_name
                || [item.manager_first_name, item.manager_last_name].filter(Boolean).join(' ')
                || '';
              const isProcessing = processing === item.id;

              return (
                <View style={styles.regCard}>
                  {/* Header row */}
                  <View style={styles.regHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.regTeamName}>{item.team_name}</Text>
                      <Text style={styles.regDetail}>
                        {item.age_group}{item.division ? ` · ${item.division}` : ''}
                      </Text>
                      {coachName ? (
                        <Text style={styles.regCoach}>Coach: {coachName}</Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                        <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </Text>
                      </View>
                      <View style={[styles.paymentBadge, { backgroundColor: getPaymentColor(item) + '15' }]}>
                        <Text style={[styles.paymentText, { color: getPaymentColor(item) }]}>
                          {getPaymentLabel(item)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Hotel info */}
                  {item.hotel_assigned ? (
                    <View style={styles.hotelRow}>
                      <Ionicons name="bed-outline" size={14} color={colors.cyan} />
                      <Text style={styles.hotelText}>
                        {hotels.find(h => h.id === item.hotel_assigned)?.hotel_name || 'Hotel assigned'}
                      </Text>
                    </View>
                  ) : item.status === 'approved' && hotels.length > 0 ? (
                    <TouchableOpacity
                      style={styles.assignHotelBtn}
                      onPress={() => handleAssignHotel(item.id)}
                      disabled={isProcessing}
                    >
                      <Ionicons name="bed-outline" size={14} color={colors.cyan} />
                      <Text style={styles.assignHotelText}>Assign Hotel</Text>
                    </TouchableOpacity>
                  ) : null}

                  {/* Action buttons — only for pending registrations */}
                  {item.status === 'pending' && (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.approveBtn]}
                        onPress={() => handleApprove(item.id)}
                        disabled={isProcessing}
                        activeOpacity={0.7}
                      >
                        {isProcessing ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                            <Text style={styles.actionBtnText}>Approve</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.rejectBtn]}
                        onPress={() => handleReject(item.id, item.team_name)}
                        disabled={isProcessing}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="close-circle" size={18} color={colors.error} />
                        <Text style={[styles.actionBtnText, { color: colors.error }]}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        {/* Hotel Selection Modal */}
        <Modal visible={hotelModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {registrations.find(r => r.id === approvingRegId)?.status === 'pending'
                    ? 'Approve & Assign Hotel'
                    : 'Assign Hotel'}
                </Text>
                <TouchableOpacity onPress={() => { setHotelModal(false); setApprovingRegId(null); }}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              {loadingHotels ? (
                <ActivityIndicator size="large" color={colors.navy} style={{ paddingVertical: 40 }} />
              ) : (
                <ScrollView style={{ maxHeight: 400 }}>
                  {hotels.map(hotel => (
                    <TouchableOpacity
                      key={hotel.id}
                      style={styles.hotelOption}
                      onPress={() => handleHotelSelect(hotel.id)}
                      disabled={!!processing}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.hotelOptionName}>{hotel.hotel_name}</Text>
                        {hotel.city ? (
                          <Text style={styles.hotelOptionDetail}>{hotel.city}, {hotel.state}</Text>
                        ) : null}
                        {hotel.rate_description ? (
                          <Text style={styles.hotelOptionRate}>{hotel.rate_description}</Text>
                        ) : hotel.price_per_night ? (
                          <Text style={styles.hotelOptionRate}>${hotel.price_per_night}/night</Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}

                  {/* Approve without hotel option (for pending regs) */}
                  {registrations.find(r => r.id === approvingRegId)?.status === 'pending' && (
                    <TouchableOpacity
                      style={[styles.hotelOption, { borderBottomWidth: 0 }]}
                      onPress={() => approvingRegId && doApprove(approvingRegId)}
                      disabled={!!processing}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.hotelOptionName, { color: colors.textSecondary }]}>
                          Approve without hotel
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ========== Events list view ==========
  return (
    <View style={styles.container}>
      <ScreenHeader title="Registrations" showBack onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadEvents(true); }} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>No events with registrations</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.eventCard}
              onPress={() => handleSelectEvent(item)}
              activeOpacity={0.7}
            >
              <View style={styles.eventCardContent}>
                <Text style={styles.eventName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.eventMeta}>
                  {item.city && item.state ? `${item.city}, ${item.state} · ` : ''}
                  {formatDate(item.start_date)}{item.end_date ? ` - ${formatDate(item.end_date)}` : ''}
                </Text>
              </View>
              <View style={styles.eventCountsRow}>
                {item.pending_count > 0 && (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>{item.pending_count} pending</Text>
                  </View>
                )}
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{item.approved_count} approved</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.regular,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
    ...fonts.medium,
  },

  // Event list
  eventCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  eventCardContent: {
    marginBottom: spacing.sm,
  },
  eventName: {
    fontSize: 17,
    color: colors.text,
    ...fonts.bold,
    marginBottom: 4,
  },
  eventMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
  },
  eventCountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.xs,
  },
  pendingBadgeText: {
    fontSize: 12,
    color: '#92400e',
    ...fonts.bold,
  },
  countBadge: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.xs,
  },
  countBadgeText: {
    fontSize: 12,
    color: '#166534',
    ...fonts.semibold,
  },

  // Summary bar
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.md,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 24,
    color: colors.text,
    ...fonts.bold,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.semibold,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // Filter pills
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.bg,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  filterPillText: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.semibold,
  },
  filterPillTextActive: {
    color: colors.white,
  },

  // Registration cards
  regCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  regHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  regTeamName: {
    fontSize: 16,
    color: colors.text,
    ...fonts.bold,
    marginBottom: 2,
  },
  regDetail: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.medium,
    marginBottom: 2,
  },
  regCoach: {
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.regular,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.xs,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    ...fonts.bold,
    textTransform: 'uppercase',
  },
  paymentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  paymentText: {
    fontSize: 11,
    ...fonts.semibold,
  },

  // Hotel row
  hotelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  hotelText: {
    fontSize: 13,
    color: colors.cyan,
    ...fonts.medium,
  },
  assignHotelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  assignHotelText: {
    fontSize: 13,
    color: colors.cyan,
    ...fonts.semibold,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.sm,
    gap: 6,
  },
  approveBtn: {
    backgroundColor: colors.success,
  },
  rejectBtn: {
    backgroundColor: colors.errorBg || '#fef2f2',
    borderWidth: 1,
    borderColor: colors.error + '30',
  },
  actionBtnText: {
    fontSize: 14,
    color: colors.white,
    ...fonts.bold,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    color: colors.text,
    ...fonts.bold,
  },
  hotelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hotelOptionName: {
    fontSize: 16,
    color: colors.text,
    ...fonts.semibold,
  },
  hotelOptionDetail: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 2,
  },
  hotelOptionRate: {
    fontSize: 13,
    color: colors.cyan,
    ...fonts.medium,
    marginTop: 2,
  },
});
