'use client';

import { useState, useEffect, useRef } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';

/* ── types ── */
interface EventData {
  id: string; name: string; slug: string; city: string; state: string;
  start_date: string; end_date: string; status: string; logo_url: string | null;
  price_cents: number | null; deposit_cents: number | null;
  multi_event_discount_pct: number | null; age_groups: string | null;
}
interface Team { id: string; name: string; age_group?: string; division_level?: string; head_coach_name?: string; }
interface EventHotel { id: string; hotel_name: string; city: string; state: string; rate_description: string | null; booking_url: string | null; }
interface UpsellEvent {
  id: string; slug: string; name: string; city: string; state: string;
  start_date: string; end_date: string; price_cents: number | null;
  deposit_cents: number | null; multi_event_discount_pct: number | null;
  logo_url: string | null;
}

/* ── helpers ── */
function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const mo = s.toLocaleString('en-US', { month: 'short' });
  if (s.getMonth() === e.getMonth()) return `${mo} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  const mo2 = e.toLocaleString('en-US', { month: 'short' });
  return `${mo} ${s.getDate()} – ${mo2} ${e.getDate()}, ${s.getFullYear()}`;
}
function formatPrice(cents: number | null) {
  if (!cents) return '$0';
  return `$${(cents / 100).toLocaleString()}`;
}
function cityGradient(city: string): string {
  const c = city.toLowerCase();
  if (c.includes('chicago')) return 'from-[#003e79] to-[#00264d]';
  if (c.includes('st. louis') || c.includes('st louis')) return 'from-[#1a3a5c] to-[#0d1f33]';
  if (c.includes('south bend')) return 'from-[#0c4a1e] to-[#082d12]';
  if (c.includes('ann arbor')) return 'from-[#00274c] to-[#001a33]';
  if (c.includes('madison')) return 'from-[#c5050c] to-[#7a0308]';
  if (c.includes('holland')) return 'from-[#4a2c0f] to-[#2d1a09]';
  return 'from-[#003e79] to-[#001f3f]';
}
function getAuthUser(): { token: string; user: any } | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = localStorage.getItem('uht_token');
    const userStr = localStorage.getItem('uht_user');
    if (token && userStr) return { token, user: JSON.parse(userStr) };
  } catch {}
  return null;
}

/* ── Step indicators ── */
function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              active ? 'bg-[#00ccff] text-white shadow-md' :
              done ? 'bg-emerald-100 text-emerald-700' :
              'bg-gray-100 text-gray-400'
            }`}>
              {done ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <span>{i + 1}</span>
              )}
              <span>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-8 h-0.5 ${done ? 'bg-emerald-300' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Main Registration Page ── */
export default function RegisterPage() {
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect to create-team if no event param
  const [redirectToCreateTeam, setRedirectToCreateTeam] = useState(false);

  // Auth
  const [auth, setAuth] = useState<{ token: string; user: any } | null>(null);

  // Teams (multi-team support)
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedTeams, setSelectedTeams] = useState<Team[]>([]);
  const [multiTeamMode, setMultiTeamMode] = useState(false);

  // Hotels
  const [eventHotels, setEventHotels] = useState<EventHotel[]>([]);
  const [hotelPicks, setHotelPicks] = useState<[string, string, string]>(['', '', '']);
  // Per-team hotel picks for multi-team mode: { teamId: [pick1, pick2, pick3] }
  const [teamHotelPicks, setTeamHotelPicks] = useState<Record<string, [string, string, string]>>({});
  const [teamLocalFlags, setTeamLocalFlags] = useState<Record<string, boolean>>({});
  const [activeHotelTeamIdx, setActiveHotelTeamIdx] = useState(0);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [isLocalTeam, setIsLocalTeam] = useState(false);
  const [needsHotel, setNeedsHotel] = useState(false);
  // Optional schedule requests / notes, keyed by team id (per team in multi-team mode)
  const [teamScheduleRequests, setTeamScheduleRequests] = useState<Record<string, string>>({});
  // Super Saver promo (short windows, a few times a year): when active, the
  // payment step offers adding a 2nd event with the credit auto-applied
  const [superSaver, setSuperSaver] = useState<{ discount_cents: number; ends_at: string; min_event_start: string | null } | null>(null);
  const [ssAddEventId, setSsAddEventId] = useState('');
  const [ssAppliedCents, setSsAppliedCents] = useState(0);

  // Steps: team → hotels → payment → card_form → submitting → confirmed (upsell is now post-registration on confirmed page)
  const [step, setStep] = useState<'team' | 'hotels' | 'payment' | 'card_form' | 'submitting' | 'confirmed'>('team');
  const [paymentChoice, setPaymentChoice] = useState<'pay_now' | 'pay_deposit' | 'pay_later' | null>(null);

  // Stripe embedded payment
  const [stripeInstance, setStripeInstance] = useState<any>(null);
  const [stripeElements, setStripeElements] = useState<any>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentAmountCents, setPaymentAmountCents] = useState(0);
  const paymentElementRef = useRef<HTMLDivElement>(null);

  // Upsell
  const [upsellEvents, setUpsellEvents] = useState<UpsellEvent[]>([]);
  const [loadingUpsell, setLoadingUpsell] = useState(false);

  // Division pricing (fetched separately for accurate per-age-group prices)
  const [eventDivisions, setEventDivisions] = useState<any[]>([]);

  // Result
  const [regResult, setRegResult] = useState<any>(null);
  const [regError, setRegError] = useState<string | null>(null);

  // Discount code
  const [discountCode, setDiscountCode] = useState('');
  const [discountValidation, setDiscountValidation] = useState<{ valid: boolean; discount_local_cents: number; discount_hotel_cents: number; team_name?: string; code_id?: string; type?: string; amount?: number; discount_type?: string; discount_amount?: number } | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [discountError, setDiscountError] = useState('');
  const [discountExpanded, setDiscountExpanded] = useState(false);

  // Inline login state (replaces redirect to /login)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginStatus, setLoginStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [loginError, setLoginError] = useState('');
  const [loginMode, setLoginMode] = useState<'magic' | 'pin'>('magic');
  const [loginPin, setLoginPin] = useState(['', '', '', '']);
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // Load event data (works with or without auth)
  const loadEventData = async () => {
    const params = new URLSearchParams(window.location.search);
    const eventSlug = params.get('event');
    const eventId = params.get('eventId');
    try {
      let ev: EventData | null = null;
      if (eventId) {
        const res = await fetch(`${API}/events?per_page=100`);
        const json = await res.json() as any;
        const found = (json.data || []).find((e: any) => e.id === eventId);
        if (found?.slug) {
          const detailRes = await fetch(`${API}/events/${found.slug}`);
          const detailJson = await detailRes.json() as any;
          if (detailJson.success) {
            ev = detailJson.data;
            if (Array.isArray(detailJson.data?.divisions)) {
              setEventDivisions(detailJson.data.divisions);
            }
          } else {
            ev = found;
          }
        } else {
          ev = found || null;
        }
      } else if (eventSlug) {
        const res = await fetch(`${API}/events/${eventSlug}`);
        const json = await res.json() as any;
        if (json.success) {
          ev = json.data;
          if (Array.isArray(json.data?.divisions)) {
            setEventDivisions(json.data.divisions);
          }
        }
      }
      if (!ev) {
        // No event param — redirect to create-team page
        const params = new URLSearchParams(window.location.search);
        if (!params.get('event') && !params.get('eventId')) {
          setRedirectToCreateTeam(true);
          setLoading(false);
          return;
        }
        setError('Event not found. Please go back and try again.');
      }
      setEvent(ev);
    } catch {
      setError('Failed to load event details.');
    }
    setLoading(false);
  };

  // Load teams for an authenticated user
  const loadTeams = async (token: string) => {
    setLoadingTeams(true);
    let allTeams: Team[] = [];
    try {
      const local = JSON.parse(localStorage.getItem('uht_teams') || '[]');
      if (Array.isArray(local) && local.length > 0) {
        allTeams = local.map((t: any) => ({
          id: t.id, name: t.name, age_group: t.age_group || t.ageGroup,
          division_level: t.division_level || t.divisionLevel,
          head_coach_name: t.head_coach_name || t.headCoachName,
        }));
      }
    } catch {}
    try {
      const res = await fetch(`${API}/teams/my-teams`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json() as any;
        const apiTeams = (json.data || []).map((t: any) => ({
          id: t.id, name: t.name, age_group: t.age_group,
          division_level: t.division_level, head_coach_name: t.head_coach_name,
        }));
        const existing = new Set(allTeams.map(t => t.id));
        for (const t of apiTeams) {
          if (!existing.has(t.id)) allTeams.push(t);
        }
      }
    } catch {}
    try {
      const localTeams = JSON.parse(localStorage.getItem('uht_teams') || '[]');
      const ids = localTeams.map((t: any) => t.id).filter(Boolean);
      if (ids.length > 0) {
        const res = await fetch(`${API}/teams/by-ids?ids=${ids.join(',')}`);
        if (res.ok) {
          const json = await res.json() as any;
          const byIdTeams = (json.data || []).map((t: any) => ({
            id: t.id, name: t.name, age_group: t.age_group,
            division_level: t.division_level, head_coach_name: t.head_coach_name,
          }));
          const existing = new Set(allTeams.map(t => t.id));
          for (const t of byIdTeams) {
            if (!existing.has(t.id)) allTeams.push(t);
          }
        }
      }
    } catch {}
    setTeams(allTeams);
    if (allTeams.length === 1) setSelectedTeam(allTeams[0]);
    setLoadingTeams(false);
  };

  // Inline login handlers
  const handleInlineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail) return;
    setLoginStatus('sending');
    setLoginError('');
    try {
      const resp = await fetch(`${API}/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim().toLowerCase(), redirect: window.location.href }),
      });
      const data = await resp.json() as any;
      if (data.success) {
        setLoginStatus('sent');
      } else if (data.error === 'no_account') {
        setLoginStatus('error');
        setLoginError("No account found with that email. Sign up first or check your email address.");
      } else {
        setLoginStatus('error');
        setLoginError(data.message || 'Something went wrong.');
      }
    } catch {
      setLoginStatus('error');
      setLoginError('Unable to connect. Please try again.');
    }
  };

  const handleInlinePinLogin = async (pinCode?: string) => {
    const code = pinCode || loginPin.join('');
    if (code.length !== 4 || !loginEmail) return;
    setPinLoading(true);
    setPinError('');
    try {
      const resp = await fetch(`${API}/auth/admin-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim().toLowerCase(), pin: code }),
      });
      const data = await resp.json() as any;
      if (data.success && data.token) {
        localStorage.setItem('uht_token', data.token);
        localStorage.setItem('uht_user', JSON.stringify(data.user));
        const newAuth = { token: data.token, user: data.user };
        setAuth(newAuth);
        loadTeams(data.token);
      } else {
        setPinError(data.message || 'Invalid PIN. Please try again.');
      }
    } catch {
      setPinError('Unable to connect. Please try again.');
    }
    setPinLoading(false);
  };

  // Parse URL params and load event (always), load teams (if logged in)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    const authData = getAuthUser();
    setAuth(authData);

    // Auto-populate discount code from URL
    if (codeParam) {
      setDiscountCode(codeParam);
      setDiscountExpanded(true);
    }

    // Always load event data (no auth needed)
    loadEventData();

    // Load teams only if logged in
    if (authData) {
      loadTeams(authData.token);
    } else {
      setLoadingTeams(false);
    }
  }, []);

  // Load Stripe.js
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).Stripe) {
      setStripeInstance((window as any).Stripe('pk_live_51JT7FXGJu05jTbyJAmm6UfNev2syS1j9F81arSoiT6Fx8JcQhmcjBUUNVxGX0Zf0amJj1H5Ylvdh7FScdopNkxfn00kBBHQuTz'));
      return;
    }
    const existing = document.querySelector('script[src="https://js.stripe.com/v3/"]');
    if (existing) return;
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.onload = () => {
      if ((window as any).Stripe) {
        setStripeInstance((window as any).Stripe('pk_live_51JT7FXGJu05jTbyJAmm6UfNev2syS1j9F81arSoiT6Fx8JcQhmcjBUUNVxGX0Zf0amJj1H5Ylvdh7FScdopNkxfn00kBBHQuTz'));
      }
    };
    document.head.appendChild(script);
  }, []);

  // Mount Stripe Payment Element when card_form step is active
  useEffect(() => {
    if (step !== 'card_form' || !stripeInstance || !clientSecret) return;
    const timer = setTimeout(() => {
      if (!paymentElementRef.current) return;
      // Clear previous mount
      paymentElementRef.current.innerHTML = '';
      const elements = stripeInstance.elements({
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#003e79',
            colorBackground: '#ffffff',
            colorText: '#1d1d1f',
            colorDanger: '#dc2626',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            borderRadius: '12px',
            spacingUnit: '4px',
          },
        },
      });
      const paymentElement = elements.create('payment', {
        layout: 'tabs',
      });
      paymentElement.mount(paymentElementRef.current);
      setStripeElements(elements);
    }, 150);
    return () => clearTimeout(timer);
  }, [step, stripeInstance, clientSecret]);

  // Handle Stripe payment submission
  const handlePaymentSubmit = async () => {
    if (!stripeInstance || !stripeElements) return;
    setProcessingPayment(true);
    setCardError(null);

    try {
      const { error, paymentIntent } = await stripeInstance.confirmPayment({
        elements: stripeElements,
        redirect: 'if_required',
      });

      if (error) {
        setCardError(error.message || 'Payment failed. Please try again.');
        setProcessingPayment(false);
        return;
      }

      if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Call our confirm-payment endpoint to update DB
        try {
          await fetch(`${API}/stripe/confirm-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
          });
        } catch {
          // Webhook will handle it if this call fails
        }

        setRegResult((prev: any) => ({
          ...prev,
          paymentConfirmed: true,
          amountPaid: paymentIntent.amount,
        }));
        loadUpsellEvents();
        setStep('confirmed');
      } else if (paymentIntent && paymentIntent.status === 'requires_action') {
        setCardError('Additional authentication required. Please complete verification.');
      } else {
        setCardError('Payment was not completed. Please try again.');
      }
    } catch (err: any) {
      setCardError(err.message || 'An unexpected error occurred.');
    }
    setProcessingPayment(false);
  };

  // Load hotels for the event
  const loadEventHotels = async () => {
    if (!event) return;
    setLoadingHotels(true);
    try {
      const res = await fetch(`${API}/events/event-hotels/${event.id}`);
      const json = await res.json() as any;
      setEventHotels(json.data || []);
    } catch { setEventHotels([]); }
    setLoadingHotels(false);
  };

  // Handle team continue → go to hotels step
  const handleTeamContinue = async () => {
    if (multiTeamMode ? selectedTeams.length === 0 : !selectedTeam) return;
    await loadEventHotels();
    setStep('hotels');
  };

  // Handle hotel selection — works for both single and multi-team modes
  const getActiveHotelPicks = (): [string, string, string] => {
    if (multiTeamMode && selectedTeams.length > 0) {
      const teamId = selectedTeams[activeHotelTeamIdx]?.id;
      return teamHotelPicks[teamId] || ['', '', ''];
    }
    return hotelPicks;
  };
  const getActiveLocalFlag = (): boolean => {
    if (multiTeamMode && selectedTeams.length > 0) {
      const teamId = selectedTeams[activeHotelTeamIdx]?.id;
      return teamLocalFlags[teamId] || false;
    }
    return isLocalTeam;
  };
  const autoAdvanceToNextTeam = () => {
    if (!multiTeamMode || selectedTeams.length <= 1) return;
    setTimeout(() => {
      const nextIdx = selectedTeams.findIndex((t, i) => i !== activeHotelTeamIdx && !teamLocalFlags[t.id] && !(teamHotelPicks[t.id] && teamHotelPicks[t.id][0]));
      if (nextIdx !== -1) setActiveHotelTeamIdx(nextIdx);
    }, 600);
  };

  const setActiveLocalFlag = (val: boolean) => {
    if (multiTeamMode && selectedTeams.length > 0) {
      const teamId = selectedTeams[activeHotelTeamIdx]?.id;
      setTeamLocalFlags(prev => ({ ...prev, [teamId]: val }));
      if (val) {
        setTeamHotelPicks(prev => ({ ...prev, [teamId]: ['', '', ''] }));
        autoAdvanceToNextTeam();
      }
    } else {
      setIsLocalTeam(val);
      if (val) setHotelPicks(['', '', '']);
    }
  };

  const selectHotel = (slot: 0 | 1 | 2, hotelName: string) => {
    if (multiTeamMode && selectedTeams.length > 0) {
      const teamId = selectedTeams[activeHotelTeamIdx]?.id;
      const hadPick = teamHotelPicks[teamId] && teamHotelPicks[teamId][0];
      setTeamHotelPicks(prev => {
        const current = prev[teamId] || ['', '', ''];
        const next = [...current] as [string, string, string];
        const existingIdx = next.indexOf(hotelName);
        if (existingIdx !== -1 && existingIdx !== slot) {
          next[existingIdx] = next[slot];
        }
        next[slot] = hotelName;
        return { ...prev, [teamId]: next };
      });
      // Auto-advance to next incomplete team after all 3 picks are made
      if (slot === 2) autoAdvanceToNextTeam();
      return;
    }
    setHotelPicks(prev => {
      const next = [...prev] as [string, string, string];
      const existingIdx = next.indexOf(hotelName);
      if (existingIdx !== -1 && existingIdx !== slot) {
        next[existingIdx] = next[slot];
      }
      next[slot] = hotelName;
      return next;
    });
  };

  const removeHotel = (slot: 0 | 1 | 2) => {
    if (multiTeamMode && selectedTeams.length > 0) {
      const teamId = selectedTeams[activeHotelTeamIdx]?.id;
      setTeamHotelPicks(prev => {
        const current = prev[teamId] || ['', '', ''];
        const next = [...current] as [string, string, string];
        next[slot] = '';
        return { ...prev, [teamId]: next };
      });
      return;
    }
    setHotelPicks(prev => {
      const next = [...prev] as [string, string, string];
      next[slot] = '';
      return next;
    });
  };

  // Load upsell events when entering upsell step
  const loadUpsellEvents = async () => {
    if (!event) return;
    setLoadingUpsell(true);
    try {
      const res = await fetch(`${API}/events/upcoming-for-upsell/${event.id}`);
      const json = await res.json() as any;
      setUpsellEvents(json.data || []);
    } catch { setUpsellEvents([]); }
    setLoadingUpsell(false);
  };

  // Super Saver: check for an active promo, and preload the event list the
  // upsell banner offers (reuses the confirmed-page upsell feed)
  useEffect(() => {
    fetch(`${API}/events/super-saver-active`)
      .then(r => r.json())
      .then((j: any) => { if (j.success && j.data?.active) setSuperSaver(j.data); })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (superSaver && event && upsellEvents.length === 0) loadUpsellEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [superSaver, event]);

  // Validate discount code (checks event discount codes AND meeting reward codes)
  const validateDiscountCode = async () => {
    if (!discountCode.trim()) return;
    setValidatingCode(true);
    setDiscountError('');
    try {
      const teamId = multiTeamMode ? selectedTeams[0]?.id : selectedTeam?.id;
      // Try event-specific discount codes first
      const res = await fetch(`${API}/events/validate-discount-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: discountCode.trim().toUpperCase(), teamId, eventId: event?.id }),
      });
      const json = await res.json() as any;
      if (json.success) {
        setDiscountValidation({ valid: true, ...json.data });
      } else {
        // Fallback: try meeting reward code validation
        try {
          const rewardRes = await fetch(`${API}/api/meeting-reward/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: discountCode.trim().toUpperCase() }),
          });
          const rewardJson = await rewardRes.json() as any;
          if (rewardJson.success && rewardJson.data?.valid) {
            setDiscountValidation({ valid: true, type: 'meeting_reward', amount: rewardJson.data.amount, discount_hotel_cents: rewardJson.data.amount * 100, discount_local_cents: rewardJson.data.amount * 100 });
          } else {
            setDiscountError(rewardJson.error || json.error || 'Invalid code');
            setDiscountValidation(null);
          }
        } catch {
          setDiscountError(json.error || 'Invalid code');
          setDiscountValidation(null);
        }
      }
    } catch { setDiscountError('Failed to validate code'); }
    setValidatingCode(false);
  };

  // Submit registration
  const submitRegistration = async () => {
    if (!event || !paymentChoice || !auth) return;
    const teamsToRegister = multiTeamMode && selectedTeams.length > 0 ? selectedTeams : (selectedTeam ? [selectedTeam] : []);
    if (teamsToRegister.length === 0) return;
    setStep('submitting');
    setRegError(null);

    try {
      const results: any[] = [];
      for (const team of teamsToRegister) {
        const body: any = {
          eventId: event.id,
          teamId: team.id,
          teamName: team.name,
          ageGroup: team.age_group || 'Unknown',
          division: team.division_level || undefined,
          email: auth.user?.email || 'unknown@email.com',
          managerFirstName: auth.user?.name?.split(' ')[0] || undefined,
          managerLastName: auth.user?.name?.split(' ').slice(1).join(' ') || undefined,
          headCoachName: team.head_coach_name || undefined,
          paymentChoice,
          hotelChoice1: (() => {
            if (multiTeamMode) {
              const tLocal = teamLocalFlags[team.id];
              if (tLocal) return 'Local Team';
              return (teamHotelPicks[team.id] || ['', '', ''])[0] || undefined;
            }
            return isLocalTeam ? 'Local Team' : hotelPicks[0] || undefined;
          })(),
          hotelChoice2: (() => {
            if (multiTeamMode) {
              if (teamLocalFlags[team.id]) return undefined;
              return (teamHotelPicks[team.id] || ['', '', ''])[1] || undefined;
            }
            return isLocalTeam ? undefined : hotelPicks[1] || undefined;
          })(),
          hotelChoice3: (() => {
            if (multiTeamMode) {
              if (teamLocalFlags[team.id]) return undefined;
              return (teamHotelPicks[team.id] || ['', '', ''])[2] || undefined;
            }
            return isLocalTeam ? undefined : hotelPicks[2] || undefined;
          })(),
          needsHotel: needsHotel,
          scheduleRequests: (teamScheduleRequests[team.id] || '').trim() || undefined,
          // Super Saver upsell: also register this team for the chosen 2nd event
          ...(ssAddEventId ? { additionalEventIds: [ssAddEventId] } : {}),
        };
        const res = await fetch(`${API}/events/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json() as any;
        if (json.success) {
          results.push(json.data);
        } else {
          setRegError(`Registration failed for ${team.name}: ${json.error || 'Unknown error'}`);
          setStep('payment');
          return;
        }
      }

      // If paying now or deposit, create PaymentIntent and show card form
      if (paymentChoice === 'pay_now' || paymentChoice === 'pay_deposit') {
        const allRegIds = results.flatMap((r: any) => r.allRegistrationIds || [r.primaryRegistrationId]);
        // One name per registration id (a team registering 2 events = 2 ids)
        const teamNames = results.flatMap((r: any, i: number) =>
          (r.allRegistrationIds || [r.primaryRegistrationId]).map(() => teamsToRegister[i]?.name || 'Team'));

        try {
          const stripeRes = await fetch(`${API}/stripe/create-payment-intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              registrationIds: allRegIds,
              paymentChoice,
              email: auth.user?.email || 'unknown@email.com',
              eventName: event.name,
              teamNames,
              ...(discountCode.trim() ? { discountCode: discountCode.trim().toUpperCase() } : {}),
            }),
          });
          const stripeJson = await stripeRes.json() as any;

          if (stripeJson.success && stripeJson.data?.fullyDiscounted) {
            // Discount covered the full amount — no payment needed
            setRegResult({
              ...(results.length === 1 ? results[0] : { registrations: results, teamCount: results.length }),
              discountCode: discountCode.trim().toUpperCase(),
              discountAmount: stripeJson.data.discountApplied ? stripeJson.data.discountApplied / 100 : 0,
              paymentNote: 'Your discount code covered the full registration!',
            });
            loadUpsellEvents();
            setStep('confirmed');
            return;
          } else if (stripeJson.success && stripeJson.data?.clientSecret) {
            setClientSecret(stripeJson.data.clientSecret);
            setPaymentIntentId(stripeJson.data.paymentIntentId);
            setPaymentAmountCents(stripeJson.data.totalCents || 0);
            setSsAppliedCents(stripeJson.data.superSaverCents || 0);
            setRegResult(results.length === 1 ? results[0] : { registrations: results, teamCount: results.length });
            setStep('card_form');
            return;
          } else {
            console.error('PaymentIntent error:', stripeJson.error);
            setRegResult({
              ...(results.length === 1 ? results[0] : { registrations: results, teamCount: results.length }),
              paymentNote: 'Registration submitted! We\'ll send a payment link via email.',
            });
            loadUpsellEvents();
            setStep('confirmed');
          }
        } catch (stripeErr) {
          console.error('Payment setup error:', stripeErr);
          setRegResult({
            ...(results.length === 1 ? results[0] : { registrations: results, teamCount: results.length }),
            paymentNote: 'Registration submitted! We\'ll send a payment link via email.',
          });
          loadUpsellEvents();
          setStep('confirmed');
        }
      } else {
        // pay_later — no payment needed now
        setRegResult(results.length === 1 ? results[0] : { registrations: results, teamCount: results.length });
        loadUpsellEvents();
        setStep('confirmed');
      }

      // Redeem discount code if validated
      if (discountValidation && results.length > 0) {
        try {
          const primaryRegId = results[0]?.primaryRegistrationId || results[0]?.allRegistrationIds?.[0];
          if (primaryRegId) {
            await fetch(`${API}/events/redeem-discount-code`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: discountCode.trim().toUpperCase(), registrationId: primaryRegId }),
            });
          }
        } catch (redeemErr) {
          console.error('Failed to redeem discount code:', redeemErr);
        }
      }

    } catch {
      setRegError('Network error. Please try again.');
      setStep('payment');
    }
  };

  // Advance from payment → submit registration + create payment intent
  const handlePaymentContinue = async () => {
    if (!paymentChoice) return;
    if (paymentChoice === 'pay_later') {
      setStep('card_form');
    } else {
      // pay_now and pay_deposit need to create the registration + payment intent first
      await submitRegistration();
    }
  };

  // Compute pricing — per-team based on division pricing
  const teamsToPrice = multiTeamMode && selectedTeams.length > 0 ? selectedTeams : (selectedTeam ? [selectedTeam] : []);
  const getTeamPrice = (team: any) => {
    if (!event) return 0;
    // Use fetched event_divisions (has per-age-group pricing)
    if (eventDivisions.length > 0 && team.age_group) {
      const teamAg = team.age_group.toLowerCase();
      // Try exact match first, then prefix match (team may have "Mite (8U)" while division has "Mite")
      const div = eventDivisions.find((d: any) => d.age_group === team.age_group)
        || eventDivisions.find((d: any) => teamAg.startsWith(d.age_group.toLowerCase()))
        || eventDivisions.find((d: any) => d.age_group.toLowerCase().startsWith(teamAg.split(' ')[0].toLowerCase()));
      if (div?.price_cents) return div.price_cents;
    }
    return event.price_cents || 0;
  };
  const totalPriceCents = teamsToPrice.reduce((sum, t) => sum + getTeamPrice(t), 0);
  // Calculate discount based on hotel selection
  const discountAmountCents = discountValidation ? (() => {
    // Percentage coupon: calculate from total price
    if (discountValidation.discount_type === 'percent' && discountValidation.discount_amount) {
      return Math.round(totalPriceCents * discountValidation.discount_amount / 100);
    }
    // Fixed amount coupons and other discount codes
    const anyLocal = multiTeamMode
      ? Object.values(teamLocalFlags).some(v => v)
      : isLocalTeam;
    return anyLocal ? discountValidation.discount_local_cents : discountValidation.discount_hotel_cents;
  })() : 0;
  const basePriceCents = Math.max(0, totalPriceCents - discountAmountCents);
  // Flat $350 deposit per team
  const DEPOSIT_PER_TEAM_CENTS = 35000;
  const depositCents = DEPOSIT_PER_TEAM_CENTS * Math.max(teamsToPrice.length, 1);
  // Step names
  const stepNames = ['Team', 'Hotels', 'Payment', 'Checkout'];
  const stepIndex = step === 'team' ? 0 : step === 'hotels' ? 1 : step === 'payment' ? 2 : step === 'card_form' || step === 'confirmed' || step === 'submitting' ? 3 : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-[#00ccff] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#6e6e73]">Loading event...</p>
        </div>
      </div>
    );
  }

  if (redirectToCreateTeam) {
    if (typeof window !== 'undefined') {
      window.location.href = '/create-team';
    }
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-[#00ccff] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#6e6e73]">Redirecting to team registration...</p>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-[#1d1d1f] mb-2">Oops!</h2>
          <p className="text-[#6e6e73] mb-6">{error || 'Event not found.'}</p>
          <a href="/events" className="inline-block px-6 py-3 rounded-xl font-semibold text-white bg-[#00ccff] hover:bg-[#00b8e6] transition-colors">
            Back to Events
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Event header */}
      <div className={`bg-gradient-to-br ${cityGradient(event.city)} relative overflow-hidden`}>
        {event.logo_url && (
          <img src={event.logo_url} alt="" className="absolute inset-0 w-full h-full object-contain opacity-[0.06] scale-150 pointer-events-none" />
        )}
        <div className="max-w-3xl mx-auto px-6 py-8 relative z-10">
          <a href="/events" className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-sm mb-4 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Events
          </a>
          <div className="flex items-center gap-5">
            {event.logo_url && (
              <img src={event.logo_url} alt="" className="w-20 h-20 object-contain drop-shadow-lg flex-shrink-0" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-white">{event.name.replace(/^\w[\w\s.'']*\s*-\s*/, '')}</h1>
              <p className="text-white/60 mt-1">{event.city}, {event.state} · {formatDateRange(event.start_date, event.end_date)}</p>
              {basePriceCents > 0 && (
                <p className="text-white/80 text-sm mt-1 font-medium">Entry Fee: {formatPrice(basePriceCents)}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Registration flow */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Inline login — shown when not authenticated */}
        {!auth && (
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-[#f0f7ff] flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <h2 className="text-xl font-bold text-[#1d1d1f]">Sign in to Register</h2>
              <p className="text-sm text-[#6e6e73] mt-1">Enter your email to continue with registration</p>
            </div>

            {loginStatus === 'sent' ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-[#1d1d1f] mb-1">Check Your Email</h3>
                <p className="text-sm text-[#6e6e73]">We sent a sign-in link to <strong>{loginEmail}</strong></p>
                <p className="text-xs text-[#86868b] mt-3">Click the link in your email to continue your registration.</p>
              </div>
            ) : (
              <>
                {/* Tab selector */}
                <div className="flex gap-1 bg-[#f5f5f7] rounded-lg p-0.5 mb-5">
                  <button
                    onClick={() => setLoginMode('magic')}
                    className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${loginMode === 'magic' ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#6e6e73]'}`}
                  >Email Link</button>
                  <button
                    onClick={() => setLoginMode('pin')}
                    className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${loginMode === 'pin' ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#6e6e73]'}`}
                  >PIN Code</button>
                </div>

                <form onSubmit={loginMode === 'magic' ? handleInlineLogin : (e) => { e.preventDefault(); handleInlinePinLogin(); }}>
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-[#1d1d1f] mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-4 py-3 rounded-xl border border-[#d2d2d7] text-[#1d1d1f] text-sm focus:outline-none focus:border-[#00ccff] focus:ring-2 focus:ring-[#00ccff]/20"
                      required
                    />
                  </div>

                  {loginMode === 'pin' && (
                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-[#1d1d1f] mb-1.5">4-Digit PIN</label>
                      <div className="flex gap-3 justify-center">
                        {loginPin.map((digit, i) => (
                          <input
                            key={i}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!/^\d*$/.test(val)) return;
                              const newPin = [...loginPin];
                              newPin[i] = val.slice(-1);
                              setLoginPin(newPin);
                              setPinError('');
                              if (val && i < 3) {
                                (e.target.nextElementSibling as HTMLInputElement)?.focus();
                              }
                              if (val && i === 3 && newPin.every(d => d)) {
                                handleInlinePinLogin(newPin.join(''));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Backspace' && !loginPin[i] && i > 0) {
                                (e.target as HTMLInputElement).previousElementSibling && ((e.target as HTMLInputElement).previousElementSibling as HTMLInputElement)?.focus();
                              }
                            }}
                            className="w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 border-[#d2d2d7] text-[#1d1d1f] focus:outline-none focus:border-[#00ccff] focus:ring-2 focus:ring-[#00ccff]/20"
                          />
                        ))}
                      </div>
                      {pinError && <p className="text-red-500 text-sm text-center mt-2">{pinError}</p>}
                    </div>
                  )}

                  {loginError && <p className="text-red-500 text-sm mb-3">{loginError}</p>}

                  <button
                    type="submit"
                    disabled={loginStatus === 'sending' || pinLoading}
                    className="w-full py-3.5 rounded-xl font-semibold text-white bg-[#003e79] hover:bg-[#00264d] disabled:opacity-50 transition-colors text-sm"
                  >
                    {loginStatus === 'sending' || pinLoading ? 'Signing in...' : loginMode === 'magic' ? 'Send Sign-In Link' : 'Sign In with PIN'}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <p className="text-xs text-[#86868b]">
                    Don't have an account? <a href={`/login?redirect=/register${typeof window !== 'undefined' ? window.location.search : ''}`} className="text-[#00ccff] font-medium hover:underline">Create one here</a>
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Registrant info */}
        {auth && step !== 'confirmed' && step !== 'submitting' && (
          <div className="flex items-center justify-between bg-white/80 backdrop-blur-sm rounded-xl px-4 py-2.5 mb-4 border border-[#e8e8ed]">
            <div className="flex items-center gap-2 text-sm text-[#6e6e73]">
              <svg className="w-4 h-4 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              <span>Registering as <span className="font-semibold text-[#1d1d1f]">{auth.user?.name || auth.user?.email}</span></span>
              {(() => { const role = typeof window !== 'undefined' ? localStorage.getItem('uht_role') : null; return role ? <span className="px-2 py-0.5 rounded-full bg-[#f0f7ff] text-[#003e79] text-xs font-semibold capitalize">{role}</span> : null; })()}
            </div>
            <a href="/login" className="text-xs text-[#00ccff] hover:text-[#0099bf] font-medium">Switch Account</a>
          </div>
        )}

        {auth && step !== 'confirmed' && step !== 'submitting' && (
          <StepIndicator steps={stepNames} current={stepIndex} />
        )}

        {/* ═══════════════════════════════════ STEP 1: SELECT TEAM ═══════════════════════════════════ */}
        {auth && step === 'team' && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-[#1d1d1f]">Select Your Team{multiTeamMode ? 's' : ''}</h2>
              {teams.length > 1 && (
                <button onClick={() => { setMultiTeamMode(!multiTeamMode); setSelectedTeams([]); setSelectedTeam(null); }}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border-2 transition ${
                    multiTeamMode
                      ? 'border-[#00ccff] bg-[#00ccff]/10 text-[#0077cc]'
                      : 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100 animate-pulse'
                  }`}>
                  {multiTeamMode ? 'Multi-Team Mode ON — Switch to Single' : '⚡ Register Multiple Teams'}
                </button>
              )}
            </div>
            <p className="text-sm text-[#6e6e73] mb-6">
              {multiTeamMode ? 'Select all teams to register for this tournament in one checkout.' : 'Choose which team to register for this tournament.'}
            </p>

            {loadingTeams ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-[#00ccff] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-[#6e6e73]">Loading your teams...</p>
              </div>
            ) : teams.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-[#f5f5f7] flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🏒</span>
                </div>
                <h3 className="font-semibold text-[#1d1d1f] text-lg mb-2">No Teams Yet</h3>
                <p className="text-sm text-[#6e6e73] mb-6">Create a team first, then come back to register.</p>
                <a
                  href={`/create-team?redirect=/register?event=${event.slug}`}
                  className="inline-block px-8 py-3.5 rounded-xl font-semibold text-white bg-[#00ccff] hover:bg-[#00b8e6] transition-all shadow-sm"
                >
                  Create a Team
                </a>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-6">
                  {teams.map(team => {
                    const isSelected = multiTeamMode
                      ? selectedTeams.some(t => t.id === team.id)
                      : selectedTeam?.id === team.id;
                    return (
                      <button
                        key={team.id}
                        onClick={() => {
                          if (multiTeamMode) {
                            setSelectedTeams(prev =>
                              prev.some(t => t.id === team.id)
                                ? prev.filter(t => t.id !== team.id)
                                : [...prev, team]
                            );
                          } else {
                            setSelectedTeam(team);
                          }
                        }}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all group ${
                          isSelected
                            ? 'border-[#00ccff] bg-[#00ccff]/5 shadow-sm'
                            : 'border-[#e8e8ed] hover:border-[#00ccff]/40 hover:bg-[#f5f5f7]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-[#1d1d1f]">{team.name}</p>
                            <p className="text-sm text-[#6e6e73] mt-0.5">
                              {[team.age_group, team.division_level].filter(Boolean).join(' · ')}
                              {team.head_coach_name && ` · Coach ${team.head_coach_name}`}
                            </p>
                          </div>
                          <div className={`w-5 h-5 ${multiTeamMode ? 'rounded-md' : 'rounded-full'} border-2 flex items-center justify-center transition-all ${
                            isSelected ? 'border-[#00ccff] bg-[#00ccff]' : 'border-[#d1d1d6]'
                          }`}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {multiTeamMode && selectedTeams.length > 0 && (
                  <div className="bg-[#f0f7ff] border border-[#003e79]/20 rounded-xl p-3 mb-4 text-sm text-[#003e79]">
                    Registering {selectedTeams.length} team{selectedTeams.length > 1 ? 's' : ''} — {selectedTeams.map(t => t.name).join(', ')}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <a href={`/create-team?redirect=/register?event=${event.slug}`} className="text-sm font-medium text-[#00ccff] hover:text-[#0099bf]">
                    + Create New Team
                  </a>
                  <button
                    onClick={handleTeamContinue}
                    disabled={multiTeamMode ? selectedTeams.length === 0 : !selectedTeam}
                    className="px-8 py-3.5 rounded-xl font-semibold text-white bg-[#00ccff] hover:bg-[#00b8e6] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    Continue{multiTeamMode && selectedTeams.length > 1 ? ` (${selectedTeams.length} teams)` : ''}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════ STEP 2: HOTEL PREFERENCES ═══════════════════════════════════ */}
        {step === 'hotels' && (() => {
          const currentPicks = getActiveHotelPicks();
          const currentLocal = getActiveLocalFlag();
          const allTeamsHaveHotels = multiTeamMode && selectedTeams.length > 0
            ? selectedTeams.every(t => teamLocalFlags[t.id] || (teamHotelPicks[t.id] && teamHotelPicks[t.id][0]))
            : isLocalTeam || hotelPicks[0] || eventHotels.length === 0;

          return (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-xl font-bold text-[#1d1d1f] mb-1">Hotel Preferences</h2>
            <p className="text-sm text-[#6e6e73] mb-4">
              {multiTeamMode && selectedTeams.length > 1
                ? 'Select hotel preferences for each team. Use the tabs below to switch between teams.'
                : 'Select your top 3 hotel choices in priority order.'}
            </p>

            {/* Multi-team selector with progress */}
            {multiTeamMode && selectedTeams.length > 1 && (() => {
              const completedCount = selectedTeams.filter(t => teamLocalFlags[t.id] || (teamHotelPicks[t.id] && teamHotelPicks[t.id][0])).length;
              const currentTeamDone = teamLocalFlags[selectedTeams[activeHotelTeamIdx]?.id] || (teamHotelPicks[selectedTeams[activeHotelTeamIdx]?.id] && teamHotelPicks[selectedTeams[activeHotelTeamIdx]?.id][0]);
              const incompleteTeams = selectedTeams.filter(t => !teamLocalFlags[t.id] && !(teamHotelPicks[t.id] && teamHotelPicks[t.id][0]));
              return (
              <>
                {/* Progress bar */}
                <div className="mb-4 p-3 bg-[#f0f9ff] border border-[#bae6fd] rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#003e79]">Team {activeHotelTeamIdx + 1} of {selectedTeams.length}</span>
                    <span className="text-xs font-medium text-[#6e6e73]">{completedCount}/{selectedTeams.length} complete</span>
                  </div>
                  <div className="flex gap-1.5">
                    {selectedTeams.map((team, idx) => {
                      const done = teamLocalFlags[team.id] || (teamHotelPicks[team.id] && teamHotelPicks[team.id][0]);
                      return (
                        <button key={team.id} onClick={() => setActiveHotelTeamIdx(idx)}
                          className={`flex-1 h-2 rounded-full transition-all ${
                            done ? 'bg-emerald-400' : idx === activeHotelTeamIdx ? 'bg-[#003e79]' : 'bg-[#d1d1d6]'
                          }`}
                          title={team.name} />
                      );
                    })}
                  </div>
                </div>

                {/* Team tabs */}
                <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                  {selectedTeams.map((team, idx) => {
                    const hasSelection = teamLocalFlags[team.id] || (teamHotelPicks[team.id] && teamHotelPicks[team.id][0]);
                    return (
                      <button
                        key={team.id}
                        onClick={() => setActiveHotelTeamIdx(idx)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2 border-2 ${
                          activeHotelTeamIdx === idx
                            ? 'border-[#003e79] bg-[#003e79] text-white shadow-md'
                            : hasSelection
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                        }`}
                      >
                        {hasSelection ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px] font-bold">{idx + 1}</span>
                        )}
                        {team.name}
                      </button>
                    );
                  })}
                </div>

                {/* Reminder if current team is done but others aren't */}
                {currentTeamDone && incompleteTeams.length > 0 && (
                  <button
                    onClick={() => {
                      const nextIdx = selectedTeams.findIndex(t => !teamLocalFlags[t.id] && !(teamHotelPicks[t.id] && teamHotelPicks[t.id][0]));
                      if (nextIdx !== -1) setActiveHotelTeamIdx(nextIdx);
                    }}
                    className="w-full mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left hover:bg-amber-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                      <span className="text-sm font-medium text-amber-800">
                        {incompleteTeams.length === 1 ? `"${incompleteTeams[0].name}" still needs hotel selection` : `${incompleteTeams.length} teams still need hotel selections`}
                        <span className="text-amber-600 ml-1">— tap to go next →</span>
                      </span>
                    </div>
                  </button>
                )}
              </>
              );
            })()}

            {loadingHotels ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-[#00ccff] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-[#6e6e73]">Loading hotels...</p>
              </div>
            ) : eventHotels.length === 0 ? (
              <div className="py-4 space-y-4">
                <div className="text-center p-6 bg-gradient-to-br from-[#f0f7ff] to-[#f5f5f7] rounded-2xl border border-[#bae6fd]">
                  <div className="w-14 h-14 bg-[#003e79]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-[#003e79]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" /></svg>
                  </div>
                  <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">Hotel Booking Coming Soon</h3>
                  <p className="text-sm text-[#6e6e73] max-w-sm mx-auto">We're finalizing hotel partnerships for this tournament. Let us know if you'll need a hotel and we'll notify you as soon as booking opens.</p>
                </div>

                {/* Need Hotel toggle */}
                <button
                  onClick={() => { setNeedsHotel(true); setIsLocalTeam(false); }}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    needsHotel ? 'border-[#00ccff] bg-[#00ccff]/5 shadow-sm' : 'border-[#e8e8ed] hover:border-[#00ccff]/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-[#1d1d1f]">We'll Need a Hotel</p>
                      <p className="text-sm text-[#6e6e73] mt-0.5">We'll email you when hotel booking opens for this event.</p>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      needsHotel ? 'border-[#00ccff] bg-[#00ccff]' : 'border-[#d1d1d6]'
                    }`}>
                      {needsHotel && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </div>
                  </div>
                </button>

                {/* Local team toggle */}
                <button
                  onClick={() => { setIsLocalTeam(true); setNeedsHotel(false); }}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    isLocalTeam && !needsHotel ? 'border-[#003e79] bg-[#003e79]/5 shadow-sm' : 'border-[#e8e8ed] hover:border-[#003e79]/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-[#1d1d1f]">We're Local</p>
                      <p className="text-sm text-[#6e6e73] mt-0.5">We don't need a hotel — we live nearby.</p>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      isLocalTeam && !needsHotel ? 'border-[#003e79] bg-[#003e79]' : 'border-[#d1d1d6]'
                    }`}>
                      {isLocalTeam && !needsHotel && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            ) : (
              <>
                {/* Local team toggle */}
                <button
                  onClick={() => setActiveLocalFlag(!currentLocal)}
                  className={`w-full text-left p-4 rounded-xl border-2 mb-5 transition-all ${
                    currentLocal ? 'border-[#003e79] bg-[#003e79]/5' : 'border-[#e8e8ed] hover:border-[#003e79]/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-[#1d1d1f]">We're a Local Team</p>
                      <p className="text-sm text-[#6e6e73] mt-0.5">We don't need a hotel — we live nearby.</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      currentLocal ? 'border-[#003e79] bg-[#003e79]' : 'border-[#d1d1d6]'
                    }`}>
                      {currentLocal && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </div>
                  </div>
                </button>

                {!currentLocal && (
                  <>
                    {/* Selected picks display */}
                    <div className="space-y-3 mb-6">
                      {[0, 1, 2].map(slot => {
                        const pick = currentPicks[slot];
                        const hotel = eventHotels.find(h => h.hotel_name === pick);
                        const label = slot === 0 ? '1st Choice' : slot === 1 ? '2nd Choice' : '3rd Choice';
                        const colors = slot === 0 ? 'border-[#00ccff] bg-[#00ccff]/5' : slot === 1 ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-gray-50';

                        return (
                          <div key={slot} className={`p-4 rounded-xl border-2 ${pick ? colors : 'border-dashed border-[#d1d1d6] bg-[#fafafa]'}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                  pick ? 'bg-[#003e79] text-white' : 'bg-[#e8e8ed] text-[#86868b]'
                                }`}>
                                  {slot + 1}
                                </span>
                                <div>
                                  {hotel ? (
                                    <>
                                      <p className="font-semibold text-[#1d1d1f] text-sm">{hotel.hotel_name}</p>
                                      <p className="text-xs text-[#6e6e73]">{hotel.city}, {hotel.state}{hotel.rate_description ? ` · ${hotel.rate_description}` : ''}</p>
                                    </>
                                  ) : (
                                    <p className="text-sm text-[#86868b]">{label} — tap a hotel below</p>
                                  )}
                                </div>
                              </div>
                              {pick && (
                                <button
                                  onClick={() => removeHotel(slot as 0 | 1 | 2)}
                                  className="w-7 h-7 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Hotel list to pick from */}
                    <p className="text-xs font-medium text-[#86868b] uppercase tracking-wider mb-3">Available Hotels</p>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {eventHotels.map(hotel => {
                        const pickedSlot = currentPicks.indexOf(hotel.hotel_name);
                        const isPicked = pickedSlot !== -1;
                        const nextEmpty = currentPicks.findIndex(p => !p);

                        return (
                          <button
                            key={hotel.id}
                            onClick={() => {
                              if (isPicked) {
                                removeHotel(pickedSlot as 0 | 1 | 2);
                              } else if (nextEmpty !== -1) {
                                selectHotel(nextEmpty as 0 | 1 | 2, hotel.hotel_name);
                              }
                            }}
                            disabled={!isPicked && nextEmpty === -1}
                            className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                              isPicked
                                ? 'border-[#003e79] bg-[#003e79]/5'
                                : nextEmpty === -1
                                  ? 'border-[#e8e8ed] bg-[#f5f5f7] opacity-50 cursor-not-allowed'
                                  : 'border-[#e8e8ed] hover:border-[#003e79]/40 hover:bg-[#f5f5f7]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-[#1d1d1f] text-sm">{hotel.hotel_name}</p>
                                <p className="text-xs text-[#6e6e73] mt-0.5">
                                  {hotel.city}, {hotel.state}
                                  {hotel.rate_description ? ` · ${hotel.rate_description}` : ''}
                                </p>
                              </div>
                              {isPicked ? (
                                <span className="w-6 h-6 rounded-full bg-[#003e79] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                                  {pickedSlot + 1}
                                </span>
                              ) : nextEmpty !== -1 ? (
                                <span className="text-xs text-[#00ccff] font-medium flex-shrink-0">+ Add</span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            <div className="flex items-center justify-between pt-6">
              <button onClick={() => setStep('team')} className="text-sm font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors">
                ← Back
              </button>
              <div className="flex items-center gap-3">
                {!allTeamsHaveHotels && multiTeamMode && selectedTeams.length > 1 && (
                  <span className="text-xs text-amber-600 font-medium">Select hotels for all teams</span>
                )}
                <button
                  onClick={() => setStep('payment')}
                  disabled={!allTeamsHaveHotels}
                  className="px-8 py-3.5 rounded-xl font-semibold text-white bg-[#00ccff] hover:bg-[#00b8e6] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* ═══════════════════════════════════ STEP 3: PAYMENT CHOICE ═══════════════════════════════════ */}
        {step === 'payment' && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-xl font-bold text-[#1d1d1f] mb-1">Choose Payment Option</h2>
            <p className="text-sm text-[#6e6e73] mb-2">
              {multiTeamMode && selectedTeams.length > 1
                ? <>Registering <span className="font-medium text-[#1d1d1f]">{selectedTeams.length} teams</span> for this tournament.</>
                : <>Registering <span className="font-medium text-[#1d1d1f]">{selectedTeam?.name || selectedTeams[0]?.name}</span> for this tournament.</>
              }
            </p>

            {/* Multi-team price breakdown */}
            {multiTeamMode && selectedTeams.length > 1 && (
              <div className="bg-[#f5f5f7] rounded-xl p-4 mb-6 space-y-2">
                <p className="text-xs font-medium text-[#86868b] uppercase tracking-wider">Price Breakdown</p>
                {selectedTeams.map(team => (
                  <div key={team.id} className="flex justify-between text-sm">
                    <span className="text-[#1d1d1f]">{team.name} <span className="text-[#86868b]">({team.age_group})</span></span>
                    <span className="font-medium text-[#1d1d1f]">{formatPrice(getTeamPrice(team))}</span>
                  </div>
                ))}
                <div className="border-t border-[#e8e8ed] pt-2 flex justify-between text-sm font-semibold">
                  <span className="text-[#1d1d1f]">Total</span>
                  <span className="text-[#1d1d1f]">{formatPrice(totalPriceCents)}</span>
                </div>
              </div>
            )}

            {/* Super Saver upsell — only while a promo window is live */}
            {superSaver && event && (() => {
              const discount = Math.round((superSaver.discount_cents || 40000) / 100);
              const eligible = upsellEvents.filter(e =>
                e.id !== event.id && (!superSaver.min_event_start || e.start_date >= superSaver.min_event_start));
              if (!eligible.length) return null;
              const endsStr = new Date(superSaver.ends_at.replace(' ', 'T')).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
              const chosen = eligible.find(e => e.id === ssAddEventId);
              return (
                <div className="mb-6 rounded-2xl border-2 border-[#00ccff] bg-gradient-to-br from-[#f0fbff] to-white p-5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔥</span>
                    <p className="font-bold text-[#003e79]">Super Saver: ${discount} off a 2nd tournament</p>
                  </div>
                  <p className="text-sm text-[#6e6e73] mt-1 mb-3">
                    Add a second event now and <span className="font-semibold text-[#1d1d1f]">${discount} comes off it automatically</span> when
                    you pay in full. Offer ends <span className="font-semibold text-[#e34948]">{endsStr}</span>.
                    <span className="text-xs text-[#86868b]"> At least one of your events must include a partner-hotel stay.</span>
                  </p>
                  <select value={ssAddEventId} onChange={e => setSsAddEventId(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-[#e8e8ed] rounded-xl text-sm text-[#1d1d1f] focus:border-[#00ccff] outline-none bg-white">
                    <option value="">No thanks — just this event</option>
                    {eligible.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.name} — {e.city}, {e.state} · {formatDateRange(e.start_date, e.end_date)}
                      </option>
                    ))}
                  </select>
                  {chosen && (
                    <p className="text-xs text-emerald-700 font-medium mt-2">
                      ✓ {chosen.name} will be added to your registration{multiTeamMode && selectedTeams.length > 1 ? ' for each team' : ''} —
                      the ${discount} Super Saver Discount applies at payment.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Schedule requests / notes — optional, one per team */}
            {(() => {
              const notesTeams = multiTeamMode && selectedTeams.length > 0 ? selectedTeams : (selectedTeam ? [selectedTeam] : []);
              if (notesTeams.length === 0) return null;
              return (
                <div className="mb-6">
                  <p className="text-sm font-semibold text-[#1d1d1f]">Schedule Requests <span className="font-normal text-[#86868b]">(optional)</span></p>
                  <p className="text-xs text-[#6e6e73] mt-0.5 mb-2">Anything we should know when building the game schedule — arrival times, coaches with multiple teams, conflicts, etc.</p>
                  <div className="space-y-2">
                    {notesTeams.map(t => (
                      <div key={t.id}>
                        {notesTeams.length > 1 && <p className="text-xs font-medium text-[#6e6e73] mb-1">{t.name}</p>}
                        <textarea
                          value={teamScheduleRequests[t.id] || ''}
                          onChange={e => setTeamScheduleRequests(prev => ({ ...prev, [t.id]: e.target.value }))}
                          maxLength={2000}
                          rows={2}
                          placeholder="Type any schedule requests or notes for this team..."
                          className="w-full p-3 border-2 border-[#e8e8ed] rounded-xl text-sm text-[#1d1d1f] focus:border-[#00ccff] focus:outline-none resize-y"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {regError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{regError}</span>
              </div>
            )}

            <div className="space-y-3 mb-6">
              {/* Pay Now */}
              <button
                onClick={() => setPaymentChoice('pay_now')}
                className={`w-full text-left p-5 rounded-xl border-2 transition-all ${
                  paymentChoice === 'pay_now' ? 'border-[#00ccff] bg-[#00ccff]/5' : 'border-[#e8e8ed] hover:border-[#00ccff]/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#1d1d1f] text-lg">Pay in Full</p>
                    <p className="text-sm text-[#6e6e73] mt-1">Pay the full entry fee now and secure your spot.</p>
                  </div>
                  <span className="text-xl font-bold text-[#1d1d1f]">{formatPrice(basePriceCents)}</span>
                </div>
              </button>

              {/* Pay Deposit */}
              {depositCents > 0 && (
                <button
                  onClick={() => setPaymentChoice('pay_deposit')}
                  className={`w-full text-left p-5 rounded-xl border-2 transition-all ${
                    paymentChoice === 'pay_deposit' ? 'border-[#00ccff] bg-[#00ccff]/5' : 'border-[#e8e8ed] hover:border-[#00ccff]/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-[#1d1d1f] text-lg">Pay a Deposit</p>
                      <p className="text-sm text-[#6e6e73] mt-1">
                        Reserve your spot with a {formatPrice(depositCents)} deposit. Remaining {formatPrice(basePriceCents - depositCents)} due before the event.
                      </p>
                    </div>
                    <span className="text-xl font-bold text-[#1d1d1f]">{formatPrice(depositCents)}</span>
                  </div>
                </button>
              )}

              {/* Pay Later */}
              <button
                onClick={() => setPaymentChoice('pay_later')}
                className={`w-full text-left p-5 rounded-xl border-2 transition-all ${
                  paymentChoice === 'pay_later' ? 'border-[#00ccff] bg-[#00ccff]/5' : 'border-[#e8e8ed] hover:border-[#00ccff]/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#1d1d1f] text-lg">Pay Later</p>
                    <p className="text-sm text-[#6e6e73] mt-1">Register now and pay before the event. Full payment of {formatPrice(basePriceCents)} due before the event.</p>
                  </div>
                  <span className="text-xl font-bold text-emerald-600">$0 now</span>
                </div>
              </button>
            </div>

            {/* Discount Code */}
            <div className="border border-[#e8e8ed] rounded-xl overflow-hidden mb-6">
              <button
                onClick={() => setDiscountExpanded(!discountExpanded)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                  Have a discount code?
                </span>
                <svg className={`w-4 h-4 transition-transform ${discountExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {discountExpanded && (
                <div className="px-5 pb-4 space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                      placeholder="UHT-XXXXXX"
                      maxLength={10}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-[#e8e8ed] text-sm font-mono tracking-wider uppercase focus:outline-none focus:border-[#00ccff] focus:ring-1 focus:ring-[#00ccff]"
                      onKeyDown={(e) => { if (e.key === 'Enter') validateDiscountCode(); }}
                    />
                    <button
                      onClick={validateDiscountCode}
                      disabled={validatingCode || !discountCode.trim()}
                      className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#003e79] hover:bg-[#002d5a] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {validatingCode ? '...' : 'Apply'}
                    </button>
                  </div>
                  {discountError && (
                    <p className="text-sm text-red-600 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {discountError}
                    </p>
                  )}
                  {discountValidation && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <p className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        {discountValidation.discount_type === 'percent'
                          ? `${discountValidation.discount_amount}% discount applied!`
                          : (isLocalTeam || Object.values(teamLocalFlags).some(v => v)
                            ? `$${(discountValidation.discount_local_cents / 100).toFixed(0)} discount applied!`
                            : `$${(discountValidation.discount_hotel_cents / 100).toFixed(0)} discount applied!`)
                        }
                      </p>
                      {discountValidation.team_name && (
                        <p className="text-xs text-emerald-600 mt-1">Code for {discountValidation.team_name}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep('hotels')} className="text-sm font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors">
                ← Back
              </button>
              <button
                onClick={handlePaymentContinue}
                disabled={!paymentChoice}
                className="px-8 py-3.5 rounded-xl font-semibold text-white bg-[#00ccff] hover:bg-[#00b8e6] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════ CHECKOUT / CARD FORM ═══════════════════════════════════ */}
        {step === 'card_form' && paymentChoice === 'pay_later' && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-[#003e79]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#1d1d1f]">Confirm Registration</h2>
                <p className="text-sm text-[#6e6e73]">Review your details and confirm to complete registration.</p>
              </div>
            </div>

            {/* Registration summary */}
            <div className="bg-[#f5f5f7] rounded-xl p-5 my-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#6e6e73]">Event</span>
                <span className="font-medium text-[#1d1d1f] text-right max-w-[60%]">{event.name.replace(/^\w[\w\s.'']*\s*-\s*/, '')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#6e6e73]">Team{multiTeamMode && selectedTeams.length > 1 ? 's' : ''}</span>
                <span className="font-medium text-[#1d1d1f] text-right max-w-[60%]">
                  {multiTeamMode && selectedTeams.length > 1
                    ? selectedTeams.map(t => t.name).join(', ')
                    : selectedTeam?.name || selectedTeams[0]?.name}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#6e6e73]">Hotel</span>
                <span className="font-medium text-[#1d1d1f]">{isLocalTeam ? 'Local Team' : hotelPicks[0] || '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#6e6e73]">Payment</span>
                <span className="font-medium text-amber-600">Pay Later</span>
              </div>
              <div className="border-t border-[#e8e8ed] pt-3 flex justify-between">
                <span className="text-sm font-semibold text-[#1d1d1f]">Total Due</span>
                <span className="text-lg font-bold text-[#1d1d1f]">{formatPrice(basePriceCents)}</span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> Full payment of {formatPrice(basePriceCents)} is due before the event. You'll receive payment instructions via email.
              </p>
            </div>

            {regError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{regError}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('payment')}
                className="text-sm font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => submitRegistration()}
                className="px-8 py-3.5 rounded-xl font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-all shadow-sm flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Confirm Registration
              </button>
            </div>
          </div>
        )}

        {step === 'card_form' && paymentChoice !== 'pay_later' && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-[#003e79]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#1d1d1f]">Complete Payment</h2>
                <p className="text-sm text-[#6e6e73]">Enter your card details to finalize your registration.</p>
              </div>
            </div>

            {/* Order summary */}
            <div className="bg-[#f5f5f7] rounded-xl p-4 my-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#6e6e73]">
                    {paymentChoice === 'pay_deposit' ? 'Deposit' : 'Total'} for{' '}
                    <span className="font-medium text-[#1d1d1f]">{event.name.replace(/^\w[\w\s.'']*\s*-\s*/, '')}</span>
                  </p>
                  <p className="text-xs text-[#86868b] mt-0.5">
                    {multiTeamMode && selectedTeams.length > 1
                      ? `${selectedTeams.length} teams: ${selectedTeams.map(t => t.name).join(', ')}`
                      : selectedTeam?.name || selectedTeams[0]?.name}
                  </p>
                </div>
                <span className="text-2xl font-bold text-[#1d1d1f]">
                  {paymentAmountCents > 0 ? `$${(paymentAmountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : formatPrice(paymentChoice === 'pay_deposit' ? depositCents : basePriceCents)}
                </span>
              </div>
              {ssAppliedCents > 0 && (
                <p className="mt-2 text-sm font-semibold text-emerald-600">
                  🔥 Super Saver Discount applied: −${(ssAppliedCents / 100).toLocaleString('en-US')}
                </p>
              )}
            </div>

            {/* Card error */}
            {cardError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{cardError}</span>
              </div>
            )}

            {/* Stripe Payment Element mounts here */}
            <div
              ref={paymentElementRef}
              className="min-h-[200px] mb-6 rounded-xl"
              style={{ minHeight: '200px' }}
            />

            {/* Secure payment note */}
            <div className="flex items-center gap-2 text-xs text-[#86868b] mb-6">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              <span>Your payment is securely processed by Stripe. We never store your card details.</span>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => { setStep('payment'); setCardError(null); }}
                disabled={processingPayment}
                className="text-sm font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors disabled:opacity-40"
              >
                ← Back
              </button>
              <button
                onClick={handlePaymentSubmit}
                disabled={processingPayment || !stripeElements}
                className="px-8 py-3.5 rounded-xl font-semibold text-white bg-[#003e79] hover:bg-[#002d5a] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
              >
                {processingPayment ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    Pay {paymentAmountCents > 0 ? `$${(paymentAmountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'Now'}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════ SUBMITTING ═══════════════════════════════════ */}
        {step === 'submitting' && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="w-16 h-16 border-4 border-[#00ccff] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-bold text-[#1d1d1f] mb-2">Submitting Registration...</h2>
            <p className="text-[#6e6e73]">Please wait while we process your registration.</p>
          </div>
        )}

        {/* ═══════════════════════════════════ STEP 4: CONFIRMATION ═══════════════════════════════════ */}
        {step === 'confirmed' && regResult && (
          <div className="space-y-6">
            {/* Success hero */}
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  {regResult.paymentConfirmed ? 'Payment Confirmed!' : 'Registration Confirmed!'}
                </h2>
                <p className="text-white/80">
                  {regResult.paymentConfirmed
                    ? `Your ${paymentChoice === 'pay_deposit' ? 'deposit' : 'payment'} of $${((regResult.amountPaid || paymentAmountCents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} has been received.`
                    : regResult.eventsRegistered > 1
                      ? `You've registered for ${regResult.eventsRegistered} events!`
                      : 'Your team has been registered.'}
                </p>
              </div>

              <div className="p-8">
                {/* Registration details */}
                <div className="bg-[#f5f5f7] rounded-xl p-5 mb-6">
                  <h3 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider mb-3">Registration Details</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6e6e73]">Team</span>
                      <span className="font-medium text-[#1d1d1f]">{selectedTeam?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6e6e73]">Event</span>
                      <span className="font-medium text-[#1d1d1f]">{event.name.replace(/^\w[\w\s.'']*\s*-\s*/, '')}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6e6e73]">Date</span>
                      <span className="font-medium text-[#1d1d1f]">{formatDateRange(event.start_date, event.end_date)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6e6e73]">Location</span>
                      <span className="font-medium text-[#1d1d1f]">{event.city}, {event.state}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6e6e73]">Status</span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-amber-600">
                        <span className="w-2 h-2 bg-amber-400 rounded-full" />
                        Pending Review
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6e6e73]">Payment</span>
                      <span className="font-medium text-[#1d1d1f]">
                        {regResult?.paymentConfirmed
                          ? `${paymentChoice === 'pay_deposit' ? 'Deposit' : 'Paid'} — $${((regResult.amountPaid || paymentAmountCents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          : paymentChoice === 'pay_now' ? 'Pay in Full' : paymentChoice === 'pay_deposit' ? 'Deposit' : 'Pay Later'}
                      </span>
                    </div>
                    {regResult?.paymentNote && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#6e6e73]">Note</span>
                        <span className="font-medium text-amber-600">{regResult.paymentNote}</span>
                      </div>
                    )}
                    {(isLocalTeam || hotelPicks[0]) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#6e6e73]">Hotel</span>
                        <span className="font-medium text-[#1d1d1f] text-right max-w-[60%]">
                          {isLocalTeam ? 'Local Team' : hotelPicks[0]}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* What happens next */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
                  <h3 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    What Happens Next?
                  </h3>
                  <ul className="text-sm text-amber-700 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="font-bold mt-0.5">1.</span>
                      <span>Our team reviews all registrations within <strong>24–48 hours</strong>.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold mt-0.5">2.</span>
                      <span>You'll receive an <strong>acceptance email</strong> once approved.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold mt-0.5">3.</span>
                      <span>Check your email for <strong>payment instructions</strong> and next steps.</span>
                    </li>
                  </ul>
                </div>

                {/* Dashboard reminder */}
                <div className="bg-[#003e79]/5 border border-[#003e79]/10 rounded-xl p-5 mb-6">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#003e79]/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    </div>
                    <div>
                      <p className="font-semibold text-[#003e79] text-sm">Your Registration Dashboard</p>
                      <p className="text-sm text-[#003e79]/70 mt-1">
                        You can view your registration status, payment info, and event details at any time by signing into your account.
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Discount Code Card (single team) ── */}
                {regResult?.discountCode && !regResult?.registrations && (
                  <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-2xl p-6 text-white mb-6">
                    <p className="text-xs uppercase tracking-widest text-emerald-100 font-semibold mb-1">
                      Discount Code for {selectedTeams?.[0]?.name || 'Your Team'}{selectedTeams?.[0]?.age_group ? ` · ${selectedTeams[0].age_group}` : ''}
                    </p>
                    <p className="text-3xl font-black tracking-[4px] font-mono mb-3">{regResult.discountCode}</p>
                    <div className="flex gap-3 mb-3">
                      <div className="bg-white/20 rounded-lg px-4 py-2">
                        <p className="text-lg font-extrabold">$200 OFF</p>
                        <p className="text-[11px] text-emerald-100">with hotel booking</p>
                      </div>
                      <div className="bg-white/20 rounded-lg px-4 py-2">
                        <p className="text-lg font-extrabold">$100 OFF</p>
                        <p className="text-[11px] text-emerald-100">local team</p>
                      </div>
                    </div>
                    <p className="text-xs text-emerald-200">One-time use · Valid only for {selectedTeams?.[0]?.name || 'this team'} · Cannot be used for other teams</p>
                  </div>
                )}
                {/* ── Discount Code Cards (multi-team) ── */}
                {regResult?.registrations && (
                  <div className="space-y-4 mb-6">
                    {regResult.registrations.filter((r: any) => r.discountCode).map((r: any, i: number) => (
                      <div key={i} className="bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-2xl p-6 text-white">
                        <p className="text-xs uppercase tracking-widest text-emerald-100 font-semibold mb-1">
                          {r.teamName ? `Discount Code for ${r.teamName}${r.ageGroup ? ` · ${r.ageGroup}` : ''}` : 'Your Multi-Event Discount Code'}
                        </p>
                        <p className="text-3xl font-black tracking-[4px] font-mono mb-3">{r.discountCode}</p>
                        <div className="flex gap-3 mb-3">
                          <div className="bg-white/20 rounded-lg px-4 py-2">
                            <p className="text-lg font-extrabold">$200 OFF</p>
                            <p className="text-[11px] text-emerald-100">with hotel booking</p>
                          </div>
                          <div className="bg-white/20 rounded-lg px-4 py-2">
                            <p className="text-lg font-extrabold">$100 OFF</p>
                            <p className="text-[11px] text-emerald-100">local team</p>
                          </div>
                        </div>
                        <p className="text-xs text-emerald-200">One-time use · Valid only for {r.teamName || 'this team'} · Cannot be used for other teams</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Register for Another Event ── */}
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">Register for Another Event</h3>
                  <p className="text-sm text-[#6e6e73] mb-4">
                    {(regResult?.discountCode || regResult?.registrations?.some((r: any) => r.discountCode))
                      ? <>Use your discount code at checkout to save!</>
                      : 'Check out our other upcoming tournaments.'}
                  </p>
                  {loadingUpsell && (
                    <div className="text-center py-6">
                      <div className="w-8 h-8 border-2 border-[#00ccff] border-t-transparent rounded-full animate-spin mx-auto" />
                    </div>
                  )}
                  {!loadingUpsell && upsellEvents.length === 0 && (
                    <button onClick={loadUpsellEvents} className="px-4 py-2 bg-[#003e79] text-white rounded-lg text-sm font-semibold hover:bg-[#002d5a] transition-colors">
                      Browse Events
                    </button>
                  )}
                  {upsellEvents.length > 0 && (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {upsellEvents.map(ue => {
                        const firstCode = regResult?.discountCode || regResult?.registrations?.[0]?.discountCode;
                        return (
                          <a
                            key={ue.id}
                            href={`/register?event=${ue.slug || ue.id}${firstCode ? `&code=${firstCode}` : ''}`}
                            className="block w-full text-left p-4 rounded-xl border-2 border-[#e8e8ed] hover:border-[#00ccff] hover:bg-[#f0f9ff] transition-all"
                          >
                            <div className="flex items-start gap-4">
                              {ue.logo_url ? (
                                <img src={ue.logo_url} alt="" className="w-12 h-12 object-contain rounded-lg flex-shrink-0" />
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-[#f5f5f7] flex items-center justify-center flex-shrink-0">
                                  <span className="text-lg">🏒</span>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-[#1d1d1f] truncate">{ue.name}</p>
                                <p className="text-xs text-[#6e6e73] mt-0.5">{ue.city}, {ue.state} · {formatDateRange(ue.start_date, ue.end_date)}</p>
                              </div>
                              <span className="text-sm font-semibold text-[#00ccff] flex-shrink-0">Register →</span>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <a
                    href="/dashboard/coach"
                    className="flex-1 py-3.5 rounded-xl font-semibold text-white bg-[#00ccff] hover:bg-[#00b8e6] transition-all shadow-sm text-center"
                  >
                    Go to My Dashboard
                  </a>
                  <a
                    href="/events"
                    className="flex-1 py-3.5 rounded-xl font-semibold text-[#1d1d1f] bg-[#f5f5f7] hover:bg-[#e8e8ed] transition-all text-center"
                  >
                    Browse More Events
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
