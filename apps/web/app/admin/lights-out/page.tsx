'use client';

/*
  ADMIN: LIGHTS OUT INVITATIONAL - invite requests from /lights-out.
  Every request lands pending; the star claim is pre-checked against
  game_three_stars (green check = found on a scoresheet). Approving
  sends the "you're in" email to the parent.
*/

import { useEffect, useState } from 'react';

const API = 'https://uht.chad-157.workers.dev/api/lights-out';

function hdrs(extra?: Record<string, string>): Record<string, string> {
  return {
    'X-Dev-Bypass': 'true',
    ...(typeof window !== 'undefined' && localStorage.getItem('uht_token') ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` } : {}),
    ...extra,
  };
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  pending_payment: 'bg-gray-50 text-gray-500 border-gray-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  denied: 'bg-red-50 text-red-600 border-red-200',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'PAID - AWAITING APPROVAL',
  pending_payment: 'CHECKOUT NOT COMPLETED',
  approved: 'APPROVED',
  denied: 'DENIED',
};

export default function LightsOutAdminPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'denied'>('all');

  const load = async () => {
    try {
      const res = await fetch(`${API}/admin/requests`, { headers: hdrs() });
      const j = await res.json();
      if (j.success) setRows(j.data || []);
    } catch {}
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);

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

  const counts = { all: rows.length, pending: 0, approved: 0, denied: 0 } as Record<string, number>;
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  const visible = rows.filter(r => filter === 'all' || r.status === filter);

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <h1 className="text-2xl font-bold text-[#1d1d1f]">Lights Out Invitational</h1>
      <p className="text-sm text-[#6e6e73] mt-1 mb-5">
        Invite requests from the Lights Out page. The star claim is checked against the scoresheets automatically -
        approving sends the confirmation email to the family.
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        {(['all', 'pending', 'approved', 'denied'] as const).map(fk => (
          <button key={fk} onClick={() => setFilter(fk)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition ${filter === fk ? 'bg-[#003e79] text-white border-[#003e79]' : 'bg-white text-[#3d3d3d] border-[#e8e8ed] hover:border-[#003e79]/40'}`}>
            {fk === 'all' ? 'All' : fk[0].toUpperCase() + fk.slice(1)} ({counts[fk] || 0})
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-10 text-center text-sm text-[#86868b]">
          {rows.length === 0 ? 'No invite requests yet.' : 'Nothing with that status.'}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-bold text-[#1d1d1f]">{r.player_name}{r.jersey_number ? ` #${r.jersey_number}` : ''}</p>
                    <span className={`text-[11px] font-bold border rounded-full px-2.5 py-0.5 uppercase ${STATUS_STYLES[r.status] || STATUS_STYLES.pending}`}>{STATUS_LABELS[r.status] || r.status}</span>
                    {!!r.paid_at && (
                      <span className="text-[11px] font-bold border rounded-full px-2.5 py-0.5 bg-green-50 text-green-700 border-green-200">
                        PAID ${((r.amount_paid_cents || 0) / 100).toLocaleString()}{r.payment_plan === 'deposit' ? ' DEPOSIT' : ' IN FULL'}
                      </span>
                    )}
                    {!!r.paid_at && r.payment_plan === 'deposit' && (r.amount_paid_cents || 0) < 55000 && (
                      <span className="text-[11px] font-bold border rounded-full px-2.5 py-0.5 bg-blue-50 text-blue-700 border-blue-200">
                        ${((55000 - (r.amount_paid_cents || 0)) / 100).toLocaleString()} BALANCE DUE
                      </span>
                    )}
                    <span className={`text-[11px] font-bold rounded-full px-2.5 py-0.5 border ${r.star_verified ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                      {r.star_verified ? 'STAR VERIFIED' : 'STAR NOT FOUND'}
                    </span>
                  </div>
                  <p className="text-sm text-[#3d3d3d] mt-1">{r.team_name}{r.birth_year ? ` · ${r.birth_year}` : ''}{r.position ? ` · ${r.position}` : ''}</p>
                  <p className="text-xs text-[#6e6e73] mt-1">Star earned at: <b>{r.star_event_name || r.star_event_id}</b></p>
                  <p className="text-xs text-[#6e6e73] mt-0.5">{r.parent_name} · {r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
                  <p className="text-[11px] text-[#86868b] mt-1">Requested {String(r.created_at || '').slice(0, 16).replace('T', ' ')}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {r.status !== 'approved' && (
                    <button onClick={() => setStatus(r.id, 'approved')} disabled={busy === r.id}
                      className="px-4 py-2 rounded-xl bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition disabled:opacity-50">
                      Approve + Email
                    </button>
                  )}
                  {r.status !== 'denied' && (
                    <button onClick={() => setStatus(r.id, 'denied')} disabled={busy === r.id}
                      className="px-4 py-2 rounded-xl bg-white border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition disabled:opacity-50">
                      Deny
                    </button>
                  )}
                  {r.status !== 'pending' && (
                    <button onClick={() => setStatus(r.id, 'pending')} disabled={busy === r.id}
                      className="px-4 py-2 rounded-xl bg-white border border-[#e8e8ed] text-[#6e6e73] text-xs font-bold hover:border-[#003e79]/40 transition disabled:opacity-50">
                      Back to Pending
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
