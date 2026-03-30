'use client';
import { useParams } from 'next/navigation';

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

function Btn({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <button className={`px-4 py-2 rounded-lg text-sm font-medium ${primary ? 'bg-[#00ccff] text-white hover:bg-[#00b8e6]' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
      {children}
    </button>
  );
}

function AdminDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Events" value={36} sub="2025-26 season" />
        <StatCard label="Active Users" value={1248} sub="+82 this month" />
        <StatCard label="Revenue YTD" value="$284K" sub="On track" />
        <StatCard label="Open Tickets" value={7} sub="3 high priority" />
      </div>
      <SectionTitle>Recent Activity</SectionTitle>
      <Table headers={['Event', 'Action', 'User', 'Time']} rows={[
        ['Presidents Day Classic', 'Schedule published', 'John D.', '2h ago'],
        ['Spring Showdown', 'Registration opened', 'System', '5h ago'],
        ['Fall Kickoff', 'Venue confirmed', 'Chad', '1d ago'],
      ]} />
      <SectionTitle>System Health</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="API Uptime" value="99.9%" />
        <StatCard label="Avg Response" value="142ms" />
        <StatCard label="DB Size" value="2.1 GB" />
      </div>
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
      <div className="flex gap-3">
        <Btn primary>Register for Event</Btn>
        <Btn>Manage Rosters</Btn>
      </div>
    </div>
  );
}

function CoachDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Teams" value={2} />
        <StatCard label="Next Game" value="Sat 9AM" sub="Rink 2" />
        <StatCard label="Record" value="6-2-1" sub="Presidents Day" />
        <StatCard label="Roster Size" value={17} sub="All cleared" />
      </div>
      <SectionTitle>Upcoming Games</SectionTitle>
      <Table headers={['Date', 'Time', 'Opponent', 'Rink']} rows={[
        ['Sat Feb 15', '9:00 AM', 'NJ Devils U14', 'Rink 2'],
        ['Sat Feb 15', '3:30 PM', 'NY Rangers U14', 'Rink 1'],
        ['Sun Feb 16', '11:00 AM', 'TBD (Playoff)', 'Rink 1'],
      ]} />
      <SectionTitle>Roster</SectionTitle>
      <Table headers={['#', 'Player', 'Pos', 'Status']} rows={[
        ['9', 'Jake Thompson', 'C', 'Active'],
        ['12', 'Ryan Mitchell', 'LW', 'Active'],
        ['31', 'Alex Chen', 'G', 'Active'],
      ]} />
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
      <div className="flex gap-3">
        <Btn primary>Send Team Email</Btn>
        <Btn>Edit Roster</Btn>
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
      <div className="flex gap-3">
        <Btn primary>Open Scoresheet</Btn>
        <Btn>View Rules</Btn>
      </div>
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
      <Btn primary>Update Availability</Btn>
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

export default function DashboardPage() {
  const params = useParams();
  const role = (params.role as string) || 'admin';
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
