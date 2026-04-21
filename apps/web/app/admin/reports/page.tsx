'use client';

import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';
const devHeaders: Record<string, string> = { 'X-Dev-Bypass': 'true' };
const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { ...devHeaders, ...(opts.headers || {}) } });

/* ── Helpers ── */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatDate(iso: string): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timeAgo(iso: string): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

/* ── Activity Score Bar ── */
function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = maxScore > 0 ? Math.min((score / maxScore) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-[#f0f0f2] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#003e79] to-[#00ccff] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-bold text-[#1d1d1f] min-w-[40px]">{score.toLocaleString()}</span>
    </div>
  );
}

/* ── Summary Card ── */
function SummaryCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl border p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)] ${accent ? 'border-[#00ccff]/30 ring-1 ring-[#00ccff]/10' : 'border-[#e8e8ed]'}`}>
      <p className="text-sm text-[#86868b] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-[#003e79]' : 'text-[#1d1d1f]'}`}>{value}</p>
      {sub && <p className="text-xs text-[#86868b] mt-1">{sub}</p>}
    </div>
  );
}

/* ── User Detail Modal ── */
function UserDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch(`${API_BASE}/analytics/reports/user/${userId}/activity`)
      .then(r => r.json())
      .then(json => { if (json.success) setData(json.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-[#003e79] to-[#005599] px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-white font-bold text-lg">
              {loading ? 'Loading...' : data?.user ? `${data.user.first_name} ${data.user.last_name}` : 'User Detail'}
            </h3>
            {data?.user && <p className="text-white/70 text-xs mt-0.5">{data.user.email}</p>}
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" /></div>
          ) : data ? (
            <>
              {/* User info */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-[#86868b] text-xs mb-0.5">Phone</p>
                  <p className="font-medium text-[#1d1d1f]">{data.user?.phone || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[#86868b] text-xs mb-0.5">Member Since</p>
                  <p className="font-medium text-[#1d1d1f]">{data.user?.created_at ? formatDate(data.user.created_at) : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[#86868b] text-xs mb-0.5">Total Activity Events</p>
                  <p className="font-medium text-[#1d1d1f]">{data.recentActivity?.length || 0}</p>
                </div>
              </div>

              {/* Registrations */}
              {data.registrations?.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-[#1d1d1f] mb-2">Registrations ({data.registrations.length})</h4>
                  <div className="space-y-2">
                    {data.registrations.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between bg-[#fafafa] rounded-lg px-4 py-2.5 text-xs">
                        <div>
                          <span className="font-semibold text-[#1d1d1f]">{r.team_name}</span>
                          <span className="text-[#86868b] ml-2">{r.event_name}</span>
                          <span className="text-[#86868b] ml-2">{r.age_group} {r.division_level}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            r.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                            r.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>{r.status}</span>
                          <span className="text-[#86868b]">{formatDate(r.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Activity */}
              {data.recentActivity?.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-[#1d1d1f] mb-2">Recent Activity</h4>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {data.recentActivity.slice(0, 30).map((a: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg hover:bg-[#fafafa]">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            a.activity_type === 'login' ? 'bg-blue-400' :
                            a.activity_type === 'page_view' ? 'bg-gray-300' :
                            a.activity_type === 'registration' ? 'bg-emerald-400' :
                            a.activity_type === 'action' ? 'bg-purple-400' :
                            'bg-amber-300'
                          }`} />
                          <span className="font-medium text-[#1d1d1f] capitalize">{a.activity_type.replace(/_/g, ' ')}</span>
                          {a.page_path && <span className="text-[#86868b]">{a.page_path}</span>}
                        </div>
                        <span className="text-[#86868b] flex-shrink-0 ml-2">{timeAgo(a.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-center text-[#86868b]">Could not load user data</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN REPORTS PAGE
   ══════════════════════════════════════════ */
export default function ReportsPage() {
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30d');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, summaryRes] = await Promise.all([
        authFetch(`${API_BASE}/analytics/reports/active-users?period=${period}&limit=50`),
        authFetch(`${API_BASE}/analytics/reports/summary`),
      ]);
      const usersJson = await usersRes.json();
      const summaryJson = await summaryRes.json();

      if (usersJson.success) setActiveUsers(usersJson.data || []);
      if (summaryJson.success) setSummary(summaryJson.data);
    } catch {}
    setLoading(false);
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const maxScore = activeUsers.length > 0 ? Math.max(...activeUsers.map((u: any) => u.activity_score || 0)) : 1;

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1d1d1f]">Reports & Analytics</h1>
          <p className="text-sm text-[#86868b] mt-1">User engagement, activity tracking, and platform insights</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label="Active Today"
          value={summary?.today?.active_users || 0}
          sub={`${summary?.today?.sessions || 0} sessions`}
          accent
        />
        <SummaryCard
          label="Active This Week"
          value={summary?.thisWeek?.active_users || 0}
          sub={`${summary?.thisWeek?.sessions || 0} sessions`}
        />
        <SummaryCard
          label="Total Users Tracked"
          value={summary?.allTime?.total_users_tracked || 0}
          sub={`${summary?.allTime?.total_sessions || 0} total sessions`}
        />
        <SummaryCard
          label="Pending Registrations"
          value={summary?.pendingRegistrations || 0}
          sub={summary?.pendingRegistrations > 0 ? 'Needs attention' : 'All clear'}
          accent={summary?.pendingRegistrations > 0}
        />
      </div>

      {/* Most Active Users */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-[#1d1d1f]">Most Active Users</h2>
        <div className="flex bg-[#f0f0f2] rounded-lg p-0.5">
          {[
            { key: '7d', label: '7 Days' },
            { key: '30d', label: '30 Days' },
            { key: '90d', label: '90 Days' },
            { key: 'all', label: 'All Time' },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                period === p.key
                  ? 'bg-white text-[#003e79] shadow-sm'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>
      ) : activeUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-12 text-center shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <div className="text-4xl mb-3">&#128202;</div>
          <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">No Activity Data Yet</h3>
          <p className="text-sm text-[#86868b] max-w-md mx-auto">
            Activity tracking has been enabled. As users browse the site, log in, and register for events, their engagement data will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)] overflow-hidden">
          {/* Table Header */}
          <div className="bg-[#fafafa] border-b border-[#f0f0f2]">
            <div className="grid grid-cols-12 gap-2 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
              <div className="col-span-1">#</div>
              <div className="col-span-3">User</div>
              <div className="col-span-1 text-center">Logins</div>
              <div className="col-span-1 text-center">Pages</div>
              <div className="col-span-1 text-center">Regs</div>
              <div className="col-span-1 text-center">Time</div>
              <div className="col-span-2">Last Active</div>
              <div className="col-span-2">Activity Score</div>
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-[#f0f0f2]">
            {activeUsers.map((u: any, idx: number) => (
              <button
                key={u.id}
                onClick={() => setSelectedUserId(u.id)}
                className="w-full grid grid-cols-12 gap-2 px-5 py-3.5 hover:bg-[#f8f9ff] transition-colors text-left items-center"
              >
                {/* Rank */}
                <div className="col-span-1">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                    idx === 0 ? 'bg-amber-100 text-amber-700' :
                    idx === 1 ? 'bg-gray-100 text-gray-600' :
                    idx === 2 ? 'bg-orange-50 text-orange-600' :
                    'bg-[#f5f5f7] text-[#86868b]'
                  }`}>{idx + 1}</span>
                </div>

                {/* User */}
                <div className="col-span-3 min-w-0">
                  <p className="text-sm font-semibold text-[#1d1d1f] truncate">{u.first_name} {u.last_name}</p>
                  <p className="text-xs text-[#86868b] truncate">{u.email}</p>
                </div>

                {/* Logins */}
                <div className="col-span-1 text-center">
                  <span className="text-sm font-bold text-[#1d1d1f]">{u.login_count}</span>
                </div>

                {/* Page Views */}
                <div className="col-span-1 text-center">
                  <span className="text-sm font-bold text-[#1d1d1f]">{u.page_views}</span>
                  {u.unique_pages > 0 && (
                    <p className="text-[10px] text-[#86868b]">{u.unique_pages} unique</p>
                  )}
                </div>

                {/* Registrations */}
                <div className="col-span-1 text-center">
                  <span className={`text-sm font-bold ${u.registration_count > 0 ? 'text-emerald-600' : 'text-[#1d1d1f]'}`}>
                    {u.registration_count}
                  </span>
                </div>

                {/* Time on Site */}
                <div className="col-span-1 text-center">
                  <span className="text-sm font-bold text-[#1d1d1f]">{formatDuration(u.total_time_seconds)}</span>
                </div>

                {/* Last Active */}
                <div className="col-span-2">
                  <span className="text-xs text-[#6e6e73]">{u.last_login ? timeAgo(u.last_login) : 'N/A'}</span>
                </div>

                {/* Score */}
                <div className="col-span-2">
                  <ScoreBar score={u.activity_score} maxScore={maxScore} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scoring explanation */}
      <div className="mt-4 p-4 bg-[#f5f5f7] rounded-xl">
        <p className="text-xs text-[#86868b]">
          <span className="font-semibold text-[#6e6e73]">Activity Score</span> is calculated from: logins (10 pts each), page views (1 pt each), registrations (25 pts each), actions (5 pts each), and time on site (1 pt per minute).
        </p>
      </div>

      {/* User Detail Modal */}
      {selectedUserId && (
        <UserDetailModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      )}
    </div>
  );
}
