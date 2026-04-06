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

type Category = 'age_group' | 'division' | 'league' | 'team_type';

const CATEGORY_LABELS: Record<Category, { title: string; description: string; icon: string }> = {
  age_group: { title: 'Age Groups', description: 'Age divisions available for team registration', icon: '👦' },
  division: { title: 'Division Levels', description: 'Skill/competition level tiers (AA, Gold, Silver, etc.)', icon: '🏆' },
  league: { title: 'Hometown Leagues', description: 'Local leagues teams can belong to', icon: '🏒' },
  team_type: { title: 'Team Types', description: 'How the team was formed (Draft, Tryout, etc.)', icon: '📋' },
};

const CATEGORIES: Category[] = ['age_group', 'division', 'league', 'team_type'];

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
    <div className="bg-gray-100 min-h-full">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage the dropdown options available across the platform</p>
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
                    : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200")}
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
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="text-2xl">{catInfo.icon}</span>
                {catInfo.title}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">{catInfo.description}</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">{activeCount} active</span>
              <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={e => setShowInactive(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Show inactive
              </label>
            </div>
          </div>

          {/* Add New */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
            <div className="flex gap-3">
              <input
                type="text"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder={`Add new ${catInfo.title.toLowerCase().replace(/s$/, '')}...`}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#00ccff]/30 focus:border-[#00ccff]"
              />
              <button
                onClick={handleAdd}
                disabled={!newValue.trim() || adding}
                className={"px-6 py-2.5 rounded-xl text-sm font-semibold transition-all " +
                  (newValue.trim() && !adding
                    ? "bg-[#00ccff] text-white hover:bg-[#00b8e6] shadow-sm"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed")}
              >
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>

          {/* Items List */}
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-[#00ccff] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">Loading...</p>
            </div>
          ) : lookups.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-gray-400">No items found. Add one above.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {lookups.map((item, idx) => (
                <div
                  key={item.id}
                  className={"flex items-center gap-3 px-6 py-3 group hover:bg-gray-50 transition-colors " +
                    (!item.is_active ? "opacity-50" : "")}
                >
                  {/* Sort order arrows */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => handleReorder(item.id, 'up')}
                      disabled={idx === 0}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button
                      onClick={() => handleReorder(item.id, 'down')}
                      disabled={idx === lookups.length - 1}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
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
                        <button onClick={() => setEditId(null)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 text-xs font-semibold hover:bg-gray-200">Cancel</button>
                      </div>
                    ) : (
                      <span
                        className="text-sm font-medium text-gray-900 cursor-pointer hover:text-[#00ccff] transition-colors"
                        onClick={() => { setEditId(item.id); setEditValue(item.value); }}
                        title="Click to edit"
                      >
                        {item.value}
                      </span>
                    )}
                  </div>

                  {/* Sort order badge */}
                  <span className="text-xs text-gray-300 w-8 text-center">{item.sort_order}</span>

                  {/* Active/Inactive toggle */}
                  <button
                    onClick={() => handleToggleActive(item)}
                    className={"px-3 py-1 rounded-full text-xs font-semibold transition-all " +
                      (item.is_active
                        ? "bg-emerald-50 text-emerald-600 hover:bg-red-50 hover:text-red-500"
                        : "bg-gray-100 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600")}
                    title={item.is_active ? 'Click to deactivate' : 'Click to reactivate'}
                  >
                    {item.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-4 text-center">
          Changes are saved instantly and reflected in the team registration form.
          Deactivated items are hidden from dropdowns but preserved for historical data.
        </p>
      </div>
    </div>
  );
}
