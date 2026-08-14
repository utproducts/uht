'use client';
// Shared registration editor slide-out panel — used by BOTH the admin
// Registrations page and the admin Events > Participants page so the two
// always show and edit the exact same information (same API row, same fields).

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';
const authFetch = (url: string, opts: RequestInit = {}) => {
  const devHeaders = { 'X-Dev-Bypass': 'true', ...(typeof window !== 'undefined' && localStorage.getItem('uht_token') ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` } : {}) };
  return fetch(url, { ...opts, headers: { ...devHeaders, ...(opts.headers || {}) } });
};

const statusLabels: Record<string, string> = {
  approved: 'Approved',
  pending: 'Pending',
  awaiting_payment: 'Awaiting Payment',
  waitlisted: 'Waitlisted',
  rejected: 'Canceled',
  denied: 'Canceled',
  withdrawn: 'Canceled',
};

export interface Registration {
  id: string;
  event_id: string;
  event_division_id: string | null;
  team_id: string;
  team_name: string;
  team_city: string | null;
  team_state: string | null;
  team_logo_url: string | null;
  team_age_group: string | null;
  age_group: string;
  division_age_group: string | null;
  division_level: string;
  status: string;
  payment_status: string;
  amount_cents: number | null;
  paid_cents: number | null;
  registered_by_first: string | null;
  registered_by_last: string | null;
  registered_by_email: string | null;
  registered_by_phone: string | null;
  registered_by_name: string | null;
  roster_count: number;
  approved_by: string | null;
  approved_at: string | null;
  hotel_assigned: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string | null;
  notes: string | null;
  _source?: string;
  head_coach_name: string | null;
  head_coach_email: string | null;
  head_coach_phone: string | null;
  manager_name: string | null;
  manager_email: string | null;
  manager_phone: string | null;
  hotel_choice_1: string | null;
  hotel_choice_2: string | null;
  hotel_choice_3: string | null;
  hotel_choice_1_name: string | null;
  hotel_choice_1_id: string | null;
  hotel_choice_2_name: string | null;
  hotel_choice_2_id: string | null;
  hotel_choice_3_name: string | null;
  hotel_choice_3_id: string | null;
}

export interface Division {
  id: string;
  event_id: string;
  age_group: string;
  division_level: string;
  max_teams: number;
  current_team_count: number;
  price_cents: number;
}

export interface EventHotel {
  id: string;
  hotel_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  price_per_night: number | null;
  rate_description: string | null;
  booking_code: string | null;
}

export function RegistrationDetailPanel({ reg, divisions, eventHotels, onClose, onSaved, onDelete }: {
  reg: Registration;
  divisions: Division[];
  eventHotels: EventHotel[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  const [status, setStatus] = useState(reg.status);
  const [paymentStatus, setPaymentStatus] = useState(reg.payment_status || 'unpaid');
  const [amountCents, setAmountCents] = useState(reg.amount_cents ? (reg.amount_cents / 100).toString() : '');
  // Division as age group + level (split selectors; resolves/creates an event division on save).
  // Level defaults to the assigned division's level, else the level the team
  // chose at creation (state-based list) — always editable.
  const teamOwnLevel = (((reg as any).team_division_level || '') as string).trim();
  const [divAgeGroup, setDivAgeGroup] = useState((reg as any).division_age_group || '');
  const [divLevel, setDivLevel] = useState((((reg as any).division_level || '') as string).trim() || teamOwnLevel);
  // The team's state's full division-level list (same list they picked from at team creation)
  const [stateLevels, setStateLevels] = useState<string[]>([]);
  useEffect(() => {
    const st = (reg.team_state || '').trim().toUpperCase();
    if (!st) return;
    authFetch(`${API_BASE}/lookups/state-divisions?state=${encodeURIComponent(st.length === 2 ? st : st.slice(0, 2))}`)
      .then(r => r.json())
      .then((json: any) => {
        if (json.success && Array.isArray(json.data)) {
          setStateLevels(json.data.filter((l: any) => l.is_active !== 0).map((l: any) => l.level_name));
        }
      })
      .catch(() => {});
  }, [reg.team_state]);
  const divTouched = useRef(false);
  const eventAgeGroups = Array.from(new Set(divisions.map(d => d.age_group)));
  const eventAgeLevels = (ag: string) => Array.from(new Set(divisions.filter(d => d.age_group === ag).map(d => (d.division_level || '').trim())));
  // Default the age group to what the team chose at registration once divisions load
  useEffect(() => {
    if (divTouched.current || divAgeGroup || !divisions.length || !reg.team_age_group) return;
    const team = reg.team_age_group.toLowerCase();
    const code = (reg.team_age_group.match(/\(([^)]+)\)/) || [])[1]?.toLowerCase();
    const match = divisions.find(d => {
      const ag = d.age_group.toLowerCase();
      return ag === team || (code && (ag === code || ag.includes(code))) || team.includes(ag) || ag.includes(team.split(' ')[0]);
    });
    if (match) {
      setDivAgeGroup(match.age_group);
      setDivLevel((((reg as any).division_level || '') as string).trim() || teamOwnLevel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisions]);
  const [hotelAssigned, setHotelAssigned] = useState(reg.hotel_assigned || '');
  const [notes, setNotes] = useState(reg.notes || '');
  // Team & contacts
  const [teamNameEdit, setTeamNameEdit] = useState(reg.team_name || '');
  // Schedule name: prefilled with the automatic "Org Name (Coach Last)" so it's
  // directly editable; saving an unchanged default keeps automatic behavior.
  const autoScheduleName = (() => {
    const base = ((reg as any).org_name || reg.team_name || '').trim();
    const coach = ((reg as any).head_coach_name || (reg as any).coach_name || '').trim();
    const last = coach.includes(' ') ? coach.split(/\s+/).slice(-1)[0] : '';
    return last ? `${base} (${last})` : base;
  })();
  const [scheduleName, setScheduleName] = useState((reg as any).schedule_name || autoScheduleName);
  const [coachName, setCoachName] = useState((reg as any).head_coach_name || (reg as any).coach_name || '');
  const [coachEmail, setCoachEmail] = useState((reg as any).head_coach_email || (reg as any).coach_email || '');
  const [coachPhone, setCoachPhone] = useState((reg as any).head_coach_phone || (reg as any).coach_phone || '');
  const [managerName, setManagerName] = useState(
    (reg as any).manager_name || [(reg as any).manager_first_name, (reg as any).manager_last_name].filter(Boolean).join(' ') || ''
  );
  const [managerEmail, setManagerEmail] = useState((reg as any).manager_email || (reg as any).email1 || '');
  const [managerPhone, setManagerPhone] = useState((reg as any).manager_phone || (reg as any).phone || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Team links (USA Hockey roster + MyHockeyRankings) — stored on the TEAM, so
  // they surface on every registration, past and future, once submitted
  const [usaHockeyUrl, setUsaHockeyUrl] = useState(((reg as any).usa_hockey_roster_url || '') as string);
  const [mhrUrl, setMhrUrl] = useState(((reg as any).mhr_url || '') as string);

  // Reward code earned by this registration (UHT-XXXXXX — next-event discount)
  const [rewardCode, setRewardCode] = useState<any | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  useEffect(() => {
    authFetch(`${API_BASE}/events/discount-codes/${reg.id}`)
      .then(r => r.json())
      .then((json: any) => {
        const codes = json.success ? (json.data || []) : [];
        setRewardCode(codes[0] || null);
      })
      .catch(() => {});
  }, [reg.id]);
  const resendCode = async () => {
    setResending(true);
    setResendMsg('');
    try {
      const res = await authFetch(`${API_BASE}/events/admin/registration/${reg.id}/resend-discount-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json() as any;
      setResendMsg(json.success ? (json.message || 'Sent!') : (json.error || 'Failed to send'));
    } catch {
      setResendMsg('Failed to send');
    }
    setResending(false);
  };

  // Manual payments (Venmo / check / … — recorded by admins)
  const [manualPayments, setManualPayments] = useState<any[]>([]);
  const [paySummary, setPaySummary] = useState<any | null>(null);
  const [newPayAmount, setNewPayAmount] = useState('');
  const [newPayMethod, setNewPayMethod] = useState('venmo');
  const [newPayRef, setNewPayRef] = useState('');
  const [payAdding, setPayAdding] = useState(false);
  const [payError, setPayError] = useState('');

  const loadPayments = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/events/admin/registration/${reg.id}/payments`);
      const json = await res.json() as any;
      if (json.success) {
        setManualPayments(json.data.payments || []);
        setPaySummary(json.data.summary || null);
      }
    } catch {}
  }, [reg.id]);
  useEffect(() => { loadPayments(); }, [loadPayments]);

  const addPayment = async () => {
    const cents = Math.round(parseFloat(newPayAmount) * 100);
    if (!cents || cents <= 0) return;
    setPayAdding(true);
    setPayError('');
    try {
      const res = await authFetch(`${API_BASE}/events/admin/registration/${reg.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: cents, method: newPayMethod, reference: newPayRef.trim() || undefined }),
      });
      const json = await res.json() as any;
      if (json.success) {
        setNewPayAmount('');
        setNewPayRef('');
        // Update instantly from the response — no extra round trips
        if (json.data?.payments) setManualPayments(json.data.payments);
        if (json.data?.summary) {
          setPaySummary(json.data.summary);
          if (json.data.summary.payment_status) setPaymentStatus(json.data.summary.payment_status);
        }
        onSaved(); // refresh the list in the background
      } else {
        setPayError(json.error || 'Failed to add payment');
      }
    } catch { setPayError('Network error'); }
    setPayAdding(false);
  };

  const removePayment = async (paymentId: string) => {
    try {
      const res = await authFetch(`${API_BASE}/events/admin/registration/${reg.id}/payments/${paymentId}`, { method: 'DELETE' });
      const json = await res.json() as any;
      if (json.success) {
        if (json.data?.payments) setManualPayments(json.data.payments);
        if (json.data?.summary) {
          setPaySummary(json.data.summary);
          if (json.data.summary.payment_status) setPaymentStatus(json.data.summary.payment_status);
        }
        onSaved();
      }
    } catch {}
  };

  // Event transfer
  const [transferEvents, setTransferEvents] = useState<{ id: string; name: string; city: string; state: string; start_date: string }[]>([]);
  const [transferEventId, setTransferEventId] = useState('');
  useEffect(() => {
    authFetch(`${API_BASE}/events/admin/list?filter=upcoming`)
      .then(r => r.json())
      .then((json: any) => { if (json.success && Array.isArray(json.data)) setTransferEvents(json.data); })
      .catch(() => {});
  }, []);
  const isTransferring = !!transferEventId && transferEventId !== reg.event_id;

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: any = {
        status,
        payment_status: paymentStatus,
        payment_amount_cents: amountCents ? Math.round(parseFloat(amountCents) * 100) : null,
        hotel_assigned: hotelAssigned || null,
        notes: notes || null,
      };
      // Division: send the age group + level pair; the API resolves or creates
      // the matching event division (schedule builder pulls these later)
      const origDivAge = (reg as any).division_age_group || '';
      const origDivLevel = ((reg as any).division_level || '').trim();
      const pairExists = divisions.some(d => d.age_group === divAgeGroup && ((d.division_level || '').trim() === divLevel.trim()));
      // Only send the division when the admin touched the fields, or the
      // prefilled pair maps to an existing division (safe auto-assign).
      // Prefills must never silently CREATE divisions.
      if ((divTouched.current || pairExists) && (divAgeGroup !== origDivAge || divLevel.trim() !== origDivLevel)) {
        if (!divAgeGroup) {
          body.event_division_id = null;
        } else {
          body.division_age_group = divAgeGroup;
          body.division_level = divLevel.trim() || null;
          if (divTouched.current && !pairExists) body.allow_create_division = true;
        }
      }
      // Team + contact edits — only send what changed
      if (teamNameEdit.trim() && teamNameEdit.trim() !== (reg.team_name || '')) body.team_name = teamNameEdit.trim();
      // Only send schedule_name when actually changed from what it opened with;
      // clearing the field reverts to the automatic name.
      const scheduleInitial = (reg as any).schedule_name || autoScheduleName;
      if (scheduleName.trim() !== scheduleInitial) body.schedule_name = scheduleName.trim() || null;
      const origCoachName = (reg as any).head_coach_name || (reg as any).coach_name || '';
      const origCoachEmail = (reg as any).head_coach_email || (reg as any).coach_email || '';
      const origCoachPhone = (reg as any).head_coach_phone || (reg as any).coach_phone || '';
      if (coachName !== origCoachName) body.coach_name = coachName.trim() || null;
      if (coachEmail !== origCoachEmail) body.coach_email = coachEmail.trim() || null;
      if (coachPhone !== origCoachPhone) body.coach_phone = coachPhone.trim() || null;
      const origMgrName = (reg as any).manager_name || [(reg as any).manager_first_name, (reg as any).manager_last_name].filter(Boolean).join(' ') || '';
      const origMgrEmail = (reg as any).manager_email || (reg as any).email1 || '';
      const origMgrPhone = (reg as any).manager_phone || (reg as any).phone || '';
      if (managerName !== origMgrName) body.manager_name = managerName.trim() || null;
      if (managerEmail !== origMgrEmail) body.manager_email = managerEmail.trim() || null;
      if (managerPhone !== origMgrPhone) body.manager_phone = managerPhone.trim() || null;
      if (usaHockeyUrl.trim() !== (((reg as any).usa_hockey_roster_url || '') as string).trim()) body.usa_hockey_url = usaHockeyUrl.trim() || null;
      if (mhrUrl.trim() !== (((reg as any).mhr_url || '') as string).trim()) body.mhr_url = mhrUrl.trim() || null;
      if (isTransferring) {
        body.event_id = transferEventId;
        // divisions are per-event; the API auto-matches in the new event
        delete body.event_division_id;
        delete body.division_age_group;
        delete body.division_level;
      }

      const res = await fetch(`https://uht.chad-157.workers.dev/api/events/admin/registration/${reg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true', ...(typeof window !== 'undefined' && localStorage.getItem('uht_token') ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` } : {}) },
        body: JSON.stringify(body),
      });
      const json = await res.json() as any;
      if (json.success) {
        setSaved(true);
        setTimeout(() => { onSaved(); onClose(); }, 600);
      } else {
        setSaveError(json.error || 'Failed to save.');
      }
    } catch (err) {
      setSaveError('Failed to save changes. Please try again.');
    }
    setSaving(false);
  };

  const regByName = [reg.registered_by_first, reg.registered_by_last].filter(Boolean).join(' ');
  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return d; }
  };

  // Hotel choices from team
  const hotelChoices = [
    reg.hotel_choice_1_id ? { id: reg.hotel_choice_1_id, name: reg.hotel_choice_1_name, rank: 1 } : null,
    reg.hotel_choice_2_id ? { id: reg.hotel_choice_2_id, name: reg.hotel_choice_2_name, rank: 2 } : null,
    reg.hotel_choice_3_id ? { id: reg.hotel_choice_3_id, name: reg.hotel_choice_3_name, rank: 3 } : null,
  ].filter(Boolean) as { id: string; name: string | null; rank: number }[];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-lg bg-white shadow-2xl h-full overflow-y-auto animate-[slideIn_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#e8e8ed] px-6 py-5 z-10">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold text-[#1d1d1f]">{reg.team_name}</h3>
              <p className="text-sm text-[#86868b]">
                {reg.team_city}{reg.team_state ? `, ${reg.team_state}` : ''}
                {reg.team_age_group && <> · Team: {reg.team_age_group}</>}
                {reg.event_division_id && <> · Div: {reg.division_age_group} {reg.division_level}</>}
                {!reg.event_division_id && <> · <span className="text-amber-600 font-medium">Unassigned</span></>}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-[#f5f5f7] rounded-xl transition">
              <svg className="w-5 h-5 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">

          {/* ── Team & Contacts ── */}
          <div>
            <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Team &amp; Contacts</label>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#6e6e73] mb-1">Registered Team Name</label>
                <input value={teamNameEdit} onChange={e => setTeamNameEdit(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6e6e73] mb-1">Schedule Name</label>
                <input value={scheduleName} onChange={e => setScheduleName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                <p className="text-[11px] text-[#86868b] mt-1">
                  Shown on schedules, scoreboards &amp; standings only — stats and org rollups stay under the registered team.
                  Clear the field to go back to the automatic &quot;Org Name (Coach Last Name)&quot;.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[#6e6e73] mb-1">Coach Name</label>
                  <input value={coachName} onChange={e => setCoachName(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6e6e73] mb-1">Coach Email</label>
                  <input value={coachEmail} onChange={e => setCoachEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6e6e73] mb-1">Coach Phone</label>
                  <input value={coachPhone} onChange={e => setCoachPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[#6e6e73] mb-1">Manager Name</label>
                  <input value={managerName} onChange={e => setManagerName(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6e6e73] mb-1">Manager Email</label>
                  <input value={managerEmail} onChange={e => setManagerEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6e6e73] mb-1">Manager Phone</label>
                  <input value={managerPhone} onChange={e => setManagerPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Team Links (USA Hockey + MyHockeyRankings) ── */}
          <div>
            <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Team Links</label>
            <div className="space-y-2.5">
              {[
                { label: 'USA Hockey Roster', value: usaHockeyUrl, set: setUsaHockeyUrl, placeholder: 'https://…usahockey…' },
                { label: 'MyHockeyRankings', value: mhrUrl, set: setMhrUrl, placeholder: 'https://myhockeyrankings.com/…' },
              ].map(link => (
                <div key={link.label}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-[#6e6e73]">{link.label}</label>
                    {link.value.trim() ? (
                      <a href={link.value.trim().startsWith('http') ? link.value.trim() : `https://${link.value.trim()}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs font-semibold text-[#003e79] hover:underline flex items-center gap-1">
                        Open
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Not submitted yet</span>
                    )}
                  </div>
                  <input value={link.value} onChange={e => link.set(e.target.value)} placeholder={link.placeholder}
                    className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                </div>
              ))}
              <p className="text-[11px] text-[#86868b]">
                Saved to the team — the links appear on all of this team&apos;s registrations, past and future, as soon as they&apos;re submitted.
              </p>
            </div>
          </div>

          {/* ── Reward Code (earned by this registration, for their next event) ── */}
          {rewardCode && (
            <div>
              <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Reward Code (for their next event)</label>
              <div className="bg-[#f0f7ff] border border-[#003e79]/10 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button
                    onClick={() => {
                      try { navigator.clipboard.writeText(rewardCode.code); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1500); } catch {}
                    }}
                    title="Click to copy"
                    className="font-mono text-lg font-bold text-[#003e79] tracking-widest hover:underline">
                    {codeCopied ? '✓ Copied!' : rewardCode.code}
                  </button>
                  {rewardCode.is_used ? (
                    <span className="text-[11px] font-semibold text-[#86868b] bg-[#e8e8ed] rounded-full px-2.5 py-1">
                      Redeemed{rewardCode.used_at ? ` ${new Date(rewardCode.used_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                    </span>
                  ) : (
                    <button onClick={resendCode} disabled={resending}
                      className="px-3 py-1.5 rounded-lg bg-[#003e79] text-white text-xs font-semibold hover:bg-[#002d5a] transition disabled:opacity-50">
                      {resending ? 'Sending…' : '✉ Email code to team'}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[#6e6e73] mt-2">
                  ${Math.round((rewardCode.discount_local_cents || 10000) / 100)} off local · ${Math.round((rewardCode.discount_hotel_cents || 20000) / 100)} off with partner hotel — one-time use on a different event.
                </p>
                {resendMsg && <p className="text-[11px] font-medium text-[#003e79] mt-1">{resendMsg}</p>}
              </div>
            </div>
          )}

          {/* ── Registration Status ── */}
          <div>
            <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Registration Status</label>
            <div className="flex gap-2 flex-wrap">
              {/* "Canceled" is stored as 'withdrawn' — excluded from participants, counts, and schedules */}
              {['pending', 'approved', 'waitlisted', 'withdrawn'].map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={"px-4 py-2 rounded-xl text-sm font-semibold transition border-2 " +
                    (status === s
                      ? s === 'approved' ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : s === 'pending' ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : s === 'waitlisted' ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-red-400 bg-red-50 text-red-700'
                      : 'border-[#e8e8ed] bg-white text-[#86868b] hover:border-[#c8c8cd]')}
                >
                  {statusLabels[s] || s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            {!['pending', 'approved', 'waitlisted', 'withdrawn'].includes(status) && (
              <p className="text-[11px] text-[#86868b] mt-1.5">
                Current status: <span className="font-semibold">{statusLabels[status] || status}</span> — it stays unchanged unless you pick one above.
              </p>
            )}
          </div>

          {/* ── Event (transfer) ── */}
          <div>
            <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Event</label>
            <select value={transferEventId || reg.event_id} onChange={e => setTransferEventId(e.target.value)}
              className="w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none">
              {!transferEvents.some(ev => ev.id === reg.event_id) && (
                <option value={reg.event_id}>{(reg as any).event_name || 'Current event'}</option>
              )}
              {transferEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} — {ev.city}, {ev.state}{ev.id === reg.event_id ? ' (current)' : ''}
                </option>
              ))}
            </select>
            {isTransferring ? (
              <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800 font-medium">
                  Saving will transfer this registration to{' '}
                  <span className="font-bold">{transferEvents.find(ev => ev.id === transferEventId)?.name}</span>.
                  Payment moves with it — no refund needed. Division and hotel assignment reset and
                  auto-match in the new event.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-[#86868b] mt-1">Pick a different event to transfer this registration — payment follows, no refund needed.</p>
            )}
          </div>

          {/* ── Division: age group + level (feeds the schedule builder) ── */}
          <div className={isTransferring ? 'opacity-50 pointer-events-none' : ''}>
            <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Event Division{isTransferring ? ' (auto-matches in new event)' : ''}</label>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-[#6e6e73] mb-1">Age Group</label>
                <select value={divAgeGroup} onChange={e => { divTouched.current = true; setDivAgeGroup(e.target.value); if (!divLevel) setDivLevel(teamOwnLevel); }}
                  className="w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none">
                  <option value="">Unassigned</option>
                  {eventAgeGroups.map(ag => (
                    <option key={ag} value={ag}>{ag}</option>
                  ))}
                  {reg.team_age_group && !eventAgeGroups.includes(reg.team_age_group) && (
                    <option value={reg.team_age_group}>{reg.team_age_group} (new for this event)</option>
                  )}
                </select>
              </div>
              {divAgeGroup && (
                <div>
                  <label className="block text-xs font-medium text-[#6e6e73] mb-1">Division Level</label>
                  <input value={divLevel} onChange={e => { divTouched.current = true; setDivLevel(e.target.value); }}
                    list="division-level-options"
                    placeholder={eventAgeLevels(divAgeGroup).filter(Boolean).join(', ') || 'e.g. A, B1, Gold'}
                    className="w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                  <datalist id="division-level-options">
                    {Array.from(new Set([
                      ...eventAgeLevels(divAgeGroup).filter(Boolean),
                      ...(teamOwnLevel ? [teamOwnLevel] : []),
                      ...stateLevels,
                    ])).map(l => <option key={l} value={l} />)}
                  </datalist>
                  {stateLevels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {stateLevels.map(l => (
                        <button key={l} type="button"
                          onClick={() => { divTouched.current = true; setDivLevel(l); }}
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition ${
                            divLevel.trim() === l
                              ? 'bg-[#003e79] text-white border-[#003e79]'
                              : 'bg-white text-[#6e6e73] border-[#e8e8ed] hover:border-[#003e79] hover:text-[#003e79]'
                          }`}>
                          {l}
                        </button>
                      ))}
                      <span className="text-[10px] text-[#86868b] self-center ml-1">{reg.team_state} levels</span>
                    </div>
                  )}
                  <p className="text-[11px] text-[#86868b] mt-1">
                    {(() => {
                      const match = divisions.find(d => d.age_group === divAgeGroup && ((d.division_level || '').trim() === divLevel.trim()));
                      return match
                        ? `Existing division — ${match.current_team_count} team${match.current_team_count !== 1 ? 's' : ''}${match.max_teams ? ` of ${match.max_teams}` : ''}`
                        : 'New division — it will be created for this event when you save (used by the schedule builder).';
                    })()}
                  </p>
                </div>
              )}
            </div>
            {reg.team_age_group && (
              <p className="text-xs text-[#86868b] mt-1.5">
                Team registered as: <span className="font-semibold text-[#1d1d1f]">{reg.team_age_group}</span>
                {divAgeGroup && divAgeGroup !== reg.team_age_group && (
                  <span className="ml-1.5 text-amber-600 font-medium">(playing up/down)</span>
                )}
              </p>
            )}
          </div>

          {/* ── Contact Info (read-only) ── */}
          <div className="bg-[#f5f5f7] rounded-xl p-4">
            <div className="text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Registered By</div>
            <div className="space-y-1 text-sm">
              {regByName && <p className="font-semibold text-[#1d1d1f]">{regByName}</p>}
              {reg.registered_by_email && (
                <p className="text-[#6e6e73]">
                  <a href={`mailto:${reg.registered_by_email}`} className="hover:text-[#003e79] transition">{reg.registered_by_email}</a>
                </p>
              )}
              {reg.registered_by_phone && <p className="text-[#6e6e73]">{reg.registered_by_phone}</p>}
            </div>
          </div>

          {/* ── Coach & Manager Contact ── */}
          {(reg.head_coach_name || reg.manager_name) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#f0f7ff] rounded-xl p-4">
                <div className="text-xs font-semibold text-[#003e79] uppercase tracking-widest mb-2">Head Coach</div>
                {reg.head_coach_name ? (
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold text-[#1d1d1f]">{reg.head_coach_name}</p>
                    {reg.head_coach_email && (
                      <p className="text-[#6e6e73] text-xs">
                        <a href={`mailto:${reg.head_coach_email}`} className="hover:text-[#003e79] transition">{reg.head_coach_email}</a>
                      </p>
                    )}
                    {reg.head_coach_phone && <p className="text-[#6e6e73] text-xs">{reg.head_coach_phone}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-[#aeaeb2]">Not set</p>
                )}
              </div>
              <div className="bg-[#f5f0ff] rounded-xl p-4">
                <div className="text-xs font-semibold text-[#6b21a8] uppercase tracking-widest mb-2">Manager</div>
                {reg.manager_name ? (
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold text-[#1d1d1f]">{reg.manager_name}</p>
                    {reg.manager_email && (
                      <p className="text-[#6e6e73] text-xs">
                        <a href={`mailto:${reg.manager_email}`} className="hover:text-[#003e79] transition">{reg.manager_email}</a>
                      </p>
                    )}
                    {reg.manager_phone && <p className="text-[#6e6e73] text-xs">{reg.manager_phone}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-[#aeaeb2]">Not set</p>
                )}
              </div>
            </div>
          )}

          {/* ── Payment ── */}
          <div>
            <div className="text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Payment</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">Status</label>
                <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none">
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Deposit Paid</option>
                  <option value="pay_later">Pay Later</option>
                  <option value="pending_payment">Processing</option>
                  <option value="refunded">Refunded</option>
                  <option value="comp">Comped</option>
                  <option value="comp">Comp</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">Amount ($)</label>
                <input type="number" step="0.01" value={amountCents} onChange={e => setAmountCents(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
              </div>
            </div>
            {reg.stripe_payment_intent_id && (
              <p className="text-[10px] text-[#86868b] mt-2">Stripe: {reg.stripe_payment_intent_id}</p>
            )}

            {/* Recorded payments (Venmo / check / … — admin only) */}
            <div className="mt-4 bg-[#f5f5f7] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">Payments Received</span>
                {paySummary && (
                  paySummary.expected_cents > 0 ? (
                    <span className={`text-[11px] font-semibold ${paySummary.balance_cents === 0 && paySummary.total_paid_cents > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {paySummary.balance_cents === 0 && paySummary.total_paid_cents > 0
                        ? 'Paid in full'
                        : `Balance: $${(paySummary.balance_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-[#86868b]">
                      {paySummary.total_paid_cents > 0
                        ? `$${(paySummary.total_paid_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} received · no price set`
                        : 'No price set on this event'}
                    </span>
                  )
                )}
              </div>
              <div className="space-y-1.5">
                {paySummary && paySummary.stripe_paid_cents > 0 && (
                  <div className="flex items-center justify-between text-xs bg-white rounded-lg px-2.5 py-1.5">
                    <span className="text-[#1d1d1f]"><span className="font-semibold">Stripe</span> (card)</span>
                    <span className="font-semibold text-[#1d1d1f]">${(paySummary.stripe_paid_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {manualPayments.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-2.5 py-1.5">
                    <span className="text-[#1d1d1f]">
                      <span className="font-semibold capitalize">{p.method}</span>
                      {p.reference && <span className="text-[#86868b]"> · {p.reference}</span>}
                      <span className="text-[#86868b]"> · {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-[#1d1d1f]">${(p.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      <button onClick={() => removePayment(p.id)} className="text-red-400 hover:text-red-600 font-bold" title="Remove payment">×</button>
                    </span>
                  </div>
                ))}
                {(!paySummary || (paySummary.stripe_paid_cents === 0 && manualPayments.length === 0)) && (
                  <p className="text-xs text-[#86868b]">No payments recorded yet.</p>
                )}
              </div>

              {/* Add payment */}
              <div className="mt-2.5 flex items-end gap-2">
                <div className="w-24">
                  <label className="block text-[10px] text-[#86868b] mb-0.5">Amount ($)</label>
                  <input type="number" step="0.01" min="0" value={newPayAmount} onChange={e => setNewPayAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2 py-1.5 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none bg-white" />
                </div>
                <div className="w-24">
                  <label className="block text-[10px] text-[#86868b] mb-0.5">Method</label>
                  <select value={newPayMethod} onChange={e => setNewPayMethod(e.target.value)}
                    className="w-full px-2 py-1.5 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none bg-white">
                    <option value="venmo">Venmo</option>
                    <option value="check">Check</option>
                    <option value="cash">Cash</option>
                    <option value="zelle">Zelle</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-[#86868b] mb-0.5">Reference (check #, memo…)</label>
                  <input value={newPayRef} onChange={e => setNewPayRef(e.target.value)}
                    className="w-full px-2 py-1.5 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none bg-white" />
                </div>
                <button onClick={addPayment} disabled={payAdding || !newPayAmount || parseFloat(newPayAmount) <= 0}
                  className="px-3 py-1.5 rounded-lg bg-[#003e79] hover:bg-[#002d5a] text-white text-xs font-semibold transition disabled:opacity-50">
                  {payAdding ? '…' : 'Add'}
                </button>
              </div>
              <p className="text-[10px] text-[#86868b] mt-1.5">Payment status updates automatically when the balance is covered.</p>
              {payError && <p className="text-[10px] text-red-600 mt-1">{payError}</p>}
            </div>
          </div>

          {/* ── Hotel Assignment ── */}
          <div>
            <div className="text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Hotel</div>

            {/* Team's choices */}
            {hotelChoices.length > 0 && (
              <div className="bg-[#f0f7ff] rounded-xl p-3 mb-3">
                <div className="text-[10px] font-semibold text-[#003e79] uppercase tracking-widest mb-1.5">Team Preferences</div>
                <div className="space-y-1.5">
                  {hotelChoices.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span className={"w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 " +
                        (c.rank === 1 ? "bg-emerald-100 text-emerald-700" : c.rank === 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600")}>
                        {c.rank}
                      </span>
                      <span className="text-[#3d3d3d] flex-1">{c.name}</span>
                      {hotelAssigned !== c.id && (
                        <button onClick={() => setHotelAssigned(c.id)}
                          className="text-[10px] px-2 py-0.5 bg-[#f0f7ff] hover:bg-[#e0ecf7] text-[#003e79] rounded-full font-semibold transition">
                          Assign
                        </button>
                      )}
                      {hotelAssigned === c.id && (
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full font-semibold">Assigned</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <select value={hotelAssigned} onChange={e => setHotelAssigned(e.target.value)}
              className="w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none">
              <option value="">Not assigned</option>
              {eventHotels.map(h => (
                <option key={h.id} value={h.id}>{h.hotel_name}{h.price_per_night ? ` ($${Math.round(h.price_per_night / 100)}/night)` : ''}</option>
              ))}
            </select>
          </div>

          {/* ── Notes — schedule requests only (same field the register form fills
               and the participants Notes column shows) ── */}
          <div>
            <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Schedule Requests / Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Schedule requests only — what the team entered at registration, or anything the schedule builder needs to know..."
              className="w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none resize-none" />
          </div>

          {/* ── Meta Info ── */}
          <div className="bg-[#f5f5f7] rounded-xl p-4 text-xs text-[#86868b] space-y-1">
            <p>Registered: {fmtDate(reg.created_at)}</p>
            {reg.approved_at && <p>Approved: {fmtDate(reg.approved_at)}</p>}
            {reg.updated_at && <p>Last updated: {fmtDate(reg.updated_at)}</p>}
            <p>Roster: {reg.roster_count} player{reg.roster_count !== 1 ? 's' : ''}</p>
            <p className="font-mono text-[10px] text-[#aeaeb2]">ID: {reg.id}</p>
          </div>
        </div>

        {/* Footer — Save + Delete */}
        <div className="sticky bottom-0 bg-white border-t border-[#e8e8ed] px-6 py-4 flex gap-3">
          <button onClick={() => onDelete(reg.id)}
            className="px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl text-sm transition"
            title="Delete registration">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-xl text-sm transition">
            Cancel
          </button>
          {saveError && (
            <p className="w-full text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 order-first">{saveError}</p>
          )}
          <button onClick={handleSave} disabled={saving || saved}
            className={"flex-1 px-4 py-2.5 font-bold rounded-xl text-sm transition " +
              (saved ? "bg-emerald-500 text-white" : "bg-[#003e79] hover:bg-[#002d5a] text-white") +
              (saving ? " opacity-50" : "")}>
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
