'use client';

import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

interface Coupon {
  id: string;
  code: string;
  discount_type: 'fixed' | 'percent';
  discount_amount: number;
  max_uses: number | null;
  current_uses: number;
  is_active: number;
  event_id: string | null;
  event_name: string | null;
  expires_at: string | null;
  created_at: string;
  created_by: string;
}

interface EventOption {
  id: string;
  name: string;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('uht_token');
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  return res.json();
}

function formatDiscount(type: string, amount: number): string {
  if (type === 'fixed') {
    return `$${(amount / 100).toFixed(2)}`;
  }
  return `${amount}%`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function CouponsAdminPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<'fixed' | 'percent'>('fixed');
  const [newAmount, setNewAmount] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('');
  const [unlimitedUses, setUnlimitedUses] = useState(true);
  const [newEventId, setNewEventId] = useState('');
  const [newExpiresAt, setNewExpiresAt] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editType, setEditType] = useState<'fixed' | 'percent'>('fixed');
  const [editAmount, setEditAmount] = useState('');
  const [editMaxUses, setEditMaxUses] = useState('');
  const [editUnlimited, setEditUnlimited] = useState(true);
  const [editEventId, setEditEventId] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');

  const loadCoupons = useCallback(async () => {
    try {
      const data = await apiFetch('/api/coupons/admin');
      if (data.success) setCoupons(data.data);
    } catch {}
    setLoading(false);
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const data = await apiFetch('/api/events');
      if (data.success) {
        setEvents((data.data || []).map((e: any) => ({ id: e.id, name: e.name })));
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadCoupons();
    loadEvents();
  }, [loadCoupons, loadEvents]);

  // Create coupon
  const handleCreate = async () => {
    const amountValue = newType === 'fixed'
      ? Math.round(parseFloat(newAmount) * 100)
      : parseInt(newAmount);

    if (!amountValue || amountValue <= 0) return;

    setSaving(true);
    const body: any = {
      code: autoGenerate ? null : newCode.trim().toUpperCase(),
      discount_type: newType,
      discount_amount: amountValue,
      max_uses: unlimitedUses ? null : (parseInt(newMaxUses) || null),
      event_id: newEventId || null,
      expires_at: newExpiresAt || null,
    };

    const result = await apiFetch('/api/coupons/admin', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (result.success) {
      setShowCreate(false);
      resetCreateForm();
      await loadCoupons();
    } else {
      alert(result.error || 'Failed to create coupon');
    }
    setSaving(false);
  };

  const resetCreateForm = () => {
    setAutoGenerate(true);
    setNewCode('');
    setNewType('fixed');
    setNewAmount('');
    setNewMaxUses('');
    setUnlimitedUses(true);
    setNewEventId('');
    setNewExpiresAt('');
  };

  // Toggle active
  const handleToggleActive = async (coupon: Coupon) => {
    setSaving(true);
    await apiFetch(`/api/coupons/admin/${coupon.id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: coupon.is_active ? 0 : 1 }),
    });
    await loadCoupons();
    setSaving(false);
  };

  // Delete coupon
  const handleDelete = async (coupon: Coupon) => {
    if (!confirm(`Delete coupon "${coupon.code}"? This cannot be undone.`)) return;
    setSaving(true);
    await apiFetch(`/api/coupons/admin/${coupon.id}`, { method: 'DELETE' });
    await loadCoupons();
    setSaving(false);
  };

  // Start editing
  const startEdit = (coupon: Coupon) => {
    setEditingId(coupon.id);
    setEditCode(coupon.code);
    setEditType(coupon.discount_type);
    setEditAmount(coupon.discount_type === 'fixed' ? (coupon.discount_amount / 100).toString() : coupon.discount_amount.toString());
    setEditMaxUses(coupon.max_uses?.toString() || '');
    setEditUnlimited(coupon.max_uses === null);
    setEditEventId(coupon.event_id || '');
    setEditExpiresAt(coupon.expires_at ? coupon.expires_at.split('T')[0] : '');
  };

  // Save edit
  const handleSaveEdit = async () => {
    if (!editingId) return;
    const amountValue = editType === 'fixed'
      ? Math.round(parseFloat(editAmount) * 100)
      : parseInt(editAmount);

    if (!amountValue || amountValue <= 0) return;

    setSaving(true);
    const body: any = {
      code: editCode.trim().toUpperCase(),
      discount_type: editType,
      discount_amount: amountValue,
      max_uses: editUnlimited ? null : (parseInt(editMaxUses) || null),
      event_id: editEventId || null,
      expires_at: editExpiresAt || null,
    };

    const result = await apiFetch(`/api/coupons/admin/${editingId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    if (result.success) {
      setEditingId(null);
      await loadCoupons();
    } else {
      alert(result.error || 'Failed to update coupon');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1d1d1f]">Coupon Codes</h1>
          <p className="text-sm text-[#86868b] mt-1">
            {coupons.length} coupon{coupons.length !== 1 ? 's' : ''} &middot; {coupons.filter(c => c.is_active).length} active
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-[#003e79] text-white text-sm font-semibold rounded-lg hover:bg-[#002d5a] transition"
        >
          + Create Coupon
        </button>
      </div>

      {saving && (
        <div className="mb-4 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
          Saving...
        </div>
      )}

      {/* Create Coupon Form */}
      {showCreate && (
        <div className="mb-6 bg-white border border-[#e8e8ed] rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4">New Coupon Code</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Code */}
            <div>
              <label className="block text-sm font-medium text-[#6e6e73] mb-1">Coupon Code</label>
              <div className="flex items-center gap-3 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoGenerate}
                    onChange={(e) => setAutoGenerate(e.target.checked)}
                    className="rounded border-[#d2d2d7] text-[#003e79] focus:ring-[#003e79]"
                  />
                  <span className="text-sm text-[#6e6e73]">Auto-generate</span>
                </label>
              </div>
              {!autoGenerate && (
                <input
                  type="text"
                  placeholder="e.g. EARLYBIRD50"
                  value={newCode}
                  onChange={e => setNewCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30 uppercase font-mono"
                />
              )}
              {autoGenerate && (
                <p className="text-xs text-[#86868b]">A random 8-character code will be generated</p>
              )}
            </div>

            {/* Discount Type + Amount */}
            <div>
              <label className="block text-sm font-medium text-[#6e6e73] mb-1">Discount</label>
              <div className="flex gap-2">
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value as 'fixed' | 'percent')}
                  className="px-3 py-2 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30"
                >
                  <option value="fixed">Fixed ($)</option>
                  <option value="percent">Percentage (%)</option>
                </select>
                <div className="relative flex-1">
                  {newType === 'fixed' && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b] text-sm">$</span>
                  )}
                  <input
                    type="number"
                    placeholder={newType === 'fixed' ? '50.00' : '10'}
                    value={newAmount}
                    onChange={e => setNewAmount(e.target.value)}
                    className={`w-full py-2 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30 ${newType === 'fixed' ? 'pl-7 pr-3' : 'px-3'}`}
                    min="0"
                    step={newType === 'fixed' ? '0.01' : '1'}
                  />
                  {newType === 'percent' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868b] text-sm">%</span>
                  )}
                </div>
              </div>
            </div>

            {/* Max Uses */}
            <div>
              <label className="block text-sm font-medium text-[#6e6e73] mb-1">Usage Limit</label>
              <div className="flex items-center gap-3 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unlimitedUses}
                    onChange={(e) => setUnlimitedUses(e.target.checked)}
                    className="rounded border-[#d2d2d7] text-[#003e79] focus:ring-[#003e79]"
                  />
                  <span className="text-sm text-[#6e6e73]">Unlimited</span>
                </label>
              </div>
              {!unlimitedUses && (
                <input
                  type="number"
                  placeholder="e.g. 100"
                  value={newMaxUses}
                  onChange={e => setNewMaxUses(e.target.value)}
                  className="w-full px-3 py-2 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30"
                  min="1"
                />
              )}
            </div>

            {/* Event Restriction */}
            <div>
              <label className="block text-sm font-medium text-[#6e6e73] mb-1">Event (optional)</label>
              <select
                value={newEventId}
                onChange={e => setNewEventId(e.target.value)}
                className="w-full px-3 py-2 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30"
              >
                <option value="">All Events</option>
                {events.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <p className="text-xs text-[#86868b] mt-1">Leave blank for all events</p>
            </div>

            {/* Expiration */}
            <div>
              <label className="block text-sm font-medium text-[#6e6e73] mb-1">Expires (optional)</label>
              <input
                type="date"
                value={newExpiresAt}
                onChange={e => setNewExpiresAt(e.target.value)}
                className="w-full px-3 py-2 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30"
              />
              <p className="text-xs text-[#86868b] mt-1">Leave blank for no expiration</p>
            </div>
          </div>

          <div className="flex gap-2 mt-5 pt-4 border-t border-[#e8e8ed]">
            <button
              onClick={handleCreate}
              disabled={!newAmount || saving}
              className="px-5 py-2 bg-[#003e79] text-white text-sm font-semibold rounded-lg hover:bg-[#002d5a] disabled:opacity-50 transition"
            >
              Create Coupon
            </button>
            <button
              onClick={() => { setShowCreate(false); resetCreateForm(); }}
              className="px-5 py-2 bg-[#f5f5f7] text-[#6e6e73] text-sm font-semibold rounded-lg hover:bg-[#e8e8ed] transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Coupons Table */}
      {coupons.length > 0 ? (
        <div className="bg-white border border-[#e8e8ed] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e8e8ed] bg-[#f9f9fb]">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#86868b] uppercase tracking-wider">Code</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#86868b] uppercase tracking-wider">Discount</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#86868b] uppercase tracking-wider">Uses</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#86868b] uppercase tracking-wider">Event</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#86868b] uppercase tracking-wider">Expires</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#86868b] uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#86868b] uppercase tracking-wider">Created</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-[#86868b] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map(coupon => {
                  const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
                  const isMaxedOut = coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses;
                  const isEditing = editingId === coupon.id;

                  if (isEditing) {
                    return (
                      <tr key={coupon.id} className="border-b border-[#f5f5f7] bg-[#f9f9fb]">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-[#86868b] mb-1">Code</label>
                              <input
                                type="text"
                                value={editCode}
                                onChange={e => setEditCode(e.target.value.toUpperCase())}
                                className="w-full px-3 py-1.5 border border-[#d2d2d7] rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#003e79]/30"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-[#86868b] mb-1">Type</label>
                              <select
                                value={editType}
                                onChange={e => setEditType(e.target.value as 'fixed' | 'percent')}
                                className="w-full px-3 py-1.5 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30"
                              >
                                <option value="fixed">Fixed ($)</option>
                                <option value="percent">Percentage (%)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-[#86868b] mb-1">Amount</label>
                              <input
                                type="number"
                                value={editAmount}
                                onChange={e => setEditAmount(e.target.value)}
                                className="w-full px-3 py-1.5 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30"
                                min="0"
                                step={editType === 'fixed' ? '0.01' : '1'}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-[#86868b] mb-1">Max Uses</label>
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editUnlimited}
                                    onChange={e => setEditUnlimited(e.target.checked)}
                                    className="rounded border-[#d2d2d7] text-[#003e79] focus:ring-[#003e79]"
                                  />
                                  <span className="text-xs text-[#6e6e73]">Unlimited</span>
                                </label>
                                {!editUnlimited && (
                                  <input
                                    type="number"
                                    value={editMaxUses}
                                    onChange={e => setEditMaxUses(e.target.value)}
                                    className="w-20 px-2 py-1.5 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30"
                                    min="1"
                                  />
                                )}
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-[#86868b] mb-1">Event</label>
                              <select
                                value={editEventId}
                                onChange={e => setEditEventId(e.target.value)}
                                className="w-full px-3 py-1.5 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30"
                              >
                                <option value="">All Events</option>
                                {events.map(e => (
                                  <option key={e.id} value={e.id}>{e.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-[#86868b] mb-1">Expires</label>
                              <input
                                type="date"
                                value={editExpiresAt}
                                onChange={e => setEditExpiresAt(e.target.value)}
                                className="w-full px-3 py-1.5 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button onClick={handleSaveEdit} className="px-4 py-1.5 bg-[#003e79] text-white text-xs font-semibold rounded-lg hover:bg-[#002d5a] transition">
                              Save
                            </button>
                            <button onClick={() => setEditingId(null)} className="px-4 py-1.5 bg-[#f5f5f7] text-[#6e6e73] text-xs font-semibold rounded-lg hover:bg-[#e8e8ed] transition">
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={coupon.id} className={`border-b border-[#f5f5f7] last:border-0 hover:bg-[#fafafa] transition ${!coupon.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3">
                        <span className="font-mono text-sm font-semibold text-[#1d1d1f] bg-[#f0f7ff] px-2 py-0.5 rounded">
                          {coupon.code}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-sm font-semibold text-[#003e79]">
                          {formatDiscount(coupon.discount_type, coupon.discount_amount)}
                        </span>
                        <span className="text-xs text-[#86868b] ml-1">
                          {coupon.discount_type === 'fixed' ? 'off' : 'off'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-sm text-[#1d1d1f]">
                          {coupon.current_uses}
                          {coupon.max_uses !== null ? ` / ${coupon.max_uses}` : ''}
                        </span>
                        {coupon.max_uses === null && (
                          <span className="text-xs text-[#86868b] ml-1">unlimited</span>
                        )}
                        {isMaxedOut && (
                          <span className="ml-2 text-xs text-orange-600 font-medium">maxed</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-sm text-[#6e6e73]">
                          {coupon.event_name || 'All Events'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-sm ${isExpired ? 'text-red-600 font-medium' : 'text-[#6e6e73]'}`}>
                          {coupon.expires_at ? formatDate(coupon.expires_at) : 'Never'}
                          {isExpired && ' (expired)'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => handleToggleActive(coupon)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                            coupon.is_active
                              ? 'bg-green-50 text-green-700 hover:bg-green-100'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${coupon.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {coupon.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-[#86868b]">
                          {formatDate(coupon.created_at)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startEdit(coupon)}
                            className="text-[#86868b] hover:text-[#003e79] transition"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(coupon)}
                            className="text-[#86868b] hover:text-red-600 transition"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-white border border-[#e8e8ed] rounded-xl">
          <div className="text-4xl mb-3">%</div>
          <p className="text-[#86868b] text-lg">No coupon codes yet</p>
          <p className="text-[#86868b] text-sm mt-1">Click "Create Coupon" to get started</p>
        </div>
      )}
    </div>
  );
}
