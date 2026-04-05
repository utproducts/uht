'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api/sponsors';

interface Sponsor {
  id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_active: number;
  sponsorship_count: number;
  total_paid_cents: number | null;
  active_tiers: string | null;
}

interface Sponsorship {
  id: string;
  sponsor_name: string;
  logo_url: string | null;
  website: string | null;
  package_name: string;
  tier: string;
  package_price_cents: number;
  amount_cents: number;
  status: string;
  payment_status: string;
  season: string | null;
  event_name: string | null;
  event_id: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  created_at: string;
}

interface Package {
  id: string;
  name: string;
  tier: string;
  price_cents: number;
  is_seasonal: number;
}

const tierColors: Record<string, string> = {
  platinum: 'bg-gray-200 text-gray-800',
  gold: 'bg-amber-100 text-amber-800',
  silver: 'bg-gray-100 text-gray-600',
  bronze: 'bg-orange-100 text-orange-700',
  custom: 'bg-cyan-100 text-cyan-700',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  expired: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
};

const paymentColors: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  unpaid: 'bg-gray-100 text-gray-600',
  partial: 'bg-amber-100 text-amber-700',
  refunded: 'bg-red-100 text-red-700',
};

export default function AdminSponsorsPage() {
  const [tab, setTab] = useState<'overview' | 'sponsors' | 'packages'>('overview');
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/admin/list`).then(r => r.json()),
      fetch(`${API_BASE}/admin/sponsorships`).then(r => r.json()),
      fetch(`${API_BASE}/packages`).then(r => r.json()),
    ]).then(([spJson, ssJson, pkgJson]) => {
      if (spJson.success) setSponsors(spJson.data);
      if (ssJson.success) setSponsorships(ssJson.data);
      if (pkgJson.success) setPackages(pkgJson.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Stats
  const totalSponsors = sponsors.length;
  const activeDeals = sponsorships.filter(s => s.status === 'active').length;
  const totalRevenue = sponsorships.filter(s => s.payment_status === 'paid').reduce((sum, s) => sum + (s.amount_cents || 0), 0);
  const pendingRevenue = sponsorships.filter(s => s.payment_status === 'unpaid').reduce((sum, s) => sum + (s.amount_cents || 0), 0);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gray-900 text-white py-6">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">Sponsor Management</h1>
            <p className="text-sm text-gray-400 mt-1">Ultimate Tournaments</p>
          </div>
          <button className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-sm transition">
            + Add Sponsor
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 -mt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{totalSponsors}</div>
            <div className="text-xs text-gray-500 mt-1">Total Sponsors</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{activeDeals}</div>
            <div className="text-xs text-gray-500 mt-1">Active Deals</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">${(totalRevenue / 100).toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Collected Revenue</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">${(pendingRevenue / 100).toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Pending Revenue</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 mt-6">
        <div className="flex gap-1 bg-gray-200 rounded-xl p-1 w-fit">
          {(['overview', 'sponsors', 'packages'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
                tab === t ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t === 'overview' ? 'All Sponsorships' : t === 'sponsors' ? `Sponsors (${totalSponsors})` : `Packages (${packages.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600" />
          </div>
        ) : (
          <>
            {/* Overview Tab - All Sponsorships */}
            {tab === 'overview' && (
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left">
                      <tr>
                        <th className="px-5 py-3 font-semibold text-gray-600">Sponsor</th>
                        <th className="px-5 py-3 font-semibold text-gray-600">Package</th>
                        <th className="px-5 py-3 font-semibold text-gray-600">Type</th>
                        <th className="px-5 py-3 font-semibold text-gray-600">Amount</th>
                        <th className="px-5 py-3 font-semibold text-gray-600">Status</th>
                        <th className="px-5 py-3 font-semibold text-gray-600">Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sponsorships.map(ss => (
                        <tr key={ss.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                          <td className="px-5 py-3">
                            <div className="font-medium text-gray-900">{ss.sponsor_name}</div>
                            {ss.website && <div className="text-[11px] text-gray-400">{ss.website.replace(/https?:\/\//, '')}</div>}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tierColors[ss.tier] || tierColors.custom}`}>
                                {ss.tier.toUpperCase()}
                              </span>
                              <span className="text-gray-700 text-xs">{ss.package_name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-600">
                            {ss.event_name ? (
                              <div>
                                <span className="font-medium text-gray-800">{ss.event_name}</span>
                                {ss.city && <span className="block text-[11px] text-gray-400">{ss.city}, {ss.state}</span>}
                              </div>
                            ) : ss.season ? (
                              <span className="font-medium">{ss.season} Season</span>
                            ) : (
                              <span className="text-gray-400">General</span>
                            )}
                          </td>
                          <td className="px-5 py-3 font-semibold text-gray-900">
                            ${(ss.amount_cents / 100).toLocaleString()}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColors[ss.status] || statusColors.pending}`}>
                              {ss.status.charAt(0).toUpperCase() + ss.status.slice(1)}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${paymentColors[ss.payment_status] || paymentColors.unpaid}`}>
                              {ss.payment_status.charAt(0).toUpperCase() + ss.payment_status.slice(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {sponsorships.length === 0 && (
                        <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No sponsorships yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sponsors Tab */}
            {tab === 'sponsors' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {sponsors.map(sp => {
                  const tiers = sp.active_tiers ? sp.active_tiers.split(',') : [];
                  return (
                    <div key={sp.id} className={`bg-white rounded-2xl shadow-lg overflow-hidden ${!sp.is_active ? 'opacity-60' : ''}`}>
                      <div className="h-1.5 bg-gradient-to-r from-cyan-500 to-blue-600" />
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">{sp.name}</h3>
                            {sp.website && (
                              <a href={sp.website} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-600 hover:underline">
                                {sp.website.replace(/https?:\/\//, '')}
                              </a>
                            )}
                          </div>
                          {tiers.length > 0 && (
                            <div className="flex gap-1">
                              {[...new Set(tiers)].map(t => (
                                <span key={t} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tierColors[t] || tierColors.custom}`}>
                                  {t.toUpperCase()}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Contact */}
                        {sp.contact_name && (
                          <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs">
                            <div className="font-medium text-gray-800">{sp.contact_name}</div>
                            {sp.contact_email && <div className="text-gray-500">{sp.contact_email}</div>}
                            {sp.contact_phone && <div className="text-gray-500">{sp.contact_phone}</div>}
                          </div>
                        )}

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-gray-50 rounded-lg p-2 text-center">
                            <div className="text-lg font-bold text-blue-600">{sp.sponsorship_count}</div>
                            <div className="text-[10px] text-gray-500">Sponsorships</div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2 text-center">
                            <div className="text-lg font-bold text-green-600">${((sp.total_paid_cents || 0) / 100).toLocaleString()}</div>
                            <div className="text-[10px] text-gray-500">Paid</div>
                          </div>
                        </div>

                        {sp.notes && (
                          <p className="text-xs text-gray-500 italic mb-3">{sp.notes}</p>
                        )}

                        <div className="flex gap-2 pt-3 border-t border-gray-100">
                          <button className="flex-1 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg text-xs transition">
                            View Details
                          </button>
                          <button className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-xs transition">
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Packages Tab */}
            {tab === 'packages' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {packages.sort((a, b) => b.price_cents - a.price_cents).map(pkg => (
                  <div key={pkg.id} className="bg-white rounded-2xl shadow-lg overflow-hidden">
                    <div className={`p-5 ${pkg.tier === 'platinum' ? 'bg-gradient-to-br from-gray-100 to-gray-200' : pkg.tier === 'gold' ? 'bg-gradient-to-br from-amber-50 to-yellow-100' : 'bg-gray-50'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tierColors[pkg.tier] || tierColors.custom}`}>
                          {pkg.tier.toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-500">{pkg.is_seasonal ? 'Season' : 'Per Event'}</span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">{pkg.name}</h3>
                      <div className="text-2xl font-extrabold text-gray-900 mt-1">
                        ${(pkg.price_cents / 100).toLocaleString()}
                      </div>
                    </div>
                    <div className="p-4 flex gap-2">
                      <button className="flex-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-xs transition">
                        Edit Package
                      </button>
                      <span className="px-3 py-1.5 text-xs text-gray-500 flex items-center">
                        {sponsorships.filter(s => s.package_name === pkg.name).length} active
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
