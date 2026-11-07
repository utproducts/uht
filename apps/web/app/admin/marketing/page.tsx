'use client';

/*
 * Marketing dashboard — what the automated marketing machine is doing and
 * how it is performing. First resident: the re-engagement (comeback) drip.
 * Daily e1 cohorts let Chad compare which send days earn the best opens,
 * clicks, and redemptions.
 */

import { useState, useEffect } from 'react';

const API = 'https://uht.chad-157.workers.dev';

function authHeaders(): Record<string, string> {
  return {
    ...(typeof window !== 'undefined' && localStorage.getItem('uht_token')
      ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` }
      : {}),
  };
}

interface Campaign { id: string; name: string; total_sent: number; total_delivered: number; total_opened: number; total_clicked: number; }
interface Cohort { day: string; cohort_size: number; redeemed: number; returned: number; got_e2: number; got_e3: number; }
interface Daily { campaign_id: string; day: string; sent: number; opened: number; clicked: number; bounced: number; }
interface Redemption { code: string; team_name: string; used_at: string; amount_cents: number; reg_team: string; }

const EMAIL_LABEL: Record<string, string> = {
  reengage2026e1: 'Email 1 - check-in',
  reengage2026e2: 'Email 2 - $100 offer',
  reengage2026e3: 'Email 3 - last chance',
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Waiting to start', cls: 'bg-[#e8e8ed] text-[#6e6e73]' },
  active: { label: 'In sequence', cls: 'bg-blue-100 text-blue-700' },
  redeemed: { label: 'Redeemed code', cls: 'bg-green-100 text-green-700' },
  returned: { label: 'Came back', cls: 'bg-emerald-100 text-emerald-700' },
  unsubscribed: { label: 'Unsubscribed', cls: 'bg-amber-100 text-amber-700' },
};

function dayName(d: string): string {
  const dt = new Date(d + 'T12:00:00Z');
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function pct(part: number, whole: number): string {
  if (!whole) return '-';
  return Math.round((part / whole) * 100) + '%';
}

export default function MarketingPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/api/analytics/reports/marketing`, { headers: authHeaders() })
      .then(r => r.json())
      .then(json => {
        if (json.success) setData(json.data);
        else setError(json.error || 'Could not load marketing data');
      })
      .catch(() => setError('Could not load marketing data'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" /></div>;
  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;

  const campaigns: Campaign[] = data?.campaigns || [];
  const statuses: { status: string; n: number }[] = data?.statuses || [];
  const cohorts: Cohort[] = data?.cohorts || [];
  const daily: Daily[] = data?.daily || [];
  const redemptions: Redemption[] = data?.redemptions || [];
  const recent: any[] = data?.recent || [];

  const totalTargets = statuses.reduce((s, x) => s + x.n, 0);
  const recovered = redemptions.reduce((s, r) => s + (r.amount_cents || 0), 0);

  // Open/click rates per e1-cohort day, from the daily email_sends stats
  const dailyByDay = new Map<string, { sent: number; opened: number; clicked: number }>();
  for (const d of daily) {
    const cur = dailyByDay.get(d.day) || { sent: 0, opened: 0, clicked: 0 };
    cur.sent += d.sent; cur.opened += d.opened; cur.clicked += d.clicked;
    dailyByDay.set(d.day, cur);
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#1d1d1f]">Marketing</h1>
        <p className="text-sm text-[#86868b] mt-0.5">Re-engagement campaign - $100 comeback codes from Johnny, sent in daily batches</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-[#e8e8ed] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">Target teams</p>
          <p className="text-2xl font-bold text-[#1d1d1f]">{totalTargets.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#e8e8ed] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">Codes redeemed</p>
          <p className="text-2xl font-bold text-green-700">{redemptions.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#e8e8ed] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">Revenue recovered</p>
          <p className="text-2xl font-bold text-green-700">${(recovered / 100).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#e8e8ed] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">Came back on their own</p>
          <p className="text-2xl font-bold text-emerald-700">{statuses.find(s => s.status === 'returned')?.n || 0}</p>
        </div>
      </div>

      {/* Pipeline statuses */}
      <div className="flex flex-wrap gap-2 mb-6">
        {statuses.map(s => {
          const m = STATUS_LABEL[s.status] || { label: s.status, cls: 'bg-[#e8e8ed] text-[#6e6e73]' };
          return <span key={s.status} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${m.cls}`}>{m.label}: {s.n}</span>;
        })}
      </div>

      {/* Per-email performance */}
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 mb-6">
        <h2 className="text-sm font-semibold text-[#1d1d1f] mb-3">Email performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-[#86868b] border-b border-[#e8e8ed]">
              <th className="py-2 pr-4">Email</th><th className="py-2 pr-4">Sent</th><th className="py-2 pr-4">Delivered</th><th className="py-2 pr-4">Opened</th><th className="py-2 pr-4">Clicked</th><th className="py-2">Open rate</th>
            </tr></thead>
            <tbody>
              {campaigns.map(cp => (
                <tr key={cp.id} className="border-b border-[#f5f5f7]">
                  <td className="py-2.5 pr-4 font-medium text-[#1d1d1f]">{EMAIL_LABEL[cp.id] || cp.name}</td>
                  <td className="py-2.5 pr-4">{cp.total_sent}</td>
                  <td className="py-2.5 pr-4">{cp.total_delivered}</td>
                  <td className="py-2.5 pr-4">{cp.total_opened}</td>
                  <td className="py-2.5 pr-4">{cp.total_clicked}</td>
                  <td className="py-2.5 font-semibold">{pct(cp.total_opened, cp.total_sent)}</td>
                </tr>
              ))}
              {campaigns.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-[#86868b]">No sends yet - first batch goes out at 10am CT</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily cohorts — which days work */}
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 mb-6">
        <h2 className="text-sm font-semibold text-[#1d1d1f] mb-1">Daily cohorts</h2>
        <p className="text-xs text-[#86868b] mb-3">Each row is one day's batch of first emails - compare which days earn opens and redemptions</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-[#86868b] border-b border-[#e8e8ed]">
              <th className="py-2 pr-4">Day</th><th className="py-2 pr-4">Teams</th><th className="py-2 pr-4">Opens (day)</th><th className="py-2 pr-4">Clicks (day)</th><th className="py-2 pr-4">Redeemed</th><th className="py-2">Came back</th>
            </tr></thead>
            <tbody>
              {cohorts.map(co => {
                const d = dailyByDay.get(co.day);
                return (
                  <tr key={co.day} className="border-b border-[#f5f5f7]">
                    <td className="py-2.5 pr-4 font-medium text-[#1d1d1f]">{dayName(co.day)}</td>
                    <td className="py-2.5 pr-4">{co.cohort_size}</td>
                    <td className="py-2.5 pr-4">{d ? `${d.opened} (${pct(d.opened, d.sent)})` : '-'}</td>
                    <td className="py-2.5 pr-4">{d ? d.clicked : '-'}</td>
                    <td className="py-2.5 pr-4 text-green-700 font-semibold">{co.redeemed || 0}</td>
                    <td className="py-2.5 text-emerald-700">{co.returned || 0}</td>
                  </tr>
                );
              })}
              {cohorts.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-[#86868b]">Cohorts appear as daily batches start sending</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Redemptions */}
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5">
          <h2 className="text-sm font-semibold text-[#1d1d1f] mb-3">Code redemptions</h2>
          {redemptions.length === 0 && <p className="text-sm text-[#86868b]">None yet</p>}
          <div className="space-y-2">
            {redemptions.slice(0, 15).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-[#f5f5f7] pb-2">
                <div className="min-w-0">
                  <p className="font-medium text-[#1d1d1f] truncate">{r.reg_team || r.team_name}</p>
                  <p className="text-xs text-[#86868b]">{r.code} - {r.used_at?.slice(0, 10)}</p>
                </div>
                <span className="text-green-700 font-semibold shrink-0">${((r.amount_cents || 0) / 100).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5">
          <h2 className="text-sm font-semibold text-[#1d1d1f] mb-3">Recent activity</h2>
          {recent.length === 0 && <p className="text-sm text-[#86868b]">Nothing yet - the first daily batch sends at 10am CT</p>}
          <div className="space-y-1.5">
            {recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs border-b border-[#f5f5f7] pb-1.5">
                <span className="text-[#1d1d1f] truncate mr-2">{r.email}</span>
                <span className="text-[#86868b] shrink-0">{EMAIL_LABEL[r.campaign_id]?.split(' - ')[0]} - {r.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
