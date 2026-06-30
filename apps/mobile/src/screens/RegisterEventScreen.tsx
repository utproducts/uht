import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch, getUser, User } from '../services/auth';
import { API_URL } from '../constants/api';
import ScreenHeader from '../components/ScreenHeader';

interface Team {
  id: string;
  name: string;
  age_group: string;
  division_level?: string;
  head_coach_name?: string;
  city?: string;
  state?: string;
}

interface Hotel {
  id: string;
  hotel_name: string;
  city?: string;
  state?: string;
  rate_description?: string;
  rate_cents?: number;
  image_url?: string;
}

type Step = 'team' | 'hotels' | 'payment' | 'confirm' | 'submitting' | 'processing_payment' | 'done';

export default function RegisterEventScreen({ route, navigation }: { route: any; navigation: any }) {
  const { eventId, eventName, eventSlug } = route.params || {};
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [step, setStep] = useState<Step>('team');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Teams
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [multiTeamMode, setMultiTeamMode] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<Team[]>([]);

  // Hotels — per-team in multi mode
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [hotelChoice1, setHotelChoice1] = useState<string | null>(null);
  const [hotelChoice2, setHotelChoice2] = useState<string | null>(null);
  const [hotelChoice3, setHotelChoice3] = useState<string | null>(null);
  const [isLocal, setIsLocal] = useState(false);
  const [needsHotel, setNeedsHotel] = useState(false);
  const [teamHotelPicks, setTeamHotelPicks] = useState<Record<string, [string | null, string | null, string | null]>>({});
  const [teamLocalFlags, setTeamLocalFlags] = useState<Record<string, boolean>>({});
  const [teamNeedsHotelFlags, setTeamNeedsHotelFlags] = useState<Record<string, boolean>>({});
  const [activeHotelTeamIdx, setActiveHotelTeamIdx] = useState(0);

  // Payment
  const [paymentChoice, setPaymentChoice] = useState<'pay_now' | 'pay_deposit' | 'pay_later'>('pay_now');
  const [eventPriceCents, setEventPriceCents] = useState<number>(0);
  const [teamPriceCents, setTeamPriceCents] = useState<Record<string, number>>({});
  const [loadingPrice, setLoadingPrice] = useState(false);

  // Flat deposit: $350 per team
  const DEPOSIT_PER_TEAM_CENTS = 35000;

  // Discount
  const [discountCode, setDiscountCode] = useState('');

  // Result
  const [registrationResult, setRegistrationResult] = useState<any>(null);
  const [registrationIds, setRegistrationIds] = useState<string[]>([]);

  useEffect(() => {
    getUser().then(u => setCurrentUser(u));
  }, []);

  // Load teams
  useEffect(() => {
    (async () => {
      setLoadingTeams(true);
      try {
        const res = await authFetch('/api/teams/my-teams');
        const json = await res.json() as any;
        if (json.success && Array.isArray(json.data)) {
          setTeams(json.data);
        }
      } catch {}
      setLoadingTeams(false);
    })();
  }, []);

  // Load hotels when moving to hotel step
  const loadHotels = useCallback(async () => {
    setLoadingHotels(true);
    try {
      const res = await authFetch(`/api/events/event-hotels/${eventId}`);
      const json = await res.json() as any;
      if (json.success && Array.isArray(json.data)) {
        setHotels(json.data);
      }
    } catch {}
    setLoadingHotels(false);
  }, [eventId]);

  // Load event pricing (divisions + event-level price) for all selected teams
  const loadEventPricing = useCallback(async () => {
    setLoadingPrice(true);
    try {
      const divRes = await authFetch(`/api/events/event-divisions/${eventId}`);
      const divJson = await divRes.json() as any;
      if (divJson.success && Array.isArray(divJson.data)) {
        const divisions = divJson.data;
        const teamsToPrice = multiTeamMode && selectedTeams.length > 0 ? selectedTeams : (selectedTeam ? [selectedTeam] : []);
        const prices: Record<string, number> = {};
        let fallbackPrice = 0;
        const anyPrice = divisions.find((d: any) => d.price_cents > 0);
        if (anyPrice) fallbackPrice = anyPrice.price_cents;

        for (const team of teamsToPrice) {
          const teamAg = team.age_group?.toLowerCase().trim() || '';
          let matchedPrice = 0;
          let bestLen = 0;
          for (const div of divisions) {
            const divAg = (div.age_group || '').toLowerCase().trim();
            if (teamAg === divAg && div.price_cents > 0) {
              matchedPrice = div.price_cents;
              break;
            }
            if (teamAg.startsWith(divAg) && divAg.length > bestLen && div.price_cents > 0) {
              matchedPrice = div.price_cents;
              bestLen = divAg.length;
            }
          }
          prices[team.id] = matchedPrice > 0 ? matchedPrice : fallbackPrice;
        }
        setTeamPriceCents(prices);
        // Total price for display
        const total = Object.values(prices).reduce((s, p) => s + p, 0);
        setEventPriceCents(total);
      }
    } catch {}
    setLoadingPrice(false);
  }, [eventId, selectedTeam, selectedTeams, multiTeamMode]);

  function selectTeam(team: Team) {
    setSelectedTeam(team);
  }

  function toggleTeam(team: Team) {
    setSelectedTeams(prev => {
      const exists = prev.some(t => t.id === team.id);
      if (exists) return prev.filter(t => t.id !== team.id);
      return [...prev, team];
    });
  }

  // Which teams are we registering?
  const teamsToRegister = multiTeamMode && selectedTeams.length > 0 ? selectedTeams : (selectedTeam ? [selectedTeam] : []);
  const numTeams = teamsToRegister.length;
  const totalDepositCents = DEPOSIT_PER_TEAM_CENTS * numTeams;

  function goToHotels() {
    if (multiTeamMode ? selectedTeams.length === 0 : !selectedTeam) return;
    setActiveHotelTeamIdx(0);
    setStep('hotels');
    loadHotels();
  }

  function goToPayment() {
    setStep('payment');
    loadEventPricing();
  }

  function goToConfirm() {
    setStep('confirm');
  }

  // Hotel helpers for multi-team mode
  function getActiveTeamHotels(): [string | null, string | null, string | null] {
    if (multiTeamMode && selectedTeams.length > 0) {
      const teamId = selectedTeams[activeHotelTeamIdx]?.id;
      return teamHotelPicks[teamId] || [null, null, null];
    }
    return [hotelChoice1, hotelChoice2, hotelChoice3];
  }

  function setActiveTeamHotel(slot: 0 | 1 | 2, value: string | null) {
    if (multiTeamMode && selectedTeams.length > 0) {
      const teamId = selectedTeams[activeHotelTeamIdx]?.id;
      setTeamHotelPicks(prev => {
        const current = prev[teamId] || [null, null, null];
        const updated: [string | null, string | null, string | null] = [...current] as any;
        updated[slot] = value;
        return { ...prev, [teamId]: updated };
      });
    } else {
      if (slot === 0) setHotelChoice1(value);
      else if (slot === 1) setHotelChoice2(value);
      else setHotelChoice3(value);
    }
  }

  function getActiveTeamIsLocal(): boolean {
    if (multiTeamMode && selectedTeams.length > 0) {
      return teamLocalFlags[selectedTeams[activeHotelTeamIdx]?.id] || false;
    }
    return isLocal;
  }

  function setActiveTeamIsLocal(val: boolean) {
    if (multiTeamMode && selectedTeams.length > 0) {
      const teamId = selectedTeams[activeHotelTeamIdx]?.id;
      setTeamLocalFlags(prev => ({ ...prev, [teamId]: val }));
      if (val) {
        setTeamHotelPicks(prev => ({ ...prev, [teamId]: [null, null, null] }));
      }
    } else {
      setIsLocal(val);
      if (val) {
        setHotelChoice1(null);
        setHotelChoice2(null);
        setHotelChoice3(null);
      }
    }
  }

  function getActiveTeamNeedsHotel(): boolean {
    if (multiTeamMode && selectedTeams.length > 0) {
      return teamNeedsHotelFlags[selectedTeams[activeHotelTeamIdx]?.id] || false;
    }
    return needsHotel;
  }

  function setActiveTeamNeedsHotel(val: boolean) {
    if (multiTeamMode && selectedTeams.length > 0) {
      const teamId = selectedTeams[activeHotelTeamIdx]?.id;
      setTeamNeedsHotelFlags(prev => ({ ...prev, [teamId]: val }));
      if (val) setTeamLocalFlags(prev => ({ ...prev, [teamId]: false }));
    } else {
      setNeedsHotel(val);
      if (val) setIsLocal(false);
    }
  }

  function allTeamsHaveHotelSelection(): boolean {
    if (!multiTeamMode || selectedTeams.length <= 1) {
      return isLocal || !!hotelChoice1 || needsHotel;
    }
    return selectedTeams.every(t =>
      teamLocalFlags[t.id] || teamNeedsHotelFlags[t.id] || !!(teamHotelPicks[t.id] && teamHotelPicks[t.id][0])
    );
  }

  async function submitRegistration() {
    if (teamsToRegister.length === 0 || !currentUser) return;

    // If registration already exists (user cancelled payment and came back), skip re-registration
    if (registrationIds.length > 0) {
      if (paymentChoice !== 'pay_later') {
        await processPayment(registrationIds);
      } else {
        setStep('done');
      }
      return;
    }

    setStep('submitting');

    try {
      const allRegIds: string[] = [];
      let lastResult: any = null;

      for (const team of teamsToRegister) {
        const body: any = {
          eventId,
          teamId: team.id,
          teamName: team.name,
          ageGroup: team.age_group,
          division: team.division_level || '',
          email: currentUser.email,
          headCoachName: team.head_coach_name || currentUser.name,
          paymentChoice: 'pay_later', // Register first, pay after
        };

        // Hotel choices — per-team in multi mode, scalar in single mode
        if (hotels.length > 0) {
          const teamIsLocal = multiTeamMode ? teamLocalFlags[team.id] : isLocal;
          if (!teamIsLocal) {
            const picks = multiTeamMode ? (teamHotelPicks[team.id] || [null, null, null]) : [hotelChoice1, hotelChoice2, hotelChoice3];
            if (picks[0]) body.hotelChoice1 = picks[0];
            if (picks[1]) body.hotelChoice2 = picks[1];
            if (picks[2]) body.hotelChoice3 = picks[2];
          }
        } else {
          const teamNeedsHotel = multiTeamMode ? teamNeedsHotelFlags[team.id] : needsHotel;
          body.needsHotel = teamNeedsHotel;
        }

        const res = await authFetch('/api/events/register', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        const json = await res.json() as any;

        if (json.success) {
          const regId = json.data?.primaryRegistrationId || json.data?.registrationId || json.data?.id;
          if (regId) allRegIds.push(regId);
          lastResult = json.data;
        } else {
          Alert.alert('Registration Failed', `${team.name}: ${json.error || 'Something went wrong.'}`);
          setStep('confirm');
          return;
        }
      }

      setRegistrationIds(allRegIds);
      setRegistrationResult(lastResult);

      // If user chose to pay now or deposit, proceed to Stripe payment
      if (paymentChoice !== 'pay_later' && allRegIds.length > 0) {
        await processPayment(allRegIds);
      } else {
        setStep('done');
      }
    } catch (err: any) {
      Alert.alert('Error', 'Network error. Please check your connection and try again.');
      setStep('confirm');
    }
  }

  async function processPayment(regIds: string[]) {
    if (teamsToRegister.length === 0 || !currentUser) return;
    setStep('processing_payment');

    try {
      // 1. Create PaymentIntent on server with ALL registration IDs
      const piRes = await fetch(`${API_URL}/api/stripe/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationIds: regIds,
          paymentChoice: paymentChoice === 'pay_deposit' ? 'pay_deposit' : 'pay_now',
          email: currentUser.email,
          eventName: eventName || 'Tournament',
          teamNames: teamsToRegister.map(t => t.name),
        }),
      });
      const piJson = await piRes.json() as any;

      if (!piJson.success) {
        Alert.alert('Payment Error', piJson.error || 'Could not set up payment. Your registration has been saved — you can pay later.');
        setStep('done');
        return;
      }

      const { clientSecret, totalCents } = piJson.data;

      // 2. Initialize Payment Sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'Ultimate Hockey Tournaments',
        applePay: {
          merchantCountryCode: 'US',
        },
        defaultBillingDetails: {
          email: currentUser.email,
        },
        style: 'automatic',
      });

      if (initError) {
        console.error('Payment sheet init error:', initError);
        Alert.alert('Payment Error', 'Could not set up payment. Your registration has been saved — you can pay later.');
        setStep('done');
        return;
      }

      // 3. Present Payment Sheet (Apple Pay will show at top if configured)
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === 'Canceled') {
          setStep('payment');
          return;
        }
        Alert.alert('Payment Failed', presentError.message || 'Payment could not be processed. You can try a different payment option.', [
          { text: 'Back to Options', onPress: () => setStep('payment') },
        ]);
        return;
      }

      // 4. Confirm payment on backend
      const confirmRes = await fetch(`${API_URL}/api/stripe/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: piJson.data.paymentIntentId }),
      });
      const confirmJson = await confirmRes.json() as any;

      if (confirmJson.success && confirmJson.data?.paid) {
        setRegistrationResult((prev: any) => ({ ...prev, paid: true, amountCents: totalCents }));
      }

      setStep('done');
    } catch (err: any) {
      console.error('Payment processing error:', err);
      Alert.alert('Payment Error', 'Something went wrong. Your registration has been saved — you can pay later.');
      setStep('done');
    }
  }

  // ------ STEP RENDERS ------

  function renderStepIndicator() {
    const steps = ['Team', 'Hotels', 'Payment', 'Confirm'];
    const stepMap: Record<string, number> = {
      team: 0,
      hotels: 1,
      payment: 2,
      confirm: 3,
      submitting: 3,
      processing_payment: 3,
    };
    const currentIndex = stepMap[step] ?? 3;

    return (
      <View style={styles.stepIndicator}>
        {steps.map((label, i) => (
          <View key={i} style={styles.stepItem}>
            <View style={[
              styles.stepDot,
              i <= currentIndex && styles.stepDotActive,
            ]}>
              {i < currentIndex ? (
                <Ionicons name="checkmark" size={12} color={colors.white} />
              ) : (
                <Text style={[styles.stepDotText, i <= currentIndex && styles.stepDotTextActive]}>
                  {i + 1}
                </Text>
              )}
            </View>
            <Text style={[styles.stepLabel, i <= currentIndex && styles.stepLabelActive]}>
              {label}
            </Text>
            {i < steps.length - 1 && <View style={[styles.stepLine, i < currentIndex && styles.stepLineActive]} />}
          </View>
        ))}
      </View>
    );
  }

  function renderTeamStep() {
    if (loadingTeams) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={styles.loadingText}>Loading your teams...</Text>
        </View>
      );
    }

    if (teams.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Teams Found</Text>
          <Text style={styles.emptySubtitle}>
            You need a team to register. Create one first, then come back to register.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('CreateTeam')}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.white} />
            <Text style={styles.primaryBtnText}>Create a Team</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const canContinue = multiTeamMode ? selectedTeams.length > 0 : !!selectedTeam;

    return (
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.stepTitle}>Select Your Team{multiTeamMode ? 's' : ''}</Text>
          {teams.length > 1 && (
            <TouchableOpacity
              style={{
                backgroundColor: multiTeamMode ? colors.cyan : '#e8eef7',
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
              activeOpacity={0.7}
              onPress={() => {
                setMultiTeamMode(!multiTeamMode);
                setSelectedTeams([]);
                setSelectedTeam(null);
              }}
            >
              <Text style={{
                fontSize: 12,
                color: multiTeamMode ? colors.white : colors.navy,
                ...fonts.semibold,
              }}>
                {multiTeamMode ? 'Multi ON' : 'Multi-Team'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.stepSubtitle}>
          {multiTeamMode
            ? 'Select all teams to register in one checkout'
            : `Choose which team to register for ${eventName}`}
        </Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {teams.map(team => {
            const isSelected = multiTeamMode
              ? selectedTeams.some(t => t.id === team.id)
              : selectedTeam?.id === team.id;
            return (
              <TouchableOpacity
                key={team.id}
                style={[styles.teamOption, isSelected && styles.teamOptionSelected]}
                activeOpacity={0.7}
                onPress={() => multiTeamMode ? toggleTeam(team) : selectTeam(team)}
              >
                <View style={styles.teamOptionLeft}>
                  {multiTeamMode ? (
                    <View style={[styles.checkboxOuter, isSelected && styles.checkboxChecked]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color={colors.white} />}
                    </View>
                  ) : (
                    <View style={styles.radioOuter}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                  )}
                </View>
                <View style={styles.teamOptionContent}>
                  <View style={styles.teamBadgeRow}>
                    <View style={styles.ageBadge}>
                      <Text style={styles.ageBadgeText}>{team.age_group}</Text>
                    </View>
                    {team.division_level ? (
                      <View style={[styles.ageBadge, { backgroundColor: colors.navy }]}>
                        <Text style={styles.ageBadgeText}>{team.division_level}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.teamOptionName}>{team.name}</Text>
                  {team.head_coach_name ? (
                    <Text style={styles.teamOptionDetail}>Coach {team.head_coach_name}</Text>
                  ) : null}
                  {(team.city || team.state) ? (
                    <Text style={styles.teamOptionDetail}>
                      {[team.city, team.state].filter(Boolean).join(', ')}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}

          {multiTeamMode && selectedTeams.length > 0 && (
            <View style={{ backgroundColor: '#f0f4ff', borderRadius: 8, padding: 12, marginTop: 4 }}>
              <Text style={{ fontSize: 13, color: colors.navy, ...fonts.medium }}>
                Registering {selectedTeams.length} team{selectedTeams.length > 1 ? 's' : ''}: {selectedTeams.map(t => t.name).join(', ')}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.primaryBtn, !canContinue && styles.primaryBtnDisabled]}
            activeOpacity={0.7}
            onPress={goToHotels}
            disabled={!canContinue}
          >
            <Text style={styles.primaryBtnText}>
              Continue{multiTeamMode && selectedTeams.length > 1 ? ` (${selectedTeams.length} teams)` : ''}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderHotelsStep() {
    if (loadingHotels) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={styles.loadingText}>Loading hotel options...</Text>
        </View>
      );
    }

    const activeTeamIsLocal = getActiveTeamIsLocal();
    const activeTeamNeedsHotel = getActiveTeamNeedsHotel();
    const activeHotels = getActiveTeamHotels();
    const selectedIds = activeHotels.filter(Boolean) as string[];
    const canContinueHotels = allTeamsHaveHotelSelection();
    const showMultiTeamTabs = multiTeamMode && selectedTeams.length > 1;
    const activeTeam = showMultiTeamTabs ? selectedTeams[activeHotelTeamIdx] : null;

    // No hotels configured for this event
    if (hotels.length === 0) {
      return (
        <View style={{ flex: 1 }}>
          <Text style={styles.stepTitle}>Hotel Preference</Text>
          <Text style={styles.stepSubtitle}>Hotels haven't been configured yet for this event</Text>

          {showMultiTeamTabs && (
            <View style={styles.teamTabBar}>
              {selectedTeams.map((team, idx) => {
                const done = teamLocalFlags[team.id] || teamNeedsHotelFlags[team.id];
                return (
                  <TouchableOpacity
                    key={team.id}
                    style={[styles.teamTab, idx === activeHotelTeamIdx && styles.teamTabActive]}
                    onPress={() => setActiveHotelTeamIdx(idx)}
                  >
                    {done && <Ionicons name="checkmark-circle" size={14} color={colors.cyan} style={{ marginRight: 4 }} />}
                    <Text style={[styles.teamTabText, idx === activeHotelTeamIdx && styles.teamTabTextActive]} numberOfLines={1}>
                      {team.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
            <TouchableOpacity
              style={[styles.hotelOption, activeTeamNeedsHotel && styles.hotelOptionSelected]}
              activeOpacity={0.7}
              onPress={() => { setActiveTeamNeedsHotel(true); setActiveTeamIsLocal(false); }}
            >
              <View style={styles.radioOuter}>
                {activeTeamNeedsHotel && <View style={styles.radioInner} />}
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.hotelOptionTitle}>We'll Need a Hotel</Text>
                <Text style={styles.hotelOptionSubtitle}>
                  We'll notify you when hotel options are available
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.hotelOption, activeTeamIsLocal && styles.hotelOptionSelected]}
              activeOpacity={0.7}
              onPress={() => { setActiveTeamIsLocal(true); setActiveTeamNeedsHotel(false); }}
            >
              <View style={styles.radioOuter}>
                {activeTeamIsLocal && <View style={styles.radioInner} />}
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.hotelOptionTitle}>We're a Local Team</Text>
                <Text style={styles.hotelOptionSubtitle}>
                  We don't need hotel accommodations
                </Text>
              </View>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('team')}>
              <Ionicons name="arrow-back" size={18} color={colors.navy} />
              <Text style={styles.secondaryBtnText}>Back</Text>
            </TouchableOpacity>
            {showMultiTeamTabs && activeHotelTeamIdx < selectedTeams.length - 1 ? (
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }, !(activeTeamNeedsHotel || activeTeamIsLocal) && styles.primaryBtnDisabled]}
                activeOpacity={0.7}
                onPress={() => setActiveHotelTeamIdx(activeHotelTeamIdx + 1)}
                disabled={!(activeTeamNeedsHotel || activeTeamIsLocal)}
              >
                <Text style={styles.primaryBtnText}>Next Team</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.white} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }, !canContinueHotels && styles.primaryBtnDisabled]}
                activeOpacity={0.7}
                onPress={goToPayment}
                disabled={!canContinueHotels}
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.white} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    // Hotels are available — pick top 3

    return (
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>Hotel Preference</Text>
        <Text style={styles.stepSubtitle}>
          {showMultiTeamTabs
            ? `Select hotels for each team (${activeHotelTeamIdx + 1} of ${selectedTeams.length})`
            : 'Select your top 3 choices in order of preference, or choose Local Team'}
        </Text>

        {showMultiTeamTabs && (
          <View style={styles.teamTabBar}>
            {selectedTeams.map((team, idx) => {
              const done = teamLocalFlags[team.id] || !!(teamHotelPicks[team.id] && teamHotelPicks[team.id][0]);
              return (
                <TouchableOpacity
                  key={team.id}
                  style={[styles.teamTab, idx === activeHotelTeamIdx && styles.teamTabActive]}
                  onPress={() => setActiveHotelTeamIdx(idx)}
                >
                  {done && <Ionicons name="checkmark-circle" size={14} color={colors.cyan} style={{ marginRight: 4 }} />}
                  <Text style={[styles.teamTabText, idx === activeHotelTeamIdx && styles.teamTabTextActive]} numberOfLines={1}>
                    {team.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Local team option */}
          <TouchableOpacity
            style={[styles.hotelOption, activeTeamIsLocal && styles.hotelOptionSelected]}
            activeOpacity={0.7}
            onPress={() => {
              setActiveTeamIsLocal(!activeTeamIsLocal);
            }}
          >
            <View style={styles.radioOuter}>
              {activeTeamIsLocal && <View style={styles.radioInner} />}
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.hotelOptionTitle}>We're a Local Team</Text>
              <Text style={styles.hotelOptionSubtitle}>We don't need hotel accommodations</Text>
            </View>
          </TouchableOpacity>

          {!activeTeamIsLocal && (
            <>
              <Text style={styles.hotelSectionLabel}>Available Hotels</Text>
              {hotels.map(hotel => {
                const choiceIndex = selectedIds.indexOf(hotel.id);
                const isChosen = choiceIndex >= 0;
                const choiceNumber = choiceIndex + 1;

                return (
                  <TouchableOpacity
                    key={hotel.id}
                    style={[styles.hotelOption, isChosen && styles.hotelOptionSelected]}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (isChosen) {
                        // Remove and shift up
                        const picks = [...activeHotels] as [string | null, string | null, string | null];
                        if (picks[0] === hotel.id) {
                          picks[0] = picks[1]; picks[1] = picks[2]; picks[2] = null;
                        } else if (picks[1] === hotel.id) {
                          picks[1] = picks[2]; picks[2] = null;
                        } else {
                          picks[2] = null;
                        }
                        setActiveTeamHotel(0, picks[0]);
                        setActiveTeamHotel(1, picks[1]);
                        setActiveTeamHotel(2, picks[2]);
                      } else {
                        // Add as next
                        if (!activeHotels[0]) setActiveTeamHotel(0, hotel.id);
                        else if (!activeHotels[1]) setActiveTeamHotel(1, hotel.id);
                        else if (!activeHotels[2]) setActiveTeamHotel(2, hotel.id);
                      }
                    }}
                  >
                    {isChosen ? (
                      <View style={styles.choiceNumberBadge}>
                        <Text style={styles.choiceNumberText}>{choiceNumber}</Text>
                      </View>
                    ) : (
                      <View style={styles.radioOuter} />
                    )}
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <Text style={styles.hotelOptionTitle}>{hotel.hotel_name}</Text>
                      {hotel.rate_description ? (
                        <Text style={styles.hotelOptionSubtitle}>{hotel.rate_description}</Text>
                      ) : null}
                      {(hotel.city || hotel.state) ? (
                        <Text style={styles.hotelOptionSubtitle}>
                          {[hotel.city, hotel.state].filter(Boolean).join(', ')}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('team')}>
            <Ionicons name="arrow-back" size={18} color={colors.navy} />
            <Text style={styles.secondaryBtnText}>Back</Text>
          </TouchableOpacity>
          {showMultiTeamTabs && activeHotelTeamIdx < selectedTeams.length - 1 ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 1 }, !(activeTeamIsLocal || activeHotels[0]) && styles.primaryBtnDisabled]}
              activeOpacity={0.7}
              onPress={() => setActiveHotelTeamIdx(activeHotelTeamIdx + 1)}
              disabled={!(activeTeamIsLocal || activeHotels[0])}
            >
              <Text style={styles.primaryBtnText}>Next Team</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 1 }, !canContinueHotels && styles.primaryBtnDisabled]}
              activeOpacity={0.7}
              onPress={goToPayment}
              disabled={!canContinueHotels}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.white} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  function renderPaymentStep() {
    const formatPrice = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const fullPrice = eventPriceCents > 0 ? formatPrice(eventPriceCents) : '';
    const depositStr = formatPrice(totalDepositCents);
    const perTeamLabel = numTeams > 1 ? ` ($350 x ${numTeams} teams)` : '';

    const paymentOptions: { value: 'pay_now' | 'pay_deposit' | 'pay_later'; title: string; subtitle: string; icon: string; priceLabel?: string }[] = [
      {
        value: 'pay_now',
        title: 'Pay in Full',
        subtitle: fullPrice
          ? `Pay ${fullPrice} now with Apple Pay or card`
          : 'Pay the full registration fee now with Apple Pay or card',
        icon: 'card-outline',
        priceLabel: fullPrice || undefined,
      },
      {
        value: 'pay_deposit',
        title: 'Pay Deposit',
        subtitle: `Pay ${depositStr} deposit now${perTeamLabel}, remaining balance due later`,
        icon: 'wallet-outline',
        priceLabel: depositStr,
      },
      {
        value: 'pay_later',
        title: 'Pay Later',
        subtitle: fullPrice
          ? `Register now, pay ${fullPrice} after approval`
          : 'Register now and receive an invoice after approval',
        icon: 'time-outline',
      },
    ];

    return (
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>Payment Option</Text>
        <Text style={styles.stepSubtitle}>Choose how you'd like to pay for registration</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {paymentOptions.map(opt => {
            const isSelected = paymentChoice === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.paymentOption, isSelected && styles.paymentOptionSelected]}
                activeOpacity={0.7}
                onPress={() => setPaymentChoice(opt.value)}
              >
                <View style={styles.paymentOptionLeft}>
                  <View style={[styles.paymentIconWrap, isSelected && styles.paymentIconWrapActive]}>
                    <Ionicons
                      name={opt.icon as any}
                      size={24}
                      color={isSelected ? colors.white : colors.navy}
                    />
                  </View>
                </View>
                <View style={styles.paymentOptionContent}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[styles.paymentOptionTitle, isSelected && styles.paymentOptionTitleActive]}>
                      {opt.title}
                    </Text>
                    {opt.priceLabel ? (
                      <Text style={[styles.paymentPriceLabel, isSelected && styles.paymentPriceLabelActive]}>
                        {opt.priceLabel}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.paymentOptionSubtitle}>{opt.subtitle}</Text>
                </View>
                <View style={styles.radioOuter}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            );
          })}

          {paymentChoice !== 'pay_later' && (
            <View style={styles.applePayNote}>
              <Ionicons name="logo-apple" size={20} color={colors.text} />
              <Text style={styles.applePayNoteText}>
                Apple Pay, credit card, and debit card accepted
              </Text>
            </View>
          )}

          {/* Discount Code */}
          <View style={styles.discountSection}>
            <Text style={styles.discountLabel}>Have a Discount Code?</Text>
            <TextInput
              style={styles.discountInput}
              placeholder="Enter code (optional)"
              placeholderTextColor={colors.textMuted}
              value={discountCode}
              onChangeText={setDiscountCode}
              autoCapitalize="characters"
            />
          </View>
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('hotels')}>
            <Ionicons name="arrow-back" size={18} color={colors.navy} />
            <Text style={styles.secondaryBtnText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, { flex: 1 }]}
            activeOpacity={0.7}
            onPress={goToConfirm}
          >
            <Text style={styles.primaryBtnText}>Review & Submit</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderConfirmStep() {
    const hotelName = (id: string | null) => {
      if (!id) return null;
      return hotels.find(h => h.id === id)?.hotel_name || id;
    };

    const fmtCents = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const paymentLabel = paymentChoice === 'pay_now'
      ? `Pay in Full${eventPriceCents > 0 ? ` — ${fmtCents(eventPriceCents)}` : ''}`
      : paymentChoice === 'pay_deposit'
      ? `Pay Deposit — ${fmtCents(totalDepositCents)}`
      : 'Pay Later';

    return (
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>Confirm Registration</Text>
        <Text style={styles.stepSubtitle}>Review your details and submit</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Event */}
          <View style={styles.confirmCard}>
            <Text style={styles.confirmLabel}>Event</Text>
            <Text style={styles.confirmValue}>{eventName}</Text>
          </View>

          {/* Team(s) */}
          <View style={styles.confirmCard}>
            <Text style={styles.confirmLabel}>Team{numTeams > 1 ? 's' : ''}</Text>
            {teamsToRegister.map(team => (
              <View key={team.id} style={{ marginBottom: numTeams > 1 ? spacing.sm : 0 }}>
                <Text style={styles.confirmValue}>{team.name}</Text>
                <View style={[styles.confirmBadgeRow, { marginBottom: 2 }]}>
                  <View style={styles.ageBadge}>
                    <Text style={styles.ageBadgeText}>{team.age_group}</Text>
                  </View>
                  {team.division_level ? (
                    <View style={[styles.ageBadge, { backgroundColor: colors.navy }]}>
                      <Text style={styles.ageBadgeText}>{team.division_level}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          {/* Contact */}
          <View style={styles.confirmCard}>
            <Text style={styles.confirmLabel}>Contact Email</Text>
            <Text style={styles.confirmValue}>{currentUser?.email}</Text>
          </View>

          {/* Hotels — per team in multi mode */}
          {teamsToRegister.map(team => {
            const tIsLocal = multiTeamMode ? teamLocalFlags[team.id] : isLocal;
            const tNeedsHotel = multiTeamMode ? teamNeedsHotelFlags[team.id] : needsHotel;
            const tPicks = multiTeamMode ? (teamHotelPicks[team.id] || [null, null, null]) : [hotelChoice1, hotelChoice2, hotelChoice3];
            const hasHotelInfo = hotels.length > 0 || tNeedsHotel || tIsLocal;
            if (!hasHotelInfo) return null;
            return (
              <View key={team.id} style={styles.confirmCard}>
                <Text style={styles.confirmLabel}>
                  Hotel{numTeams > 1 ? ` — ${team.name}` : ' Preference'}
                </Text>
                {tIsLocal ? (
                  <Text style={styles.confirmValue}>Local Team — No hotel needed</Text>
                ) : tNeedsHotel ? (
                  <Text style={styles.confirmValue}>Will need a hotel (to be notified)</Text>
                ) : (
                  <>
                    {tPicks[0] ? <Text style={styles.confirmValue}>1st Choice: {hotelName(tPicks[0])}</Text> : null}
                    {tPicks[1] ? <Text style={styles.confirmValue}>2nd Choice: {hotelName(tPicks[1])}</Text> : null}
                    {tPicks[2] ? <Text style={styles.confirmValue}>3rd Choice: {hotelName(tPicks[2])}</Text> : null}
                  </>
                )}
              </View>
            );
          })}

          {/* Payment */}
          <View style={styles.confirmCard}>
            <Text style={styles.confirmLabel}>Payment</Text>
            <View style={styles.paymentConfirmRow}>
              <Ionicons
                name={paymentChoice === 'pay_now' ? 'card-outline' : paymentChoice === 'pay_deposit' ? 'wallet-outline' : 'time-outline'}
                size={18}
                color={colors.navy}
              />
              <Text style={[styles.confirmValue, { marginLeft: spacing.sm }]}>{paymentLabel}</Text>
            </View>
            {paymentChoice !== 'pay_later' && (
              <Text style={styles.confirmNote}>
                You'll be prompted to pay with Apple Pay or card after submitting.
              </Text>
            )}
            {paymentChoice === 'pay_later' && (
              <Text style={styles.confirmNote}>
                You'll receive an invoice and payment instructions after your registration is approved.
              </Text>
            )}
          </View>

          {discountCode ? (
            <View style={styles.confirmCard}>
              <Text style={styles.confirmLabel}>Discount Code</Text>
              <Text style={styles.confirmValue}>{discountCode}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('payment')}>
            <Ionicons name="arrow-back" size={18} color={colors.navy} />
            <Text style={styles.secondaryBtnText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitBtn, { flex: 1 }]}
            activeOpacity={0.7}
            onPress={submitRegistration}
          >
            <Ionicons name="checkmark-circle" size={20} color={colors.white} />
            <Text style={styles.primaryBtnText}>
              {paymentChoice !== 'pay_later' ? 'Register & Pay' : 'Register Now'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderSubmitting() {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Submitting your registration...</Text>
      </View>
    );
  }

  function renderProcessingPayment() {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.cyan} />
        <Text style={styles.loadingText}>Setting up payment...</Text>
        <Text style={[styles.loadingText, { fontSize: 13, marginTop: spacing.sm }]}>
          The payment sheet will appear shortly
        </Text>
      </View>
    );
  }

  function renderDone() {
    const didPay = registrationResult?.paid;

    return (
      <View style={styles.doneContainer}>
        <View style={styles.doneIconWrap}>
          <Ionicons name="checkmark-circle" size={72} color={colors.cyan} />
        </View>
        <Text style={styles.doneTitle}>You're Registered!</Text>
        <Text style={styles.doneSubtitle}>
          {numTeams > 1
            ? `${numTeams} teams have been registered for ${eventName}`
            : `${teamsToRegister[0]?.name || 'Your team'} has been registered for ${eventName}`}
        </Text>

        <View style={styles.doneCard}>
          <Text style={styles.doneCardTitle}>What Happens Next</Text>
          <View style={styles.doneStep}>
            <View style={styles.doneStepDot} />
            <Text style={styles.doneStepText}>
              Our team will review your registration
            </Text>
          </View>
          <View style={styles.doneStep}>
            <View style={styles.doneStepDot} />
            <Text style={styles.doneStepText}>
              You'll receive a confirmation email at {currentUser?.email}
            </Text>
          </View>
          {didPay ? (
            <View style={styles.doneStep}>
              <View style={[styles.doneStepDot, { backgroundColor: '#22c55e' }]} />
              <Text style={[styles.doneStepText, { color: '#22c55e', fontWeight: '600' }]}>
                Payment received — ${((registrationResult.amountCents || 0) / 100).toFixed(2)}
              </Text>
            </View>
          ) : (
            <View style={styles.doneStep}>
              <View style={styles.doneStepDot} />
              <Text style={styles.doneStepText}>
                Payment instructions will be sent once approved
              </Text>
            </View>
          )}
        </View>

        {registrationResult?.discountCode ? (
          <View style={styles.discountCard}>
            <Ionicons name="gift-outline" size={22} color={colors.cyan} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.discountCardTitle}>Multi-Event Discount</Text>
              <Text style={styles.discountCardCode}>{registrationResult.discountCode}</Text>
              <Text style={styles.discountCardNote}>
                Use this code when registering for another event
              </Text>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={18} color={colors.white} />
          <Text style={styles.primaryBtnText}>Back to Event</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ------ MAIN RENDER ------

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title={step === 'done' ? 'Registration Complete' : `Register: ${eventName || 'Event'}`}
        showBack
        onBack={() => {
          if (step === 'done') {
            navigation.goBack();
          } else {
            Alert.alert('Leave Registration?', 'Your progress will be lost.', [
              { text: 'Stay', style: 'cancel' },
              { text: 'Leave', style: 'destructive', onPress: () => navigation.goBack() },
            ]);
          }
        }}
      />

      {!['done', 'submitting', 'processing_payment'].includes(step) && (
        <View style={styles.stepIndicatorWrap}>
          {renderStepIndicator()}
        </View>
      )}

      <View style={styles.content}>
        {step === 'team' && renderTeamStep()}
        {step === 'hotels' && renderHotelsStep()}
        {step === 'payment' && renderPaymentStep()}
        {step === 'confirm' && renderConfirmStep()}
        {step === 'submitting' && renderSubmitting()}
        {step === 'processing_payment' && renderProcessingPayment()}
        {step === 'done' && renderDone()}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.medium,
  },

  // Step indicator
  stepIndicatorWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: {
    backgroundColor: colors.navy,
  },
  stepDotText: {
    fontSize: 12,
    color: colors.textMuted,
    ...fonts.bold,
  },
  stepDotTextActive: {
    color: colors.white,
  },
  stepLabel: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.medium,
    marginLeft: spacing.xs,
    marginRight: spacing.xs,
  },
  stepLabelActive: {
    color: colors.navy,
    ...fonts.semibold,
  },
  stepLine: {
    width: 20,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: 2,
  },
  stepLineActive: {
    backgroundColor: colors.navy,
  },

  // Step content
  stepTitle: {
    fontSize: 22,
    color: colors.text,
    ...fonts.bold,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  stepSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },

  // Team options
  teamOption: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  teamOptionSelected: {
    borderColor: colors.navy,
    backgroundColor: '#f0f4ff',
  },
  teamOptionLeft: {
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  teamOptionContent: {
    flex: 1,
  },
  teamBadgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  teamOptionName: {
    fontSize: 17,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.xs,
  },
  teamOptionDetail: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
    marginBottom: 2,
  },

  // Radio
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.navy,
  },

  // Checkbox (multi-team mode)
  checkboxOuter: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },

  // Team tabs (multi-team hotel selection)
  teamTabBar: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  teamTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e8eef7',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  teamTabActive: {
    backgroundColor: '#f0f4ff',
    borderColor: colors.navy,
  },
  teamTabText: {
    fontSize: 12,
    color: colors.textSecondary,
    ...fonts.medium,
  },
  teamTabTextActive: {
    color: colors.navy,
    ...fonts.semibold,
  },

  // Age badge
  ageBadge: {
    backgroundColor: colors.cyan,
    borderRadius: radii.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  ageBadgeText: {
    color: colors.white,
    fontSize: 11,
    ...fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Hotel options
  hotelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  hotelOptionSelected: {
    borderColor: colors.navy,
    backgroundColor: '#f0f4ff',
  },
  hotelOptionTitle: {
    fontSize: 16,
    color: colors.text,
    ...fonts.semibold,
  },
  hotelOptionSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 2,
  },
  hotelSectionLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  choiceNumberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceNumberText: {
    color: colors.white,
    fontSize: 12,
    ...fonts.bold,
  },

  // Payment options
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  paymentOptionSelected: {
    borderColor: colors.navy,
    backgroundColor: '#f0f4ff',
  },
  paymentOptionLeft: {
    marginRight: spacing.md,
  },
  paymentIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e8eef7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentIconWrapActive: {
    backgroundColor: colors.navy,
  },
  paymentOptionContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  paymentOptionTitle: {
    fontSize: 16,
    color: colors.text,
    ...fonts.semibold,
    marginBottom: 2,
  },
  paymentOptionTitleActive: {
    color: colors.navy,
  },
  paymentOptionSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
    lineHeight: 18,
  },
  paymentPriceLabel: {
    fontSize: 18,
    color: colors.text,
    ...fonts.bold,
  },
  paymentPriceLabelActive: {
    color: colors.navy,
  },
  applePayNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#f0f4ff',
    borderRadius: radii.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  applePayNoteText: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.medium,
    flex: 1,
  },
  discountSection: {
    marginTop: spacing.lg,
  },
  discountLabel: {
    fontSize: 14,
    color: colors.text,
    ...fonts.semibold,
    marginBottom: spacing.sm,
  },

  // Confirm
  confirmCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  confirmLabel: {
    fontSize: 12,
    color: colors.textMuted,
    ...fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  confirmValue: {
    fontSize: 16,
    color: colors.text,
    ...fonts.medium,
  },
  confirmBadgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  confirmNote: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  paymentConfirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  discountInput: {
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    ...fonts.medium,
  },

  // Buttons
  bottomBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.sm,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 16,
    ...fonts.semibold,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cyan,
    borderRadius: radii.sm,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.navy,
    borderRadius: radii.sm,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  secondaryBtnText: {
    color: colors.navy,
    fontSize: 15,
    ...fonts.semibold,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 20,
    color: colors.text,
    ...fonts.bold,
    marginTop: spacing.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },

  // Done
  doneContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xxxl,
    paddingHorizontal: spacing.lg,
  },
  doneIconWrap: {
    marginBottom: spacing.md,
  },
  doneTitle: {
    fontSize: 26,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.sm,
  },
  doneSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  doneCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    width: '100%',
    marginBottom: spacing.lg,
  },
  doneCardTitle: {
    fontSize: 16,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.md,
  },
  doneStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  doneStepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.cyan,
    marginTop: 5,
  },
  doneStepText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    lineHeight: 20,
  },
  discountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fffe',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cyan,
    padding: spacing.lg,
    width: '100%',
    marginBottom: spacing.xl,
  },
  discountCardTitle: {
    fontSize: 14,
    color: colors.text,
    ...fonts.semibold,
  },
  discountCardCode: {
    fontSize: 18,
    color: colors.cyan,
    ...fonts.bold,
    marginTop: 2,
    letterSpacing: 1,
  },
  discountCardNote: {
    fontSize: 12,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: 2,
  },
});
