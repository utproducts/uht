'use client';
import { useState, useEffect, useCallback } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';

interface LookupValue {
  id: string;
  category: string;
  value: string;
  sort_order: number;
  is_active: number;
}

type Category = 'age_group' | 'division' | 'league' | 'team_type' | 'state_divisions';

const CATEGORY_LABELS: Record<Category, { title: string; description: string; icon: string }> = {
  age_group: { title: 'Age Groups', description: 'Age divisions available for team registration', icon: '' },
  division: { title: 'Division Levels', description: 'Global default division levels (AA, Gold, Silver, etc.)', icon: '' },
  state_divisions: { title: 'State Divisions', description: 'Each state has its own division level names', icon: '' },
  league: { title: 'Hometown Leagues', description: 'Local leagues teams can belong to', icon: '' },
  team_type: { title: 'Team Types', description: 'How the team was formed (Draft, Tryout, etc.)', icon: '' },
};

const CATEGORIES: Category[] = ['age_group', 'division', 'state_divisions', 'league', 'team_type'];

// US state codes
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

interface StateDivLevel {
  id: string;
  state: string;
  level_name: string;
  sort_order: number;
  is_active: number;
}

function StateDivisionsPanel() {
  const [levels, setLevels] = useState<StateDivLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = useState('');
  const [newLevel, setNewLevel] = useState('');
  const [adding, setAdding] = useState(false);
  const [statesWithLevels, setStatesWithLevels] = useState<string[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [levelsRes, statesRes] = await Promise.all([
        fetch(`${API}/lookups/state-divisions${selectedState ? `?state=${selectedState}` : ''}`).then(r => r.json()),
        fetch(`${API}/lookups/state-divisions/states`).then(r => r.json()),
      ]);
      if (levelsRes.success) setLevels(levelsRes.data);
      if (statesRes.success) setStatesWithLevels(statesRes.data);
    } catch (_) {}
    setLoading(false);
  }, [selectedState]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleAdd = async () => {
    if (!newLevel.trim() || !selectedState) return;
    setAdding(true);
    try {
      const res = await fetch(`${API}/lookups/state-divisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: selectedState, levelName: newLevel.trim(), sortOrder: levels.length }),
      });
      const json = await res.json();
      if (json.success) {
        setNewLevel('');
        await loadAll();
      } else {
        alert(json.error || 'Failed to add');
      }
    } catch (_) { alert('Failed to add'); }
    setAdding(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await fetch(`${API}/lookups/state-divisions/${id}`, { method: 'DELETE' });
    await loadAll();
  };

  // Group by state for display
  const grouped = levels.reduce<Record<string, StateDivLevel[]>>((acc, l) => {
    if (!acc[l.state]) acc[l.state] = [];
    acc[l.state].push(l);
    return acc;
  }, {});

  return (
    <div className="px-6 py-5">
      {/* State selector */}
      <div className="flex gap-3 items-end mb-5">
        <div className="flex-1">
          <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">Select State</label>
          <select
            value={selectedState}
            onChange={e => setSelectedState(e.target.value)}
            className="w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#00ccff]/30 outline-none"
          >
            <option value="">All States</option>
            {US_STATES.map(s => (
              <option key={s} value={s}>{s}{statesWithLevels.includes(s) ? ` (${(grouped[s] || []).length} levels)` : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Add new level */}
      {selectedState && (
        <div className="flex gap-3 mb-5 bg-[#f5f5f7] rounded-xl p-3">
          <input
            type="text"
            value={newLevel}
            onChange={e => setNewLevel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder={`Add division level for ${selectedState}... (e.g., AA, Tier 1)`}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm focus:outline-none focus:ring-2 focus:ring-[#00ccff]/30"
          />
          <button onClick={handleAdd} disabled={!newLevel.trim() || adding}
            className="px-5 py-2.5 rounded-xl bg-[#00ccff] text-white text-sm font-semibold hover:bg-[#00b8e6] disabled:bg-[#e8e8ed] disabled:text-[#86868b] transition">
            {adding ? '...' : 'Add'}
          </button>
        </div>
      )}

      {/* Display levels */}
      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-10">
          <p className="text-[#86868b] text-sm">{selectedState ? `No division levels for ${selectedState} yet` : 'Select a state to manage its division levels, or view all states'}</p>
          {!selectedState && statesWithLevels.length > 0 && (
            <p className="text-xs text-[#aeaeb2] mt-2">{statesWithLevels.length} states have levels configured</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0])).map(([state, items]) => (
            <div key={state} className="border border-[#e8e8ed] rounded-xl overflow-hidden">
              <div className="bg-[#fafafa] px-4 py-2.5 border-b border-[#e8e8ed] flex items-center justify-between">
                <span className="text-sm font-bold text-[#1d1d1f]">{state}</span>
                <span className="text-xs text-[#86868b]">{items.length} levels</span>
              </div>
              <div className="divide-y divide-[#f0f0f0]">
                {items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#fafafa] transition">
                    <span className="flex-1 text-sm font-medium text-[#1d1d1f]">{item.level_name}</span>
                    <button onClick={() => handleDelete(item.id, item.level_name)}
                      className="p-1 rounded text-[#c8c8cd] hover:text-red-500 hover:bg-red-50 transition" title="Delete">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminSettingsPage() {
  const [lookups, setLookups] = useState<LookupValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Category>('age_group');
  const [showInactive, setShowInactive] = useState(false);

  // Add new item
  const [newValue, setNewValue] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit item
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const loadLookups = useCallback(async () => {
    setLoading(true);
    try {
      const activeParam = showInactive ? '&active=false' : '';
      const res = await fetch(`${API}/lookups?category=${activeTab}${activeParam}`);
      const json = await res.json() as any;
      setLookups(json.data || []);
    } catch (err) {
      console.error('Failed to load lookups:', err);
    }
    setLoading(false);
  }, [activeTab, showInactive]);

  useEffect(() => { loadLookups(); }, [loadLookups]);

  const handleAdd = async () => {
    if (!newValue.trim()) return;
    setAdding(true);
    try {
      await fetch(`${API}/lookups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: activeTab, value: newValue.trim() }),
      });
      setNewValue('');
      await loadLookups();
    } catch (err) {
      alert('Failed to add. Please try again.');
    }
    setAdding(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editValue.trim()) return;
    try {
      await fetch(`${API}/lookups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: editValue.trim() }),
      });
      setEditId(null);
      setEditValue('');
      await loadLookups();
    } catch (err) {
      alert('Failed to update. Please try again.');
    }
  };

  const handleToggleActive = async (item: LookupValue) => {
    try {
      await fetch(`${API}/lookups/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.is_active }),
      });
      await loadLookups();
    } catch (err) {
      alert('Failed to update. Please try again.');
    }
  };

  const handleDelete = async (item: LookupValue) => {
    if (!confirm(`Permanently delete "${item.value}"? This cannot be undone. If teams reference this value, consider deactivating instead.`)) return;
    try {
      await fetch(`${API}/lookups/${item.id}`, { method: 'DELETE' });
      await loadLookups();
    } catch (err) {
      alert('Failed to delete. Please try again.');
    }
  };

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const idx = lookups.findIndex(l => l.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= lookups.length) return;

    const current = lookups[idx];
    const swap = lookups[swapIdx];

    try {
      await Promise.all([
        fetch(`${API}/lookups/${current.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: swap.sort_order }),
        }),
        fetch(`${API}/lookups/${swap.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: current.sort_order }),
        }),
      ]);
      await loadLookups();
    } catch (err) {
      alert('Failed to reorder.');
    }
  };

  const catInfo = CATEGORY_LABELS[activeTab];
  const activeCount = lookups.filter(l => l.is_active).length;

  return (
    <div className="bg-[#fafafa] min-h-full">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Settings</h1>
        <p className="text-sm text-[#86868b] mt-1">Manage the dropdown options available across the platform</p>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Category Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {CATEGORIES.map(cat => {
            const info = CATEGORY_LABELS[cat];
            return (
              <button
                key={cat}
                onClick={() => { setActiveTab(cat); setEditId(null); setNewValue(''); }}
                className={"flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all " +
                  (activeTab === cat
                    ? "bg-[#003e79] text-white shadow-md"
                    : "bg-white text-[#6e6e73] hover:bg-[#f5f5f7] border border-[#e8e8ed]")}
              >
                <span>{info.icon}</span>
                <span>{info.title}</span>
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Category Header */}
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#1d1d1f] flex items-center gap-2">
                <span className="text-2xl">{catInfo.icon}</span>
                {catInfo.title}
              </h2>
              <p className="text-sm text-[#86868b] mt-0.5">{catInfo.description}</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-[#86868b]">{activeCount} active</span>
              <label className="flex items-center gap-2 text-sm text-[#86868b] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={e => setShowInactive(e.target.checked)}
                  className="rounded border-[#e8e8ed]"
                />
                Show inactive
              </label>
            </div>
          </div>

          {/* State Divisions — separate UI */}
          {activeTab === 'state_divisions' && <StateDivisionsPanel />}

          {/* Standard lookup items */}
          {activeTab !== 'state_divisions' && <>
          {/* Add New */}
          <div className="px-6 py-4 bg-[#f5f5f7] border-b border-gray-100">
            <div className="flex gap-3">
              <input
                type="text"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder={`Add new ${catInfo.title.toLowerCase().replace(/s$/, '')}...`}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm focus:outline-none focus:ring-2 focus:ring-[#00ccff]/30 focus:border-[#00ccff]"
              />
              <button
                onClick={handleAdd}
                disabled={!newValue.trim() || adding}
                className={"px-6 py-2.5 rounded-xl text-sm font-semibold transition-all " +
                  (newValue.trim() && !adding
                    ? "bg-[#00ccff] text-white hover:bg-[#00b8e6] shadow-sm"
                    : "bg-[#e8e8ed] text-[#86868b] cursor-not-allowed")}
              >
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>

          {/* Items List */}
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-[#00ccff] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-[#86868b]">Loading...</p>
            </div>
          ) : lookups.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-[#86868b]">No items found. Add one above.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#e8e8ed]">
              {lookups.map((item, idx) => (
                <div
                  key={item.id}
                  className={"flex items-center gap-3 px-6 py-3 group hover:bg-[#f5f5f7] transition-colors " +
                    (!item.is_active ? "opacity-50" : "")}
                >
                  {/* Sort order arrows */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => handleReorder(item.id, 'up')}
                      disabled={idx === 0}
                      className="text-[#86868b] hover:text-[#6e6e73] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button
                      onClick={() => handleReorder(item.id, 'down')}
                      disabled={idx === lookups.length - 1}
                      className="text-[#86868b] hover:text-[#6e6e73] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  </div>

                  {/* Value / Edit */}
                  <div className="flex-1">
                    {editId === item.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleUpdate(item.id); if (e.key === 'Escape') setEditId(null); }}
                          autoFocus
                          className="flex-1 px-3 py-1.5 rounded-lg border border-[#00ccff] text-sm focus:outline-none focus:ring-2 focus:ring-[#00ccff]/30"
                        />
                        <button onClick={() => handleUpdate(item.id)} className="px-3 py-1.5 rounded-lg bg-[#00ccff] text-white text-xs font-semibold hover:bg-[#00b8e6]">Save</button>
                        <button onClick={() => setEditId(null)} className="px-3 py-1.5 rounded-lg bg-[#fafafa] text-[#86868b] text-xs font-semibold hover:bg-[#e8e8ed]">Cancel</button>
                      </div>
                    ) : (
                      <span
                        className="text-sm font-medium text-[#1d1d1f] cursor-pointer hover:text-[#00ccff] transition-colors"
                        onClick={() => { setEditId(item.id); setEditValue(item.value); }}
                        title="Click to edit"
                      >
                        {item.value}
                      </span>
                    )}
                  </div>

                  {/* Sort order badge */}
                  <span className="text-xs text-[#86868b] w-8 text-center">{item.sort_order}</span>

                  {/* Active/Inactive toggle */}
                  <button
                    onClick={() => handleToggleActive(item)}
                    className={"px-3 py-1 rounded-full text-xs font-semibold transition-all " +
                      (item.is_active
                        ? "bg-emerald-50 text-emerald-600 hover:bg-red-50 hover:text-red-500"
                        : "bg-[#fafafa] text-[#86868b] hover:bg-emerald-50 hover:text-emerald-600")}
                    title={item.is_active ? 'Click to deactivate' : 'Click to reactivate'}
                  >
                    {item.is_active ? 'Active' : 'Inactive'}
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(item)}
                    className="p-1.5 rounded-lg text-[#c8c8cd] hover:text-red-500 hover:bg-red-50 transition"
                    title="Delete permanently"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

        </>}
        </div>

        <p className="text-xs text-[#86868b] mt-4 text-center">
          Changes are saved instantly and reflected in the team registration form.
        </p>
      </div>
    </div>
  );
}
