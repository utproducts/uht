'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api/teams';

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
  created_at: string;
}

const AGE_GROUPS = ['Mite', 'Squirt', 'Pee Wee', 'Bantam', '16u/JV', '18u/Var.', 'Unknown'];
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

// ==================
// Edit Team Modal
// ==================
function EditTeamModal({ team, onClose, onSaved }: { team: Team; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: team.name,
    age_group: team.age_group,
    division_level: team.division_level || '',
    city: team.city || '',
    state: team.state || '',
    usa_hockey_team_id: team.usa_hockey_team_id || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Team name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          age_group: form.age_group,
          division_level: form.division_level || null,
          city: form.city || null,
          state: form.state || null,
          usa_hockey_team_id: form.usa_hockey_team_id || null,
        }),
      });
      const json = await res.json();
      if (json.success) { onSaved(); onClose(); }
      else setError(json.error || 'Failed to save');
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  };

  const fc = "w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none";
  const lc = "block text-xs font-semibold text-gray-600 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Edit Team</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
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
              <input className={fc} value={form.division_level} onChange={e => setForm({...form, division_level: e.target.value})} placeholder="e.g. AA, A1, B2" />
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
          <div>
            <label className={lc}>USA Hockey Team ID</label>
            <input className={fc} value={form.usa_hockey_team_id} onChange={e => setForm({...form, usa_hockey_team_id: e.target.value})} />
          </div>
        </div>
        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-sm transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================
// Main Teams Page
// ==================
export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ageFilter, setAgeFilter] = useState('all');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Team | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 50;

  const loadTeams = () => {
    setLoading(true);
    fetch(`${API_BASE}/admin/list`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setTeams(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadTeams(); }, []);

  const handleDelete = async (team: Team) => {
    try {
      const res = await fetch(`${API_BASE}/admin/${team.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { setDeleteConfirm(null); loadTeams(); }
    } catch (e) { console.error(e); }
  };

  // Filters
  const filtered = teams.filter(t => {
    const matchesSearch = !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.city && t.city.toLowerCase().includes(search.toLowerCase())) ||
      (t.organization_name && t.organization_name.toLowerCase().includes(search.toLowerCase()));
    const matchesAge = ageFilter === 'all' || t.age_group === ageFilter;
    return matchesSearch && matchesAge;
  });

  // Pagination
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  // Stats
  const ageBreakdown: Record<string, number> = {};
  teams.forEach(t => {
    ageBreakdown[t.age_group] = (ageBreakdown[t.age_group] || 0) + 1;
  });

  return (
    <div className="bg-gray-100 min-h-full">
      {/* Edit Modal */}
      {editingTeam && (
        <EditTeamModal team={editingTeam} onClose={() => setEditingTeam(null)} onSaved={loadTeams} />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Deactivate Team</h3>
              <p className="text-sm text-gray-500 mb-4">Are you sure you want to deactivate <strong>{deleteConfirm.name}</strong>?</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition">Cancel</button>
                <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition">Deactivate</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Team Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">{teams.length.toLocaleString()} teams in database</p>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="max-w-7xl mx-auto px-6 mt-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{teams.length.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Total Teams</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{teams.filter(t => t.age_group !== 'Unknown').length.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Categorized</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{teams.filter(t => t.age_group === 'Unknown').length.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Needs Review</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{teams.filter(t => t.player_count > 0).length}</div>
            <div className="text-xs text-gray-500 mt-1">With Roster</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto px-6 mt-5 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="flex-1 max-w-sm">
            <input
              type="text"
              placeholder="Search teams, cities, organizations..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
            />
          </div>

          {/* Age Group Filter */}
          <select
            value={ageFilter}
            onChange={(e) => { setAgeFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-cyan-500 outline-none"
          >
            <option value="all">All Age Groups</option>
            {AGE_GROUPS.map(ag => (
              <option key={ag} value={ag}>{ag} ({ageBreakdown[ag] || 0})</option>
            ))}
          </select>

          <span className="text-sm text-gray-500">{filtered.length.toLocaleString()} results</span>
        </div>
      </div>

      {/* Team Table */}
      <div className="max-w-7xl mx-auto px-6 py-5">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            <p className="text-gray-500 font-medium">No teams found</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Team Name</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Age Group</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Division</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Location</th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Players</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map(team => (
                    <tr key={team.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-sm text-gray-900">{team.name}</div>
                        {team.organization_name && <div className="text-xs text-gray-400 mt-0.5">{team.organization_name}</div>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                          team.age_group === 'Unknown' ? 'bg-amber-50 text-amber-700' : 'bg-cyan-50 text-cyan-700'
                        }`}>
                          {team.age_group}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">{team.division_level || '—'}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {team.city && team.state ? `${team.city}, ${team.state}` : team.state || '—'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="text-sm font-bold text-gray-900">{team.player_count}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditingTeam(team)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition" title="Edit">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                          </button>
                          <button onClick={() => setDeleteConfirm(team)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition" title="Deactivate">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-gray-500">
                  Showing {((page-1)*perPage)+1}–{Math.min(page*perPage, filtered.length)} of {filtered.length.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p-1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Prev
                  </button>
                  {Array.from({length: Math.min(7, totalPages)}, (_, i) => {
                    let p: number;
                    if (totalPages <= 7) p = i + 1;
                    else if (page <= 4) p = i + 1;
                    else if (page >= totalPages - 3) p = totalPages - 6 + i;
                    else p = page - 3 + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition ${
                          page === p ? 'bg-cyan-600 text-white shadow' : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p+1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
