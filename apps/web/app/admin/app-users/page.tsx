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

interface FollowReportEvent {
  event_id: string;
  event_name: string;
  start_date: string;
  team_count: number;
  total_followers: number;
  teams: { team_id: string; team_name: string; followers: number }[];
}

export default function AppUsersPage() {
  const [stats, setStats] = useState<AppStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [followReport, setFollowReport] = useState<FollowReportEvent[]>([]);
  const [openEvent, setOpenEvent] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/users/admin/app-stats`, { headers: authHeaders() })
      .then(r => r.json())
      .then((j: any) => { if (j.success) setStats(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch(`${API}/api/users/admin/follow-report`, { headers: authHeaders() })
      .then(r => r.json())
      .then((j: any) => { if (j.success) setFollowReport(j.data || []); })
      .catch(() => {});
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

          {/* Followers per team, by event */}
          <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-sm mt-8">
            <h2 className="font-bold text-[#1d1d1f]">Team Followers by Event</h2>
            <p className="text-xs text-[#86868b] mb-4">How many app users follow each approved team. The adoption scoreboard - zero means that team's families are not on the app yet.</p>
            {followReport.length === 0 ? (
              <p className="text-sm text-[#86868b]">No current events with approved teams.</p>
            ) : (
              <div className="space-y-3">
                {followReport.map(ev => {
                  const open = openEvent === ev.event_id;
                  const maxF = Math.max(1, ...ev.teams.map(t => t.followers));
                  const zeroTeams = ev.teams.filter(t => t.followers === 0).length;
                  return (
                    <div key={ev.event_id} className="border border-[#e8e8ed] rounded-xl overflow-hidden">
                      <button onClick={() => setOpenEvent(open ? null : ev.event_id)}
                        className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[#fafafa] hover:bg-[#f0f7ff] transition text-left">
                        <div>
                          <span className="font-semibold text-[#1d1d1f] text-sm">{ev.event_name}</span>
                          <span className="text-xs text-[#86868b] ml-2">{ev.start_date?.slice(0, 10)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-semibold text-[#003e79]">{ev.total_followers} follower{ev.total_followers !== 1 ? 's' : ''}</span>
                          <span className="text-[#86868b]">{ev.team_count} teams</span>
                          {zeroTeams > 0 && <span className="text-amber-600 font-semibold">{zeroTeams} at zero</span>}
                          <span className="text-[#86868b]">{open ? '▴' : '▾'}</span>
                        </div>
                      </button>
                      {open && (
                        <div className="divide-y divide-[#f0f0f3]">
                          {ev.teams.map(t => (
                            <div key={t.team_id} className="flex items-center gap-3 px-4 py-2">
                              <span className="flex-1 text-sm text-[#1d1d1f] min-w-0 truncate">{t.team_name}</span>
                              <div className="w-28 sm:w-48 bg-[#f5f5f7] rounded-full h-3 overflow-hidden shrink-0">
                                <div className={`h-3 rounded-full ${t.followers === 0 ? '' : 'bg-gradient-to-r from-[#003e79] to-[#00ccff]'}`}
                                  style={{ width: `${Math.max(t.followers === 0 ? 0 : 6, (t.followers / maxF) * 100)}%` }} />
                              </div>
                              <span className={`w-8 text-right text-sm font-semibold shrink-0 ${t.followers === 0 ? 'text-amber-600' : 'text-[#1d1d1f]'}`}>{t.followers}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
