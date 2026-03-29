'use client';
import { useParams } from 'next/navigation';

/* ── helper components ── */
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={"text-3xl font-bold mt-1 " + (color || "text-gray-900")}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-gray-800 mb-3">{children}</h2>;
}

function Table({ cols, rows }: { cols: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-200">{cols.map((c, i) => <th key={i} className="text-left py-2 px-3 text-gray-500 font-medium">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">{r.map((cell, j) => <td key={j} className="py-2 px-3">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function CapacityBar({ label, filled, total }: { label: string; filled: number; total: number }) {
  const pct = Math.round((filled / total) * 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1"><span className="font-medium">{label}</span><span className="text-gray-500">{filled}/{total} teams</span></div>
      <div className="w-full bg-gray-200 rounded-full h-3"><div className="h-3 rounded-full" style={{ width: pct + "%", backgroundColor: pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#00ccff" }} /></div>
    </div>
  );
}

/* ── Admin Dashboard ── */
function AdminDash() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Events" value="36" sub="2025-26 season" color="text-[#00ccff]" />
        <StatCard label="Registered Teams" value="482" sub="+38 this week" color="text-green-600" />
        <StatCard label="Active Players" value="6,218" sub="across all events" />
        <StatCard label="Revenue" value="$384K" sub="YTD collected" color="text-emerald-600" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>Recent Registrations</SectionTitle>
          <Table cols={["Team", "Event", "Division", "Date"]} rows={[
            ["Chicago Steel U14", "Windy City Classic", "U14 AA", "Mar 28"],
            ["Milwaukee Hawks U12", "Dairy State Showdown", "U12 A", "Mar 27"],
            ["Indy Racers U16", "Hoosier Cup", "U16 AAA", "Mar 26"],
            ["St. Louis Blues U10", "Gateway Invitational", "U10 B", "Mar 25"],
            ["Detroit Jr. Wings U14", "Motor City Faceoff", "U14 AA", "Mar 25"],
          ]} />
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>Upcoming Events</SectionTitle>
          <Table cols={["Event", "Date", "Teams", "Status"]} rows={[
            ["Spring Thaw Classic", "Apr 4-6", "24/32", "Filling"],
            ["Windy City Classic", "Apr 11-13", "30/32", "Almost Full"],
            ["Dairy State Showdown", "Apr 18-20", "16/24", "Open"],
            ["Gateway Invitational", "Apr 25-27", "12/28", "Open"],
            ["Hoosier Cup", "May 2-4", "8/32", "Early Bird"],
          ]} />
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Quick Actions</SectionTitle>
        <div className="flex flex-wrap gap-3">
          {["Create Event", "Send Email Blast", "View All Teams", "Export Data", "Manage Venues", "Schedule Builder"].map(a => (
            <button key={a} className="px-4 py-2 bg-[#003e79] text-white rounded-lg text-sm hover:bg-[#002d5a] transition-colors">{a}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Director Dashboard ── */
function DirectorDash() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Director Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="My Events" value="8" sub="Currently managing" color="text-[#00ccff]" />
        <StatCard label="Pending Approvals" value="12" sub="Registration requests" color="text-amber-500" />
        <StatCard label="Total Revenue" value="$94K" sub="Across my events" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Event Capacity</SectionTitle>
        <CapacityBar label="Spring Thaw Classic - U14 AA" filled={14} total={16} />
        <CapacityBar label="Spring Thaw Classic - U12 A" filled={10} total={12} />
        <CapacityBar label="Windy City Classic - U16 AAA" filled={7} total={8} />
        <CapacityBar label="Windy City Classic - U14 AA" filled={15} total={16} />
        <CapacityBar label="Dairy State Showdown - U12 B" filled={4} total={12} />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Pending Registrations</SectionTitle>
        <Table cols={["Team", "Event", "Division", "Submitted", "Action"]} rows={[
          ["North Shore Wolves U14", "Spring Thaw", "U14 AA", "Mar 28", "Review"],
          ["Rockford IceHogs U12", "Windy City", "U12 A", "Mar 27", "Review"],
          ["Kenosha Kings U16", "Dairy State", "U16 AAA", "Mar 27", "Review"],
        ]} />
      </div>
    </div>
  );
}

/* ── Organization Dashboard ── */
function OrgDash() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Organization Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Teams" value="12" sub="Active this season" color="text-[#00ccff]" />
        <StatCard label="Coaches" value="18" sub="Assigned across teams" />
        <StatCard label="Players" value="186" sub="Rostered" color="text-green-600" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Teams</SectionTitle>
        <Table cols={["Team", "Division", "Coach", "Players", "Events"]} rows={[
          ["Chicago Steel U14 AA", "U14 AA", "Mike Johnson", "15", "3"],
          ["Chicago Steel U12 A", "U12 A", "Sarah Chen", "14", "2"],
          ["Chicago Steel U16 AAA", "U16 AAA", "Dave Wilson", "17", "4"],
          ["Chicago Steel U10 B", "U10 B", "Lisa Park", "13", "2"],
        ]} />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Quick Actions</SectionTitle>
        <div className="flex flex-wrap gap-3">
          {["Create Team", "Add Coach", "Add Player", "Pull USA Hockey Roster", "Register for Event"].map(a => (
            <button key={a} className="px-4 py-2 bg-[#003e79] text-white rounded-lg text-sm hover:bg-[#002d5a] transition-colors">{a}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Coach Dashboard ── */
function CoachDash() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Coach Dashboard</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Next Game</SectionTitle>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-[#003e79]">Chicago Steel U14</p>
            <p className="text-sm text-gray-500">Home</p>
          </div>
          <div className="text-center px-6">
            <p className="text-sm text-gray-400">Apr 4 @ 2:30 PM</p>
            <p className="text-3xl font-bold text-gray-300">VS</p>
            <p className="text-xs text-gray-400">Rink A - Rosemont</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-700">Milwaukee Hawks U14</p>
            <p className="text-sm text-gray-500">Away</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="My Teams" value="2" color="text-[#00ccff]" />
        <StatCard label="Roster Size" value="15" sub="Chicago Steel U14" />
        <StatCard label="Upcoming Games" value="6" sub="Next 30 days" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Roster - Chicago Steel U14 AA</SectionTitle>
        <Table cols={["#", "Player", "Pos", "GP", "G", "A", "PTS"]} rows={[
          ["9", "Jake Morrison", "C", "12", "8", "11", "19"],
          ["17", "Tyler Reed", "RW", "12", "6", "9", "15"],
          ["4", "Sam Butler", "D", "12", "2", "10", "12"],
          ["22", "Alex Kim", "LW", "11", "7", "4", "11"],
          ["31", "Ryan Torres", "G", "10", "0", "0", ".923 SV%"],
        ]} />
      </div>
      <div className="flex flex-wrap gap-3">
        {["Add Player", "Remove Player", "Register for Event", "View Schedule"].map(a => (
          <button key={a} className="px-4 py-2 bg-[#003e79] text-white rounded-lg text-sm hover:bg-[#002d5a] transition-colors">{a}</button>
        ))}
      </div>
    </div>
  );
}

import { useParams } from 'next/navigation';

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={"text-3xl font-bold mt-1 " + (color || "text-gray-900")}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-gray-800 mb-3">{children}</h2>;
}

function Table({ cols, rows }: { cols: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-200">{cols.map((c, i) => <th key={i} className="text-left py-2 px-3 text-gray-500 font-medium">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">{r.map((cell, j) => <td key={j} className="py-2 px-3">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function CapBar({ label, filled, total }: { label: string; filled: number; total: number }) {
  const pct = Math.round((filled / total) * 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1"><span className="font-medium">{label}</span><span className="text-gray-500">{filled}/{total}</span></div>
      <div className="w-full bg-gray-200 rounded-full h-3"><div className="h-3 rounded-full" style={{ width: pct + "%", backgroundColor: pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#00ccff" }} /></div>
    </div>
  );
}

function Btn({ children }: { children: string }) {
  return <button className="px-4 py-2 bg-[#003e79] text-white rounded-lg text-sm hover:bg-[#002d5a] transition-colors">{children}</button>;
}

function AdminDash() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Events" value="36" sub="2025-26 season" color="text-[#00ccff]" />
        <StatCard label="Registered Teams" value="482" sub="+38 this week" color="text-green-600" />
        <StatCard label="Active Players" value="6,218" />
        <StatCard label="Revenue" value="$384K" sub="YTD" color="text-emerald-600" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>Recent Registrations</SectionTitle>
          <Table cols={["Team","Event","Division","Date"]} rows={[["Chicago Steel U14","Windy City Classic","U14 AA","Mar 28"],["Milwaukee Hawks U12","Dairy State Showdown","U12 A","Mar 27"],["Indy Racers U16","Hoosier Cup","U16 AAA","Mar 26"],["St. Louis Blues U10","Gateway Invitational","U10 B","Mar 25"]]} />
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>Upcoming Events</SectionTitle>
          <Table cols={["Event","Date","Teams","Status"]} rows={[["Spring Thaw Classic","Apr 4-6","24/32","Filling"],["Windy City Classic","Apr 11-13","30/32","Almost Full"],["Dairy State Showdown","Apr 18-20","16/24","Open"],["Gateway Invitational","Apr 25-27","12/28","Open"]]} />
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Quick Actions</SectionTitle>
        <div className="flex flex-wrap gap-3">
          {["Create Event","Send Email Blast","View All Teams","Export Data","Manage Venues","Schedule Builder"].map(a => <Btn key={a}>{a}</Btn>)}
        </div>
      </div>
    </div>
  );
}

function DirectorDash() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Director Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="My Events" value="8" color="text-[#00ccff]" />
        <StatCard label="Pending Approvals" value="12" color="text-amber-500" />
        <StatCard label="Revenue" value="$94K" sub="My events" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Event Capacity</SectionTitle>
        <CapBar label="Spring Thaw - U14 AA" filled={14} total={16} />
        <CapBar label="Spring Thaw - U12 A" filled={10} total={12} />
        <CapBar label="Windy City - U16 AAA" filled={7} total={8} />
        <CapBar label="Windy City - U14 AA" filled={15} total={16} />
        <CapBar label="Dairy State - U12 B" filled={4} total={12} />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Pending Registrations</SectionTitle>
        <Table cols={["Team","Event","Division","Submitted"]} rows={[["North Shore Wolves U14","Spring Thaw","U14 AA","Mar 28"],["Rockford IceHogs U12","Windy City","U12 A","Mar 27"],["Kenosha Kings U16","Dairy State","U16 AAA","Mar 27"]]} />
      </div>
    </div>
  );
}

function OrgDash() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Organization Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Teams" value="12" color="text-[#00ccff]" />
        <StatCard label="Coaches" value="18" />
        <StatCard label="Players" value="186" color="text-green-600" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Teams</SectionTitle>
        <Table cols={["Team","Division","Coach","Players","Events"]} rows={[["Chicago Steel U14 AA","U14 AA","Mike Johnson","15","3"],["Chicago Steel U12 A","U12 A","Sarah Chen","14","2"],["Chicago Steel U16 AAA","U16 AAA","Dave Wilson","17","4"],["Chicago Steel U10 B","U10 B","Lisa Park","13","2"]]} />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Quick Actions</SectionTitle>
        <div className="flex flex-wrap gap-3">
          {["Create Team","Add Coach","Add Player","Pull USA Hockey Roster","Register for Event"].map(a => <Btn key={a}>{a}</Btn>)}
        </div>
      </div>
    </div>
  );
}

function CoachDash() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Coach Dashboard</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Next Game</SectionTitle>
        <div className="flex items-center justify-center gap-6 py-4">
          <div className="text-center"><p className="text-xl font-bold text-[#003e79]">Chicago Steel U14</p><p className="text-sm text-gray-500">Home</p></div>
          <div className="text-center px-6"><p className="text-sm text-gray-400">Apr 4 @ 2:30 PM</p><p className="text-3xl font-bold text-gray-300">VS</p><p className="text-xs text-gray-400">Rink A - Rosemont</p></div>
          <div className="text-center"><p className="text-xl font-bold text-gray-700">Milwaukee Hawks U14</p><p className="text-sm text-gray-500">Away</p></div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="My Teams" value="2" color="text-[#00ccff]" />
        <StatCard label="Roster" value="15" sub="Chicago Steel U14" />
        <StatCard label="Upcoming" value="6" sub="Next 30 days" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Roster</SectionTitle>
        <Table cols={["#","Player","Pos","GP","G","A","PTS"]} rows={[["9","Jake Morrison","C","12","8","11","19"],["17","Tyler Reed","RW","12","6","9","15"],["4","Sam Butler","D","12","2","10","12"],["22","Alex Kim","LW","11","7","4","11"],["31","Ryan Torres","G","10","-","-",".923"]]} />
      </div>
      <div className="flex flex-wrap gap-3">
        {["Add Player","Remove Player","Register for Event","View Schedule"].map(a => <Btn key={a}>{a}</Btn>)}
      </div>
    </div>
  );
}

function ManagerDash() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="My Team" value="1" color="text-[#00ccff]" />
        <StatCard label="Players" value="15" />
        <StatCard label="Events" value="3" color="text-green-600" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Team Roster</SectionTitle>
        <Table cols={["Player","Parent","Email","Phone","#"]} rows={[["Jake Morrison","Tom Morrison","tom@email.com","(312) 555-0101","9"],["Tyler Reed","Amy Reed","amy@email.com","(312) 555-0102","17"],["Sam Butler","Dan Butler","dan@email.com","(312) 555-0103","4"],["Alex Kim","Jenny Kim","jenny@email.com","(312) 555-0104","22"]]} />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Registered Events</SectionTitle>
        <Table cols={["Event","Date","Location","Division","Status"]} rows={[["Spring Thaw Classic","Apr 4-6","Rosemont, IL","U14 AA","Confirmed"],["Windy City Classic","Apr 11-13","Chicago, IL","U14 AA","Pending"],["Hoosier Cup","May 2-4","South Bend, IN","U14 AA","Confirmed"]]} />
      </div>
      <div className="flex flex-wrap gap-3">
        {["Add Player","Edit Contact Info","Register for Event","View Schedule"].map(a => <Btn key={a}>{a}</Btn>)}
      </div>
    </div>
  );
}

function ParentDash() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Parent / Player Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="Teams" value="1" />
        <StatCard label="Games Played" value="12" color="text-[#00ccff]" />
        <StatCard label="Goals" value="8" color="text-green-600" />
        <StatCard label="Points" value="19" color="text-amber-500" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Player Stats - Jake Morrison (#9)</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div><p className="text-3xl font-bold text-[#003e79]">12</p><p className="text-sm text-gray-500">GP</p></div>
          <div><p className="text-3xl font-bold text-green-600">8</p><p className="text-sm text-gray-500">Goals</p></div>
          <div><p className="text-3xl font-bold text-[#00ccff]">11</p><p className="text-sm text-gray-500">Assists</p></div>
          <div><p className="text-3xl font-bold text-amber-500">19</p><p className="text-sm text-gray-500">Points</p></div>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Upcoming Schedule</SectionTitle>
        <Table cols={["Date","Opponent","Time","Rink"]} rows={[["Apr 4","vs Milwaukee Hawks","2:30 PM","Rink A"],["Apr 5","vs Detroit Jr Wings","10:00 AM","Rink B"],["Apr 6","TBD (Playoff)","2:00 PM","Rink A"]]} />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Recent Results</SectionTitle>
        <Table cols={["Date","Opponent","Result","Score"]} rows={[["Mar 22","vs Indy Racers","W","5-2"],["Mar 22","vs St. Louis Blues","W","3-1"],["Mar 23","vs Rockford IceHogs","L","2-4"]]} />
      </div>
    </div>
  );
}

function ScorekeeperDash() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Scorekeeper Dashboard</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Live Game</SectionTitle>
        <div className="text-center mb-4">
          <span className="inline-block px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">LIVE - Period 2</span>
        </div>
        <div className="flex items-center justify-center gap-8 py-4">
          <div className="text-center">
            <p className="text-lg font-bold text-[#003e79]">Chicago Steel U14</p>
            <p className="text-5xl font-bold text-[#003e79] my-3">3</p>
            <div className="flex gap-2 justify-center">
              <button className="w-10 h-10 bg-green-500 text-white rounded-lg text-xl font-bold hover:bg-green-600">+</button>
              <button className="w-10 h-10 bg-red-500 text-white rounded-lg text-xl font-bold hover:bg-red-600">-</button>
            </div>
          </div>
          <div className="text-center"><p className="text-4xl font-bold text-gray-300">-</p><p className="text-sm text-gray-400">12:45 remaining</p></div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-700">Milwaukee Hawks U14</p>
            <p className="text-5xl font-bold text-gray-700 my-3">1</p>
            <div className="flex gap-2 justify-center">
              <button className="w-10 h-10 bg-green-500 text-white rounded-lg text-xl font-bold hover:bg-green-600">+</button>
              <button className="w-10 h-10 bg-red-500 text-white rounded-lg text-xl font-bold hover:bg-red-600">-</button>
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-2 mt-4">
          {["1st","2nd","3rd","OT"].map((p, i) => (
            <button key={p} className={"px-4 py-2 rounded-lg text-sm font-medium " + (i === 1 ? "bg-[#003e79] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>{p}</button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Scoring Log</SectionTitle>
        <Table cols={["Time","Period","Team","Scorer","Assist"]} rows={[["14:22","1st","Chicago","#9 Morrison","#17 Reed"],["8:05","1st","Milwaukee","#11 Anderson","#5 Smith"],["2:30","1st","Chicago","#22 Kim","#4 Butler"],["16:10","2nd","Chicago","#17 Reed","#9 Morrison"]]} />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>My Assignments</SectionTitle>
        <Table cols={["Time","Rink","Home","Away","Status"]} rows={[["2:30 PM","Rink A","Chicago Steel","Milwaukee Hawks","In Progress"],["5:00 PM","Rink A","Indy Racers","Detroit Jr Wings","Upcoming"],["7:30 PM","Rink B","St. Louis Blues","Rockford IceHogs","Upcoming"]]} />
      </div>
    </div>
  );
}

function RefereeDash() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Referee Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Assignments" value="4" sub="This weekend" color="text-[#00ccff]" />
        <StatCard label="Completed" value="1" sub="Today" color="text-green-600" />
        <StatCard label="Next Game" value="5:00 PM" sub="Rink A" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>My Assignments</SectionTitle>
        <Table cols={["Date","Time","Rink","Home","Away","Role"]} rows={[["Apr 4","2:30 PM","Rink A","Chicago Steel U14","Milwaukee Hawks U14","Referee"],["Apr 4","5:00 PM","Rink A","Indy Racers U16","Detroit Jr Wings U16","Linesman"],["Apr 5","10:00 AM","Rink B","St. Louis Blues U12","Rockford IceHogs U12","Referee"],["Apr 5","1:00 PM","Rink A","Semifinal 1","Semifinal 2","Referee"]]} />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <SectionTitle>Game Reports</SectionTitle>
        <Table cols={["Date","Game","Report","Status"]} rows={[["Apr 4","Chicago vs Milwaukee","Misconduct - #14 delay of game","Submitted"],["Apr 4","Indy vs Detroit","No incidents","Pending"]]} />
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

export default function DashboardPage() {
  const params = useParams();
  const role = (params.role as string) || 'admin';
  const Comp = DASHBOARDS[role];
  if (!Comp) return <div className="p-10 text-center text-gray-500">Unknown role: {role}</div>;
  return <Comp />;
}
