'use client';

import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  usa_hockey_number: string | null;
  jersey_number: string | null;
  position: string | null;
  shoots: string | null;
  roster_status: string;
  guardians: Guardian[];
}

interface Guardian {
  player_id: string;
  relationship: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
}

interface Team {
  id: string;
  name: string;
  age_group: string;
  division_level: string | null;
  organization_id: string | null;
  organization_name: string | null;
  city: string | null;
  state: string | null;
  season: string | null;
  head_coach_name: string | null;
  head_coach_email: string | null;
  head_coach_phone: string | null;
  manager_name: string | null;
  manager_email: string | null;
  manager_phone: string | null;
  player_count: number;
  created_at: string;
  created_by: string | null;
  invite_code: string | null;
}

interface OrgGroup {
  org_id: string | null;
  org_name: string;
  teams: Team[];
}

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [viewMode, setViewMode] = useState<'org' | 'list'>('org');
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);

  // Roster expand state
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<{ team: Team } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ new_only: 'true', per_page: '500' });
      if (search) params.set('search', search);
      if (stateFilter) params.set('state', stateFilter);
      if (seasonFilter) params.set('season', seasonFilter);

      const res = await fetch(`${API}/api/teams/admin/list?${params}`, {
        headers: { 'X-Dev-Bypass': 'true', ...(typeof window !== 'undefined' && localStorage.getItem('uht_token') ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` } : {}) },
      });
      const data = await res.json();
      if (data.success) {
        setTeams(data.data || []);
        setTotal(data.pagination?.total || 0);
      }
    } catch (err) {
      console.error('Failed to load teams:', err);
    } finally {
      setLoading(false);
    }
  }, [search, stateFilter, seasonFilter]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // Deep link from event participants: /admin/teams?roster=<teamId>&q=<name>
  // opens with the team searched and its roster expanded
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const rosterTeam = params.get('roster');
    const q = params.get('q');
    if (q) setSearch(q);
    if (rosterTeam) toggleTeamExpand(rosterTeam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch roster when team is expanded
  const toggleTeamExpand = async (teamId: string) => {
    if (expandedTeamId === teamId) {
      setExpandedTeamId(null);
      setRoster([]);
      return;
    }
    setExpandedTeamId(teamId);
    setRosterLoading(true);
    setRoster([]);
    try {
      const res = await fetch(`${API}/api/teams/admin/team-roster/${teamId}`, {
        headers: { 'X-Dev-Bypass': 'true', ...(typeof window !== 'undefined' && localStorage.getItem('uht_token') ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` } : {}) },
      });
      const data = await res.json();
      if (data.success) {
        setRoster(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load roster:', err);
    } finally {
      setRosterLoading(false);
    }
  };

  // Delete team
  const handleDelete = async () => {
    if (!deleteModal || deleteConfirm.toUpperCase() !== 'DELETE') return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API}/api/teams/admin/${deleteModal.team.id}`, {
        method: 'DELETE',
        headers: { 'X-Dev-Bypass': 'true', ...(typeof window !== 'undefined' && localStorage.getItem('uht_token') ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` } : {}) },
      });
      const data = await res.json();
      if (data.success) {
        setTeams(prev => prev.filter(t => t.id !== deleteModal.team.id));
        setTotal(prev => prev - 1);
        if (expandedTeamId === deleteModal.team.id) {
          setExpandedTeamId(null);
          setRoster([]);
        }
        setDeleteModal(null);
        setDeleteConfirm('');
      } else {
        setDeleteError(data.error || 'Failed to delete team');
      }
    } catch (err) {
      setDeleteError('Network error — please try again');
    } finally {
      setDeleting(false);
    }
  };

  // Group teams by organization
  const orgGroups: OrgGroup[] = (() => {
    const map = new Map<string, OrgGroup>();
    const unaffiliated: Team[] = [];

    for (const team of teams) {
      if (team.organization_id && team.organization_name) {
        const key = team.organization_id;
        if (!map.has(key)) {
          map.set(key, { org_id: team.organization_id, org_name: team.organization_name, teams: [] });
        }
        map.get(key)!.teams.push(team);
      } else {
        unaffiliated.push(team);
      }
    }

    const groups = Array.from(map.values()).sort((a, b) => a.org_name.localeCompare(b.org_name));
    if (unaffiliated.length > 0) {
      groups.push({ org_id: null, org_name: 'Unaffiliated', teams: unaffiliated });
    }
    return groups;
  })();

  // Get unique states from loaded teams for filter chips
  const activeStates = Array.from(new Set(teams.map(t => t.state).filter(Boolean))).sort() as string[];

  const toggleOrg = (key: string) => {
    setExpandedOrgs(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => setExpandedOrgs(new Set(orgGroups.map(g => g.org_id || 'unaffiliated')));
  const collapseAll = () => setExpandedOrgs(new Set());

  // Shared team row renderer
  const renderTeamRow = (team: Team, showOrg: boolean) => {
    const isExpanded = expandedTeamId === team.id;
    return (
      <tbody key={team.id}>
        <tr
          onClick={() => toggleTeamExpand(team.id)}
          className={`border-t border-[#f0f0f0] cursor-pointer transition ${isExpanded ? 'bg-[#f0f7ff]' : 'hover:bg-[#fafafa]'}`}
        >
          <td className="px-5 py-3">
            <div className="flex items-center gap-2">
              <svg className={`w-3.5 h-3.5 text-[#86868b] transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-medium text-[#1d1d1f]">{team.name}</span>
            </div>
          </td>
          {showOrg && (
            <td className="px-5 py-3 text-[#6e6e73]">{team.organization_name || '—'}</td>
          )}
          <td className="px-5 py-3">
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
              {team.age_group}
            </span>
          </td>
          <td className="px-5 py-3 text-[#6e6e73]">
            {[team.city, team.state].filter(Boolean).join(', ') || '—'}
          </td>
          <td className="px-5 py-3">
            {team.head_coach_name ? (
              <div>
                <span className="text-[#1d1d1f]">{team.head_coach_name}</span>
                {team.head_coach_email && (
                  <p className="text-[11px] text-[#86868b]">{team.head_coach_email}</p>
                )}
              </div>
            ) : (
              <span className="text-[#c7c7cc]">{'—'}</span>
            )}
          </td>
          <td className="px-5 py-3 text-center">
            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${team.player_count > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-[#f5f5f7] text-[#86868b]'}`}>
              {team.player_count}
            </span>
          </td>
          <td className="px-5 py-3 text-[#6e6e73] text-xs">
            {team.season || <span className="text-[#c7c7cc]">{'—'}</span>}
          </td>
          <td className="px-5 py-3 text-right">
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteModal({ team }); setDeleteConfirm(''); setDeleteError(''); }}
              className="p-1.5 rounded-lg text-[#c7c7cc] hover:text-red-500 hover:bg-red-50 transition"
              title="Delete team"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </td>
        </tr>

        {/* Expanded roster panel */}
        {isExpanded && (
          <tr>
            <td colSpan={showOrg ? 8 : 7} className="p-0">
              <div className="bg-[#f8fafc] border-t border-b border-[#e0e7ef]">
                {/* Team contact header */}
                <div className="px-6 py-4 border-b border-[#e8e8ed]">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[#86868b] mb-3">Team Contacts</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {team.head_coach_name && (
                      <div className="flex items-start gap-3 bg-white rounded-lg border border-[#e8e8ed] p-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          HC
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#1d1d1f]">{team.head_coach_name}</p>
                          <p className="text-xs text-[#86868b]">Head Coach</p>
                          {team.head_coach_email && <p className="text-xs text-[#003e79] mt-0.5">{team.head_coach_email}</p>}
                          {team.head_coach_phone && <p className="text-xs text-[#6e6e73]">{team.head_coach_phone}</p>}
                        </div>
                      </div>
                    )}
                    {team.manager_name && (
                      <div className="flex items-start gap-3 bg-white rounded-lg border border-[#e8e8ed] p-3">
                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          TM
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#1d1d1f]">{team.manager_name}</p>
                          <p className="text-xs text-[#86868b]">Team Manager</p>
                          {team.manager_email && <p className="text-xs text-[#003e79] mt-0.5">{team.manager_email}</p>}
                          {team.manager_phone && <p className="text-xs text-[#6e6e73]">{team.manager_phone}</p>}
                        </div>
                      </div>
                    )}
                    {!team.head_coach_name && !team.manager_name && (
                      <p className="text-sm text-[#86868b]">No team contacts on file</p>
                    )}
                  </div>
                </div>

                {/* Player roster */}
                <div className="px-6 py-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[#86868b] mb-3">
                    Player Roster {!rosterLoading && `(${roster.length})`}
                  </h4>

                  {rosterLoading ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-[#86868b]">
                      <div className="animate-spin h-4 w-4 border-2 border-[#003e79] border-t-transparent rounded-full" />
                      Loading roster...
                    </div>
                  ) : roster.length === 0 ? (
                    <p className="text-sm text-[#86868b] py-2">No players on this roster yet</p>
                  ) : (
                    <div className="bg-white rounded-lg border border-[#e8e8ed] overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[#fafafa] text-left text-[10px] uppercase tracking-wide text-[#86868b]">
                            <th className="px-4 py-2 font-medium w-10">#</th>
                            <th className="px-4 py-2 font-medium">Player</th>
                            <th className="px-4 py-2 font-medium">Position</th>
                            <th className="px-4 py-2 font-medium">Shoots</th>
                            <th className="px-4 py-2 font-medium">DOB</th>
                            <th className="px-4 py-2 font-medium">Parent / Guardian</th>
                            <th className="px-4 py-2 font-medium">Contact</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roster.map((player) => (
                            <tr key={player.id} className="border-t border-[#f0f0f0]">
                              <td className="px-4 py-2.5 text-[#6e6e73] font-mono text-xs">
                                {player.jersey_number || '—'}
                              </td>
                              <td className="px-4 py-2.5 font-medium text-[#1d1d1f]">
                                {player.first_name} {player.last_name}
                              </td>
                              <td className="px-4 py-2.5 text-[#6e6e73]">
                                {player.position || '—'}
                              </td>
                              <td className="px-4 py-2.5 text-[#6e6e73]">
                                {player.shoots || '—'}
                              </td>
                              <td className="px-4 py-2.5 text-[#6e6e73] text-xs">
                                {player.date_of_birth ? new Date(player.date_of_birth).toLocaleDateString() : '—'}
                              </td>
                              <td className="px-4 py-2.5">
                                {player.guardians.length > 0 ? (
                                  <div className="space-y-1">
                                    {player.guardians.map((g, gi) => (
                                      <div key={gi} className="text-xs">
                                        <span className="text-[#1d1d1f]">{g.first_name} {g.last_name}</span>
                                        <span className="text-[#c7c7cc] ml-1">({g.relationship})</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[#c7c7cc] text-xs">{'—'}</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                {player.guardians.length > 0 ? (
                                  <div className="space-y-1">
                                    {player.guardians.map((g, gi) => (
                                      <div key={gi} className="text-xs">
                                        {g.email && <p className="text-[#003e79]">{g.email}</p>}
                                        {g.phone && <p className="text-[#6e6e73]">{g.phone}</p>}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[#c7c7cc] text-xs">{'—'}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </td>
          </tr>
        )}
      </tbody>
    );
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1d1d1f]">Teams</h1>
        <p className="text-sm text-[#86868b] mt-1">
          Teams created through the new system, organized by organization
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-[#e8e8ed] p-4">
          <p className="text-2xl font-semibold text-[#1d1d1f]">{total}</p>
          <p className="text-xs text-[#86868b] mt-0.5">Total Teams</p>
        </div>
        <div className="bg-white rounded-xl border border-[#e8e8ed] p-4">
          <p className="text-2xl font-semibold text-[#1d1d1f]">{orgGroups.filter(g => g.org_id).length}</p>
          <p className="text-xs text-[#86868b] mt-0.5">Organizations</p>
        </div>
        <div className="bg-white rounded-xl border border-[#e8e8ed] p-4">
          <p className="text-2xl font-semibold text-[#1d1d1f]">{activeStates.length}</p>
          <p className="text-xs text-[#86868b] mt-0.5">States</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-[#e8e8ed] p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search teams, coaches, cities..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#e8e8ed] text-sm focus:border-[#003e79] focus:ring-1 focus:ring-[#003e79]/20 outline-none"
            />
          </div>

          {/* State filter */}
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#e8e8ed] text-sm bg-white focus:border-[#003e79] outline-none"
          >
            <option value="">All States</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Season filter */}
          <select
            value={seasonFilter}
            onChange={e => setSeasonFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#e8e8ed] text-sm bg-white focus:border-[#003e79] outline-none"
          >
            <option value="">All Seasons</option>
            <option value="2026-2027">2026-2027</option>
            <option value="2027-2028">2027-2028</option>
            <option value="none">No Season Set</option>
          </select>

          {/* View toggle */}
          <div className="flex bg-[#f5f5f7] rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('org')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${viewMode === 'org' ? 'bg-white shadow-sm text-[#1d1d1f]' : 'text-[#86868b]'}`}
            >
              By Org
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${viewMode === 'list' ? 'bg-white shadow-sm text-[#1d1d1f]' : 'text-[#86868b]'}`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 border-3 border-[#003e79] border-t-transparent rounded-full" />
        </div>
      ) : teams.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e8e8ed] p-12 text-center">
          <div className="h-16 w-16 bg-[#f5f5f7] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-[#1d1d1f]">No teams yet</h3>
          <p className="text-sm text-[#86868b] mt-1">
            Teams will appear here as coaches create them through the registration system
          </p>
        </div>
      ) : viewMode === 'org' ? (
        /* ORG VIEW */
        <div>
          <div className="flex justify-end gap-2 mb-3">
            <button onClick={expandAll} className="text-xs text-[#003e79] hover:underline">Expand All</button>
            <span className="text-[#e8e8ed]">|</span>
            <button onClick={collapseAll} className="text-xs text-[#003e79] hover:underline">Collapse All</button>
          </div>
          <div className="space-y-3">
            {orgGroups.map(group => {
              const key = group.org_id || 'unaffiliated';
              const isExpanded = expandedOrgs.has(key);
              return (
                <div key={key} className="bg-white rounded-xl border border-[#e8e8ed] overflow-hidden">
                  {/* Org header */}
                  <button
                    onClick={() => toggleOrg(key)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#fafafa] transition"
                  >
                    <div className="flex items-center gap-3">
                      <svg className={`w-4 h-4 text-[#86868b] transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <div className="text-left">
                        <span className="font-semibold text-[#1d1d1f]">{group.org_name}</span>
                        {group.teams[0]?.state && (
                          <span className="ml-2 px-2 py-0.5 bg-[#f0f7ff] text-[#003e79] text-[11px] font-medium rounded-full">
                            {group.teams[0].state}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-[#86868b]">
                      {group.teams.length} team{group.teams.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {/* Expanded team list */}
                  {isExpanded && (
                    <div className="border-t border-[#e8e8ed]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[#fafafa] text-left text-[11px] uppercase tracking-wide text-[#86868b]">
                            <th className="px-5 py-2 font-medium">Team Name</th>
                            <th className="px-5 py-2 font-medium">Age Group</th>
                            <th className="px-5 py-2 font-medium">Location</th>
                            <th className="px-5 py-2 font-medium">Head Coach</th>
                            <th className="px-5 py-2 font-medium">Players</th>
                            <th className="px-5 py-2 font-medium">Season</th>
                            <th className="px-5 py-2 font-medium w-10"></th>
                          </tr>
                        </thead>
                        {group.teams.map(team => renderTeamRow(team, false))}
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* LIST VIEW */
        <div className="bg-white rounded-xl border border-[#e8e8ed] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-left text-[11px] uppercase tracking-wide text-[#86868b] border-b border-[#e8e8ed]">
                <th className="px-5 py-3 font-medium">Team</th>
                <th className="px-5 py-3 font-medium">Organization</th>
                <th className="px-5 py-3 font-medium">Age Group</th>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Coach</th>
                <th className="px-5 py-3 font-medium">Players</th>
                <th className="px-5 py-3 font-medium">Season</th>
                <th className="px-5 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            {teams.map(team => renderTeamRow(team, true))}
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDeleteModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#1d1d1f]">Delete Team</h3>
                  <p className="text-sm text-[#86868b]">This action cannot be undone</p>
                </div>
              </div>

              <div className="bg-[#fafafa] rounded-lg p-4 mb-4">
                <p className="text-sm text-[#1d1d1f]">
                  <span className="font-semibold">{deleteModal.team.name}</span>
                  {deleteModal.team.organization_name && (
                    <span className="text-[#86868b]"> ({deleteModal.team.organization_name})</span>
                  )}
                </p>
                {deleteModal.team.player_count > 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    This team has {deleteModal.team.player_count} player{deleteModal.team.player_count !== 1 ? 's' : ''} on the roster
                  </p>
                )}
              </div>

              {deleteError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
                  <p className="text-sm text-red-700">{deleteError}</p>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm text-[#6e6e73] mb-1.5">
                  Type <span className="font-semibold text-[#1d1d1f]">delete</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder="delete"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-[#e8e8ed] text-sm focus:border-red-400 focus:ring-1 focus:ring-red-200 outline-none"
                  onKeyDown={e => { if (e.key === 'Enter' && deleteConfirm.toUpperCase() === 'DELETE') handleDelete(); }}
                />
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 bg-[#fafafa] border-t border-[#e8e8ed]">
              <button
                onClick={() => setDeleteModal(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#e8e8ed] text-sm font-medium text-[#1d1d1f] hover:bg-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirm.toUpperCase() !== 'DELETE' || deleting}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {deleting ? 'Deleting...' : 'Delete Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
