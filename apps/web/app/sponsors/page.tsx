'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api/sponsors';

interface SponsorPackage {
  id: string;
  name: string;
  tier: string;
  description: string;
  price_cents: number;
  benefits: string;
  is_seasonal: number;
}

interface ActiveSponsor {
  id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  tier: string;
  package_name: string;
  season: string | null;
  event_id: string | null;
  event_name: string | null;
}

const tierConfig: Record<string, { color: string; bg: string; border: string; icon: string; order: number }> = {
  platinum: { color: 'text-gray-800', bg: 'bg-gradient-to-br from-gray-100 to-gray-200', border: 'border-gray-300 ring-2 ring-gray-300', icon: '💎', order: 0 },
  gold: { color: 'text-amber-700', bg: 'bg-gradient-to-br from-amber-50 to-yellow-100', border: 'border-amber-300 ring-2 ring-amber-200', icon: '🥇', order: 1 },
  silver: { color: 'text-gray-600', bg: 'bg-gradient-to-br from-gray-50 to-slate-100', border: 'border-gray-300', icon: '🥈', order: 2 },
  bronze: { color: 'text-orange-700', bg: 'bg-gradient-to-br from-orange-50 to-amber-50', border: 'border-orange-200', icon: '🥉', order: 3 },
  custom: { color: 'text-cyan-700', bg: 'bg-gradient-to-br from-cyan-50 to-blue-50', border: 'border-cyan-200', icon: '⭐', order: 4 },
};

