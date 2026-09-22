'use client';

import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

function authHeaders(): Record<string, string> {
  return {
    'X-Dev-Bypass': 'true',
    ...(typeof window !== 'undefined' && localStorage.getItem('uht_token')
      ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` }
      : {}),
  };
}

interface AppStats {
  app_accounts: number;
  new_7d: number;
  new_30d: number;
  push_devices: number;
  ios_devices: number;
  android_devices: number;
  push_users: number;
  monthly: { month: string; signups: number }[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtMonth(m: string): string {
  const [y, mo] = m.split('-');
  return `${MONTH_NAMES[parseInt(mo, 10) - 1] || mo} ${y}`;
}

export default function AppUsersPage() {
  const [stats, setStats] = useState<AppStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/users/admin/app-stats`, { headers: authHeaders() })
      .then(r => r.json())
      .then((j: any) => { if (j.success) setStats(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const maxSignups = Math.max(1, ...(stats?.monthly || []).map(m => m.signups));

  return (
    <div className="p-6 sm:p-8 max-w-[1100px] mx-auto">
      <h1 className="text-2xl font-bold text-[#1d1d1f] mb-1">App Users</h1>
      <p className="text-sm text-[#6e6e73] mb-6">People who have created their account through the UHT app, and devices reachable by push notification.</p>

      {loading ? (
        <div className="text-[#86868b] text-sm py-10 text-center">Loading...</div>
      ) : !stats ? (
        <div className="text-[#86868b] text-sm py-10 text-center">Could not load app stats.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {[
              { label: 'App Accounts', value: stats.app_accounts, color: 'text-[#003e79]' },
              { label: 'New This Week', value: stats.new_7d, color: 'text-green-600' },
              { label: 'New Last 30 Days', value: stats.new_30d, color: 'text-green-600' },
              { label: 'Push-Ready Devices', value: stats.push_devices, color: 'text-[#00a0cc]' },
            ].map(t => (
              <div key={t.label} className="bg-white rounded-2xl border border-[#e8e8ed] px-5 py-4 text-center shadow-sm">
                <div className={`text-3xl font-bold ${t.color}`}>{t.value.toLocaleString()}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#86868b] mt-1">{t.label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 mb-8 text-sm text-[#6e6e73]">
            <span className="bg-white border border-[#e8e8ed] rounded-full px-3 py-1.5"> {stats.ios_devices.toLocaleString()} iOS</span>
            <span className="bg-white border border-[#e8e8ed] rounded-full px-3 py-1.5">🤖 {stats.android_devices.toLocaleString()} Android</span>
            <span className="bg-white border border-[#e8e8ed] rounded-full px-3 py-1.5">🔔 {stats.push_users.toLocaleString()} users reachable by push</span>
          </div>

          <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-sm">
            <h2 className="font-bold text-[#1d1d1f] mb-4">New App Accounts by Month</h2>
            {stats.monthly.length === 0 ? (
              <p className="text-sm text-[#86868b]">No signups recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {stats.monthly.map(m => (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="w-20 text-xs font-medium text-[#6e6e73] shrink-0">{fmtMonth(m.month)}</span>
                    <div className="flex-1 bg-[#f5f5f7] rounded-full h-5 overflow-hidden">
                      <div className="h-5 rounded-full bg-[#003e79]" style={{ width: `${Math.max(3, (m.signups / maxSignups) * 100)}%` }} />
                    </div>
                    <span className="w-12 text-right text-sm font-semibold text-[#1d1d1f] shrink-0">{m.signups.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
