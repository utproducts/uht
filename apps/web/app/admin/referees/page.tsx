'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';
const headers: Record<string, string> = { 'X-Dev-Bypass': 'true' };
const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

interface City { id: string; name: string; state: string; }
interface Referee {
  id: string; type: string; first_name: string; last_name: string;
  email: string; phone: string | null; city_id: string | null;
  city_name: string | null; city_state: string | null;
  stripe_account_id: string | null; stripe_onboarding_complete: number;
  tax_info_collected: number; is_active: number; notes: string | null;
  invite_token: string | null; created_at: string;
}
interface Rate {
  id: string; age_group: string; role: string; rate_cents: number; season: string;
}

const AGE_GROUPS = ['Mite', 'Squirt', 'Pee Wee', 'Bantam', 'Midget', '16U', '18U', 'High School', 'Adult'];
const CURRENT_SEASON = '2025/2026';

// ──────────────────────────────────────
// STATUS BADGES
// ──────────────────────────────────────
function OnboardingBadge({ referee }: { referee: Referee }) {
  if (referee.stripe_onboarding_complete) {
    return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">VERIFIED</span>;
  }
  if (referee.stripe_account_id) {
    return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">PENDING</span>;
  }
  return <span className="px-2 py-0.5 bg-[#e8e8ed] text-[#86868b] rounded-full text-[10px] font-bold">NOT STARTED</span>;
}

