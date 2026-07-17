'use client';

import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

interface RSVP {
  id: number;
  name: string;
  email: string;
  team_org: string | null;
  attending: string;
  created_at: string;
}

interface Reward {
  id: number;
  email: string;
  name: string | null;
  code: string;
  amount: number;
  redeemed: number;
  push_sent: number;
  created_at: string;
}

export default function RSVPsPage() {
  const [rsvps, setRsvps] = useState<RSVP[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [sendingReward, setSendingReward] = useState(false);
  const [rewardResult, setRewardResult] = useState<{ codes_created: number; pushes_sent: number; total_rsvps?: number; total_targeted?: number; amount?: number } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [tab, setTab] = useState<'rsvps' | 'rewards' | 'send_gift'>('rsvps');

  // Gift send state
  const [giftAudience, setGiftAudience] = useState<'all_users' | 'coaches' | 'parents' | 'custom'>('all_users');
  const [giftAmount, setGiftAmount] = useState(25);
  const [giftCustomEmails, setGiftCustomEmails] = useState('');
  const [giftTitle, setGiftTitle] = useState('You Got a Gift!');
  const [giftMessage, setGiftMessage] = useState('');
  const [showGiftConfirm, setShowGiftConfirm] = useState(false);
  const [sendingGift, setSendingGift] = useState(false);

  const fetchRsvps = useCallback(async () => {
    setLoading(true);
    try {
      const [rsvpRes, rewardRes] = await Promise.all([
        fetch(`${API}/api/rsvps`),
        fetch(`${API}/api/meeting-rewards`),
      ]);
      const rsvpJson = await rsvpRes.json();
      const rewardJson = await rewardRes.json();
      if (rsvpJson.success) setRsvps(rsvpJson.data || []);
      if (rewardJson.success) setRewards(rewardJson.data || []);
    } catch (e) {
      console.error('Failed to fetch:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRsvps(); }, [fetchRsvps]);

  const filtered = rsvps.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.name || '').toLowerCase().includes(q)
      || (r.email || '').toLowerCase().includes(q)
      || (r.team_org || '').toLowerCase().includes(q);
  });

  const filteredRewards = rewards.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.name || '').toLowerCase().includes(q)
      || (r.email || '').toLowerCase().includes(q)
      || (r.code || '').toLowerCase().includes(q);
  });

  const exportCSV = () => {
    setExporting(true);
    const header = 'Name,Email,Team/Organization,RSVP Date\n';
    const rows = filtered.map(r => {
      const date = r.created_at ? new Date(r.created_at + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      return `"${(r.name || '').replace(/"/g, '""')}","${(r.email || '').replace(/"/g, '""')}","${(r.team_org || '').replace(/"/g, '""')}","${date}"`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uht-rsvps-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  const sendReward = async () => {
    setSendingReward(true);
    setRewardResult(null);
    try {
      const res = await fetch(`${API}/api/meeting-reward/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendKey: 'uht-coaches-2026' }),
      });
      const json = await res.json();
      if (json.success) {
        setRewardResult(json.data);
        fetchRsvps(); // Refresh to show rewards
        setTab('rewards');
      }
    } catch (e) {
      console.error('Failed to send reward:', e);
    } finally {
      setSendingReward(false);
      setShowConfirm(false);
    }
  };

  const sendGift = async () => {
    setSendingGift(true);
    setRewardResult(null);
    try {
      const payload: any = {
        sendKey: 'uht-coaches-2026',
        audience: giftAudience,
        amount: giftAmount,
        title: giftTitle || 'You Got a Gift!',
        message: giftMessage || undefined,
      };
      if (giftAudience === 'custom') {
        payload.customEmails = giftCustomEmails.split(/[,\n]/).map((e: string) => e.trim()).filter(Boolean);
      }
      const res = await fetch(`${API}/api/gift/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setRewardResult(json.data);
        fetchRsvps();
        setTab('rewards');
      }
    } catch (e) {
      console.error('Failed to send gift:', e);
    } finally {
      setSendingGift(false);
      setShowGiftConfirm(false);
    }
  };

  const formatDate = (d: string) => {
    if (!d) return '—';
    return new Date(d + 'Z').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coach/Manager Meeting RSVPs</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tuesday, July 14, 2026 at 7:30 PM CT — Zoom
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            disabled={exporting || filtered.length === 0}
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={sendingReward || rsvps.length === 0}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold rounded-lg hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 transition-all shadow-md hover:shadow-lg"
          >
            {sendingReward ? 'Sending...' : 'Send Reward'}
          </button>
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
            <div className="text-center">
              <div className="text-5xl mb-4">🎁</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Send Reward to All RSVPs?</h2>
              <p className="text-gray-600 text-sm mb-1">
                This will generate unique <strong>$50 off</strong> discount codes for all <strong>{rsvps.length}</strong> RSVP&apos;d coaches.
              </p>
              <p className="text-gray-600 text-sm mb-6">
                Those with the app will receive a push notification with a confetti surprise!
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={sendReward}
                  disabled={sendingReward}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 font-bold disabled:opacity-50"
                >
                  {sendingReward ? 'Sending...' : 'Send It!'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reward Result Banner */}
      {rewardResult && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <p className="font-bold text-amber-900">Rewards Sent!</p>
              <p className="text-sm text-amber-800 mt-1">
                Generated <strong>{rewardResult.codes_created}</strong> new codes.
                Sent <strong>{rewardResult.pushes_sent}</strong> push notifications to coaches with the app.
                Total RSVPs: {rewardResult.total_rsvps}.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Total RSVPs</p>
          <p className="text-3xl font-bold text-[#003e79] mt-1">{rsvps.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">With Team/Org</p>
          <p className="text-3xl font-bold text-emerald-600 mt-1">{rsvps.filter(r => r.team_org).length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Codes Generated</p>
          <p className="text-3xl font-bold text-amber-600 mt-1">{rewards.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Codes Redeemed</p>
          <p className="text-3xl font-bold text-purple-600 mt-1">{rewards.filter(r => r.redeemed).length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('rsvps')}
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${tab === 'rsvps' ? 'bg-white text-[#003e79] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          RSVPs ({rsvps.length})
        </button>
        <button
          onClick={() => setTab('rewards')}
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${tab === 'rewards' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Reward Codes ({rewards.length})
        </button>
        <button
          onClick={() => setTab('send_gift')}
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${tab === 'send_gift' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Send Gift
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <input
          type="text"
          placeholder={tab === 'rsvps' ? 'Search by name, email, or team...' : 'Search by name, email, or code...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none text-sm"
        />
      </div>

      {/* RSVP Table */}
      {tab === 'rsvps' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading RSVPs...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              {search ? 'No RSVPs match your search' : 'No RSVPs yet — they\'ll appear here as coaches respond'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Team / Org</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">RSVP Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r, i) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 text-sm text-gray-400">{i + 1}</td>
                      <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{r.name}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{r.email}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{r.team_org || '—'}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{formatDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Rewards Table */}
      {tab === 'rewards' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading rewards...</div>
          ) : filteredRewards.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              {search ? 'No reward codes match your search' : 'No reward codes yet — hit "Send Reward" during the call!'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Push Sent</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRewards.map((r, i) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 text-sm text-gray-400">{i + 1}</td>
                      <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{r.name || '—'}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{r.email}</td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-sm font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded">{r.code}</span>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-emerald-600">${r.amount} off</td>
                      <td className="px-5 py-3.5">
                        {r.push_sent ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Sent</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Pending</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {r.redeemed ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded-full">Redeemed</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">Active</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Send Gift Tab */}
      {tab === 'send_gift' && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-2xl">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Send Gift to Users</h2>

          {/* Audience */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Audience</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'all_users', label: 'All Users', desc: 'Everyone with a UHT account' },
                { value: 'coaches', label: 'Coaches & Managers', desc: 'Users with coach or manager role' },
                { value: 'parents', label: 'Parents', desc: 'Users with parent role' },
                { value: 'custom', label: 'Custom Emails', desc: 'Enter specific email addresses' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setGiftAudience(opt.value as any)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${giftAudience === opt.value ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <p className={`text-sm font-semibold ${giftAudience === opt.value ? 'text-emerald-700' : 'text-gray-900'}`}>{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Custom emails textarea */}
          {giftAudience === 'custom' && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email Addresses</label>
              <textarea
                value={giftCustomEmails}
                onChange={e => setGiftCustomEmails(e.target.value)}
                placeholder="Enter emails separated by commas or new lines..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none text-sm"
              />
            </div>
          )}

          {/* Amount */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Discount Amount</label>
            <div className="flex gap-3">
              {[10, 25, 50, 100].map(amt => (
                <button
                  key={amt}
                  onClick={() => setGiftAmount(amt)}
                  className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${giftAmount === amt ? 'bg-emerald-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  ${amt}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <span className="text-gray-500 font-bold">$</span>
                <input
                  type="number"
                  value={giftAmount}
                  onChange={e => setGiftAmount(Number(e.target.value) || 0)}
                  className="w-20 px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-bold text-center focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Notification Title */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Push Notification Title</label>
            <input
              type="text"
              value={giftTitle}
              onChange={e => setGiftTitle(e.target.value)}
              placeholder="You Got a Gift!"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none text-sm"
            />
          </div>

          {/* Custom message (optional) */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Custom Message <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={giftMessage}
              onChange={e => setGiftMessage(e.target.value)}
              placeholder={`You just received a $${giftAmount} discount for your next UHT tournament! Tap to unwrap your reward.`}
              rows={2}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none text-sm"
            />
          </div>

          {/* Send Button */}
          <button
            onClick={() => setShowGiftConfirm(true)}
            disabled={sendingGift || (giftAudience === 'custom' && !giftCustomEmails.trim()) || giftAmount <= 0}
            className="w-full px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-base font-bold rounded-xl hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 transition-all shadow-lg hover:shadow-xl"
          >
            Send ${giftAmount} Gift to {giftAudience === 'all_users' ? 'All Users' : giftAudience === 'coaches' ? 'Coaches' : giftAudience === 'parents' ? 'Parents' : 'Selected Users'}
          </button>
        </div>
      )}

      {/* Gift Confirm Modal */}
      {showGiftConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
            <div className="text-center">
              <div className="text-5xl mb-4">🎁</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Send ${giftAmount} Gift?</h2>
              <p className="text-gray-600 text-sm mb-1">
                This will generate unique <strong>${giftAmount} off</strong> discount codes for{' '}
                <strong>{giftAudience === 'all_users' ? 'all users' : giftAudience === 'coaches' ? 'all coaches/managers' : giftAudience === 'parents' ? 'all parents' : 'selected users'}</strong>.
              </p>
              <p className="text-gray-600 text-sm mb-6">
                Those with the app will receive a push notification with a gift surprise!
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowGiftConfirm(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={sendGift}
                  disabled={sendingGift}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg hover:from-emerald-600 hover:to-teal-600 font-bold disabled:opacity-50"
                >
                  {sendingGift ? 'Sending...' : 'Send It!'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(tab === 'rsvps' ? filtered : filteredRewards).length > 0 && tab !== 'send_gift' && (
        <p className="text-xs text-gray-400 text-center">
          Showing {tab === 'rsvps' ? filtered.length : filteredRewards.length} of {tab === 'rsvps' ? rsvps.length : rewards.length} {tab === 'rsvps' ? 'RSVPs' : 'reward codes'}
        </p>
      )}
    </div>
  );
}
