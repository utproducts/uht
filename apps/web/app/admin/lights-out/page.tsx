'use client';

/*
  ADMIN: LIGHTS OUT INVITATIONAL - invite requests from /lights-out.
  Every request lands pending; the star claim is pre-checked against
  game_three_stars (green check = found on a scoresheet). Approving
  sends the "you're in" email to the parent.
*/

import React, { useEffect, useState } from 'react';

const API = 'https://uht.chad-157.workers.dev/api/lights-out';

function hdrs(extra?: Record<string, string>): Record<string, string> {
  return {
    'X-Dev-Bypass': 'true',
    ...(typeof window !== 'undefined' && localStorage.getItem('uht_token') ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` } : {}),
    ...extra,
  };
}

// Division by birth year, current (2026-27) season - what each kid is now.
// Shared by the rollup cards and the division filter on the table.
const divisionOf = (by: any): string => {
  const y = parseInt(String(by || '').trim(), 10);
  if (!y || y < 2004 || y > 2023) return 'Unknown';
  if (y >= 2018) return 'Mite';
  if (y >= 2016) return 'Squirt';
  if (y >= 2014) return 'Pee Wee';
  if (y >= 2012) return 'Bantam';
  return 'Midget';
};
const posOf = (p: any): string => {
  const s = String(p || '').trim().toUpperCase();
  if (s.startsWith('F')) return 'F';
  if (s.startsWith('D')) return 'D';
  if (s.startsWith('G')) return 'G';
  return '?';
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  pending_payment: 'bg-gray-50 text-gray-500 border-gray-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  denied: 'bg-red-50 text-red-600 border-red-200',
  invite_requested: 'bg-[#f0f7ff] text-[#0077b0] border-[#bfe0f5]',
  invite_approved: 'bg-green-50 text-green-700 border-green-200',
  invite_denied: 'bg-red-50 text-red-600 border-red-200',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'PAID - AWAITING APPROVAL',
  pending_payment: 'CHECKOUT NOT COMPLETED',
  approved: 'APPROVED',
  denied: 'DENIED',
  invite_requested: 'INVITE REQUEST - NO STAR',
  invite_approved: 'CODE SENT - AWAITING REGISTRATION',
  invite_denied: 'REQUEST DENIED',
};

export default function LightsOutAdminPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'registered' | 'incomplete' | 'pending' | 'approved' | 'denied' | 'requests' | 'code_sent' | 'waitlist'>('all');
  // Clicking a division card narrows the whole table to that age group -
  // the first step toward building teams per division
  const [divFilter, setDivFilter] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editBusy, setEditBusy] = useState(false);
  const [editMsg, setEditMsg] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sizesMsg, setSizesMsg] = useState('');
  const [sizesBusy, setSizesBusy] = useState(false);

  const sendSizesTest = async () => {
    const to = testEmail.trim();
    if (!to.includes('@')) { setSizesMsg('Enter the email to send the test to.'); return; }
    setSizesBusy(true);
    setSizesMsg('');
    try {
      const res = await fetch(`${API}/admin/test-sizes-email`, { method: 'POST', headers: hdrs({ 'Content-Type': 'application/json' }), body: JSON.stringify({ to }) });
      const j = await res.json();
      setSizesMsg(j.success ? `Test sent to ${to} (sample player: ${j.data?.sample_player}). Check your inbox, click everything.` : (j.error || 'Test failed.'));
    } catch { setSizesMsg('Test failed - try again.'); }
    setSizesBusy(false);
  };

  const sendSizesBlast = async (count: number) => {
    if (!window.confirm(`Send the sizes email to ${count} famil${count === 1 ? 'y' : 'ies'} that have not gotten one yet? Each gets their own link, and nobody is ever emailed twice.`)) return;
    setSizesBusy(true);
    setSizesMsg('');
    try {
      const res = await fetch(`${API}/admin/send-sizes-emails`, { method: 'POST', headers: hdrs() });
      const j = await res.json();
      setSizesMsg(j.success ? `Sent ${j.data?.sent} emails${j.data?.failed?.length ? ` - FAILED for: ${j.data.failed.join(', ')}` : '.'}` : (j.error || 'Send failed.'));
      load();
    } catch { setSizesMsg('Send failed - try again.'); }
    setSizesBusy(false);
  };

  const load = async () => {
    try {
      const res = await fetch(`${API}/admin/requests`, { headers: hdrs() });
      const j = await res.json();
      if (j.success) setRows(j.data || []);
    } catch {}
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);

  // Fix misspelled names / wrong info straight on the registration row.
  // Saves only the fields, never touches status, payment, or codes.
  const startEdit = (r: any) => {
    setEditRow(r.id);
    setEditMsg('');
    setEditForm({
      player_name: r.player_name || '', team_name: r.team_name || '', birth_year: r.birth_year || '',
      position: r.position || '', parent_name: r.parent_name || '', email: r.email || '', phone: r.phone || '',
      jersey_name: r.jersey_name || '', jersey_number_request: r.jersey_number_request || '',
      jersey_size: r.jersey_size || '', tee_size: r.tee_size || '',
    });
  };
  const saveEdit = async (id: string) => {
    setEditBusy(true);
    setEditMsg('');
    const payload: any = { ...editForm };
    // player name and email cannot be blanked - drop them if emptied
    if (!String(payload.player_name || '').trim()) delete payload.player_name;
    if (!String(payload.email || '').trim()) delete payload.email;
    try {
      const res = await fetch(`${API}/admin/requests/${id}/details`, {
        method: 'PATCH', headers: hdrs({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (j.success) {
        setRows(prev => prev.map(r => r.id === id ? { ...r, ...payload } : r));
        setEditRow(null);
      } else setEditMsg(j.error || 'Save failed.');
    } catch { setEditMsg('Save failed - try again.'); }
    setEditBusy(false);
  };

  // Team builder: assign a paid player to an event team. Writes through the
  // details endpoint; empty string clears the assignment.
  const assignTeam = async (id: string, team: string | null) => {
    setBusy(id);
    try {
      const res = await fetch(`${API}/admin/requests/${id}/details`, {
        method: 'PATCH', headers: hdrs({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ assigned_team: team || '' }),
      });
      const j = await res.json();
      if (j.success) setRows(prev => prev.map(r => r.id === id ? { ...r, assigned_team: team } : r));
    } catch {}
    setBusy(null);
  };
  // Existing team names per division, for the row dropdowns
  const teamsByDiv: Record<string, string[]> = {};
  for (const r of rows) {
    if (r.assigned_team) {
      const d = divisionOf(r.birth_year);
      const list = (teamsByDiv[d] = teamsByDiv[d] || []);
      if (!list.includes(r.assigned_team)) list.push(r.assigned_team);
    }
  }
  for (const d of Object.keys(teamsByDiv)) teamsByDiv[d].sort();

  const setStatus = async (id: string, status: string) => {
    setBusy(id);
    try {
      const res = await fetch(`${API}/admin/requests/${id}`, {
        method: 'PATCH', headers: hdrs({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status }),
      });
      const j = await res.json();
      if (j.success) setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch {}
    setBusy(null);
  };

  // Registered = actually paid (matches the overview tile). Incomplete =
  // started checkout, never paid. Requests = everything that arrived through
  // the invite-request door, INCLUDING converts that have since registered -
  // staff kept losing track of them when they vanished from this tab.
  const isReq = (r: any) => String(r.status).startsWith('invite_');
  const fromRequest = (r: any) => r.star_event_id === 'invite-request';
  const fromWaitlist = (r: any) => r.star_event_id === 'goalie-waitlist';
  const isPaid = (r: any) => !isReq(r) && (r.amount_paid_cents || 0) > 0;
  // Request lifecycle: Requests = waiting on review. Approving moves them to
  // Code Sent. Registering moves them to Registered. Nothing stays behind,
  // so a zero Requests pill means nothing is being missed.
  const counts = { all: rows.length, registered: 0, incomplete: 0, pending: 0, approved: 0, denied: 0, requests: 0, code_sent: 0, waitlist: 0 } as Record<string, number>;
  for (const r of rows) {
    if (r.status === 'invite_requested') counts.requests++;
    else if (r.status === 'invite_approved') counts.code_sent++;
    else if (r.status === 'goalie_waitlist') counts.waitlist++;
    else if (r.status === 'denied' || r.status === 'invite_denied') counts.denied++;
    else counts[r.status] = (counts[r.status] || 0) + 1;
    if (isPaid(r)) counts.registered++;
    else if (!isReq(r) && r.status !== 'goalie_waitlist') counts.incomplete++;
  }
  const needle = q.trim().toLowerCase();
  const visible = rows.filter(r => {
    if (divFilter && divisionOf(r.birth_year) !== divFilter) return false;
    if (needle && !`${r.player_name || ''} ${r.parent_name || ''} ${r.email || ''} ${r.team_name || ''} ${r.invite_code || ''}`.toLowerCase().includes(needle)) return false;
    if (filter === 'all') return true;
    if (filter === 'requests') return r.status === 'invite_requested';
    if (filter === 'code_sent') return r.status === 'invite_approved';
    if (filter === 'waitlist') return r.status === 'goalie_waitlist';
    if (filter === 'denied') return r.status === 'denied' || r.status === 'invite_denied';
    if (filter === 'registered') return isPaid(r);
    if (filter === 'incomplete') return !isReq(r) && !isPaid(r);
    return r.status === filter;
  });

  // One chip that tells the whole story (shown in the expanded panel)
  const chipFor = (r: any): { label: string; cls: string } => {
    const st = String(r.status);
    const paid = r.amount_paid_cents || 0;
    if (st === 'invite_requested') return { label: 'NEEDS REVIEW', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    if (st === 'invite_approved') return { label: 'CODE SENT - NOT REGISTERED YET', cls: 'bg-[#f0f7ff] text-[#0077b0] border-[#bfe0f5]' };
    if (st === 'goalie_waitlist') return { label: 'GOALIE WAITLIST', cls: 'bg-orange-50 text-orange-700 border-orange-200' };
    if (st === 'invite_denied' || st === 'denied') return { label: 'DENIED', cls: 'bg-red-50 text-red-600 border-red-200' };
    if (st === 'pending_payment') return { label: 'CHECKOUT ABANDONED', cls: 'bg-gray-50 text-gray-500 border-gray-200' };
    if (st === 'pending') return { label: 'PAID - NEEDS APPROVAL', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    if (paid >= 55000) return { label: 'IN - PAID IN FULL', cls: 'bg-green-50 text-green-700 border-green-200' };
    return { label: `IN - $${((55000 - paid) / 100).toLocaleString()} BALANCE DUE`, cls: 'bg-green-50 text-green-700 border-green-200' };
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <h1 className="text-2xl font-bold text-[#1d1d1f]">Lights Out Invitational</h1>
      <p className="text-sm text-[#6e6e73] mt-1 mb-5">
        Invite requests from the Lights Out page. The star claim is checked against the scoresheets automatically -
        approving sends the confirmation email to the family.
      </p>

      {/* Money strip + division rollup. Collected sums every paid Lights Out
          registration; Still Owed is what the deposit families have left on
          the $550 full price. Divisions use the current (2026-27) season -
          what each kid is right now. */}
      {loaded && rows.length > 0 && (() => {
        const paidRows = rows.filter((r: any) => isPaid(r));
        const collected = paidRows.reduce((s: number, r: any) => s + (r.amount_paid_cents || 0), 0);
        const owed = paidRows.reduce((s: number, r: any) => s + Math.max(0, 55000 - (r.amount_paid_cents || 0)), 0);
        const onDeposit = paidRows.filter((r: any) => (r.amount_paid_cents || 0) < 55000).length;
        const money = (cents: number) => '$' + Math.round(cents / 100).toLocaleString();

        const ORDER = ['Mite', 'Squirt', 'Pee Wee', 'Bantam', 'Midget', 'Unknown'];
        const YEARS_LABEL: Record<string, string> = { Mite: '2018+', Squirt: '2016-17', 'Pee Wee': '2014-15', Bantam: '2012-13', Midget: '2011 & older' };
        const agg: Record<string, { paid: number; req: number; wait: number; years: Record<string, number>; pos: Record<string, number> }> = {};
        for (const r of rows) {
          if (!isPaid(r) && !isReq(r) && r.status !== 'goalie_waitlist') continue; // abandoned checkouts don't count
          const d = divisionOf(r.birth_year);
          const a = (agg[d] = agg[d] || { paid: 0, req: 0, wait: 0, years: {}, pos: {} });
          if (isPaid(r)) {
            a.paid++;
            const yk = String(r.birth_year || '?').trim();
            a.years[yk] = (a.years[yk] || 0) + 1;
            const pk = posOf(r.position);
            a.pos[pk] = (a.pos[pk] || 0) + 1;
          } else if (r.status === 'goalie_waitlist') a.wait++;
          else a.req++;
        }
        // Goalie caps per division (Chad, Nov 2026). At the cap, the public
        // page routes new goalies to the free waitlist automatically.
        const GOALIE_CAPS: Record<string, number> = { Mite: 6, Squirt: 8, 'Pee Wee': 8, Bantam: 6 };
        const shown = ORDER.filter(d => agg[d]);
        return (
          <div className="mb-5">
            <div className="grid grid-cols-2 gap-3 mb-4 sm:max-w-md">
              <div className="bg-white border border-[#e8e8ed] rounded-2xl px-4 py-3 shadow-sm">
                <p className="text-[11px] font-bold text-[#6e6e73] uppercase tracking-wide">Collected</p>
                <p className="text-2xl font-black text-green-700 leading-tight">{money(collected)}</p>
                <p className="text-[11px] text-[#86868b] font-semibold leading-snug">{paidRows.length} paid registration{paidRows.length === 1 ? '' : 's'}</p>
              </div>
              <div className="bg-white border border-[#e8e8ed] rounded-2xl px-4 py-3 shadow-sm">
                <p className="text-[11px] font-bold text-[#6e6e73] uppercase tracking-wide">Still owed</p>
                <p className="text-2xl font-black text-amber-600 leading-tight">{money(owed)}</p>
                <p className="text-[11px] text-[#86868b] font-semibold leading-snug">{owed > 0 ? `${onDeposit} on deposit of the $550 full price` : 'everyone is paid in full'}</p>
              </div>
            </div>
            {shown.length > 0 && (
              <>
                <div className="flex items-center gap-2.5 mb-2">
                  <p className="text-[11px] font-bold text-[#86868b] uppercase tracking-widest">Divisions</p>
                  {divFilter ? (
                    <button onClick={() => setDivFilter(null)}
                      className="text-[11px] font-bold text-white bg-[#003e79] rounded-full px-2.5 py-0.5 hover:bg-[#00315f] transition">
                      Showing {divFilter} only · clear
                    </button>
                  ) : (
                    <span className="text-[11px] text-[#a1a1a6] font-semibold">click a card to see that age group&apos;s players below</span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {shown.map(d => {
                    const a = agg[d];
                    const g = a.pos['G'] || 0;
                    const cap = GOALIE_CAPS[d];
                    const goalieFull = !!cap && g >= cap;
                    return (
                      <div key={d} onClick={() => setDivFilter(divFilter === d ? null : d)}
                        className={`rounded-2xl px-4 py-3 shadow-sm cursor-pointer transition select-none border ${divFilter === d
                          ? 'bg-[#f0f7ff] border-[#003e79] ring-1 ring-inset ring-[#003e79]'
                          : 'bg-white border-[#e8e8ed] hover:border-[#003e79]/50'}`}>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-[11px] font-bold text-[#6e6e73] uppercase tracking-wide">{d}</p>
                          {!!YEARS_LABEL[d] && <p className="text-[10px] text-[#a1a1a6] font-semibold whitespace-nowrap">{YEARS_LABEL[d]}</p>}
                        </div>
                        <p className="text-2xl font-black text-[#003e79] leading-tight">
                          {a.paid}<span className="text-[11px] font-bold text-[#86868b] ml-1.5">paid</span>
                        </p>
                        <div className="flex gap-3 mt-1.5">
                          <div>
                            <p className="text-[9px] font-bold text-[#a1a1a6] uppercase tracking-wide">Fwd</p>
                            <p className="text-sm font-bold text-[#1d1d1f] leading-tight">{a.pos['F'] || 0}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[#a1a1a6] uppercase tracking-wide">Def</p>
                            <p className="text-sm font-bold text-[#1d1d1f] leading-tight">{a.pos['D'] || 0}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[#a1a1a6] uppercase tracking-wide">Goalie</p>
                            <p className={`text-sm font-bold leading-tight ${goalieFull ? 'text-orange-600' : 'text-[#1d1d1f]'}`}>{g}{cap ? `/${cap}` : ''}</p>
                          </div>
                        </div>
                        <p className="text-[10px] text-[#a1a1a6] font-semibold leading-snug mt-1.5">
                          {Object.entries(a.years).sort((a2, b2) => a2[0].localeCompare(b2[0])).map(([y, n]) => `${y}: ${n}`).join(' · ') || 'none paid yet'}
                        </p>
                        {(a.req > 0 || a.wait > 0 || goalieFull) && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {goalieFull && (
                              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                                Goalies full{a.wait ? ` · ${a.wait} waiting` : ''}
                              </span>
                            )}
                            {!goalieFull && a.wait > 0 && (
                              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                                {a.wait} on goalie waitlist
                              </span>
                            )}
                            {a.req > 0 && (
                              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                {a.req} requested
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Swag order: jersey + tee size totals across paid registrations, so
          ordering is one glance - plus who still has not picked */}
      {loaded && (() => {
        const paid = rows.filter((r: any) => isPaid(r));
        if (paid.length === 0) return null;
        const unsent = paid.filter((r: any) => !r.sizes_email_sent_at).length;
        const allEmailed = unsent === 0;
        // Size matrix: jerseys split into regular vs goalie cut (stored as
        // "Goalie Cut Youth L"), tees straight from tee_size
        const ORDER2 = ['Youth S', 'Youth M', 'Youth L', 'Youth XL', 'Adult S', 'Adult M', 'Adult L', 'Adult XL', 'Adult XXL'];
        const reg: Record<string, number> = {}; const gk: Record<string, number> = {}; const ts: Record<string, number> = {};
        for (const r of paid) {
          const j = String((r as any).jersey_size || '');
          if (j.startsWith('Goalie Cut ')) gk[j.slice(11)] = (gk[j.slice(11)] || 0) + 1;
          else if (j) reg[j] = (reg[j] || 0) + 1;
          const t = (r as any).tee_size; if (t) ts[t] = (ts[t] || 0) + 1;
        }
        const sizesPresent = [
          ...ORDER2.filter(sz => reg[sz] || gk[sz] || ts[sz]),
          ...Object.keys({ ...reg, ...gk, ...ts }).filter(sz => !ORDER2.includes(sz)).sort(),
        ];
        const hasGoalie = Object.keys(gk).length > 0;
        const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
        const missing = paid.filter((r: any) => !r.jersey_size || !r.tee_size).length;
        const exportSwag = () => {
          const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
          const header = ['Player', 'Name on Jersey', 'Number', 'Cut', 'Jersey Size', 'Tee Size', 'Team', 'Birth Year', 'Parent Email'];
          const lines = [header.join(',')];
          for (const r of [...paid].sort((a: any, b: any) => String(a.player_name).localeCompare(String(b.player_name)))) {
            const raw = String(r.jersey_size || '');
            const goalie = raw.startsWith('Goalie Cut ');
            lines.push([
              r.player_name,
              r.jersey_name || String(r.player_name || '').trim().split(/\s+/).slice(-1)[0] || '',
              r.jersey_number_request || r.jersey_number || '',
              goalie ? 'Goalie Cut' : (raw ? 'Regular' : ''),
              goalie ? raw.slice(11) : raw,
              r.tee_size || '',
              r.team_name || '',
              r.birth_year || '',
              r.email || '',
            ].map(esc).join(','));
          }
          const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `lights-out-swag-order-${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
          URL.revokeObjectURL(a.href);
        };
        return (
          <div className={`border rounded-2xl px-4 py-3 shadow-sm mb-5 ${allEmailed ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-[#e8e8ed]'}`}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
              <p className={`text-[11px] font-bold uppercase tracking-widest ${allEmailed ? 'text-emerald-700' : 'text-[#86868b]'}`}>
                Swag order ({paid.length} players){allEmailed ? ' - approved, all families emailed' : ''}
              </p>
              <button onClick={exportSwag}
                className="px-3 py-1 rounded-full text-xs font-bold border border-[#003e79] text-[#003e79] bg-white hover:bg-[#f0f7ff]">
                Export swag order
              </button>
            </div>
            {sizesPresent.length === 0 ? (
              <p className="text-sm text-[#86868b]">No sizes picked yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr>
                      <th className="text-left pr-8 py-1 text-[10px] font-bold text-[#86868b] uppercase tracking-wide">Size</th>
                      <th className="text-right pr-8 py-1 text-[10px] font-bold text-[#86868b] uppercase tracking-wide">Jerseys</th>
                      {hasGoalie && <th className="text-right pr-8 py-1 text-[10px] font-bold text-[#86868b] uppercase tracking-wide whitespace-nowrap">Goalie cut</th>}
                      <th className="text-right py-1 text-[10px] font-bold text-[#86868b] uppercase tracking-wide">Tees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizesPresent.map(sz => (
                      <tr key={sz} className="border-t border-[#f0f0f2]">
                        <td className="pr-8 py-1 font-semibold text-[#1d1d1f] whitespace-nowrap">{sz}</td>
                        <td className="pr-8 py-1 text-right font-bold text-[#003e79]">{reg[sz] || <span className="font-normal text-[#d2d2d7]">-</span>}</td>
                        {hasGoalie && <td className="pr-8 py-1 text-right font-bold text-[#003e79]">{gk[sz] || <span className="font-normal text-[#d2d2d7]">-</span>}</td>}
                        <td className="py-1 text-right font-bold text-[#003e79]">{ts[sz] || <span className="font-normal text-[#d2d2d7]">-</span>}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-[#e8e8ed]">
                      <td className="pr-8 py-1 text-[10px] font-bold text-[#86868b] uppercase tracking-wide">Total</td>
                      <td className="pr-8 py-1 text-right font-black text-[#003e79]">{sum(reg)}</td>
                      {hasGoalie && <td className="pr-8 py-1 text-right font-black text-[#003e79]">{sum(gk)}</td>}
                      <td className="py-1 text-right font-black text-[#003e79]">{sum(ts)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {missing > 0 && <p className="text-xs font-semibold text-amber-600 mt-1.5">{missing} player{missing !== 1 ? 's' : ''} still missing a size</p>}
            {(() => {
              return (
                <div className={`mt-3 pt-3 border-t ${allEmailed ? 'border-emerald-200' : 'border-[#f0f0f2]'}`}>
                  <p className="text-[11px] font-bold text-[#86868b] uppercase tracking-widest mb-2">Sizes email</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                      placeholder="you@email.com"
                      className="border border-[#e0e0e5] rounded-lg px-3 py-1.5 text-sm w-52 focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                    <button onClick={sendSizesTest} disabled={sizesBusy}
                      className="px-4 py-1.5 rounded-full text-sm font-semibold border border-[#003e79] text-[#003e79] hover:bg-[#f0f7ff] disabled:opacity-50">
                      Send me a test
                    </button>
                    {unsent > 0 && (
                      <button onClick={() => sendSizesBlast(unsent)} disabled={sizesBusy}
                        className="px-4 py-1.5 rounded-full text-sm font-semibold bg-[#003e79] text-white hover:bg-[#00315f] disabled:opacity-50">
                        {`Approve + email ${unsent} famil${unsent === 1 ? 'y' : 'ies'}`}
                      </button>
                    )}
                  </div>
                  {sizesMsg && <p className="text-xs font-semibold text-[#0a6ebd] mt-2">{sizesMsg}</p>}
                  <p className="text-[11px] text-[#86868b] mt-1.5">
                    The test uses a real player so every link works - the size form, the social graphic, and the balance button. The real send skips anyone already emailed.
                  </p>
                </div>
              );
            })()}
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search player, parent, team, email, code..."
            className="border border-[#e0e0e5] rounded-full pl-4 pr-8 py-1.5 text-sm w-72 bg-white focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]/40 outline-none" />
          {q && (
            <button onClick={() => setQ('')} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#e8e8ed] text-[#6e6e73] text-[11px] font-bold leading-none hover:bg-[#d2d2d7]">
              ×
            </button>
          )}
        </div>
        {(['all', 'registered', 'pending', 'requests', 'code_sent', 'waitlist', 'incomplete', 'denied'] as const).map(fk => (
          <button key={fk} onClick={() => setFilter(fk)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition ${filter === fk ? 'bg-[#003e79] text-white border-[#003e79]' : 'bg-white text-[#3d3d3d] border-[#e8e8ed] hover:border-[#003e79]/40'}`}>
            {fk === 'all' ? 'All' : fk === 'code_sent' ? 'Code Sent' : fk === 'waitlist' ? 'Goalie Waitlist' : fk === 'pending' ? 'Needs Approval' : fk[0].toUpperCase() + fk.slice(1)} ({counts[fk] || 0})
          </button>
        ))}
      </div>

      {/* Team-building scoreboard: with a division selected, show each
          team's size and position split plus who is still unassigned */}
      {divFilter && loaded && (() => {
        const paidDiv = rows.filter(r => isPaid(r) && divisionOf(r.birth_year) === divFilter);
        if (paidDiv.length === 0) return null;
        const g: Record<string, { n: number; F: number; D: number; G: number }> = {};
        let un = 0;
        for (const r of paidDiv) {
          const t = r.assigned_team;
          if (!t) { un++; continue; }
          const a = (g[t] = g[t] || { n: 0, F: 0, D: 0, G: 0 });
          a.n++;
          const pk = posOf(r.position);
          if (pk === 'F' || pk === 'D' || pk === 'G') (a as any)[pk]++;
        }
        return (
          <div className="flex flex-wrap items-center gap-2 mb-4 -mt-1">
            <span className="text-[11px] font-bold text-[#86868b] uppercase tracking-widest">{divFilter} teams</span>
            {Object.entries(g).sort((a, b) => a[0].localeCompare(b[0])).map(([t, a]) => (
              <span key={t} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#f0f7ff] text-[#0a6ebd] border border-[#bfe0f5]">
                {t}: {a.n}<span className="font-semibold text-[#6e9fc0]"> · F{a.F} D{a.D} G{a.G}</span>
              </span>
            ))}
            {un > 0 && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Unassigned: {un}
              </span>
            )}
            {Object.keys(g).length === 0 && (
              <span className="text-[11px] text-[#86868b] font-semibold">no teams yet - use the Team dropdown on any paid player to start one</span>
            )}
          </div>
        );
      })()}

      {!loaded ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-10 text-center text-sm text-[#86868b]">
          {rows.length === 0 ? 'No invite requests yet.' : divFilter ? `No ${divFilter} players with that status.` : 'Nothing with that status.'}
        </div>
      ) : (
        <>
        <Ic.Legend />
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-x-auto">
          <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="border-b border-[#e8e8ed] bg-[#f8f8fa] text-left">
                <th className="px-4 py-2.5 text-[11px] font-bold text-[#86868b] uppercase">Player</th>
                <th className="px-2 py-2.5 text-[11px] font-bold text-[#86868b] uppercase hidden sm:table-cell">Year</th>
                <th className="px-2 py-2.5 text-[11px] font-bold text-[#86868b] uppercase text-center">Paid</th>
                <th className="px-2 py-2.5 text-[11px] font-bold text-[#86868b] uppercase text-center">In</th>
                <th className="px-2 py-2.5 text-[11px] font-bold text-[#86868b] uppercase text-center">Star</th>
                <th className="px-2 py-2.5 text-[11px] font-bold text-[#86868b] uppercase text-center">Sizes</th>
                <th className="px-2 py-2.5 text-[11px] font-bold text-[#86868b] uppercase hidden sm:table-cell">Team</th>
                <th className="px-4 py-2.5 text-[11px] font-bold text-[#86868b] uppercase text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const st = String(r.status);
                const paid = r.amount_paid_cents || 0;
                const isIn = st === 'approved' && paid > 0;
                const isOpen = openRow === r.id;
                const chip = chipFor(r);
                return (
                <React.Fragment key={r.id}>
                <tr onClick={() => setOpenRow(isOpen ? null : r.id)}
                  className={`border-b border-[#f5f5f7] cursor-pointer transition ${isOpen ? 'bg-[#f0f7ff]' : isIn ? 'bg-emerald-50/40 hover:bg-emerald-50' : 'hover:bg-[#fafafa]'}`}>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-[#1d1d1f] leading-tight">{r.player_name}{r.jersey_number ? ` #${r.jersey_number}` : ''}</p>
                    <p className="text-[11px] text-[#86868b] truncate max-w-[240px]">{r.team_name}</p>
                  </td>
                  <td className="px-2 py-2.5 text-[#6e6e73] hidden sm:table-cell">{String(r.birth_year || '').trim() || '-'}</td>
                  <td className="px-2 py-2.5 text-center">
                    {paid >= 55000 ? <Ic.Check title="Paid in full" />
                      : paid > 0 ? <Ic.Dollar title={`$${((55000 - paid) / 100).toLocaleString()} balance due`} />
                      : st === 'pending_payment' ? <Ic.X title="Checkout abandoned" />
                      : <Ic.Dash title="No payment - invite request" />}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {st === 'approved' ? <Ic.Check title="Approved - they are in" />
                      : st === 'pending' ? <Ic.Clock title="Paid - needs your approval" />
                      : st === 'invite_approved' ? <Ic.Mail title="Code sent - not registered yet" />
                      : st === 'invite_requested' ? <Ic.Clock title="Invite request - needs review" />
                      : st === 'goalie_waitlist' ? <Ic.Clock title="Goalie waitlist - waiting for a spot to open" />
                      : (st === 'denied' || st === 'invite_denied') ? <Ic.X title="Denied" />
                      : <Ic.Dash title="Not in" />}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {r.star_verified ? <Ic.Check title="Star verified on a scoresheet" />
                      : (fromRequest(r) || fromWaitlist(r)) && r.invite_code ? <Ic.Key title={`Invite code ${r.invite_code}`} />
                      : fromWaitlist(r) ? <Ic.Circle title="Goalie waitlist - no code yet" />
                      : fromRequest(r) ? <Ic.Circle title="Invite request - no code yet" />
                      : <Ic.Alert title="Star not found on scoresheets" />}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {paid > 0
                      ? (r.jersey_size && r.tee_size ? <Ic.Check title={`Jersey ${r.jersey_size} - Tee ${r.tee_size}`} />
                        : <Ic.Clock title="Waiting on sizes" />)
                      : <Ic.Dash title="Sizes collected after payment" />}
                  </td>
                  <td className="px-2 py-2.5 hidden sm:table-cell" onClick={e => e.stopPropagation()}>
                    {isPaid(r) ? (
                      <select value={r.assigned_team || ''} disabled={busy === r.id}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === '__new__') {
                            const name = window.prompt(`New ${divisionOf(r.birth_year)} team name:`);
                            if (name && name.trim()) assignTeam(r.id, name.trim());
                            e.target.value = r.assigned_team || '';
                          } else assignTeam(r.id, v || null);
                        }}
                        className={`border rounded-lg px-1.5 py-1 text-[11px] font-bold bg-white max-w-[130px] outline-none ${r.assigned_team ? 'border-[#bfe0f5] text-[#0a6ebd]' : 'border-[#e0e0e5] text-[#86868b]'}`}>
                        <option value="">No team</option>
                        {(teamsByDiv[divisionOf(r.birth_year)] || []).map(t => <option key={t} value={t}>{t}</option>)}
                        <option value="__new__">+ New team...</option>
                      </select>
                    ) : <span className="text-[#d2d2d7] text-xs">-</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    {st === 'pending' && (<>
                      <button onClick={() => setStatus(r.id, 'approved')} disabled={busy === r.id}
                        className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-[11px] font-bold hover:bg-green-700 transition disabled:opacity-50 mr-1.5">
                        Approve + Email
                      </button>
                      <button onClick={() => setStatus(r.id, 'denied')} disabled={busy === r.id}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-50 transition disabled:opacity-50">
                        Deny
                      </button>
                    </>)}
                    {st === 'invite_requested' && (<>
                      <button onClick={() => setStatus(r.id, 'invite_approved')} disabled={busy === r.id}
                        className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-[11px] font-bold hover:bg-green-700 transition disabled:opacity-50 mr-1.5">
                        Send Code
                      </button>
                      <button onClick={() => setStatus(r.id, 'invite_denied')} disabled={busy === r.id}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-50 transition disabled:opacity-50">
                        Deny
                      </button>
                    </>)}
                    {st === 'goalie_waitlist' && (<>
                      <button onClick={() => setStatus(r.id, 'invite_approved')} disabled={busy === r.id}
                        className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-[11px] font-bold hover:bg-green-700 transition disabled:opacity-50 mr-1.5">
                        Spot Opened + Send Code
                      </button>
                      <button onClick={() => setStatus(r.id, 'invite_denied')} disabled={busy === r.id}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-50 transition disabled:opacity-50">
                        Remove
                      </button>
                    </>)}
                    {!['pending', 'invite_requested', 'goalie_waitlist'].includes(st) && (
                      <button onClick={() => setOpenRow(isOpen ? null : r.id)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-[#6e6e73] bg-[#f5f5f7] hover:bg-[#e8e8ed] hover:text-[#1d1d1f] transition">
                        {isOpen ? 'Close' : 'Details'}
                      </button>
                    )}
                  </td>
                </tr>
                {isOpen && (
                <tr className="border-b border-[#f0f0f3] bg-[#fafbfc]">
                  <td colSpan={8} className="px-5 py-4">
                    {editRow === r.id ? (
                      <div className="w-full">
                        <p className="text-[11px] font-bold text-[#86868b] uppercase tracking-widest mb-2">Edit registration - {r.player_name}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-3xl">
                          {([['player_name', 'Player name'], ['birth_year', 'Birth year'], ['team_name', 'Team'], ['parent_name', 'Parent name'], ['email', 'Parent email'], ['phone', 'Phone'], ['jersey_name', 'Name on jersey'], ['jersey_number_request', 'Jersey #'], ['jersey_size', 'Jersey size'], ['tee_size', 'Tee size']] as const).map(([k, label]) => (
                            <label key={k} className="block">
                              <span className="block text-[10px] font-bold text-[#86868b] uppercase tracking-wide mb-0.5">{label}</span>
                              <input value={editForm[k] || ''} onChange={e => setEditForm((f: any) => ({ ...f, [k]: e.target.value }))}
                                className="w-full border border-[#e0e0e5] rounded-lg px-2.5 py-1.5 text-sm bg-white focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                            </label>
                          ))}
                          <label className="block">
                            <span className="block text-[10px] font-bold text-[#86868b] uppercase tracking-wide mb-0.5">Position</span>
                            <select value={editForm.position || ''} onChange={e => setEditForm((f: any) => ({ ...f, position: e.target.value }))}
                              className="w-full border border-[#e0e0e5] rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-[#003e79]/20 outline-none">
                              {!['Forward', 'Defense', 'Goalie', ''].includes(editForm.position || '') && <option value={editForm.position}>{editForm.position}</option>}
                              <option value="">-</option>
                              <option value="Forward">Forward</option>
                              <option value="Defense">Defense</option>
                              <option value="Goalie">Goalie</option>
                            </select>
                          </label>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <button onClick={() => saveEdit(r.id)} disabled={editBusy}
                            className="px-4 py-1.5 rounded-lg bg-[#003e79] text-white text-[11px] font-bold hover:bg-[#00315f] transition disabled:opacity-50">
                            Save changes
                          </button>
                          <button onClick={() => setEditRow(null)} disabled={editBusy}
                            className="px-3 py-1.5 rounded-lg bg-white border border-[#e8e8ed] text-[#6e6e73] text-[11px] font-bold hover:border-[#003e79]/40 transition disabled:opacity-50">
                            Cancel
                          </button>
                          {editMsg && <span className="text-xs font-semibold text-red-600">{editMsg}</span>}
                        </div>
                        <p className="text-[11px] text-[#86868b] mt-2">Saves straight to the registration - no emails go out. Jersey sizes read like &quot;Youth L&quot; or &quot;Adult M&quot; (goalie jerseys: &quot;Goalie Cut Adult M&quot;).</p>
                      </div>
                    ) : (
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1.5 text-sm min-w-[240px]">
                        <span className={`inline-block text-[11px] font-bold border rounded-full px-2.5 py-0.5 uppercase ${chip.cls}`}>{chip.label}</span>
                        <p className="text-[#3d3d3d]">{r.team_name}{r.birth_year ? ` · ${r.birth_year}` : ''}{r.position ? ` · ${r.position}` : ''}</p>
                        {(r.jersey_size || r.tee_size || r.jersey_number_request || r.jersey_name) ? (
                          <p className="text-xs font-semibold text-[#0a6ebd]">
                            On the jersey: {(r.jersey_name || '(no name)')}{r.jersey_number_request ? ` #${r.jersey_number_request}` : ''} · {r.jersey_size ? `Jersey ${r.jersey_size}` : 'Jersey size missing'} · {r.tee_size ? `Tee ${r.tee_size}` : 'Tee size missing'}
                          </p>
                        ) : ((r.amount_paid_cents || 0) > 0 && <p className="text-xs font-semibold text-amber-600">Sizes not submitted yet</p>)}
                        {fromWaitlist(r)
                          ? <p className="text-xs text-orange-700 font-semibold">Joined the goalie waitlist{r.invite_code ? <> · code <b className="tracking-widest">{r.invite_code}</b></> : ''}{isIn ? ' · now registered' : ''}</p>
                          : fromRequest(r)
                          ? <p className="text-xs text-[#0077b0] font-semibold">Came in as an invite request{r.invite_code ? <> · code <b className="tracking-widest">{r.invite_code}</b></> : ''}{isIn ? ' · now registered' : ''}</p>
                          : <p className="text-xs text-[#6e6e73]">Star earned at: <b>{r.star_event_name || r.star_event_id}</b></p>}
                        {r.notes && String(r.notes).startsWith('Invite request') && (
                          <p className="text-xs text-[#3d3d3d] italic">{String(r.notes).replace('Invite request: ', '').replace('Invite request (no star)', '')}</p>
                        )}
                        <p className="text-xs text-[#6e6e73]">{r.parent_name} · {r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
                        <p className="text-[11px] text-[#86868b]">Requested {String(r.created_at || '').slice(0, 16).replace('T', ' ')}</p>
                        {(!!r.paid_at || ['approved', 'pending'].includes(st)) && (
                          <a href={`https://uht.chad-157.workers.dev/api/lights-out/share/${r.id}.png`} target="_blank" rel="noreferrer"
                            className="inline-block text-xs text-[#0077b0] font-semibold underline underline-offset-2">
                            View social graphic
                          </a>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <button onClick={() => startEdit(r)}
                          className="px-3 py-1.5 rounded-lg bg-white border border-[#003e79] text-[#003e79] text-[11px] font-bold hover:bg-[#f0f7ff] transition">
                          Edit details
                        </button>
                        {st === 'approved' && (<>
                          <button onClick={() => setStatus(r.id, 'denied')} disabled={busy === r.id}
                            className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-50 transition disabled:opacity-50">
                            Deny
                          </button>
                          <button onClick={() => setStatus(r.id, 'pending')} disabled={busy === r.id}
                            className="px-3 py-1.5 rounded-lg bg-white border border-[#e8e8ed] text-[#6e6e73] text-[11px] font-bold hover:border-[#003e79]/40 transition disabled:opacity-50">
                            Back to Pending
                          </button>
                        </>)}
                        {st === 'denied' && (
                          <button onClick={() => setStatus(r.id, 'pending')} disabled={busy === r.id}
                            className="px-3 py-1.5 rounded-lg bg-white border border-[#e8e8ed] text-[#6e6e73] text-[11px] font-bold hover:border-[#003e79]/40 transition disabled:opacity-50">
                            Back to Pending
                          </button>
                        )}
                        {st === 'invite_approved' && (
                          <button onClick={() => setStatus(r.id, 'invite_denied')} disabled={busy === r.id}
                            className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-50 transition disabled:opacity-50">
                            Pull the code
                          </button>
                        )}
                        {st === 'invite_denied' && (
                          <button onClick={() => setStatus(r.id, fromWaitlist(r) ? 'goalie_waitlist' : 'invite_requested')} disabled={busy === r.id}
                            className="px-3 py-1.5 rounded-lg bg-white border border-[#e8e8ed] text-[#6e6e73] text-[11px] font-bold hover:border-[#003e79]/40 transition disabled:opacity-50">
                            {fromWaitlist(r) ? 'Back to waitlist' : 'Back to review'}
                          </button>
                        )}
                        {st === 'invite_approved' && fromWaitlist(r) && (
                          <span className="text-[11px] text-[#86868b] self-center">Code sent off the goalie waitlist</span>
                        )}
                      </div>
                    </div>
                    )}
                  </td>
                </tr>
                )}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

/* Small SVG status icons - consistent stroke style, meaning on hover */
const icCls = 'w-4 h-4 inline-block';
const Ic = {
  Check: ({ title }: { title: string }) => (
    <span title={title}><svg className={`${icCls} text-emerald-600`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg></span>
  ),
  Clock: ({ title }: { title: string }) => (
    <span title={title}><svg className={`${icCls} text-amber-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
  ),
  X: ({ title }: { title: string }) => (
    <span title={title}><svg className={`${icCls} text-red-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></span>
  ),
  Alert: ({ title }: { title: string }) => (
    <span title={title}><svg className={`${icCls} text-red-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L2 20h20L12 3z" /><path d="M12 10v4" /><path d="M12 17.5v.5" /></svg></span>
  ),
  Dollar: ({ title }: { title: string }) => (
    <span title={title}><svg className={`${icCls} text-amber-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M12 2v20" /><path d="M17 6.5c-1-1.5-2.7-2-5-2-2.8 0-5 1.2-5 3.5s2.4 3 5 3.5 5 1.2 5 3.5-2.2 3.5-5 3.5c-2.3 0-4-.5-5-2" /></svg></span>
  ),
  Mail: ({ title }: { title: string }) => (
    <span title={title}><svg className={`${icCls} text-[#0077b0]`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg></span>
  ),
  Key: ({ title }: { title: string }) => (
    <span title={title}><svg className={`${icCls} text-[#0077b0]`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="4" /><path d="M11 12L20 3" /><path d="M16 7l3 3" /></svg></span>
  ),
  Circle: ({ title }: { title: string }) => (
    <span title={title}><svg className={`${icCls} text-[#0077b0]`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><circle cx="12" cy="12" r="7" /></svg></span>
  ),
  Dash: ({ title }: { title: string }) => (
    <span title={title}><svg className={`${icCls} text-[#c7c7cc]`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round"><path d="M6 12h12" /></svg></span>
  ),
  Legend: () => (
    <p className="text-[11px] text-[#86868b] mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="flex items-center gap-1"><Ic.Check title="" /> done</span>
      <span className="flex items-center gap-1"><Ic.Clock title="" /> waiting</span>
      <span className="flex items-center gap-1"><Ic.Dollar title="" /> balance due</span>
      <span className="flex items-center gap-1"><Ic.Alert title="" /> star not found</span>
      <span className="flex items-center gap-1"><Ic.Key title="" /> invite code (hover to see it)</span>
      <span className="flex items-center gap-1"><Ic.Circle title="" /> request, no code yet</span>
      <span className="flex items-center gap-1"><Ic.Mail title="" /> code sent</span>
      <span className="flex items-center gap-1"><Ic.X title="" /> no</span>
      <span>- hover any icon for details, click a row to expand</span>
    </p>
  ),
};
