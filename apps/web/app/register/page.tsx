'use client';

import { useState, useEffect } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';

/* ── types ── */
interface EventData {
  id: string; name: string; slug: string; city: string; state: string;
  start_date: string; end_date: string; status: string; logo_url: string | null;
  price_cents: number | null; deposit_cents: number | null;
  multi_event_discount_pct: number | null; age_groups: string | null;
}
interface Team { id: string; name: string; age_group?: string; division_level?: string; head_coach_name?: string; }
interface UpsellEvent {
  id: string; name: string; city: string; state: string;
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

  // Auth
  const [auth, setAuth] = useState<{ token: string; user: any } | null>(null);

  // Teams
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  // Steps: team → payment → upsell → submitting → confirmed
  const [step, setStep] = useState<'team' | 'payment' | 'upsell' | 'submitting' | 'confirmed'>('team');
  const [paymentChoice, setPaymentChoice] = useState<'pay_now' | 'pay_deposit' | 'pay_later' | null>(null);

  // Upsell
  const [upsellEvents, setUpsellEvents] = useState<UpsellEvent[]>([]);
  const [selectedUpsellIds, setSelectedUpsellIds] = useState<Set<string>>(new Set());
  const [loadingUpsell, setLoadingUpsell] = useState(false);
  const [upsellCityFilter, setUpsellCityFilter] = useState('');
  const [upsellMonthFilter, setUpsellMonthFilter] = useState('');

  // Result
  const [regResult, setRegResult] = useState<any>(null);
  const [regError, setRegError] = useState<string | null>(null);

  // Parse URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventSlug = params.get('event');
    const eventId = params.get('eventId');
    const authData = getAuthUser();
    setAuth(authData);

    if (!authData) {
      window.location.href = `/login?redirect=/register${window.location.search}`;
      return;
    }

    // Load event
    (async () => {
      try {
        let ev: EventData | null = null;
        if (eventId) {
          // Direct ID load
          const res = await fetch(`${API}/events?per_page=100`);
          const json = await res.json() as any;
          ev = (json.data || []).find((e: any) => e.id === eventId) || null;
        } else if (eventSlug) {
          const res = await fetch(`${API}/events/${eventSlug}`);
          const json = await res.json() as any;
          if (json.success) ev = json.data;
        }
        if (!ev) {
          setError('Event not found. Please go back and try again.');
        }
        setEvent(ev);
      } catch {
        setError('Failed to load event details.');
      }
      setLoading(false);
    })();

