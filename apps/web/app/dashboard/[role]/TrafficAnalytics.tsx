'use client';

import { useState, useEffect } from 'react';

// Analytics section for the admin dashboard: website page views and app
// usage per day / week / month, from our own tracker (user_activity_log).
// Admin pages are excluded server-side so staff browsing doesn't count.

const API = 'https://uht.chad-157.workers.dev/api';

type WebRow = { bucket: string; views: number; visitors: number };
type AppRow = { bucket: string; users: number; sessions: number };

type Traffic = {
  web: { daily: WebRow[]; weekly: WebRow[]; monthly: WebRow[] };
  app: { daily: AppRow[]; weekly: AppRow[]; monthly: AppRow[]; tracked_since?: string };
};

type Period = 'day' | 'week' | 'month';

// Local-date helpers (buckets come back as Central-time dates)
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(ymd(x));
  }
  return out;
}

function lastNWeeks(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(monday);
    x.setDate(monday.getDate() - i * 7);
    out.push(ymd(x));
  }
  return out;
}

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortLabel(bucket: string, period: Period): string {
  if (period === 'month') {
    const [y, m] = bucket.split('-').map(Number);
    return m === 1 ? `${MONTHS[0]} '${String(y).slice(2)}` : MONTHS[m - 1];
  }
  const [, m, d] = bucket.split('-').map(Number);
  return `${m}/${d}`;
}

