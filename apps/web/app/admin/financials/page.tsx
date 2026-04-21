'use client';

import { useState, useEffect, useCallback } from 'react';

const API = 'https://uht.chad-157.workers.dev/api/financials';
const EVENTS_API = 'https://uht.chad-157.workers.dev/api/events';

const fmt = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtMonth = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(parseInt(y), parseInt(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const EXPENSE_CATEGORIES: Record<string, { label: string; color: string }> = {
  rink_rental: { label: 'Rink Rental', color: 'bg-blue-500' },
  referees: { label: 'Referees', color: 'bg-orange-500' },
  trophies: { label: 'Trophies/Awards', color: 'bg-yellow-500' },
  hotel_costs: { label: 'Hotel Costs', color: 'bg-purple-500' },
  marketing: { label: 'Marketing', color: 'bg-pink-500' },
  travel: { label: 'Travel', color: 'bg-cyan-500' },
  supplies: { label: 'Supplies', color: 'bg-green-500' },
  insurance: { label: 'Insurance', color: 'bg-red-500' },
  staff: { label: 'Staff', color: 'bg-indigo-500' },
  other: { label: 'Other', color: 'bg-gray-500' },
};

/* ─── Bar component for simple horizontal bars ─── */
function Bar({ value, max, color = 'bg-[#003e79]' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-[#f0f0f3] rounded-full h-2.5">
      <div className={`h-2.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   ADD/EDIT EXPENSE MODAL
   ═══════════════════════════════════════════ */
function ExpenseModal({ eventId, expense, onSave, onClose }: {
  eventId: string;
  expense: any | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    category: expense?.category || 'rink_rental',
    description: expense?.description || '',
    amount: expense ? String(expense.amount_cents / 100) : '',
    vendor: expense?.vendor || '',
    date: expense?.date || '',
    notes: expense?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.description || !form.amount) return;
    setSaving(true);
    const body = {
      event_id: eventId,
      category: form.category,
      description: form.description,
      amount_cents: Math.round(parseFloat(form.amount) * 100),
      vendor: form.vendor || null,
      date: form.date || null,
      notes: form.notes || null,
    };
    const url = expense ? `${API}/expenses/${expense.id}` : `${API}/expenses`;
    await fetch(url, {
      method: expense ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-[#1d1d1f] mb-4">{expense ? 'Edit Expense' : 'Add Expense'}</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">Category</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm">
              {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">Description</label>
            <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" placeholder="e.g. Friday night ice rental" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#86868b] mb-1">Amount ($)</label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#86868b] mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">Vendor</label>
            <input type="text" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })}
              className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" placeholder="e.g. Compton Family Ice Arena" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" rows={2} />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-xl text-sm transition">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.description || !form.amount}
            className="flex-1 px-4 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ADD/EDIT REBATE MODAL
   ═══════════════════════════════════════════ */
function RebateModal({ eventId, eventCity, eventState, rebate, onSave, onClose }: {
  eventId: string;
  eventCity: string;
  eventState: string;
  rebate: any | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    hotel_name: rebate?.hotel_name || '',
    rebate_type: rebate?.rebate_type || 'per_night',
    rate_amount: rebate?.rate_amount ? String(rebate.rate_amount) : '',
    room_nights: rebate?.room_nights ? String(rebate.room_nights) : '',
    total_rebate: rebate ? String(rebate.total_rebate_cents / 100) : '',
    notes: rebate?.notes || '',
    date_received: rebate?.date_received || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.hotel_name || !form.total_rebate) return;
    setSaving(true);
    const body = {
      event_id: eventId,
      hotel_name: form.hotel_name,
      city: eventCity,
      state: eventState,
      rebate_type: form.rebate_type,
      rate_amount: form.rate_amount ? parseFloat(form.rate_amount) : null,
      room_nights: form.room_nights ? parseInt(form.room_nights) : null,
      total_rebate_cents: Math.round(parseFloat(form.total_rebate) * 100),
      notes: form.notes || null,
      date_received: form.date_received || null,
    };
    const url = rebate ? `${API}/rebates/${rebate.id}` : `${API}/rebates`;
    await fetch(url, {
      method: rebate ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-[#1d1d1f] mb-4">{rebate ? 'Edit Hotel Rebate' : 'Add Hotel Rebate'}</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">Hotel Name</label>
            <input type="text" value={form.hotel_name} onChange={e => setForm({ ...form, hotel_name: e.target.value })}
              className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" placeholder="e.g. Embassy Suites" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#86868b] mb-1">Rebate Type</label>
              <select value={form.rebate_type} onChange={e => setForm({ ...form, rebate_type: e.target.value })}
                className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm">
                <option value="per_night">Per Room Night</option>
                <option value="flat_fee">Flat Fee</option>
                <option value="percentage">Percentage</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#86868b] mb-1">Rate ($)</label>
              <input type="number" step="0.01" value={form.rate_amount} onChange={e => setForm({ ...form, rate_amount: e.target.value })}
                className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" placeholder="e.g. 10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#86868b] mb-1">Room Nights</label>
              <input type="number" value={form.room_nights} onChange={e => setForm({ ...form, room_nights: e.target.value })}
                className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#86868b] mb-1">Total Rebate ($)</label>
              <input type="number" step="0.01" value={form.total_rebate} onChange={e => setForm({ ...form, total_rebate: e.target.value })}
                className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">Date Received</label>
            <input type="date" value={form.date_received} onChange={e => setForm({ ...form, date_received: e.target.value })}
              className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" rows={2} />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-xl text-sm transition">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.hotel_name || !form.total_rebate}
            className="flex-1 px-4 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   EVENT P&L DETAIL VIEW
   ═══════════════════════════════════════════ */
function EventPnL({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expenseModal, setExpenseModal] = useState<any | false>(false);
  const [rebateModal, setRebateModal] = useState<any | false>(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/event-pnl/${eventId}`)
      .then(r => r.json())
      .then(json => { if (json.success) setData(json.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    await fetch(`${API}/expenses/${id}`, { method: 'DELETE' });
    load();
  };

  const handleDeleteRebate = async (id: string) => {
    if (!confirm('Delete this rebate?')) return;
    await fetch(`${API}/rebates/${id}`, { method: 'DELETE' });
    load();
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>;
  if (!data) return <div className="text-center py-16 text-[#86868b]">Event not found.</div>;

  const { event, revenue, revenueByDivision, expenses, expenseTotals, rebates, summary } = data;
  const isProfit = summary.net_income_cents >= 0;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-[#003e79] hover:text-[#002d5a] font-medium text-sm mb-4 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Back to Financials
      </button>

      {/* Event header */}
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 mb-6">
        <h2 className="text-xl font-extrabold text-[#1d1d1f] mb-1">{event.name}</h2>
        <p className="text-sm text-[#86868b]">{event.city}, {event.state}</p>
      </div>

      {/* P&L Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
          <div className="text-2xl font-bold text-green-600">{fmt(summary.total_revenue_cents)}</div>
          <div className="text-xs text-[#86868b] mt-1 font-semibold">Revenue</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
          <div className="text-2xl font-bold text-red-500">{fmt(summary.total_expenses_cents)}</div>
          <div className="text-xs text-[#86868b] mt-1 font-semibold">Expenses</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
          <div className="text-2xl font-bold text-blue-600">{fmt(summary.total_rebates_cents)}</div>
          <div className="text-xs text-[#86868b] mt-1 font-semibold">Hotel Rebates</div>
        </div>
        <div className={`rounded-2xl border p-5 text-center ${isProfit ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className={`text-2xl font-bold ${isProfit ? 'text-green-700' : 'text-red-600'}`}>{fmt(summary.net_income_cents)}</div>
          <div className="text-xs text-[#86868b] mt-1 font-semibold">Net {isProfit ? 'Profit' : 'Loss'}</div>
        </div>
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Breakdown */}
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6">
          <h3 className="text-base font-bold text-[#1d1d1f] mb-4">Revenue by Division</h3>
          <div className="space-y-3">
            {revenue.team_count > 0 && (
              <div className="flex items-center justify-between text-sm pb-2 border-b border-[#f0f0f3]">
                <span className="text-[#86868b]">{revenue.paid_teams} paid / {revenue.unpaid_teams} unpaid of {revenue.team_count} teams</span>
              </div>
            )}
            {revenueByDivision.map((d: any) => (
              <div key={d.age_group + d.division_level} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-semibold text-[#1d1d1f]">{d.age_group}</span>
                  {d.division_level && <span className="text-[#86868b] ml-1">{d.division_level}</span>}
                  <span className="text-xs text-[#86868b] ml-2">({d.team_count} teams)</span>
                </div>
                <span className="font-bold text-green-600">{fmt(d.revenue_cents)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-[#1d1d1f]">Expenses by Category</h3>
            <button onClick={() => setExpenseModal(null)} className="px-3 py-1.5 bg-[#003e79] text-white text-xs font-semibold rounded-lg hover:bg-[#002d5a] transition">+ Add</button>
          </div>
          {expenseTotals.length === 0 ? (
            <p className="text-sm text-[#86868b] text-center py-4">No expenses recorded yet. Click "+ Add" to start tracking.</p>
          ) : (
            <div className="space-y-3">
              {expenseTotals.map((et: any) => {
                const cat = EXPENSE_CATEGORIES[et.category] || { label: et.category, color: 'bg-gray-500' };
                return (
                  <div key={et.category}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${cat.color}`} />
                        <span className="font-semibold text-[#1d1d1f]">{cat.label}</span>
                        <span className="text-xs text-[#86868b]">({et.line_items})</span>
                      </div>
                      <span className="font-bold text-red-500">{fmt(et.total_cents)}</span>
                    </div>
                    <Bar value={et.total_cents} max={summary.total_expenses_cents} color={cat.color} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Expense Detail Table */}
      {expenses.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 mt-6">
          <h3 className="text-base font-bold text-[#1d1d1f] mb-4">All Expenses</h3>
          <div className="rounded-xl border border-[#e8e8ed] overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
                <th className="text-left px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase">Category</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase">Description</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase hidden md:table-cell">Vendor</th>
                <th className="text-right px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase">Amount</th>
                <th className="text-right px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase w-20"></th>
              </tr></thead>
              <tbody>
                {expenses.map((exp: any, i: number) => (
                  <tr key={exp.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'} hover:bg-[#f0f7ff]`}>
                    <td className="px-4 py-2.5"><span className="text-xs font-medium text-[#6e6e73]">{EXPENSE_CATEGORIES[exp.category]?.label || exp.category}</span></td>
                    <td className="px-4 py-2.5 font-medium text-[#1d1d1f]">{exp.description}</td>
                    <td className="px-4 py-2.5 text-[#86868b] hidden md:table-cell">{exp.vendor || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-red-500">{fmt(exp.amount_cents)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setExpenseModal(exp)} className="text-[#86868b] hover:text-[#003e79] text-xs mr-2">Edit</button>
                      <button onClick={() => handleDeleteExpense(exp.id)} className="text-[#86868b] hover:text-red-500 text-xs">Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hotel Rebates */}
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-[#1d1d1f]">Hotel Rebates</h3>
          <button onClick={() => setRebateModal(null)} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition">+ Add Rebate</button>
        </div>
        {rebates.length === 0 ? (
          <p className="text-sm text-[#86868b] text-center py-4">No hotel rebates recorded yet.</p>
        ) : (
          <div className="rounded-xl border border-[#e8e8ed] overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
                <th className="text-left px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase">Hotel</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase hidden sm:table-cell">Type</th>
                <th className="text-center px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase hidden md:table-cell">Room Nights</th>
                <th className="text-right px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase">Rebate</th>
                <th className="text-right px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase w-20"></th>
              </tr></thead>
              <tbody>
                {rebates.map((rb: any, i: number) => (
                  <tr key={rb.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'} hover:bg-[#f0f7ff]`}>
                    <td className="px-4 py-2.5 font-medium text-[#1d1d1f]">{rb.hotel_name}</td>
                    <td className="px-4 py-2.5 text-[#86868b] hidden sm:table-cell">{rb.rebate_type === 'per_night' ? 'Per Night' : rb.rebate_type === 'flat_fee' ? 'Flat Fee' : rb.rebate_type === 'percentage' ? '%' : 'Other'}</td>
                    <td className="px-4 py-2.5 text-center hidden md:table-cell">{rb.room_nights || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-blue-600">{fmt(rb.total_rebate_cents)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setRebateModal(rb)} className="text-[#86868b] hover:text-[#003e79] text-xs mr-2">Edit</button>
                      <button onClick={() => handleDeleteRebate(rb.id)} className="text-[#86868b] hover:text-red-500 text-xs">Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {expenseModal !== false && (
        <ExpenseModal eventId={eventId} expense={expenseModal} onSave={() => { setExpenseModal(false); load(); }} onClose={() => setExpenseModal(false)} />
      )}
      {rebateModal !== false && (
        <RebateModal eventId={eventId} eventCity={event.city} eventState={event.state} rebate={rebateModal} onSave={() => { setRebateModal(false); load(); }} onClose={() => setRebateModal(false)} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN FINANCIALS PAGE
   ═══════════════════════════════════════════ */
export default function AdminFinancialsPage() {
  const [tab, setTab] = useState<'overview' | 'events' | 'cities' | 'yoy'>('overview');
  const [dashboard, setDashboard] = useState<any>(null);
  const [yoyData, setYoyData] = useState<any>(null);
  const [cityData, setCityData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>('');
  const [seasonFilter, setSeasonFilter] = useState<string>('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Load dashboard data
  const loadDashboard = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (yearFilter) params.set('year', yearFilter);
    if (seasonFilter) params.set('season', seasonFilter);
    fetch(`${API}/dashboard?${params}`)
      .then(r => r.json())
      .then(json => { if (json.success) setDashboard(json.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [yearFilter, seasonFilter]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Load YoY when tab opens
  useEffect(() => {
    if (tab === 'yoy' && !yoyData) {
      fetch(`${API}/yoy`).then(r => r.json()).then(json => { if (json.success) setYoyData(json.data); });
    }
  }, [tab]);

  // Load city data when tab opens
  useEffect(() => {
    if (tab === 'cities') {
      const params = new URLSearchParams();
      if (yearFilter) params.set('year', yearFilter);
      fetch(`${API}/by-city?${params}`).then(r => r.json()).then(json => { if (json.success) setCityData(json.data); });
    }
  }, [tab, yearFilter]);

  if (selectedEventId) {
    return (
      <div className="bg-[#fafafa] min-h-full">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <EventPnL eventId={selectedEventId} onBack={() => setSelectedEventId(null)} />
        </div>
      </div>
    );
  }

  const events = dashboard?.revenueByEvent || [];
  const totalRevenue = events.reduce((s: number, e: any) => s + e.revenue_cents, 0);
  const totalTeams = events.reduce((s: number, e: any) => s + e.team_count, 0);
  const totalEvents = events.length;
  const avgPerEvent = totalEvents > 0 ? totalRevenue / totalEvents : 0;
  const avgPerTeam = totalTeams > 0 ? totalRevenue / totalTeams : 0;

  // For overview revenue by month
  const months = dashboard?.revenueByMonth || [];
  const maxMonthRev = Math.max(...months.map((m: any) => m.revenue_cents), 1);

  return (
    <div className="bg-[#fafafa] min-h-full">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Financial Reports</h1>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {dashboard?.filters && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-[#86868b] uppercase tracking-widest">Year:</label>
                <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1">
                  <button onClick={() => setYearFilter('')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${!yearFilter ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73]'}`}>
                    All
                  </button>
                  {dashboard.filters.years.map((y: string) => (
                    <button key={y} onClick={() => setYearFilter(y)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${yearFilter === y ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73]'}`}>
                      {y}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-[#86868b] uppercase tracking-widest">Season:</label>
                <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1">
                  <button onClick={() => setSeasonFilter('')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${!seasonFilter ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73]'}`}>
                    All
                  </button>
                  {dashboard.filters.seasons.map((s: string) => (
                    <button key={s} onClick={() => setSeasonFilter(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${seasonFilter === s ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73]'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1 w-fit">
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'events', label: 'Event P&Ls' },
            { key: 'cities', label: 'By City' },
            { key: 'yoy', label: 'Year over Year' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${tab === t.key ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>
        ) : (
          <>
            {/* ════════ OVERVIEW TAB ════════ */}
            {tab === 'overview' && (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
                    <div className="text-2xl font-bold text-green-600">{fmt(totalRevenue)}</div>
                    <div className="text-xs text-[#86868b] mt-1 font-semibold">Total Revenue</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
                    <div className="text-2xl font-bold text-[#003e79]">{totalTeams.toLocaleString()}</div>
                    <div className="text-xs text-[#86868b] mt-1 font-semibold">Total Teams</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
                    <div className="text-2xl font-bold text-[#1d1d1f]">{totalEvents}</div>
                    <div className="text-xs text-[#86868b] mt-1 font-semibold">Events</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
                    <div className="text-2xl font-bold text-purple-600">{fmt(avgPerEvent)}</div>
                    <div className="text-xs text-[#86868b] mt-1 font-semibold">Avg / Event</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
                    <div className="text-2xl font-bold text-cyan-600">{fmt(avgPerTeam)}</div>
                    <div className="text-xs text-[#86868b] mt-1 font-semibold">Avg / Team</div>
                  </div>
                </div>

                {/* Revenue by Month */}
                <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6">
                  <h3 className="text-base font-bold text-[#1d1d1f] mb-4">Revenue by Month</h3>
                  <div className="space-y-2.5">
                    {months.map((m: any) => (
                      <div key={m.month} className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-[#86868b] w-20 shrink-0">{fmtMonth(m.month)}</span>
                        <div className="flex-1"><Bar value={m.revenue_cents} max={maxMonthRev} color="bg-green-500" /></div>
                        <span className="text-sm font-bold text-green-600 w-24 text-right">{fmt(m.revenue_cents)}</span>
                        <span className="text-xs text-[#86868b] w-16 text-right">{m.team_count} teams</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Events */}
                <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6">
                  <h3 className="text-base font-bold text-[#1d1d1f] mb-4">Top Events by Revenue</h3>
                  <div className="space-y-2">
                    {[...events].sort((a: any, b: any) => b.revenue_cents - a.revenue_cents).slice(0, 10).map((ev: any, i: number) => (
                      <button key={ev.id} onClick={() => setSelectedEventId(ev.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#f0f7ff] transition text-left group">
                        <span className="w-7 h-7 rounded-full bg-[#f0f7ff] text-[#003e79] text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1d1d1f] truncate group-hover:text-[#003e79]">{ev.name}</p>
                          <p className="text-xs text-[#86868b]">{ev.city}, {ev.state} · {ev.team_count} teams</p>
                        </div>
                        <span className="text-sm font-bold text-green-600">{fmt(ev.revenue_cents)}</span>
                        <svg className="w-4 h-4 text-[#c7c7cc] group-hover:text-[#003e79] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Registrations by City */}
                <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6">
                  <h3 className="text-base font-bold text-[#1d1d1f] mb-4">Registrations by City</h3>
                  {(dashboard?.regsByCity || []).map((c: any) => {
                    const maxTeams = Math.max(...(dashboard.regsByCity || []).map((x: any) => x.total_teams), 1);
                    return (
                      <div key={c.city + c.state} className="flex items-center gap-3 py-2">
                        <span className="text-sm font-semibold text-[#1d1d1f] w-40 shrink-0">{c.city}, {c.state}</span>
                        <div className="flex-1"><Bar value={c.total_teams} max={maxTeams} /></div>
                        <span className="text-sm font-bold text-[#003e79] w-12 text-right">{c.total_teams}</span>
                        <span className="text-xs text-[#86868b] w-20 text-right">{c.paid_teams} paid</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ════════ EVENT P&Ls TAB ════════ */}
            {tab === 'events' && (
              <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6">
                <h3 className="text-base font-bold text-[#1d1d1f] mb-1">Event Profit & Loss</h3>
                <p className="text-xs text-[#86868b] mb-4">Click an event to see full breakdown, add expenses, and track hotel rebates.</p>
                <div className="rounded-xl border border-[#e8e8ed] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
                      <th className="text-left px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase">Event</th>
                      <th className="text-center px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase hidden sm:table-cell">Teams</th>
                      <th className="text-right px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase">Revenue</th>
                      <th className="text-right px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase hidden md:table-cell">Per Team</th>
                      <th className="text-right px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase w-12"></th>
                    </tr></thead>
                    <tbody>
                      {[...events].sort((a: any, b: any) => b.revenue_cents - a.revenue_cents).map((ev: any, i: number) => (
                        <tr key={ev.id} onClick={() => setSelectedEventId(ev.id)}
                          className={`cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'} hover:bg-[#f0f7ff] transition-colors`}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-[#1d1d1f]">{ev.name}</p>
                            <p className="text-xs text-[#86868b]">{ev.city}, {ev.state}</p>
                          </td>
                          <td className="px-4 py-3 text-center hidden sm:table-cell">
                            <span className="text-sm font-bold text-[#003e79]">{ev.team_count}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bold text-green-600">{fmt(ev.revenue_cents)}</span>
                          </td>
                          <td className="px-4 py-3 text-right hidden md:table-cell">
                            <span className="text-sm text-[#86868b]">{ev.team_count > 0 ? fmt(ev.revenue_cents / ev.team_count) : '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <svg className="w-4 h-4 text-[#c7c7cc] inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ════════ BY CITY TAB ════════ */}
            {tab === 'cities' && cityData && (
              <>
                <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6">
                  <h3 className="text-base font-bold text-[#1d1d1f] mb-4">Revenue by City</h3>
                  {cityData.cities.map((c: any) => {
                    const maxRev = Math.max(...cityData.cities.map((x: any) => x.revenue_cents), 1);
                    return (
                      <div key={c.city + c.state} className="py-3 border-b border-[#f0f0f3] last:border-b-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <div>
                            <span className="text-sm font-bold text-[#1d1d1f]">{c.city}, {c.state}</span>
                            <span className="text-xs text-[#86868b] ml-2">{c.event_count} events · {c.team_count} teams</span>
                          </div>
                          <span className="text-sm font-bold text-green-600">{fmt(c.revenue_cents)}</span>
                        </div>
                        <Bar value={c.revenue_cents} max={maxRev} color="bg-green-500" />
                      </div>
                    );
                  })}
                </div>

                {/* Rebates by City */}
                {cityData.rebatesByCity && cityData.rebatesByCity.length > 0 && (
                  <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6">
                    <h3 className="text-base font-bold text-[#1d1d1f] mb-4">Hotel Rebates by City</h3>
                    {cityData.rebatesByCity.map((c: any) => (
                      <div key={c.city + c.state} className="flex items-center justify-between py-2.5 border-b border-[#f0f0f3] last:border-b-0">
                        <div>
                          <span className="text-sm font-semibold text-[#1d1d1f]">{c.city}, {c.state}</span>
                          {c.total_room_nights && <span className="text-xs text-[#86868b] ml-2">{c.total_room_nights} room nights</span>}
                        </div>
                        <span className="text-sm font-bold text-blue-600">{fmt(c.total_rebates_cents)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Expenses by City */}
                {cityData.expensesByCity && cityData.expensesByCity.length > 0 && (
                  <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6">
                    <h3 className="text-base font-bold text-[#1d1d1f] mb-4">Expenses by City</h3>
                    {(() => {
                      // Group by city
                      const grouped: Record<string, any[]> = {};
                      cityData.expensesByCity.forEach((e: any) => {
                        const key = `${e.city}, ${e.state}`;
                        if (!grouped[key]) grouped[key] = [];
                        grouped[key].push(e);
                      });
                      return Object.entries(grouped).map(([city, items]) => {
                        const total = items.reduce((s: number, i: any) => s + i.total_cents, 0);
                        return (
                          <div key={city} className="py-3 border-b border-[#f0f0f3] last:border-b-0">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-[#1d1d1f]">{city}</span>
                              <span className="text-sm font-bold text-red-500">{fmt(total)}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {items.map((item: any) => (
                                <span key={item.category} className="text-xs bg-[#f5f5f7] px-2 py-1 rounded-lg text-[#6e6e73]">
                                  {EXPENSE_CATEGORIES[item.category]?.label || item.category}: {fmt(item.total_cents)}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </>
            )}

            {/* ════════ YEAR OVER YEAR TAB ════════ */}
            {tab === 'yoy' && yoyData && (
              <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6">
                <h3 className="text-base font-bold text-[#1d1d1f] mb-4">Year-over-Year Comparison</h3>
                <div className="rounded-xl border border-[#e8e8ed] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
                      <th className="text-left px-4 py-3 text-xs font-bold text-[#86868b] uppercase">Year</th>
                      <th className="text-center px-4 py-3 text-xs font-bold text-[#86868b] uppercase">Events</th>
                      <th className="text-center px-4 py-3 text-xs font-bold text-[#86868b] uppercase">Teams</th>
                      <th className="text-center px-4 py-3 text-xs font-bold text-[#86868b] uppercase hidden sm:table-cell">Cities</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-[#86868b] uppercase">Revenue</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-[#86868b] uppercase hidden md:table-cell">Avg / Event</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-[#86868b] uppercase hidden md:table-cell">Avg / Team</th>
                    </tr></thead>
                    <tbody>
                      {yoyData.yearly.map((yr: any, i: number) => {
                        const prevYr = yoyData.yearly[i + 1];
                        const revChange = prevYr ? ((yr.revenue_cents - prevYr.revenue_cents) / Math.max(prevYr.revenue_cents, 1) * 100) : null;
                        const teamChange = prevYr ? ((yr.team_count - prevYr.team_count) / Math.max(prevYr.team_count, 1) * 100) : null;
                        return (
                          <tr key={yr.year} className={`${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}>
                            <td className="px-4 py-3 font-bold text-[#1d1d1f] text-lg">{yr.year}</td>
                            <td className="px-4 py-3 text-center font-semibold">{yr.event_count}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-semibold">{yr.team_count}</span>
                              {teamChange !== null && (
                                <span className={`text-xs ml-1 ${teamChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {teamChange >= 0 ? '+' : ''}{teamChange.toFixed(0)}%
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center hidden sm:table-cell font-semibold">{yr.city_count}</td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-bold text-green-600">{fmt(yr.revenue_cents)}</span>
                              {revChange !== null && (
                                <span className={`text-xs ml-1 ${revChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {revChange >= 0 ? '+' : ''}{revChange.toFixed(0)}%
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right hidden md:table-cell text-[#86868b]">{yr.event_count > 0 ? fmt(yr.revenue_cents / yr.event_count) : '—'}</td>
                            <td className="px-4 py-3 text-right hidden md:table-cell text-[#86868b]">{yr.team_count > 0 ? fmt(yr.revenue_cents / yr.team_count) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* YoY Visual Bars */}
                <div className="mt-6">
                  <h4 className="text-sm font-bold text-[#1d1d1f] mb-3">Revenue Comparison</h4>
                  {(() => {
                    const maxRev = Math.max(...yoyData.yearly.map((y: any) => y.revenue_cents), 1);
                    return yoyData.yearly.map((yr: any) => (
                      <div key={yr.year} className="flex items-center gap-3 py-2">
                        <span className="text-sm font-bold text-[#1d1d1f] w-12">{yr.year}</span>
                        <div className="flex-1"><Bar value={yr.revenue_cents} max={maxRev} color="bg-green-500" /></div>
                        <span className="text-sm font-bold text-green-600 w-28 text-right">{fmt(yr.revenue_cents)}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