// --- Inquiry Form Modal ---
function InquiryModal({ packageName, onClose }: { packageName: string; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', package: packageName, message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = async () => {
    if (!form.name || !form.email) return;
    setSubmitting(true);
    try {
      const res = await fetch('https://uht.chad-157.workers.dev/api/sponsors/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setResult('success');
      } else {
        setResult('error');
      }
    } catch {
      setResult('error');
    } finally {
      setSubmitting(false);
    }
  };

  if (result === 'success') {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center" onClick={e => e.stopPropagation()}>
          <div className="text-5xl mb-4">🎉</div>
          <h3 className="text-xl font-extrabold text-gray-900 mb-2">Thank You!</h3>
          <p className="text-gray-600 mb-6">We've received your inquiry and will be in touch within 24 hours.</p>
          <button onClick={onClose} className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl transition">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Sponsorship Inquiry</h3>
              <p className="text-sm text-gray-500">We'll get back to you within 24 hours</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Your name" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <input type="text" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })}
                placeholder="Company name" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="you@company.com" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="(555) 555-5555" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interested Package</label>
            <select value={form.package} onChange={e => setForm({ ...form, package: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none">
              <option value="">Not sure yet</option>
              <option value="Platinum Partner">Platinum Partner ($10,000/season)</option>
              <option value="Gold Sponsor">Gold Sponsor ($5,000/season)</option>
              <option value="Silver Sponsor">Silver Sponsor ($2,500/season)</option>
              <option value="Bronze Supporter">Bronze Supporter ($1,000/season)</option>
              <option value="Single Event Sponsor">Single Event Sponsor ($2,000/event)</option>
              <option value="Rink Board Sponsor">Rink Board Sponsor ($750/event)</option>
              <option value="Custom">Custom Package</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
              rows={3} placeholder="Tell us about your goals and any questions you have..."
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none resize-none" />
          </div>

          {result === 'error' && (
            <div className="px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              Something went wrong. Please try again or email johnny@ultimatetournament.com directly.
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !form.name || !form.email}
            className={`flex-1 px-4 py-2.5 font-semibold rounded-xl text-sm transition ${
              !form.name || !form.email ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-700 text-white'
            } ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {submitting ? 'Sending...' : 'Send Inquiry'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SponsorsPage() {
  const [packages, setPackages] = useState<SponsorPackage[]>([]);
  const [sponsors, setSponsors] = useState<ActiveSponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryPackage, setInquiryPackage] = useState('');

  const openInquiry = (pkg?: string) => {
    setInquiryPackage(pkg || '');
    setInquiryOpen(true);
  };

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/packages`).then(r => r.json()),
      fetch(`${API_BASE}/all`).then(r => r.json()),
    ]).then(([pkgJson, spJson]) => {
      if (pkgJson.success) setPackages(pkgJson.data);
      if (spJson.success) setSponsors(spJson.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const seasonalPackages = packages.filter(p => p.is_seasonal);
  const eventPackages = packages.filter(p => !p.is_seasonal);

  // Group sponsors by tier
  const sponsorsByTier: Record<string, ActiveSponsor[]> = {};
  sponsors.forEach(s => {
    if (!sponsorsByTier[s.tier]) sponsorsByTier[s.tier] = [];
    sponsorsByTier[s.tier].push(s);
  });
  const sortedTiers = Object.keys(sponsorsByTier).sort((a, b) => (tierConfig[a]?.order ?? 99) - (tierConfig[b]?.order ?? 99));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {inquiryOpen && <InquiryModal packageName={inquiryPackage} onClose={() => setInquiryOpen(false)} />}

      {/* Hero */}
      <div className="bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-16 text-center">
          <div className="text-5xl mb-4">🤝</div>
          <h1 className="text-4xl font-extrabold mb-3">Partner With Ultimate Tournaments</h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto mb-6">
            Put your brand in front of thousands of hockey families across the Midwest.
            From season-long partnerships to single event sponsorships, we have opportunities for every budget.
          </p>
          <button
            onClick={() => openInquiry()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl text-lg transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
            Get In Touch
          </button>
        </div>
      </div>

      {/* Impact Stats */}
      <div className="max-w-6xl mx-auto px-4 -mt-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { num: '36+', label: 'Events Per Year', icon: '🏒' },
            { num: '500+', label: 'Teams Annually', icon: '👕' },
            { num: '10K+', label: 'Families Reached', icon: '👨‍👩‍👧‍👦' },
            { num: '7', label: 'States Covered', icon: '🗺️' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl shadow-lg p-5 text-center">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-2xl font-extrabold text-gray-900">{s.num}</div>
              <div className="text-xs text-gray-500 font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sponsorship Packages - Season */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Season Sponsorship Packages</h2>
          <p className="text-gray-500 max-w-xl mx-auto">Year-round visibility across all Ultimate Tournaments events. The best value for maximum brand exposure.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {seasonalPackages.sort((a, b) => b.price_cents - a.price_cents).map(pkg => {
            const tc = tierConfig[pkg.tier] || tierConfig.custom;
            const benefits = pkg.benefits ? JSON.parse(pkg.benefits) : [];
            return (
              <div key={pkg.id} className={`rounded-2xl border-2 ${tc.border} overflow-hidden flex flex-col`}>
                <div className={`${tc.bg} p-5 text-center`}>
                  <div className="text-3xl mb-2">{tc.icon}</div>
                  <h3 className={`text-lg font-extrabold ${tc.color}`}>{pkg.name}</h3>
                  <div className="text-3xl font-extrabold text-gray-900 mt-2">
                    ${(pkg.price_cents / 100).toLocaleString()}
                    <span className="text-sm font-medium text-gray-500">/season</span>
                  </div>
                </div>
                <div className="bg-white p-5 flex-1 flex flex-col">
                  <p className="text-sm text-gray-500 mb-4">{pkg.description}</p>
                  <ul className="space-y-2 flex-1">
                    {benefits.map((b: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        {b}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => openInquiry(pkg.name)}
                    className="mt-5 w-full text-center px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-sm transition"
                  >
                    Inquire Now
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event-Specific Sponsorships - Highlighted Section */}
      <div className="bg-gradient-to-br from-cyan-900 to-blue-900 text-white py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/20 border border-cyan-400/30 rounded-full text-cyan-300 text-xs font-bold uppercase tracking-wider mb-4">
              <span className="animate-pulse w-2 h-2 bg-cyan-400 rounded-full inline-block" />
              New Opportunity
            </div>
            <h2 className="text-3xl font-extrabold mb-2">Sponsor a Specific Event</h2>
            <p className="text-cyan-200 max-w-xl mx-auto">
              Want to target a specific market? Choose individual events to sponsor and get concentrated brand exposure at tournaments in the cities that matter most to your business.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {eventPackages.sort((a, b) => b.price_cents - a.price_cents).map(pkg => {
              const benefits = pkg.benefits ? JSON.parse(pkg.benefits) : [];
              return (
                <div key={pkg.id} className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 p-6 hover:bg-white/15 transition">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-xl font-extrabold">{pkg.name}</h3>
                      <p className="text-cyan-200 text-sm mt-1">{pkg.description}</p>
                    </div>
                    <div className="text-2xl font-extrabold whitespace-nowrap ml-4">
                      ${(pkg.price_cents / 100).toLocaleString()}
                      <span className="text-xs font-medium text-cyan-300 block text-right">/event</span>
                    </div>
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                    {benefits.map((b: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-cyan-100">
                        <svg className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        {b}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => openInquiry(pkg.name)}
                    className="mt-5 inline-flex items-center gap-1 text-cyan-300 hover:text-white text-sm font-semibold transition"
                  >
                    Inquire Now
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Current Sponsors */}
      {sponsors.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Our Sponsors</h2>
            <p className="text-gray-500">Thank you to the businesses that make Ultimate Tournaments possible.</p>
          </div>

          {sortedTiers.map(tier => {
            const tc = tierConfig[tier] || tierConfig.custom;
            return (
              <div key={tier} className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">{tc.icon}</span>
                  <h3 className={`text-lg font-bold ${tc.color}`}>{tier.charAt(0).toUpperCase() + tier.slice(1)} Partners</h3>
                  <div className="flex-1 border-t border-gray-200 ml-2" />
                </div>
                <div className={`grid gap-4 ${tier === 'platinum' ? 'grid-cols-1' : tier === 'gold' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
                  {sponsorsByTier[tier].map(sp => (
                    <div key={sp.id + sp.package_name} className={`${tc.bg} rounded-xl border ${tc.border.split(' ')[0]} p-5 ${tier === 'platinum' ? 'text-center py-8' : ''}`}>
                      {sp.logo_url ? (
                        <img src={sp.logo_url} alt={sp.name} className="h-12 object-contain mb-3" />
                      ) : (
                        <div className={`${tier === 'platinum' ? 'text-2xl' : 'text-lg'} font-extrabold ${tc.color} mb-1`}>{sp.name}</div>
                      )}
                      {sp.website && (
                        <a href={sp.website} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-600 hover:underline">{sp.website.replace(/https?:\/\//, '')}</a>
                      )}
                      {sp.event_name && (
                        <div className="text-[11px] text-gray-500 mt-1">Sponsoring: {sp.event_name}</div>
                      )}
                      {sp.season && (
                        <div className="text-[11px] text-gray-500 mt-1">{sp.season} Season</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CTA Footer */}
      <div className="bg-gray-100 py-12">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Ready to Get Started?</h2>
          <p className="text-gray-600 mb-6">
            Contact us today to discuss a sponsorship package that fits your business goals.
            Custom packages are also available.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => openInquiry()}
              className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl transition"
            >
              Submit an Inquiry
            </button>
            <a
              href="tel:+1-630-555-0100"
              className="px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-xl border border-gray-300 transition"
            >
              Call Us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