// ──────────────────────────────────────
// MAIN PAGE
// ──────────────────────────────────────
export default function RefereesPage() {
  const [tab, setTab] = useState<'individuals' | 'assigners' | 'rates'>('individuals');
  const [referees, setReferees] = useState<Referee[]>([]);
  const [assigners, setAssigners] = useState<Referee[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);

  // Add referee form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState<'individual' | 'assigner'>('individual');
  const [addFirst, setAddFirst] = useState('');
  const [addLast, setAddLast] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addCityId, setAddCityId] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit referee
  const [editingRef, setEditingRef] = useState<Referee | null>(null);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCityId, setEditCityId] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Rate form
  const [addRateGroup, setAddRateGroup] = useState(AGE_GROUPS[0]);
  const [addRateRole, setAddRateRole] = useState<'referee' | 'linesman'>('referee');
  const [addRateDollars, setAddRateDollars] = useState('');
  const [addRateSeason, setAddRateSeason] = useState(CURRENT_SEASON);
  const [savingRate, setSavingRate] = useState(false);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [refRes, assignerRes, rateRes, cityRes] = await Promise.all([
        fetch(`${API_BASE}/referees?type=individual`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/referees?type=assigner`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/referees/rates`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/cities`, { headers }).then(r => r.json()),
      ]);
      if (refRes.success) setReferees(refRes.data);
      if (assignerRes.success) setAssigners(assignerRes.data);
      if (rateRes.success) setRates(rateRes.data);
      if (cityRes.success) setCities(cityRes.data);
    } catch (e) {
      console.error('Failed to load data', e);
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!addFirst.trim() || !addLast.trim() || !addEmail.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/referees`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({
          type: addType,
          first_name: addFirst, last_name: addLast,
          email: addEmail, phone: addPhone || undefined,
          city_id: addCityId || undefined, notes: addNotes || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowAddForm(false);
        setAddFirst(''); setAddLast(''); setAddEmail(''); setAddPhone(''); setAddCityId(''); setAddNotes('');
        await loadAll();
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const startEdit = (ref: Referee) => {
    setEditingRef(ref);
    setEditFirst(ref.first_name); setEditLast(ref.last_name);
    setEditEmail(ref.email); setEditPhone(ref.phone || '');
    setEditCityId(ref.city_id || ''); setEditNotes(ref.notes || '');
  };

  const handleEdit = async () => {
    if (!editingRef || !editFirst.trim() || !editLast.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/referees/${editingRef.id}`, {
        method: 'PUT', headers: jsonHeaders,
        body: JSON.stringify({
          first_name: editFirst, last_name: editLast,
          email: editEmail, phone: editPhone || null,
          city_id: editCityId || null, notes: editNotes || null,
        }),
      });
      const json = await res.json();
      if (json.success) { setEditingRef(null); await loadAll(); }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/referees/${id}`, {
        method: 'DELETE', headers,
      });
      const json = await res.json();
      if (json.success) { setConfirmDelete(null); await loadAll(); }
    } catch (e) { console.error(e); }
  };

  const handleAddRate = async () => {
    if (!addRateDollars) return;
    setSavingRate(true);
    try {
      const res = await fetch(`${API_BASE}/referees/rates`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({
          age_group: addRateGroup,
          role: addRateRole,
          rate_cents: Math.round(parseFloat(addRateDollars) * 100),
          season: addRateSeason,
        }),
      });
      const json = await res.json();
      if (json.success) { setAddRateDollars(''); await loadAll(); }
    } catch (e) { console.error(e); }
    setSavingRate(false);
  };

  const handleDeleteRate = async (id: string) => {
    try {
      await fetch(`${API_BASE}/referees/rates/${id}`, { method: 'DELETE', headers });
      await loadAll();
    } catch (e) { console.error(e); }
  };

  const inputCls = "w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-cyan-600 outline-none";
  const fmtDollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const tabData = tab === 'individuals' ? referees : assigners;

  if (loading) {
    return (
      <div className="bg-[#fafafa] min-h-full">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#fafafa] min-h-full">
      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <p className="text-[#1d1d1f] font-medium mb-4">Delete &ldquo;{confirmDelete.name}&rdquo;?</p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(confirmDelete.id)} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm transition">Delete</button>
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2 bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-lg text-sm transition hover:bg-[#d8d8dd]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingRef && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditingRef(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#003e79] to-[#005599] rounded-t-2xl px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Edit {editingRef.type === 'assigner' ? 'Assigner' : 'Referee'}</h3>
              <button onClick={() => setEditingRef(null)} className="text-white/70 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">First Name</label>
                  <input value={editFirst} onChange={e => setEditFirst(e.target.value)} className={inputCls} /></div>
                <div><label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">Last Name</label>
                  <input value={editLast} onChange={e => setEditLast(e.target.value)} className={inputCls} /></div>
              </div>
              <div><label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">Email</label>
                <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className={inputCls} /></div>
              <div><label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">Phone</label>
                <input value={editPhone} onChange={e => setEditPhone(e.target.value)} className={inputCls} /></div>
              <div><label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">City</label>
                <select value={editCityId} onChange={e => setEditCityId(e.target.value)} className={inputCls}>
                  <option value="">No city assigned</option>
                  {cities.map(c => <option key={c.id} value={c.id}>{c.name}, {c.state}</option>)}
                </select></div>
              <div><label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">Notes</label>
                <input value={editNotes} onChange={e => setEditNotes(e.target.value)} className={inputCls} /></div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleEdit} disabled={saving} className="flex-1 px-4 py-2 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-lg text-sm transition disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
                <button onClick={() => setEditingRef(null)} className="flex-1 px-4 py-2 bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-lg text-sm transition hover:bg-[#d8d8dd]">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Referees</h1>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Individual Refs', value: referees.length },
            { label: 'Assigners', value: assigners.length },
            { label: 'Onboarded', value: [...referees, ...assigners].filter(r => r.stripe_onboarding_complete).length },
            { label: 'Rate Cards', value: rates.length },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
              <div className="text-2xl font-bold text-[#003e79]">{s.value}</div>
              <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1">
            {([
              { key: 'individuals', label: 'Referees', count: referees.length },
              { key: 'assigners', label: 'Assigners', count: assigners.length },
              { key: 'rates', label: 'Pay Rates', count: rates.length },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setShowAddForm(false); }}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
                  tab === t.key ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                }`}
              >
                {t.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  tab === t.key ? 'bg-[#003e79] text-white' : 'bg-[#d8d8dd] text-[#6e6e73]'
                }`}>{t.count}</span>
              </button>
            ))}
          </div>
          {tab !== 'rates' && (
            <button
              onClick={() => { setShowAddForm(true); setAddType(tab === 'assigners' ? 'assigner' : 'individual'); }}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg text-sm transition"
            >
              + Add {tab === 'assigners' ? 'Assigner' : 'Referee'}
            </button>
          )}
        </div>

        {/* RATES TAB */}
        {tab === 'rates' && (
          <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
            <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Pay Rates by Age Group</h2>
            <p className="text-sm text-[#86868b] mb-6">Set the per-game rate for referees and linesmen at each age group. Rates are tied to a season.</p>

            {/* Add Rate Form */}
            <div className="bg-[#fafafa] border border-[#e8e8ed] rounded-xl p-4 mb-6">
              <h3 className="font-semibold text-[#1d1d1f] text-sm mb-3">Add / Update Rate</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">Age Group</label>
                  <select value={addRateGroup} onChange={e => setAddRateGroup(e.target.value)} className={inputCls}>
                    {AGE_GROUPS.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">Role</label>
                  <select value={addRateRole} onChange={e => setAddRateRole(e.target.value as any)} className={inputCls}>
                    <option value="referee">Referee</option>
                    <option value="linesman">Linesman</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">Rate ($)</label>
                  <input type="number" step="0.01" min="0" placeholder="75.00" value={addRateDollars} onChange={e => setAddRateDollars(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">Season</label>
                  <select value={addRateSeason} onChange={e => setAddRateSeason(e.target.value)} className={inputCls}>
                    <option value="2025/2026">2025/2026</option>
                    <option value="2024/2025">2024/2025</option>
                  </select>
                </div>
                <button onClick={handleAddRate} disabled={!addRateDollars || savingRate} className="px-4 py-2 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-lg text-sm transition disabled:opacity-50 h-[38px]">
                  {savingRate ? 'Saving...' : 'Save Rate'}
                </button>
              </div>
            </div>

            {/* Rate Table */}
            {(() => {
              const seasons = Array.from(new Set(rates.map(r => r.season))).sort().reverse();
              return seasons.map(season => {
                const seasonRates = rates.filter(r => r.season === season);
                const ageGroups = Array.from(new Set(seasonRates.map(r => r.age_group)));
                // Sort age groups by AGE_GROUPS order
                ageGroups.sort((a, b) => AGE_GROUPS.indexOf(a) - AGE_GROUPS.indexOf(b));

                return (
                  <div key={season} className="mb-6">
                    <h3 className="font-semibold text-[#1d1d1f] text-sm mb-3">{season}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
                            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left">Age Group</th>
                            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left">Role</th>
                            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-right">Rate / Game</th>
                            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-center w-16"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e8e8ed]">
                          {seasonRates.sort((a, b) => {
                            const ai = AGE_GROUPS.indexOf(a.age_group);
                            const bi = AGE_GROUPS.indexOf(b.age_group);
                            if (ai !== bi) return ai - bi;
                            return a.role.localeCompare(b.role);
                          }).map(rate => (
                            <tr key={rate.id} className="hover:bg-[#fafafa]">
                              <td className="px-4 py-3 font-semibold text-[#1d1d1f]">{rate.age_group}</td>
                              <td className="px-4 py-3 text-[#3d3d3d] capitalize">{rate.role}</td>
                              <td className="px-4 py-3 text-right font-bold text-[#003e79]">{fmtDollars(rate.rate_cents)}</td>
                              <td className="px-4 py-3 text-center">
                                <button onClick={() => handleDeleteRate(rate.id)} className="p-1 hover:bg-red-50 rounded transition text-[#86868b] hover:text-red-500">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              });
            })()}

            {rates.length === 0 && (
              <div className="text-center py-8 text-sm text-[#86868b]">No rates configured yet. Add your first rate above.</div>
            )}
          </div>
        )}

        {/* REFEREES / ASSIGNERS TAB */}
        {tab !== 'rates' && (
          <>
            {/* Add Form */}
            {showAddForm && (
              <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
                <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Add {addType === 'assigner' ? 'Referee Assigner' : 'Individual Referee'}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">First Name</label>
                    <input value={addFirst} onChange={e => setAddFirst(e.target.value)} placeholder="John" className={inputCls} autoFocus /></div>
                  <div><label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">Last Name</label>
                    <input value={addLast} onChange={e => setAddLast(e.target.value)} placeholder="Smith" className={inputCls} /></div>
                  <div><label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">Email</label>
                    <input type="email" value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="john@example.com" className={inputCls} /></div>
                  <div><label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">Phone</label>
                    <input value={addPhone} onChange={e => setAddPhone(e.target.value)} placeholder="(555) 123-4567" className={inputCls} /></div>
                  <div><label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">City</label>
                    <select value={addCityId} onChange={e => setAddCityId(e.target.value)} className={inputCls}>
                      <option value="">Select city...</option>
                      {cities.map(c => <option key={c.id} value={c.id}>{c.name}, {c.state}</option>)}
                    </select></div>
                  <div><label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">Notes</label>
                    <input value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="Optional notes..." className={inputCls} /></div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={handleAdd} disabled={!addFirst.trim() || !addLast.trim() || !addEmail.trim() || saving} className="px-6 py-2 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-lg text-sm transition disabled:opacity-50">{saving ? 'Saving...' : 'Add'}</button>
                  <button onClick={() => setShowAddForm(false)} className="px-6 py-2 bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-lg text-sm transition hover:bg-[#d8d8dd]">Cancel</button>
                </div>
              </div>
            )}

            {/* List */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden">
              {tabData.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
                      <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left">Name</th>
                      <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left">Email</th>
                      <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left">City</th>
                      <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-center">Onboarding</th>
                      <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-center w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e8ed]">
                    {tabData.map(ref => (
                      <tr key={ref.id} className="hover:bg-[#fafafa] transition">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#1d1d1f]">{ref.first_name} {ref.last_name}</div>
                          {ref.phone && <div className="text-[10px] text-[#86868b] mt-0.5">{ref.phone}</div>}
                        </td>
                        <td className="px-4 py-3 text-[#3d3d3d]">{ref.email}</td>
                        <td className="px-4 py-3 text-[#3d3d3d]">
                          {ref.city_name ? `${ref.city_name}, ${ref.city_state}` : <span className="text-[#86868b]">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center"><OnboardingBadge referee={ref} /></td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => startEdit(ref)} className="p-1.5 hover:bg-[#f5f5f7] rounded-lg transition text-[#86868b] hover:text-[#3d3d3d]" title="Edit">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                            </button>
                            <button onClick={() => setConfirmDelete({ id: ref.id, name: `${ref.first_name} ${ref.last_name}` })} className="p-1.5 hover:bg-red-50 rounded-lg transition text-[#86868b] hover:text-red-500" title="Delete">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-[#86868b]">No {tab === 'assigners' ? 'assigners' : 'referees'} yet. Add one to get started.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