function longLabel(bucket: string, period: Period): string {
  if (period === 'month') {
    const [y, m] = bucket.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  const [y, m, d] = bucket.split('-').map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return period === 'week' ? `Week of ${s.replace(/^\w+, /, '')}` : s;
}

export default function TrafficAnalytics() {
  const [data, setData] = useState<Traffic | null>(null);
  const [failed, setFailed] = useState(false);
  const [period, setPeriod] = useState<Period>('day');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uht_token') : null;
    fetch(`${API}/analytics/reports/traffic`, {
      headers: { 'X-Dev-Bypass': 'true', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: 'no-store',
    })
      .then(r => r.json())
      .then(j => { if (j?.success) setData(j.data); else setFailed(true); })
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 text-sm text-[#86868b]">Traffic stats are not available right now.</div>;
  }
  if (!data) {
    return <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6"><div className="animate-pulse h-32 bg-[#f0f0f2] rounded-xl" /></div>;
  }

  // Zero-fill each series onto a fixed axis so quiet days still show
  const axes: Record<Period, string[]> = {
    day: lastNDays(30),
    week: lastNWeeks(12),
    month: lastNMonths(12),
  };
  const webBy = (p: Period) => {
    const src = p === 'day' ? data.web.daily : p === 'week' ? data.web.weekly : data.web.monthly;
    const map = new Map(src.map(r => [r.bucket, r]));
    return axes[p].map(b => ({ bucket: b, views: map.get(b)?.views || 0, visitors: map.get(b)?.visitors || 0 }));
  };
  const appBy = (p: Period) => {
    const src = p === 'day' ? data.app.daily : p === 'week' ? data.app.weekly : data.app.monthly;
    const map = new Map(src.map(r => [r.bucket, r]));
    return axes[p].map(b => ({ bucket: b, users: map.get(b)?.users || 0 }));
  };

  const dayRows = webBy('day');
  const weekRows = webBy('week');
  const monthRows = webBy('month');
  const appDay = appBy('day');
  const appWeek = appBy('week');
  const appMonth = appBy('month');

  const today = dayRows[dayRows.length - 1];
  const thisWeek = weekRows[weekRows.length - 1];
  const thisMonth = monthRows[monthRows.length - 1];
  const appToday = appDay[appDay.length - 1]?.users || 0;
  const appThisWeek = appWeek[appWeek.length - 1]?.users || 0;
  const appThisMonth = appMonth[appMonth.length - 1]?.users || 0;
  const appHasData = appMonth.some(r => r.users > 0);

  const rows = period === 'day' ? dayRows : period === 'week' ? weekRows : monthRows;
  const appRows = period === 'day' ? appDay : period === 'week' ? appWeek : appMonth;
  const max = Math.max(1, ...rows.map(r => r.views));
  const appMax = Math.max(1, ...appRows.map(r => r.users));
  const labelEvery = period === 'day' ? 5 : period === 'week' ? 2 : 1;

  const tile = (label: string, value: number, sub: string) => (
    <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)] min-w-0">
      <p className="text-sm text-[#86868b] mb-1 truncate">{label}</p>
      <p className="text-2xl font-bold text-[#003e79]">{value.toLocaleString()}</p>
      <p className="text-xs text-[#86868b] mt-1 truncate">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {tile('Page Views Today', today?.views || 0, `${(today?.visitors || 0).toLocaleString()} visitors`)}
        {tile('Views This Week', thisWeek?.views || 0, `${(thisWeek?.visitors || 0).toLocaleString()} visitors`)}
        {tile('Views This Month', thisMonth?.views || 0, `${(thisMonth?.visitors || 0).toLocaleString()} visitors`)}
        {tile('App Users Today', appToday, 'signed in on the app')}
        {tile('App Users This Week', appThisWeek, 'signed in on the app')}
        {tile('App Users This Month', appThisMonth, 'signed in on the app')}
      </div>

      {/* Chart card */}
      <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-bold text-[#1d1d1f]">Website Page Views</p>
            <p className="text-xs text-[#86868b]">
              {period === 'day' ? 'Last 30 days' : period === 'week' ? 'Last 12 weeks' : 'Last 12 months'} · admin pages excluded
            </p>
          </div>
          <div className="flex rounded-lg border border-[#e8e8ed] overflow-hidden text-xs font-semibold">
            {(['day', 'week', 'month'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 capitalize ${period === p ? 'bg-[#003e79] text-white' : 'bg-white text-[#003e79] hover:bg-[#f5f8fb]'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-[2px] h-40">
          {rows.map(r => (
            <div
              key={r.bucket}
              className="flex-1 min-w-0 group relative flex items-end h-full"
              title={`${longLabel(r.bucket, period)}: ${r.views.toLocaleString()} views, ${r.visitors.toLocaleString()} visitors`}
            >
              <div
                className="w-full rounded-t bg-gradient-to-t from-[#003e79] to-[#0e7fb8] group-hover:to-[#00ccff] transition-colors"
                style={{ height: `${Math.max((r.views / max) * 100, r.views > 0 ? 2 : 0.8)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-[2px] mt-1">
          {rows.map((r, i) => (
            <div key={r.bucket} className="flex-1 min-w-0 text-center text-[9px] text-[#86868b] whitespace-nowrap overflow-visible">
              {i % labelEvery === 0 ? shortLabel(r.bucket, period) : ''}
            </div>
          ))}
        </div>

        {/* App usage, same axis */}
        <div className="mt-5 pt-4 border-t border-[#f0f0f2]">
          <p className="text-sm font-bold text-[#1d1d1f] mb-1">App Users</p>
          {appHasData ? (
            <>
              <div className="flex items-end gap-[2px] h-20">
                {appRows.map(r => (
                  <div
                    key={r.bucket}
                    className="flex-1 min-w-0 group relative flex items-end h-full"
                    title={`${longLabel(r.bucket, period)}: ${r.users.toLocaleString()} app users`}
                  >
                    <div
                      className="w-full rounded-t bg-[#0e7fb8]/80 group-hover:bg-[#00ccff] transition-colors"
                      style={{ height: `${Math.max((r.users / appMax) * 100, r.users > 0 ? 4 : 1)}%` }}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[#86868b] mt-2">Unique signed-in app users per {period}. Tracking started Nov 27, 2026, so earlier periods show zero.</p>
            </>
          ) : (
            <p className="text-xs text-[#86868b]">App usage tracking started Nov 27, 2026 — numbers build from today as people open the app.</p>
          )}
        </div>
      </div>
    </div>
  );
}
