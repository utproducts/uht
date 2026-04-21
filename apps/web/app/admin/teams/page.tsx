'use client';

import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api/teams';
const devHeaders = { 'X-Dev-Bypass': 'true' };
const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { ...devHeaders, ...(opts.headers || {}) } });

interface Team {
  id: string;
  name: string;
  age_group: string;
  division_level: string | null;
  organization_id: string | null;
  organization_name: string | null;
  usa_hockey_team_id: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  is_active: number;
  player_count: number;
  head_coach_name: string | null;
  head_coach_email: string | null;
  head_coach_phone: string | null;
  manager_name: string | null;
  manager_email: string | null;
  manager_phone: string | null;
  contact_type: string | null;
  season: string | null;
  created_at: string;
}

interface OrgRow {
  org_key: string;
  name: string;
  organization_id: string | null;
  team_count: number;
  age_groups: number;
  age_group_list: string;
  cities: string | null;
  states: string | null;
  seasons: string | null;
  latest_season: string | null;
  contacts_count: number;
  unique_contacts: number;
  coach_count: number;
  parent_count: number;
  manager_count: number;
}

interface EventOption {
  id: string;
  name: string;
  team_count: number;
}

interface Stats {
  total: number;
  categorized: number;
  needs_review: number;
  with_contact: number;
  coaches: number;
  managers: number;
  parents: number;
  unique_orgs: number;
}

const AGE_GROUPS = ['Mite', 'Squirt', 'Pee Wee', 'Bantam', 'Midget', '16u/JV', '18u/Var.', 'Girls 8u', 'Girls 10u', 'Girls 12u', 'Girls 14u', 'Adult', 'Unknown'];
const US_STATES = ['Illinois','Indiana','Iowa','Michigan','Minnesota','Missouri','Ohio','Wisconsin','Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Mississippi','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wyoming'];
const CONTACT_TYPES = [
  { value: 'coach', label: 'Coach', color: 'bg-blue-50 text-blue-700' },
  { value: 'manager', label: 'Manager', color: 'bg-purple-50 text-purple-700' },
  { value: 'parent', label: 'Parent', color: 'bg-amber-50 text-amber-700' },
  { value: 'player', label: 'Player', color: 'bg-emerald-50 text-emerald-700' },
  { value: 'other', label: 'Other', color: 'bg-gray-100 text-gray-600' },
];

function ContactTypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-[11px] text-[#c7c7cc] italic">Unset</span>;
  const ct = CONTACT_TYPES.find(c => c.value === type);
  if (!ct) return <span className="text-[11px] text-[#86868b]">{type}</span>;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${ct.color}`}>{ct.label}</span>;
}

/* ── Edit Team Drawer ── */
function EditTeamDrawer({ team, onClose, onSaved }: { team: Team; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: team.name,
    age_group: team.age_group,
    division_level: team.division_level || '',
    city: team.city || '',
    state: team.state || '',
    usa_hockey_team_id: team.usa_hockey_team_id || '',
    head_coach_name: team.head_coach_name || '',
    head_coach_email: team.head_coach_email || '',
    head_coach_phone: team.head_coach_phone || '',
    manager_name: team.manager_name || '',
    manager_email: team.manager_email || '',
    manager_phone: team.manager_phone || '',
    contact_type: team.contact_type || '',
    season: team.season || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Team name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await authFetch(`${API_BASE}/admin/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          age_group: form.age_group,
          division_level: form.division_level || null,
          city: form.city || null,
          state: form.state || null,
          usa_hockey_team_id: form.usa_hockey_team_id || null,
          head_coach_name: form.head_coach_name || null,
          head_coach_email: form.head_coach_email || null,
          head_coach_phone: form.head_coach_phone || null,
          manager_name: form.manager_name || null,
          manager_email: form.manager_email || null,
          manager_phone: form.manager_phone || null,
          contact_type: form.contact_type || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(true);
        setTimeout(() => { onSaved(); onClose(); }, 600);
      } else setError(json.error || 'Failed to save');
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  };

  const fc = "w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]/30 outline-none";
  const lc = "block text-[11px] font-semibold text-[#86868b] uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#003e79] to-[#005599] px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Edit Team</h2>
            <p className="text-white/70 text-xs mt-0.5">{team.name}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl font-bold">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl font-semibold">{error}</div>}
          {success && <div className="bg-emerald-50 text-emerald-700 text-sm px-4 py-3 rounded-xl font-semibold">Saved!</div>}

          {/* Team Info */}
          <div>
            <h3 className="text-sm font-bold text-[#1d1d1f] mb-3">Team Details</h3>
            <div className="space-y-3">
              <div>
                <label className={lc}>Team Name *</label>
                <input className={fc} value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lc}>Age Group</label>
                  <select className={fc} value={form.age_group} onChange={e => setForm({...form, age_group: e.target.value})}>
                    {AGE_GROUPS.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lc}>Division Level</label>
                  <input className={fc} value={form.division_level} onChange={e => setForm({...form, division_level: e.target.value})} placeholder="e.g. AA, A, B" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lc}>City</label>
                  <input className={fc} value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
                </div>
                <div>
                  <label className={lc}>State</label>
                  <select className={fc} value={form.state} onChange={e => setForm({...form, state: e.target.value})}>
                    <option value="">—</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lc}>Season</label>
                  <select className={fc} value={form.season} onChange={e => setForm({...form, season: e.target.value})}>
                    <option value="">—</option>
                    <option value="2024/2025">2024/2025</option>
                    <option value="2025/2026">2025/2026</option>
                    <option value="2026/2027">2026/2027</option>
                  </select>
                </div>
                <div>
                  <label className={lc}>USA Hockey ID</label>
                  <input className={fc} value={form.usa_hockey_team_id} onChange={e => setForm({...form, usa_hockey_team_id: e.target.value})} placeholder="e.g. 123456" />
                </div>
              </div>
            </div>
          </div>

          {/* Contact Type — prominent */}
          <div className="p-4 rounded-xl bg-[#f0f7ff] border border-[#003e79]/10">
            <label className="block text-sm font-bold text-[#003e79] mb-3">Contact Role</label>
            <p className="text-xs text-[#6e6e73] mb-3">Who is the primary contact for this team? This determines which email lists they appear on.</p>
            <div className="grid grid-cols-5 gap-2">
              {CONTACT_TYPES.map(ct => (
                <button
                  key={ct.value}
                  onClick={() => setForm({...form, contact_type: form.contact_type === ct.value ? '' : ct.value})}
                  className={`px-2 py-2 rounded-xl text-xs font-bold text-center transition border-2 ${
                    form.contact_type === ct.value
                      ? 'border-[#003e79] bg-[#003e79] text-white'
                      : 'border-[#e8e8ed] bg-white text-[#6e6e73] hover:border-[#003e79]/30'
                  }`}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-sm font-bold text-[#1d1d1f] mb-3">Contact Info</h3>
            <div className="space-y-3">
              <div>
                <label className={lc}>Name</label>
                <input className={fc} value={form.head_coach_name} onChange={e => setForm({...form, head_coach_name: e.target.value})} placeholder="Contact name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lc}>Email</label>
                  <input type="email" className={fc} value={form.head_coach_email} onChange={e => setForm({...form, head_coach_email: e.target.value})} placeholder="email@example.com" />
                </div>
                <div>
                  <label className={lc}>Phone</label>
                  <input type="tel" className={fc} value={form.head_coach_phone} onChange={e => setForm({...form, head_coach_phone: e.target.value})} placeholder="312-555-0100" />
                </div>
              </div>
            </div>
          </div>

          {/* Manager */}
          <details className="group">
            <summary className="text-xs font-semibold text-[#003e79] cursor-pointer hover:underline">+ Additional Manager Contact</summary>
            <div className="mt-3 space-y-3 pl-3 border-l-2 border-[#003e79]/10">
              <div>
                <label className={lc}>Manager Name</label>
                <input className={fc} value={form.manager_name} onChange={e => setForm({...form, manager_name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lc}>Manager Email</label>
                  <input type="email" className={fc} value={form.manager_email} onChange={e => setForm({...form, manager_email: e.target.value})} />
                </div>
                <div>
                  <label className={lc}>Manager Phone</label>
                  <input type="tel" className={fc} value={form.manager_phone} onChange={e => setForm({...form, manager_phone: e.target.value})} />
                </div>
              </div>
            </div>
          </details>
        </div>

        <div className="border-t border-[#e8e8ed] px-6 py-4 flex items-center justify-end gap-3 shrink-0 bg-white">
          <button onClick={onClose} className="px-5 py-2.5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-full text-sm transition">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-bold rounded-full text-sm transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Player roster row: shows players under a team ── */
interface Player {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
  position: string | null;
  shoots: string | null;
  date_of_birth: string | null;
  usa_hockey_number: string | null;
  roster_status: string;
  guardians: { user_id: string; first_name: string; last_name: string; email: string; phone: string | null; relationship: string }[];
}

function TeamRosterRow({ teamId }: { teamId: string }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);

  useEffect(() => {
    authFetch(`${API_BASE}/admin/team-roster/${teamId}`)
      .then(r => r.json())
      .then(json => { if (json.success) { setPlayers(json.data || []); setCount(json.count || 0); } setLoading(false); })
      .catch(() => setLoading(false));
  }, [teamId]);

  if (loading) return (
    <tr><td colSpan={5} className="pl-24 pr-5 py-3 bg-[#f8fafc]">
      <div className="flex items-center gap-2 text-xs text-[#86868b]">
        <div className="w-3 h-3 border-2 border-[#00ccff] border-t-transparent rounded-full animate-spin" />
        Loading roster...
      </div>
    </td></tr>
  );

  if (count === 0) return (
    <tr><td colSpan={5} className="pl-24 pr-5 py-4 bg-[#f8fafc] border-b border-[#f0f0f3]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#f5f5f7] flex items-center justify-center">
          <svg className="w-4 h-4 text-[#c7c7cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        </div>
        <div>
          <p className="text-xs text-[#86868b] font-medium">No players on roster yet</p>
          <p className="text-[11px] text-[#c7c7cc] mt-0.5">Players will appear here once added during registration</p>
        </div>
      </div>
    </td></tr>
  );

  return (
    <>
      {/* Roster header */}
      <tr className="bg-[#f8fafc] border-b border-[#eef2f6]">
        <td colSpan={5} className="pl-24 pr-5 py-1.5">
          <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">{count} Player{count !== 1 ? 's' : ''} on Roster</span>
        </td>
      </tr>
      {players.map((player) => (
        <tr key={player.id} className="bg-[#f8fafc] border-b border-[#eef2f6] hover:bg-[#f0f4ff] transition-colors">
          <td className="pl-28 pr-5 py-2">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#003e79]/10 flex items-center justify-center text-[10px] font-bold text-[#003e79]">
                {player.jersey_number || '—'}
              </div>
              <div>
                <p className="text-sm text-[#1d1d1f] font-medium">{player.last_name}, {player.first_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {player.position && (
                    <span className="text-[10px] font-semibold text-[#6e6e73] capitalize">{player.position}</span>
                  )}
                  {player.shoots && (
                    <span className="text-[10px] text-[#86868b]">Shoots {player.shoots.toUpperCase()}</span>
                  )}
                  {player.date_of_birth && (
                    <span className="text-[10px] text-[#c7c7cc]">DOB: {player.date_of_birth}</span>
                  )}
                </div>
              </div>
            </div>
          </td>
          <td className="px-5 py-2">
            {player.usa_hockey_number ? (
              <span className="text-[11px] text-[#6e6e73] font-mono">{player.usa_hockey_number}</span>
            ) : (
              <span className="text-[10px] text-[#c7c7cc] italic">No USA#</span>
            )}
          </td>
          <td className="px-5 py-2">
            {player.guardians.length > 0 ? (
              <div className="space-y-0.5">
                {player.guardians.map((g, i) => (
                  <p key={i} className="text-xs text-[#1d1d1f]">
                    {g.first_name} {g.last_name}
                    <span className="ml-1 text-[10px] text-[#86868b] capitalize">({g.relationship})</span>
                  </p>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-[#c7c7cc] italic">No parent contact</span>
            )}
          </td>
          <td className="px-5 py-2 hidden lg:table-cell">
            {player.guardians.length > 0 ? (
              <div className="space-y-0.5">
                {player.guardians.map((g, i) => (
                  <div key={i}>
                    <p className="text-xs text-[#003e79] truncate max-w-[200px]">{g.email}</p>
                    {g.phone && <p className="text-[11px] text-[#86868b]">{g.phone}</p>}
                  </div>
                ))}
              </div>
            ) : null}
          </td>
          <td className="px-5 py-2 text-right"></td>
        </tr>
      ))}
    </>
  );
}

/* ── Expanded Org Row: shows child teams with nested player expand ── */
function OrgTeamsRow({ orgKey, orgDisplayName, onEdit }: { orgKey: string; orgDisplayName: string; onEdit: (t: Team) => void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [ageFilter, setAgeFilter] = useState<string>('all');

  useEffect(() => {
    // Use orgKey which is either an organization_id or a name-based key
    authFetch(`${API_BASE}/admin/org-teams/${encodeURIComponent(orgKey)}`)
      .then(r => r.json())
      .then(json => { if (json.success) setTeams(json.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [orgKey]);

  if (loading) return (
    <tr><td colSpan={6} className="px-8 py-4 bg-[#f5f5f7]/50">
      <div className="flex items-center gap-2 text-xs text-[#86868b]">
        <div className="w-3.5 h-3.5 border-2 border-[#003e79] border-t-transparent rounded-full animate-spin" />
        Loading teams...
      </div>
    </td></tr>
  );

  // Get unique age groups from this org's teams
  const ageGroups = Array.from(new Set(teams.map(t => t.age_group))).sort();
  const filteredTeams = ageFilter === 'all' ? teams : teams.filter(t => t.age_group === ageFilter);

  return (
    <>
      {/* Age group filter bar (only show if org has more than one age group) */}
      {ageGroups.length > 1 && (
        <tr>
          <td colSpan={6} className="px-8 py-2 bg-[#f0f4f8] border-b border-[#e8e8ed]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider mr-1">Filter:</span>
              <button
                onClick={() => setAgeFilter('all')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                  ageFilter === 'all' ? 'bg-[#003e79] text-white' : 'bg-white text-[#6e6e73] border border-[#e8e8ed] hover:border-[#003e79]/30'
                }`}
              >
                All ({teams.length})
              </button>
              {ageGroups.map(ag => {
                const count = teams.filter(t => t.age_group === ag).length;
                return (
                  <button
                    key={ag}
                    onClick={() => setAgeFilter(ag)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                      ageFilter === ag ? 'bg-[#003e79] text-white' : 'bg-white text-[#6e6e73] border border-[#e8e8ed] hover:border-[#003e79]/30'
                    }`}
                  >
                    {ag} ({count})
                  </button>
                );
              })}
            </div>
          </td>
        </tr>
      )}
      {filteredTeams.map((team) => {
        const isTeamExpanded = expandedTeam === team.id;
        return (
          <tbody key={team.id}>
            <tr
              className={`${isTeamExpanded ? 'bg-[#e8f4ff]' : 'bg-[#fafafa]/80 hover:bg-[#f0f7ff]'} transition-colors cursor-pointer border-b border-[#f0f0f3]`}
              onClick={() => setExpandedTeam(isTeamExpanded ? null : team.id)}
            >
              <td className="pl-14 pr-5 py-2.5">
                <div className="flex items-center gap-2">
                  {/* Expand chevron for player roster */}
                  <div className={`w-4 h-4 rounded flex items-center justify-center transition flex-shrink-0 ${isTeamExpanded ? 'bg-[#00ccff] text-white' : 'bg-transparent text-[#c7c7cc]'}`}>
                    <svg className={`w-2.5 h-2.5 transition-transform ${isTeamExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-[#1d1d1f]">
                      <span className="font-medium">{team.name}</span>
                    </p>
                    <p className="text-xs text-[#6e6e73] flex items-center gap-1.5 mt-0.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        team.age_group === 'Unknown' ? 'bg-amber-50 text-amber-700' : 'bg-[#003e79]/5 text-[#003e79]'
                      }`}>{team.age_group}</span>
                      {team.division_level && <span className="text-xs text-[#6e6e73]">{team.division_level}</span>}
                      {team.player_count > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700">
                          {team.player_count} player{team.player_count !== 1 ? 's' : ''}
                        </span>
                      )}
                      {team.city && <span className="text-[11px] text-[#86868b]">{team.city}{team.state ? `, ${team.state}` : ''}</span>}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-2.5">
                {team.season ? (
                  <span className="text-[10px] font-semibold text-emerald-700">{team.season}</span>
                ) : (
                  <span className="text-[10px] text-[#c7c7cc] italic">—</span>
                )}
              </td>
              <td className="px-5 py-2.5">
                <ContactTypeBadge type={team.contact_type} />
                {team.head_coach_name && <p className="text-xs text-[#1d1d1f] mt-0.5">{team.head_coach_name}</p>}
              </td>
              <td className="px-5 py-2.5 hidden lg:table-cell">
                {team.head_coach_email ? (
                  <div>
                    <p className="text-xs text-[#003e79] truncate max-w-[200px]">{team.head_coach_email}</p>
                    {team.head_coach_phone && <p className="text-[11px] text-[#86868b]">{team.head_coach_phone}</p>}
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-semibold">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                    Missing
                  </span>
                )}
              </td>
              <td className="px-5 py-2.5 text-right">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(team); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#003e79]/10 text-[#86868b] hover:text-[#003e79] transition"
                  title="Edit team"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                </button>
              </td>
            </tr>
            {isTeamExpanded && <TeamRosterRow teamId={team.id} />}
          </tbody>
        );
      })}
    </>
  );
}

/* ══════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════ */
export default function AdminTeamsPage() {
  const [viewMode, setViewMode] = useState<'list' | 'orgs'>('orgs');
  const [stats, setStats] = useState<Stats | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  // List view state
  const [teams, setTeams] = useState<Team[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [ageFilter, setAgeFilter] = useState('all');
  const [contactFilter, setContactFilter] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listTotalPages, setListTotalPages] = useState(1);
  const [listTotal, setListTotal] = useState(0);

  // Org view state
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [debouncedOrgSearch, setDebouncedOrgSearch] = useState('');
  const [orgPage, setOrgPage] = useState(1);
  const [orgTotalPages, setOrgTotalPages] = useState(1);
  const [orgTotal, setOrgTotal] = useState(0);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [seasonFilter, setSeasonFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [events, setEvents] = useState<EventOption[]>([]);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [mergeOrgName, setMergeOrgName] = useState('');
  const [merging, setMerging] = useState(false);
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [editingOrgName, setEditingOrgName] = useState('');

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setListPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedOrgSearch(orgSearch); setOrgPage(1); }, 300);
    return () => clearTimeout(t);
  }, [orgSearch]);

  // Load events for filter dropdown
  useEffect(() => {
    authFetch(`${API_BASE}/admin/events-list`).then(r => r.json()).then(json => {
      if (json.success) setEvents((json.data || []).filter((e: EventOption) => e.team_count > 0));
    }).catch(() => {});
  }, []);

  // Load list view
  const loadList = useCallback(async () => {
    setListLoading(true);
    const params = new URLSearchParams({ page: listPage.toString(), per_page: '50' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (ageFilter !== 'all') params.set('age_group', ageFilter);
    if (contactFilter) params.set('has_contact', contactFilter);
    if (seasonFilter) params.set('season', seasonFilter);
    if (eventFilter) params.set('event_id', eventFilter);
    try {
      const res = await authFetch(`${API_BASE}/admin/list?${params}`);
      const json = await res.json();
      if (json.success) {
        setTeams(json.data || []);
        if (json.pagination) { setListTotalPages(json.pagination.totalPages); setListTotal(json.pagination.total); }
        if (json.stats) setStats(json.stats);
      }
    } catch {}
    setListLoading(false);
  }, [listPage, debouncedSearch, ageFilter, contactFilter, seasonFilter, eventFilter]);

  // Load org view
  const loadOrgs = useCallback(async () => {
    setOrgLoading(true);
    const params = new URLSearchParams({ page: orgPage.toString(), per_page: '30' });
    if (debouncedOrgSearch) params.set('search', debouncedOrgSearch);
    if (seasonFilter) params.set('season', seasonFilter);
    if (eventFilter) params.set('event_id', eventFilter);
    try {
      const res = await authFetch(`${API_BASE}/admin/orgs?${params}`);
      const json = await res.json();
      if (json.success) {
        setOrgs(json.data || []);
        if (json.pagination) { setOrgTotalPages(json.pagination.totalPages); setOrgTotal(json.pagination.total); }
      }
    } catch {}
    setOrgLoading(false);
  }, [orgPage, debouncedOrgSearch, seasonFilter, eventFilter]);

  // Merge handler
  const handleMerge = async () => {
    if (selectedForMerge.size < 2 || !mergeOrgName.trim()) return;
    setMerging(true);
    try {
      // Get all team IDs from selected org rows
      const teamIds: string[] = [];
      for (const orgKey of Array.from(selectedForMerge)) {
        const res = await authFetch(`${API_BASE}/admin/org-teams/${encodeURIComponent(orgKey)}`);
        const json = await res.json();
        if (json.success) {
          for (const t of json.data) teamIds.push(t.id);
        }
      }
      if (teamIds.length > 0) {
        const res = await authFetch(`${API_BASE}/admin/merge-org`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ team_ids: teamIds, org_name: mergeOrgName.trim() })
        });
        const json = await res.json();
        if (json.success) {
          alert(`Merged ${json.teams_linked} teams into "${mergeOrgName}"`);
          setMergeMode(false);
          setSelectedForMerge(new Set());
          setMergeOrgName('');
          loadOrgs();
        }
      }
    } catch (e) { alert('Merge failed'); }
    setMerging(false);
  };

  // Rename org handler
  const handleRenameOrg = async (orgId: string) => {
    if (!editingOrgName.trim()) return;
    try {
      const res = await authFetch(`https://uht.chad-157.workers.dev/api/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingOrgName.trim() })
      });
      const json = await res.json();
      if (json.success) {
        setEditingOrgId(null);
        setEditingOrgName('');
        loadOrgs();
      }
    } catch {}
  };

  // Initial stats load
  useEffect(() => {
    authFetch(`${API_BASE}/admin/list?per_page=1`).then(r => r.json()).then(json => { if (json.stats) setStats(json.stats); });
  }, []);

  useEffect(() => { if (viewMode === 'list') loadList(); }, [viewMode, loadList]);
  useEffect(() => { if (viewMode === 'orgs') loadOrgs(); }, [viewMode, loadOrgs]);

  const handleTeamSaved = () => { if (viewMode === 'list') loadList(); else loadOrgs(); };

  const Pagination = ({ page, totalPages, total, setPage, label }: { page: number; totalPages: number; total: number; setPage: (p: number | ((p: number) => number)) => void; label: string }) => (
    totalPages > 1 ? (
      <div className="px-5 py-4 border-t border-[#e8e8ed] flex items-center justify-between">
        <span className="text-xs text-[#86868b]">Page {page} of {totalPages} ({total.toLocaleString()} {label})</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={page === 1} className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#f5f5f7] hover:bg-[#e8e8ed] disabled:opacity-30 transition">First</button>
          <button onClick={() => setPage((p: number) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#f5f5f7] hover:bg-[#e8e8ed] disabled:opacity-30 transition">Prev</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p: number;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-xs font-semibold transition ${page === p ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#3d3d3d]'}`}>{p}</button>;
          })}
          <button onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#f5f5f7] hover:bg-[#e8e8ed] disabled:opacity-30 transition">Next</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#f5f5f7] hover:bg-[#e8e8ed] disabled:opacity-30 transition">Last</button>
        </div>
      </div>
    ) : null
  );

  return (
    <div className="bg-[#fafafa] min-h-full">
      {editingTeam && <EditTeamDrawer team={editingTeam} onClose={() => setEditingTeam(null)} onSaved={handleTeamSaved} />}

      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Teams</h1>
        {stats && <p className="text-sm text-[#86868b] mt-0.5">{stats.total.toLocaleString()} teams across {stats.unique_orgs?.toLocaleString() || '—'} organizations</p>}
      </div>

      {/* Stats */}
      {stats && (
        <div className="max-w-7xl mx-auto px-6 mt-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
              <div className="text-2xl font-bold text-[#003e79]">{stats.total.toLocaleString()}</div>
              <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">Total Teams</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
              <div className="text-2xl font-bold text-emerald-600">{stats.with_contact.toLocaleString()}</div>
              <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">With Contact</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.coaches.toLocaleString()}</div>
              <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">Coaches</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
              <div className="text-2xl font-bold text-[#1d1d1f]">{stats.unique_orgs?.toLocaleString() || '—'}</div>
              <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">Organizations</div>
            </div>
          </div>
        </div>
      )}

      {/* View Toggle + Content */}
      <div className="max-w-7xl mx-auto px-6 py-5">
        <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden">
          {/* Toolbar */}
          <div className="p-5 border-b border-[#e8e8ed]">
            <div className="flex flex-wrap items-center gap-3">
              {/* View toggle */}
              <div className="flex gap-1 bg-[#f5f5f7] rounded-xl p-1 mr-2">
                <button
                  onClick={() => setViewMode('orgs')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${viewMode === 'orgs' ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#6e6e73]'}`}
                >
                  Organizations
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${viewMode === 'list' ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#6e6e73]'}`}
                >
                  All Teams
                </button>
              </div>

              {/* Search */}
              <div className="flex-1 min-w-[200px] max-w-md relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder={viewMode === 'orgs' ? 'Search organizations...' : 'Search teams, coaches, emails...'}
                  value={viewMode === 'orgs' ? orgSearch : search}
                  onChange={e => viewMode === 'orgs' ? setOrgSearch(e.target.value) : setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-[#e8e8ed] rounded-xl text-sm text-[#1d1d1f] placeholder:text-[#86868b] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                />
              </div>

              {/* Season filter — shows in both views */}
              <select value={seasonFilter} onChange={e => { setSeasonFilter(e.target.value); setListPage(1); setOrgPage(1); }}
                className="px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm bg-white text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none">
                <option value="">All Seasons</option>
                <option value="2025/2026">2025/2026</option>
                <option value="2024/2025">2024/2025</option>
                <option value="2023/2024">2023/2024</option>
                <option value="none">No Season</option>
              </select>

              {/* Event filter */}
              <select value={eventFilter} onChange={e => { setEventFilter(e.target.value); setListPage(1); setOrgPage(1); }}
                className="px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm bg-white text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none max-w-[280px]">
                <option value="">All Events</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name} ({ev.team_count})</option>
                ))}
              </select>

              {viewMode === 'list' && (
                <>
                  <select value={ageFilter} onChange={e => { setAgeFilter(e.target.value); setListPage(1); }}
                    className="px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm bg-white text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none">
                    <option value="all">All Age Groups</option>
                    {AGE_GROUPS.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                  </select>
                  <select value={contactFilter} onChange={e => { setContactFilter(e.target.value); setListPage(1); }}
                    className="px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm bg-white text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none">
                    <option value="">All Teams</option>
                    <option value="yes">Has Contact</option>
                    <option value="no">Missing Contact</option>
                  </select>
                </>
              )}

              {viewMode === 'orgs' && (
                <button
                  onClick={() => { setMergeMode(!mergeMode); setSelectedForMerge(new Set()); setMergeOrgName(''); }}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${mergeMode ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-[#003e79] text-white hover:bg-[#002d5c]'}`}
                >
                  {mergeMode ? 'Cancel Merge' : 'Merge Orgs'}
                </button>
              )}

              <span className="text-xs text-[#86868b] tabular-nums ml-auto">
                {viewMode === 'orgs' ? `${orgTotal.toLocaleString()} orgs` : `${listTotal.toLocaleString()} teams`}
              </span>
            </div>
          </div>

          {/* MERGE BAR */}
          {mergeMode && (
            <div className="px-5 py-3 bg-blue-50 border-b border-blue-100">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-semibold text-blue-900">
                  {selectedForMerge.size === 0 ? 'Select orgs to merge' : `${selectedForMerge.size} org${selectedForMerge.size > 1 ? 's' : ''} selected`}
                </span>
                <button
                  onClick={() => {
                    const allKeys = orgs.map(o => o.organization_id || o.org_key);
                    const allSelected = allKeys.every(k => selectedForMerge.has(k));
                    if (allSelected) {
                      setSelectedForMerge(new Set());
                    } else {
                      setSelectedForMerge(new Set(allKeys));
                    }
                  }}
                  className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition"
                >
                  {orgs.length > 0 && orgs.every(o => selectedForMerge.has(o.organization_id || o.org_key)) ? 'Deselect All' : `Select All (${orgs.length})`}
                </button>
                <div className="flex-1 min-w-[200px] max-w-md">
                  <label className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block mb-1">Organization Name</label>
                  <input
                    type="text"
                    placeholder="Type the org name here..."
                    value={mergeOrgName}
                    onChange={e => setMergeOrgName(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-300 outline-none bg-white"
                  />
                </div>
                <button
                  onClick={handleMerge}
                  disabled={selectedForMerge.size < 2 || !mergeOrgName.trim() || merging}
                  className="px-4 py-2 bg-[#003e79] text-white rounded-lg text-sm font-semibold hover:bg-[#002d5c] disabled:opacity-40 transition"
                >
                  {merging ? 'Merging...' : `Merge ${selectedForMerge.size} orgs`}
                </button>
              </div>
            </div>
          )}

          {/* ORG VIEW */}
          {viewMode === 'orgs' && (
            <>
              {orgLoading ? (
                <div className="py-16 text-center">
                  <div className="inline-block w-6 h-6 border-2 border-[#003e79] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : orgs.length === 0 ? (
                <div className="py-16 text-center"><p className="text-[#86868b] text-sm">No organizations found.</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
                      <th className="text-left px-5 py-2.5 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">Organization</th>
                      <th className="text-left px-5 py-2.5 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">Season</th>
                      <th className="text-left px-5 py-2.5 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">Role</th>
                      <th className="text-left px-5 py-2.5 text-[11px] font-bold text-[#86868b] uppercase tracking-wider hidden lg:table-cell">Contact</th>
                      <th className="text-right px-5 py-2.5 text-[11px] font-bold text-[#86868b] uppercase tracking-wider w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.map((org) => {
                      const isExpanded = expandedOrg === org.org_key;
                      const ageList = org.age_group_list ? org.age_group_list.split(',').filter(a => a !== 'Unknown') : [];
                      return (
                        <tbody key={org.org_key}>
                          <tr
                            className={`group ${isExpanded ? 'bg-[#f0f7ff]' : 'bg-white hover:bg-[#fafafa]'} transition-colors cursor-pointer border-b border-[#e8e8ed] ${mergeMode && selectedForMerge.has(org.organization_id || org.org_key) ? 'bg-blue-50/50' : ''}`}
                            onClick={() => {
                              if (mergeMode) {
                                const key = org.organization_id || org.org_key;
                                setSelectedForMerge(prev => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              } else {
                                setExpandedOrg(isExpanded ? null : org.org_key);
                              }
                            }}
                          >
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                {mergeMode && (
                                  <input
                                    type="checkbox"
                                    checked={selectedForMerge.has(org.organization_id || org.org_key)}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={() => {
                                      const key = org.organization_id || org.org_key;
                                      setSelectedForMerge(prev => {
                                        const next = new Set(prev);
                                        if (next.has(key)) next.delete(key);
                                        else next.add(key);
                                        return next;
                                      });
                                    }}
                                    className="w-4 h-4 rounded border-[#e8e8ed] text-[#003e79] focus:ring-[#003e79]/20"
                                  />
                                )}
                                <div className={`w-5 h-5 rounded flex items-center justify-center transition ${isExpanded ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#86868b]'}`}>
                                  <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                  </svg>
                                </div>
                                <div>
                                  {editingOrgId === (org.organization_id || org.org_key) ? (
                                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                      <input
                                        type="text"
                                        value={editingOrgName}
                                        onChange={e => setEditingOrgName(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' && org.organization_id) handleRenameOrg(org.organization_id);
                                          if (e.key === 'Escape') { setEditingOrgId(null); setEditingOrgName(''); }
                                        }}
                                        autoFocus
                                        className="px-2 py-1 border border-[#003e79] rounded-lg text-sm font-bold text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none w-64"
                                      />
                                      <button onClick={() => org.organization_id && handleRenameOrg(org.organization_id)} className="px-2 py-1 bg-[#003e79] text-white rounded text-xs font-semibold">Save</button>
                                      <button onClick={() => { setEditingOrgId(null); setEditingOrgName(''); }} className="px-2 py-1 bg-[#f5f5f7] text-[#6e6e73] rounded text-xs font-semibold">Cancel</button>
                                    </div>
                                  ) : (
                                    <p className="font-bold text-[#1d1d1f] flex items-center gap-2">
                                      {org.name}
                                      {org.organization_id && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setEditingOrgId(org.organization_id || org.org_key); setEditingOrgName(org.name); }}
                                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#003e79]/10 text-[#c7c7cc] hover:text-[#003e79] transition opacity-0 group-hover:opacity-100"
                                          title="Rename organization"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                                        </button>
                                      )}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <span className="text-[11px] text-[#86868b] font-medium">{org.team_count} teams</span>
                                    {ageList.length > 0 && (
                                      <>
                                        <span className="text-[#e8e8ed]">·</span>
                                        {ageList.slice(0, 4).map(ag => (
                                          <span key={ag} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#003e79]/5 text-[#003e79]">{ag}</span>
                                        ))}
                                        {ageList.length > 4 && <span className="text-[10px] text-[#86868b]">+{ageList.length - 4}</span>}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              {org.latest_season ? (
                                <div>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">{org.latest_season}</span>
                                  {org.seasons && org.seasons.split(',').filter(Boolean).length > 1 && (
                                    <p className="text-[10px] text-[#86868b] mt-0.5">{org.seasons.split(',').filter(Boolean).length} seasons</p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] text-[#c7c7cc] italic">Unknown</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-wrap gap-1">
                                {org.coach_count > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-50 text-blue-700">{org.coach_count} coach{org.coach_count !== 1 ? 'es' : ''}</span>}
                                {org.parent_count > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700">{org.parent_count} parent{org.parent_count !== 1 ? 's' : ''}</span>}
                                {org.manager_count > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-purple-50 text-purple-700">{org.manager_count} mgr{org.manager_count !== 1 ? 's' : ''}</span>}
                              </div>
                              <span className="text-[10px] text-[#86868b] mt-0.5 block">{org.unique_contacts} contact{org.unique_contacts !== 1 ? 's' : ''}</span>
                            </td>
                            <td className="px-5 py-3.5 hidden lg:table-cell">
                              {org.cities && <span className="text-xs text-[#86868b]">{org.cities.split(',').filter(Boolean).slice(0, 2).join(', ')}</span>}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <svg className={`w-4 h-4 text-[#86868b] inline-block transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                              </svg>
                            </td>
                          </tr>
                          {isExpanded && <OrgTeamsRow orgKey={org.organization_id || org.org_key} orgDisplayName={org.name} onEdit={setEditingTeam} />}
                        </tbody>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <Pagination page={orgPage} totalPages={orgTotalPages} total={orgTotal} setPage={setOrgPage} label="organizations" />
            </>
          )}

          {/* LIST VIEW */}
          {viewMode === 'list' && (
            <>
              {listLoading ? (
                <div className="py-16 text-center">
                  <div className="inline-block w-6 h-6 border-2 border-[#003e79] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : teams.length === 0 ? (
                <div className="py-16 text-center"><p className="text-[#86868b] text-sm">No teams found.</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
                        <th className="text-left px-5 py-2.5 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">Team</th>
                        <th className="text-left px-5 py-2.5 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">Age / Div</th>
                        <th className="text-left px-5 py-2.5 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">Season</th>
                        <th className="text-left px-5 py-2.5 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">Role</th>
                        <th className="text-left px-5 py-2.5 text-[11px] font-bold text-[#86868b] uppercase tracking-wider hidden lg:table-cell">Contact</th>
                        <th className="text-right px-5 py-2.5 text-[11px] font-bold text-[#86868b] uppercase tracking-wider w-16">Edit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.map((team, idx) => (
                        <tr
                          key={team.id}
                          className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]/50'} hover:bg-[#f0f7ff] transition-colors cursor-pointer`}
                          onClick={() => setEditingTeam(team)}
                        >
                          <td className="px-5 py-3">
                            <p className="font-semibold text-[#1d1d1f] truncate">{team.name}</p>
                            <p className="text-xs text-[#86868b] mt-0.5">
                              {team.city && team.state ? `${team.city}, ${team.state}` : team.state || team.city || '—'}
                            </p>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              team.age_group === 'Unknown' ? 'bg-amber-50 text-amber-700' : 'bg-[#003e79]/5 text-[#003e79]'
                            }`}>{team.age_group}</span>
                            {team.division_level && <span className="ml-1.5 text-xs text-[#6e6e73]">{team.division_level}</span>}
                          </td>
                          <td className="px-5 py-3">
                            {team.season ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">{team.season}</span>
                            ) : (
                              <span className="text-[10px] text-[#c7c7cc] italic">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3"><ContactTypeBadge type={team.contact_type} /></td>
                          <td className="px-5 py-3">
                            {team.head_coach_name ? (
                              <p className="text-sm text-[#1d1d1f]">{team.head_coach_name}</p>
                            ) : (
                              <span className="text-xs text-[#c7c7cc] italic">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 hidden lg:table-cell">
                            {team.head_coach_email ? (
                              <div>
                                <p className="text-xs text-[#003e79] truncate max-w-[200px]">{team.head_coach_email}</p>
                                {team.head_coach_phone && <p className="text-[11px] text-[#86868b]">{team.head_coach_phone}</p>}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-semibold">Missing</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button onClick={(e) => { e.stopPropagation(); setEditingTeam(team); }}
                              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#003e79]/10 text-[#86868b] hover:text-[#003e79] transition">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={listPage} totalPages={listTotalPages} total={listTotal} setPage={setListPage} label="teams" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