    // Load teams
    (async () => {
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
          headers: { Authorization: `Bearer ${authData!.token}` },
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
      // Also try by-ids from localStorage
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
    })();
  }, []);

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

  // Submit registration
  const submitRegistration = async () => {
    if (!event || !selectedTeam || !paymentChoice || !auth) return;
    setStep('submitting');
    setRegError(null);

    try {
      const body: any = {
        eventId: event.id,
        teamId: selectedTeam.id,
        teamName: selectedTeam.name,
        ageGroup: selectedTeam.age_group || 'Unknown',
        division: selectedTeam.division_level || undefined,
        email: auth.user?.email || 'unknown@email.com',
        managerFirstName: auth.user?.name?.split(' ')[0] || undefined,
        managerLastName: auth.user?.name?.split(' ').slice(1).join(' ') || undefined,
        headCoachName: selectedTeam.head_coach_name || undefined,
        paymentChoice,
      };
      if (selectedUpsellIds.size > 0) {
        body.additionalEventIds = Array.from(selectedUpsellIds);
      }
      const res = await fetch(`${API}/events/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json() as any;
      if (json.success) {
        setRegResult(json.data);
        setStep('confirmed');
      } else {
        setRegError(json.error || 'Registration failed.');
        setStep('payment');
      }
    } catch {
      setRegError('Network error. Please try again.');
      setStep('payment');
    }
  };

  // Advance from payment → upsell
  const handlePaymentContinue = async () => {
    if (!paymentChoice) return;
    await loadUpsellEvents();
    setStep('upsell');
  };

  const toggleUpsell = (id: string) => {
    setSelectedUpsellIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Compute pricing
  const basePriceCents = event?.price_cents || 0;
  const depositCents = event?.deposit_cents || 0;
  const discountPct = event?.multi_event_discount_pct || 0;
  const totalUpsellEvents = selectedUpsellIds.size;
  const upsellSavingsCents = totalUpsellEvents > 0
    ? Math.round(basePriceCents * (discountPct / 100)) * totalUpsellEvents
    : 0;

  // Step names
  const stepNames = ['Select Team', 'Payment', 'More Events', 'Confirm'];
  const stepIndex = step === 'team' ? 0 : step === 'payment' ? 1 : step === 'upsell' ? 2 : step === 'confirmed' || step === 'submitting' ? 3 : 0;

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
        {step !== 'confirmed' && step !== 'submitting' && (
          <StepIndicator steps={stepNames} current={stepIndex} />
        )}

        {/* ═══════════════════════════════════ STEP 1: SELECT TEAM ═══════════════════════════════════ */}
        {step === 'team' && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-xl font-bold text-[#1d1d1f] mb-1">Select Your Team</h2>
            <p className="text-sm text-[#6e6e73] mb-6">Choose which team to register for this tournament.</p>

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
                  {teams.map(team => (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeam(team)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all group ${
                        selectedTeam?.id === team.id
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
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          selectedTeam?.id === team.id ? 'border-[#00ccff] bg-[#00ccff]' : 'border-[#d1d1d6]'
                        }`}>
                          {selectedTeam?.id === team.id && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <a href={`/create-team?redirect=/register?event=${event.slug}`} className="text-sm font-medium text-[#00ccff] hover:text-[#0099bf]">
                    + Create New Team
                  </a>
                  <button
                    onClick={() => selectedTeam && setStep('payment')}
                    disabled={!selectedTeam}
                    className="px-8 py-3.5 rounded-xl font-semibold text-white bg-[#00ccff] hover:bg-[#00b8e6] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════ STEP 2: PAYMENT CHOICE ═══════════════════════════════════ */}
        {step === 'payment' && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-xl font-bold text-[#1d1d1f] mb-1">Choose Payment Option</h2>
            <p className="text-sm text-[#6e6e73] mb-6">
              Registering <span className="font-medium text-[#1d1d1f]">{selectedTeam?.name}</span> for this tournament.
            </p>

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

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep('team')} className="text-sm font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors">
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

        {/* ═══════════════════════════════════ STEP 3: MULTI-EVENT UPSELL ═══════════════════════════════════ */}
        {step === 'upsell' && (() => {
          // Derive unique cities and months from upsell events for filter chips
          const upsellCities = Array.from(new Set(upsellEvents.map(ue => ue.city))).sort();
          const upsellMonths = Array.from(new Set(upsellEvents.map(ue => {
            const d = new Date(ue.start_date + 'T12:00:00');
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          }))).sort();
          const monthLabel = (ym: string) => {
            const [y, m] = ym.split('-');
            return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
          };

          // Apply filters
          let filteredUpsell = upsellEvents;
          if (upsellCityFilter) {
            filteredUpsell = filteredUpsell.filter(ue => ue.city === upsellCityFilter);
          }
          if (upsellMonthFilter) {
            filteredUpsell = filteredUpsell.filter(ue => {
              const d = new Date(ue.start_date + 'T12:00:00');
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === upsellMonthFilter;
            });
          }

          // Count selected that are currently hidden by filters
          const hiddenSelectedCount = Array.from(selectedUpsellIds).filter(id => !filteredUpsell.find(ue => ue.id === id)).length;

          return (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-full text-sm font-semibold mb-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Save with Multi-Event Registration!
              </div>
              <h2 className="text-xl font-bold text-[#1d1d1f]">Register for More Events & Save</h2>
              {discountPct > 0 ? (
                <p className="text-sm text-[#6e6e73] mt-2">
                  Add another event and get <span className="font-bold text-emerald-600">{discountPct}% off</span> each additional registration!
                </p>
              ) : (
                <p className="text-sm text-[#6e6e73] mt-2">Check out our other upcoming tournaments.</p>
              )}
            </div>

            {loadingUpsell ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-[#00ccff] border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : upsellEvents.length === 0 ? (
              <div className="text-center py-6 text-[#86868b]">
                <p>No other upcoming events at this time.</p>
              </div>
            ) : (
              <>
                {/* ── Filter bar ── */}
                <div className="mb-4">
                  {/* City filter chips */}
                  {upsellCities.length > 1 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-[#86868b] uppercase tracking-wider mb-2">Filter by City</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setUpsellCityFilter('')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            !upsellCityFilter
                              ? 'bg-[#003e79] text-white shadow-sm'
                              : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                          }`}
                        >
                          All Cities
                        </button>
                        {upsellCities.map(city => {
                          const count = upsellEvents.filter(ue => ue.city === city).length;
                          return (
                            <button
                              key={city}
                              onClick={() => setUpsellCityFilter(upsellCityFilter === city ? '' : city)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                upsellCityFilter === city
                                  ? 'bg-[#003e79] text-white shadow-sm'
                                  : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                              }`}
                            >
                              {city} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Month filter chips */}
                  {upsellMonths.length > 1 && (
                    <div>
                      <p className="text-xs font-medium text-[#86868b] uppercase tracking-wider mb-2">Filter by Month</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setUpsellMonthFilter('')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            !upsellMonthFilter
                              ? 'bg-[#003e79] text-white shadow-sm'
                              : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                          }`}
                        >
                          All Dates
                        </button>
                        {upsellMonths.map(ym => {
                          const count = upsellEvents.filter(ue => {
                            const d = new Date(ue.start_date + 'T12:00:00');
                            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === ym;
                          }).length;
                          return (
                            <button
                              key={ym}
                              onClick={() => setUpsellMonthFilter(upsellMonthFilter === ym ? '' : ym)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                upsellMonthFilter === ym
                                  ? 'bg-[#003e79] text-white shadow-sm'
                                  : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                              }`}
                            >
                              {monthLabel(ym)} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Active filter + result count */}
                  {(upsellCityFilter || upsellMonthFilter) && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#e8e8ed]">
                      <span className="text-xs text-[#86868b]">
                        Showing {filteredUpsell.length} of {upsellEvents.length} events
                        {hiddenSelectedCount > 0 && (
                          <span className="text-emerald-600 font-medium"> · {hiddenSelectedCount} selected not shown</span>
                        )}
                      </span>
                      <button
                        onClick={() => { setUpsellCityFilter(''); setUpsellMonthFilter(''); }}
                        className="text-xs font-medium text-[#00ccff] hover:text-[#0099bf]"
                      >
                        Clear Filters
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Event list ── */}
                {filteredUpsell.length === 0 ? (
                  <div className="text-center py-6 text-[#86868b]">
                    <p className="text-sm">No events match your filters.</p>
                    <button onClick={() => { setUpsellCityFilter(''); setUpsellMonthFilter(''); }} className="text-sm font-medium text-[#00ccff] mt-2">
                      Clear Filters
                    </button>
                  </div>
                ) : (
                <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto">
                  {filteredUpsell.map(ue => {
                    const isSelected = selectedUpsellIds.has(ue.id);
                    const uePriceCents = ue.price_cents || 0;
                    const ueDiscountPct = discountPct || ue.multi_event_discount_pct || 0;
                    const discountedPrice = uePriceCents - Math.round(uePriceCents * ueDiscountPct / 100);
                    return (
                      <button
                        key={ue.id}
                        onClick={() => toggleUpsell(ue.id)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                          isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-[#e8e8ed] hover:border-[#00ccff]/40'
                        }`}
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
                            <p className="font-semibold text-[#1d1d1f] truncate">{ue.name.replace(/^\w[\w\s.'']*\s*-\s*/, '')}</p>
                            <p className="text-xs text-[#6e6e73] mt-0.5">{ue.city}, {ue.state} · {formatDateRange(ue.start_date, ue.end_date)}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              {ueDiscountPct > 0 ? (
                                <>
                                  <span className="text-xs text-[#86868b] line-through">{formatPrice(uePriceCents)}</span>
                                  <span className="text-sm font-bold text-emerald-600">{formatPrice(discountedPrice)}</span>
                                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Save {ueDiscountPct}%</span>
                                </>
                              ) : (
                                <span className="text-sm font-semibold text-[#1d1d1f]">{formatPrice(uePriceCents)}</span>
                              )}
                            </div>
                          </div>
                          <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-all ${
                            isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-[#d1d1d6]'
                          }`}>
                            {isSelected && (
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                )}
              </>
            )}

            {/* Order summary */}
            <div className="bg-[#f5f5f7] rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-[#1d1d1f]">Order Summary</h4>
                {selectedUpsellIds.size > 0 && (
                  <span className="text-xs text-emerald-600 font-medium">{1 + selectedUpsellIds.size} events</span>
                )}
              </div>
              <div className="space-y-2 text-sm">
                {/* Primary event — always present */}
                <div className="flex items-center justify-between">
                  <span className="text-[#6e6e73] flex-1">{event.name.replace(/^\w[\w\s.'']*\s*-\s*/, '')}</span>
                  <span className="font-medium ml-3">{formatPrice(basePriceCents)}</span>
                </div>
                {/* Additional events — with remove button */}
                {Array.from(selectedUpsellIds).map(id => {
                  const ue = upsellEvents.find(e => e.id === id);
                  if (!ue) return null;
                  const uePriceCents = ue.price_cents || 0;
                  const ueDiscountPct = discountPct || ue.multi_event_discount_pct || 0;
                  const discountedPrice = uePriceCents - Math.round(uePriceCents * ueDiscountPct / 100);
                  return (
                    <div key={id} className="flex items-center justify-between group">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button
                          onClick={() => toggleUpsell(id)}
                          className="w-5 h-5 flex items-center justify-center rounded text-[#86868b] hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                          title="Remove from order"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                        <span className="text-[#6e6e73] truncate">{ue.name.replace(/^\w[\w\s.'']*\s*-\s*/, '')}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                        {ueDiscountPct > 0 && <span className="text-xs text-[#86868b] line-through">{formatPrice(uePriceCents)}</span>}
                        <span className="font-medium">{formatPrice(discountedPrice)}</span>
                      </div>
                    </div>
                  );
                })}
                {upsellSavingsCents > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold pt-2 border-t border-[#e8e8ed]">
                    <span>Multi-event savings</span>
                    <span>-{formatPrice(upsellSavingsCents)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-[#1d1d1f] pt-2 border-t border-[#e8e8ed]">
                  <span>Total</span>
                  <span>{formatPrice(
                    basePriceCents +
                    Array.from(selectedUpsellIds).reduce((sum, id) => {
                      const ue = upsellEvents.find(e => e.id === id);
                      if (!ue) return sum;
                      const uePriceCents = ue.price_cents || 0;
                      const ueDiscountPct = discountPct || ue.multi_event_discount_pct || 0;
                      return sum + uePriceCents - Math.round(uePriceCents * ueDiscountPct / 100);
                    }, 0)
                  )}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep('payment')} className="text-sm font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors">
                ← Back
              </button>
              <button
                onClick={submitRegistration}
                className="px-8 py-3.5 rounded-xl font-semibold text-white bg-[#00ccff] hover:bg-[#00b8e6] transition-all shadow-sm"
              >
                {selectedUpsellIds.size > 0 ? `Register for ${1 + selectedUpsellIds.size} Events` : 'Complete Registration'}
              </button>
            </div>
          </div>
          );
        })()}

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
                <h2 className="text-2xl font-bold text-white mb-2">Registration Confirmed!</h2>
                <p className="text-white/80">
                  {regResult.eventsRegistered > 1
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
                        {paymentChoice === 'pay_now' ? 'Pay in Full' : paymentChoice === 'pay_deposit' ? 'Deposit' : 'Pay Later'}
                      </span>
                    </div>
                    {selectedUpsellIds.size > 0 && (
                      <div className="flex justify-between text-sm pt-2 border-t border-[#e8e8ed]">
                        <span className="text-[#6e6e73]">Additional Events</span>
                        <span className="font-medium text-emerald-600">+{selectedUpsellIds.size} event{selectedUpsellIds.size > 1 ? 's' : ''}</span>
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
