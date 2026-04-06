'use client';

import { useState, useEffect } from 'react';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#003e79]">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-[#003e79] mb-3">{children}</h2>;
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>{headers.map((h, i) => <th key={i} className="px-4 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-4 py-2">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function CapBar({ label, cur, max }: { label: string; cur: number; max: number }) {
  const pct = Math.round((cur / max) * 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1"><span>{label}</span><span>{cur}/{max}</span></div>
      <div className="h-2 bg-gray-200 rounded-full"><div className="h-2 bg-[#00ccff] rounded-full" style={{ width: pct + '%' }} /></div>
    </div>
  );
}

function AdminDash() {
  const [stats, setStats] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [sponsorships, setSponsorships] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const API = 'https://uht.chad-157.workers.dev/api';
    Promise.all([
      fetch(`${API}/events/admin/list?filter=upcoming`).then(r => r.json()),
      fetch(`${API}/events/admin/list?filter=all`).then(r => r.json()),
      fetch(`${API}/sponsors/admin/sponsorships`).then(r => r.json()),
    ]).then(([upJson, allJson, spJson]) => {
      const upcoming = upJson.success ? upJson.data : [];
      const all = allJson.success ? allJson.data : [];
      const sp = spJson.success ? spJson.data : [];
      setEvents(upcoming);
      setSponsorships(sp);

      const totalTeams = all.reduce((s: number, e: any) => s + (e.registration_count || 0), 0);
      const totalRevenue = all.reduce((s: number, e: any) => s + (e.total_revenue_cents || 0), 0);
      const sponsorRevenue = sp.filter((s: any) => s.payment_status === 'paid').reduce((s: number, x: any) => s + (x.amount_cents || 0), 0);

      setStats({
        upcomingEvents: upcoming.length,
        totalEvents: all.length,
        totalTeams,
        totalRevenue: totalRevenue + sponsorRevenue,
        activeSponsors: sp.filter((s: any) => s.status === 'active').length,
      });
      setLoadingStats(false);
    }).catch(() => setLoadingStats(false));
  }, []);

  if (loadingStats) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Upcoming Events" value={stats?.upcomingEvents || 0} sub={`${stats?.totalEvents || 0} total`} />
        <StatCard label="Teams Registered" value={stats?.totalTeams || 0} sub="Across all events" />
        <StatCard label="Total Revenue" value={`$${((stats?.totalRevenue || 0) / 100).toLocaleString()}`} sub="Events + Sponsorships" />
        <StatCard label="Active Sponsors" value={stats?.activeSponsors || 0} sub="Current deals" />
      </div>

      {/* Quick Actions */}
      <SectionTitle>Quick Actions</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Create Event', href: '/admin/events', icon: '🏆' },
          { label: 'View Sponsors', href: '/admin/sponsors', icon: '🤝' },
          { label: 'Manage Ice', href: '/admin/ice', icon: '⛸' },
          { label: 'View FAQ', href: '/faq', icon: '❓' },
        ].map(a => (
          <a key={a.label} href={a.href} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition text-center">
            <div className="text-2xl mb-1">{a.icon}</div>
            <div className="text-sm font-medium text-gray-800">{a.label}</div>
          </a>
        ))}
      </div>

      {/* Upcoming Events */}
      <SectionTitle>Upcoming Events</SectionTitle>
      {events.length > 0 ? (
        <Table headers={['Event', 'Dates', 'Location', 'Teams', 'Revenue', 'Status']} rows={
          events.slice(0, 6).map((e: any) => {
            const startDt = new Date(e.start_date + 'T12:00:00');
            const endDt = new Date(e.end_date + 'T12:00:00');
            const dateStr = `${startDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            return [
              e.tournament_name || e.name,
              dateStr,
              `${e.city}, ${e.state}`,
              String(e.registration_count || 0),
              e.total_revenue_cents ? `$${(e.total_revenue_cents / 100).toLocaleString()}` : '$0',
              e.status?.replace(/_/g, ' ') || 'draft',
            ];
          })
        } />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">No upcoming events</div>
      )}

      {/* Sponsor Deals */}
      {sponsorships.length > 0 && (
        <>
          <SectionTitle>Active Sponsorships</SectionTitle>
          <Table headers={['Sponsor', 'Package', 'Amount', 'Status', 'Payment']} rows={
            sponsorships.filter((s: any) => s.status === 'active').slice(0, 5).map((s: any) => [
              s.sponsor_name,
              s.package_name,
              `$${(s.amount_cents / 100).toLocaleString()}`,
              s.status,
              s.payment_status,
            ])
          } />
        </>
      )}
    </div>
  );
}

function DirectorDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Upcoming Events" value={4} sub="Next 60 days" />
        <StatCard label="Teams Registered" value={186} sub="Across all events" />
        <StatCard label="Venues Booked" value={8} sub="2 pending" />
        <StatCard label="Staff Assigned" value={42} sub="Refs + scorekeepers" />
      </div>
      <SectionTitle>Event Pipeline</SectionTitle>
      <Table headers={['Event', 'Date', 'Teams', 'Status']} rows={[
        ['Presidents Day Classic', 'Feb 14-16', '48/48', 'Full'],
        ['Spring Showdown', 'Mar 21-23', '32/64', 'Open'],
        ['Summer Slapshot', 'Jun 13-15', '0/48', 'Coming Soon'],
      ]} />
      <SectionTitle>Venue Capacity</SectionTitle>
      <CapBar label="Bridgeport Ice Arena" cur={6} max={8} />
      <CapBar label="Twin Rinks Stamford" cur={4} max={6} />
      <CapBar label="Shelton Rink" cur={2} max={4} />
    </div>
  );
}

function OrgDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Teams" value={6} sub="3 divisions" />
        <StatCard label="Registered Events" value={4} sub="2 upcoming" />
        <StatCard label="Total Players" value={94} sub="Across all teams" />
        <StatCard label="Balance Due" value="$4,200" sub="Next payment Apr 1" />
      </div>
      <SectionTitle>Team Roster</SectionTitle>
      <Table headers={['Team', 'Division', 'Players', 'Next Event']} rows={[
        ['CT Wolves U12 A', 'Squirt A', '15', 'Presidents Day Classic'],
        ['CT Wolves U14 AA', 'Bantam AA', '17', 'Presidents Day Classic'],
        ['CT Wolves U10 B', 'Mite B', '14', 'Spring Showdown'],
      ]} />
    </div>
  );
}

function CoachDash() {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Get team IDs from localStorage (created via Create Team page)
        const localTeams = JSON.parse(localStorage.getItem('uht_teams') || '[]');
        const ids = localTeams.map((t: any) => t.id).filter(Boolean);

        if (ids.length > 0) {
          const res = await fetch(`https://uht.chad-157.workers.dev/api/teams/by-ids?ids=${ids.join(',')}`);
          const json = await res.json();
          if (json.success && json.data.length > 0) {
            setTeams(json.data);
            setLoading(false);
            return;
          }
        }

        // Fallback: show localStorage data directly
        if (localTeams.length > 0) {
          setTeams(localTeams);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Teams" value={teams.length} />
        <StatCard label="Upcoming Events" value={0} sub="Register from Events page" />
        <StatCard label="Players" value={0} sub="Add via USA Hockey" />
        <StatCard label="Balance" value="$0" sub="No outstanding fees" />
      </div>

      {/* My Teams */}
      <div className="flex items-center justify-between">
        <SectionTitle>My Teams</SectionTitle>
        <a href="/create-team" className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-sm transition">
          + Create Team
        </a>
      </div>

      {teams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">🏒</div>
          <h3 className="text-lg font-bold text-gray-700 mb-2">No Teams Yet</h3>
          <p className="text-sm text-gray-400 mb-5">Create your first team to start registering for tournaments.</p>
          <a href="/create-team" className="inline-block px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-sm transition">
            Create Your First Team
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map((team: any) => (
            <div key={team.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{team.name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {team.age_group}{team.division_level ? ` · ${team.division_level}` : ''}
                  </p>
                </div>
                {team.usa_hockey_team_id && (
                  <span className="text-[10px] font-semibold px-2 py-1 bg-blue-50 text-blue-600 rounded-full">USA Hockey</span>
                )}
              </div>

              {(team.city || team.state) && (
                <p className="text-sm text-gray-500 mb-2">
                  📍 {[team.city, team.state].filter(Boolean).join(', ')}
                </p>
              )}

              {team.head_coach_name && (
                <p className="text-sm text-gray-500 mb-1">
                  🧑‍🏫 Coach: <span className="font-medium text-gray-700">{team.head_coach_name}</span>
                </p>
              )}

              {team.season_record && (
                <p className="text-sm text-gray-500 mb-1">
                  📊 Record: <span className="font-medium text-gray-700">{team.season_record}</span>
                </p>
              )}

              {team.hometown_league && (
                <p className="text-sm text-gray-500 mb-1">
                  🏟️ League: <span className="font-medium text-gray-700">{team.hometown_league}</span>
                </p>
              )}

              <div className="flex gap-2 mt-4">
                <a href="/events" className="flex-1 text-center px-3 py-2 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 font-semibold rounded-xl text-xs transition">
                  Register for Event
                </a>
                <button className="px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 font-medium rounded-xl text-xs transition">
                  Edit Team
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Links */}
      <SectionTitle>Quick Actions</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Browse Events', href: '/events', icon: '🏆' },
          { label: 'Create Team', href: '/create-team', icon: '🏒' },
          { label: 'My Schedule', href: '/dashboard/coach/schedule', icon: '📅' },
          { label: 'My Roster', href: '/dashboard/coach/roster', icon: '📋' },
        ].map(a => (
          <a key={a.label} href={a.href} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition text-center">
            <div className="text-2xl mb-1">{a.icon}</div>
            <div className="text-sm font-medium text-gray-800">{a.label}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function ManagerDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Team" value="CT Wolves U14" />
        <StatCard label="Players" value={17} sub="All fees paid" />
        <StatCard label="Upcoming Events" value={2} />
        <StatCard label="Open Tasks" value={3} sub="Roster updates" />
      </div>
      <SectionTitle>Player Status</SectionTitle>
      <Table headers={['Player', 'Registration', 'Waiver', 'Fee']} rows={[
        ['Jake Thompson', 'Complete', 'Signed', 'Paid'],
        ['Ryan Mitchell', 'Complete', 'Signed', 'Paid'],
        ['Sam Patel', 'Complete', 'Pending', 'Paid'],
      ]} />
      <SectionTitle>Team Communications</SectionTitle>
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <p className="text-sm"><span className="font-medium">Schedule Update:</span> Saturday games moved to Rink 2</p>
        <p className="text-sm"><span className="font-medium">Reminder:</span> Jerseys due by Friday</p>
      </div>
    </div>
  );
}

function ParentDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Player" value="Jake Thompson" sub="#9 - Center" />
        <StatCard label="Next Game" value="Sat 9AM" sub="vs NJ Devils U14" />
        <StatCard label="Events" value={2} sub="Registered" />
        <StatCard label="Balance" value="$0" sub="All paid" />
      </div>
      <SectionTitle>Upcoming Schedule</SectionTitle>
      <Table headers={['Date', 'Time', 'Event', 'Opponent', 'Rink']} rows={[
        ['Sat Feb 15', '9:00 AM', 'Presidents Day', 'NJ Devils U14', 'Rink 2'],
        ['Sat Feb 15', '3:30 PM', 'Presidents Day', 'NY Rangers U14', 'Rink 1'],
        ['Sun Feb 16', '11:00 AM', 'Presidents Day', 'TBD', 'TBD'],
      ]} />
      <SectionTitle>Hotel Info</SectionTitle>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="font-medium text-sm">Courtyard by Marriott Shelton</p>
        <p className="text-sm text-gray-500">780 Bridgeport Ave, Shelton CT</p>
        <p className="text-sm text-[#00ccff] mt-1">Block rate: $139/night - Code: UHT2025</p>
      </div>
    </div>
  );
}

function ScorekeeperDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Assigned Games" value={8} sub="This weekend" />
        <StatCard label="Completed" value={23} sub="This season" />
        <StatCard label="Next Game" value="Sat 8AM" sub="Rink 1" />
        <StatCard label="Avg Duration" value="52 min" />
      </div>
      <SectionTitle>My Assignments</SectionTitle>
      <Table headers={['Date', 'Time', 'Rink', 'Matchup', 'Division']} rows={[
        ['Sat Feb 15', '8:00 AM', 'Rink 1', 'CT Wolves vs NH Bears', 'Squirt A'],
        ['Sat Feb 15', '10:30 AM', 'Rink 1', 'NJ Devils vs NY Rangers', 'Bantam AA'],
        ['Sat Feb 15', '1:00 PM', 'Rink 2', 'MA Eagles vs RI Storm', 'Peewee A'],
        ['Sun Feb 16', '8:00 AM', 'Rink 1', 'Semifinal 1', 'Squirt A'],
      ]} />
    </div>
  );
}

function RefereeDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Assigned Games" value={6} sub="This weekend" />
        <StatCard label="Completed" value={31} sub="This season" />
        <StatCard label="Next Game" value="Sat 8AM" sub="Rink 1" />
        <StatCard label="Earnings YTD" value="$2,480" />
      </div>
      <SectionTitle>My Schedule</SectionTitle>
      <Table headers={['Date', 'Time', 'Rink', 'Matchup', 'Role']} rows={[
        ['Sat Feb 15', '8:00 AM', 'Rink 1', 'CT Wolves vs NH Bears', 'Center'],
        ['Sat Feb 15', '10:30 AM', 'Rink 2', 'NJ Devils vs NY Rangers', 'Linesman'],
        ['Sat Feb 15', '3:30 PM', 'Rink 1', 'MA Eagles vs RI Storm', 'Center'],
        ['Sun Feb 16', '9:00 AM', 'Rink 1', 'Semifinal 2', 'Center'],
      ]} />
      <SectionTitle>Availability</SectionTitle>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-sm mb-2">Spring Showdown (Mar 21-23): <span className="text-green-600 font-medium">Available</span></p>
        <p className="text-sm">Summer Slapshot (Jun 13-15): <span className="text-yellow-600 font-medium">Pending</span></p>
      </div>
    </div>
  );
}

const DASHBOARDS: Record<string, () => JSX.Element> = {
  admin: AdminDash,
  director: DirectorDash,
  organization: OrgDash,
  coach: CoachDash,
  manager: ManagerDash,
  parent: ParentDash,
  scorekeeper: ScorekeeperDash,
  referee: RefereeDash,
};

export default function DashboardContent({ role }: { role: string }) {
  const Dashboard = DASHBOARDS[role];

  if (!Dashboard) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Unknown role: {role}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#003e79] mb-6 capitalize">{role} Dashboard</h1>
      <Dashboard />
    </div>
  );
}
