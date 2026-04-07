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
  platinum: { color: 'text-[#003e79]', bg: 'bg-[#f0f7ff]', border: 'border-[#e8e8ed]', icon: '💎', order: 0 },
  gold: { color: 'text-[#003e79]', bg: 'bg-[#f0f7ff]', border: 'border-[#e8e8ed]', icon: '🥇', order: 1 },
  silver: { color: 'text-[#003e79]', bg: 'bg-[#f0f7ff]', border: 'border-[#e8e8ed]', icon: '🥈', order: 2 },
  bronze: { color: 'text-[#003e79]', bg: 'bg-[#f0f7ff]', border: 'border-[#e8e8ed]', icon: '🥉', order: 3 },
  custom: { color: 'text-[#003e79]', bg: 'bg-[#f0f7ff]', border: 'border-[#e8e8ed]', icon: '⭐', order: 4 },
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
        <div className="bg-white rounded-2xl shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] w-full max-w-md p-8 text-center" onClick={e => e.stopPropagation()}>
          <div className="text-5xl mb-4">🎉</div>
          <h3 className="text-xl font-extrabold text-[#1d1d1f] mb-2">Thank You!</h3>
          <p className="text-[#3d3d3d] mb-6">We've received your inquiry and will be in touch within 24 hours.</p>
          <button onClick={onClose} className="px-6 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-full transition">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-[#e8e8ed] px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[#1d1d1f]">Sponsorship Inquiry</h3>
              <p className="text-sm text-[#86868b]">We'll get back to you within 24 hours</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[#f5f5f7] rounded-lg transition">
              <svg className="w-5 h-5 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#1d1d1f] mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Your name" className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1d1d1f] mb-1">Company</label>
              <input type="text" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })}
                placeholder="Company name" className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1d1d1f] mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="you@company.com" className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1d1d1f] mb-1">Phone</label>
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="(555) 555-5555" className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1d1d1f] mb-1">Interested Package</label>
            <select value={form.package} onChange={e => setForm({ ...form, package: e.target.value })}
              className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none">
              <option value="">Not sure yet</option>
              <option value="Platinum">Platinum</option>
              <option value="Gold">Gold</option>
              <option value="Silver">Silver</option>
              <option value="Bronze">Bronze</option>
              <option value="Custom Package">Custom Package</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1d1d1f] mb-1">Message</label>
            <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
              rows={3} placeholder="Tell us about your goals and any questions you have..."
              className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none resize-none" />
          </div>

          {result === 'error' && (
            <div className="px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              Something went wrong. Please try again or contact us directly.
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-[#e8e8ed] px-6 py-4 rounded-b-2xl flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-[#f0f7ff] hover:bg-[#e0efff] text-[#003e79] font-semibold rounded-full text-sm transition">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !form.name || !form.email}
            className={`flex-1 px-4 py-2.5 font-semibold rounded-full text-sm transition ${
              !form.name || !form.email ? 'bg-[#d0d0d5] text-[#86868b] cursor-not-allowed' : 'bg-[#003e79] hover:bg-[#002d5a] text-white'
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

  // Group sponsors by tier
  const sponsorsByTier: Record<string, ActiveSponsor[]> = {};
  sponsors.forEach(s => {
    if (!sponsorsByTier[s.tier]) sponsorsByTier[s.tier] = [];
    sponsorsByTier[s.tier].push(s);
  });
  const sortedTiers = Object.keys(sponsorsByTier).sort((a, b) => (tierConfig[a]?.order ?? 99) - (tierConfig[b]?.order ?? 99));

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {inquiryOpen && <InquiryModal packageName={inquiryPackage} onClose={() => setInquiryOpen(false)} />}

      {/* Hero */}
      <div className="relative overflow-hidden py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-[#003e79] via-[#005599] to-[#00ccff]"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#005599]/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#00ccff]/20 rounded-full blur-3xl"></div>

        <div className="relative max-w-6xl mx-auto px-4 text-center">
          <div className="text-5xl mb-4">🤝</div>
          <h1 className="text-4xl font-extrabold mb-3 text-white">Partner With Ultimate Tournaments</h1>
          <p className="text-lg text-white/90 max-w-2xl mx-auto mb-8">
            Everything we do is CUSTOM. Reach thousands of hockey families across 7 states with sponsorships tailored to your business.
          </p>
          <button
            onClick={() => openInquiry()}
            className="inline-flex items-center gap-2 px-8 py-3 bg-white text-[#003e79] font-bold rounded-full text-lg hover:bg-[#f0f7ff] transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
            Start a Conversation
          </button>
        </div>
      </div>

      {/* Impact Stats */}
      <div className="max-w-6xl mx-auto px-4 -mt-12 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { num: '36+', label: 'Events Per Year', icon: '🏒' },
            { num: '500+', label: 'Teams Annually', icon: '👕' },
            { num: '10K+', label: 'Families Reached', icon: '👨‍👩‍👧‍👦' },
            { num: '7', label: 'States Covered', icon: '🗺️' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-5 text-center">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-2xl font-extrabold text-[#1d1d1f]">{s.num}</div>
              <div className="text-xs text-[#86868b] font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Current Partners */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-[#1d1d1f] mb-3">Current Partners</h2>
          <p className="text-[#6e6e73] max-w-xl mx-auto">These businesses help us create world-class hockey tournaments.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            'Knuckleheads Park',
            'Hilton',
            'Hampton Inn',
            'Kalahari Resorts',
            'Great Wolf Lodge',
            'Pure Hockey'
          ].map(partner => (
            <div key={partner} className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6 text-center flex items-center justify-center min-h-[140px]">
              <p className="font-semibold text-[#1d1d1f]">{partner}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Sponsorship Packages */}
      {packages.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-[#1d1d1f] mb-3">Sponsorship Packages</h2>
            <p className="text-[#6e6e73] max-w-xl mx-auto">Choose a tier that fits your goals — or let us build something custom.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {(() => {
              const tierOrder = ['platinum', 'gold', 'silver', 'bronze'];
              const grouped: Record<string, SponsorPackage[]> = {};
              packages.forEach(pkg => {
                const t = pkg.tier.toLowerCase();
                if (!grouped[t]) grouped[t] = [];
                grouped[t].push(pkg);
              });
              const tierGradients: Record<string, string> = {
                platinum: 'from-[#003e79] to-[#00ccff]',
                gold: 'from-[#8B6914] to-[#D4A843]',
                silver: 'from-[#4a4a4a] to-[#9e9e9e]',
                bronze: 'from-[#6B3A1F] to-[#CD7F32]',
              };
              const tierLabels: Record<string, string> = {
                platinum: 'Platinum',
                gold: 'Gold',
                silver: 'Silver',
                bronze: 'Bronze',
              };
              return tierOrder
                .filter(t => grouped[t] && grouped[t].length > 0)
                .map(tier => {
                  const pkg = grouped[tier][0];
                  const benefits = pkg.benefits ? (() => { try { return JSON.parse(pkg.benefits); } catch { return []; } })() : [];
                  return (
                    <div key={tier} className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden hover:shadow-[0_8px_40px_-12px_rgba(0,62,121,0.18)] hover:-translate-y-1 transition-all duration-300 flex flex-col">
                      {/* Tier gradient header */}
                      <div className={`bg-gradient-to-r ${tierGradients[tier] || 'from-[#003e79] to-[#00ccff]'} px-6 py-5 text-center`}>
                        <h3 className="text-xl font-bold text-white">{tierLabels[tier] || tier}</h3>
                        {pkg.is_seasonal ? (
                          <p className="text-white/70 text-xs mt-1">Season-long partnership</p>
                        ) : (
                          <p className="text-white/70 text-xs mt-1">Per-event partnership</p>
                        )}
                      </div>

                      {/* Pricing */}
                      <div className="px-6 pt-6 pb-4 text-center border-b border-[#e8e8ed]">
                        <div className="text-3xl font-extrabold text-[#1d1d1f]">
                          ${(pkg.price_cents / 100).toLocaleString()}
                        </div>
                        <p className="text-xs text-[#86868b] mt-1">{pkg.is_seasonal ? 'per season' : 'per event'}</p>
                      </div>

                      {/* Benefits */}
                      <div className="px-6 py-5 flex-1">
                        {benefits.length > 0 ? (
                          <ul className="space-y-2.5">
                            {benefits.map((b: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-[#3d3d3d]">
                                <svg className="w-4 h-4 text-[#00ccff] mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                {b}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-[#6e6e73]">{pkg.description}</p>
                        )}
                      </div>

                      {/* CTA */}
                      <div className="px-6 pb-6">
                        <button
                          onClick={() => openInquiry(pkg.name)}
                          className="w-full px-6 py-3 rounded-full bg-[#003e79] text-white font-semibold text-sm hover:bg-[#002d5a] active:scale-[0.98] transition-all"
                        >
                          Get Started
                        </button>
                      </div>
                    </div>
                  );
                });
            })()}
          </div>

          {/* Custom note */}
          <p className="text-center text-[#6e6e73] mt-8 text-sm">
            Need something different? Every package can be customized to fit your brand.{' '}
            <button onClick={() => openInquiry('Custom Package')} className="text-[#003e79] font-semibold hover:underline">
              Contact us
            </button>{' '}
            to discuss.
          </p>
        </div>
      )}

      {/* Why Partner With Us */}
      <div className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-[#1d1d1f] mb-3">Why Partner With Ultimate Tournaments</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="text-2xl">🎯</div>
                <div>
                  <h3 className="font-bold text-[#1d1d1f] mb-1">Targeted Reach</h3>
                  <p className="text-[#6e6e73]">Access engaged hockey families across 7 states with 36+ events annually</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="text-2xl">🏆</div>
                <div>
                  <h3 className="font-bold text-[#1d1d1f] mb-1">Premium Events</h3>
                  <p className="text-[#6e6e73]">Associate your brand with quality competitive hockey tournaments</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="text-2xl">📊</div>
                <div>
                  <h3 className="font-bold text-[#1d1d1f] mb-1">Measurable Impact</h3>
                  <p className="text-[#6e6e73]">Track brand visibility with 500+ teams and 10,000+ families</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="text-2xl">🎨</div>
                <div>
                  <h3 className="font-bold text-[#1d1d1f] mb-1">Custom Packages</h3>
                  <p className="text-[#6e6e73]">Everything we do is custom. We work with you to create the perfect fit</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="text-2xl">🤝</div>
                <div>
                  <h3 className="font-bold text-[#1d1d1f] mb-1">Partnership Support</h3>
                  <p className="text-[#6e6e73]">Dedicated support to maximize the value of your partnership</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="text-2xl">📱</div>
                <div>
                  <h3 className="font-bold text-[#1d1d1f] mb-1">Digital Integration</h3>
                  <p className="text-[#6e6e73]">Featured on our website and in communications with tournament participants</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contact CTA */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="bg-white rounded-3xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-8 md:p-12 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-[#1d1d1f] mb-3">Ready to Partner?</h2>
          <p className="text-[#6e6e73] mb-8 max-w-2xl mx-auto">
            Let's build a custom sponsorship package that aligns with your business goals. Reach out to discuss your vision.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <button
              onClick={() => openInquiry()}
              className="px-8 py-3 bg-[#003e79] hover:bg-[#002d5a] text-white font-bold rounded-full transition"
            >
              Send Inquiry
            </button>
            <a
              href="tel:630-336-6160"
              className="px-8 py-3 bg-[#f0f7ff] hover:bg-[#e0efff] text-[#003e79] font-bold rounded-full border border-[#e8e8ed] transition"
            >
              Call: 630-336-6160
            </a>
          </div>

          <p className="text-[#86868b] text-sm">
            Email: john@ultimatetournaments.net
          </p>
        </div>
      </div>

      {/* Current Sponsors List */}
      {sponsors.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-extrabold text-[#1d1d1f] mb-2">All Sponsors</h2>
            <p className="text-[#6e6e73]">Thank you to all our partners who make Ultimate Tournaments possible.</p>
          </div>

          {sortedTiers.map(tier => {
            const tc = tierConfig[tier] || tierConfig.custom;
            return (
              <div key={tier} className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">{tc.icon}</span>
                  <h3 className={`text-lg font-bold ${tc.color}`}>{tier.charAt(0).toUpperCase() + tier.slice(1)} Partners</h3>
                  <div className="flex-1 border-t border-[#e8e8ed] ml-2" />
                </div>
                <div className={`grid gap-4 ${tier === 'platinum' ? 'grid-cols-1' : tier === 'gold' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
                  {sponsorsByTier[tier].map(sp => (
                    <div key={sp.id + sp.package_name} className={`${tc.bg} rounded-2xl border ${tc.border} shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-5 ${tier === 'platinum' ? 'text-center py-8' : ''}`}>
                      {sp.logo_url ? (
                        <img src={sp.logo_url} alt={sp.name} className="h-12 object-contain mb-3" />
                      ) : (
                        <div className={`${tier === 'platinum' ? 'text-2xl' : 'text-lg'} font-extrabold ${tc.color} mb-1`}>{sp.name}</div>
                      )}
                      {sp.website && (
                        <a href={sp.website} target="_blank" rel="noopener noreferrer" className="text-xs text-[#003e79] hover:underline">{sp.website.replace(/https?:\/\//, '')}</a>
                      )}
                      {sp.event_name && (
                        <div className="text-[11px] text-[#86868b] mt-1">Sponsoring: {sp.event_name}</div>
                      )}
                      {sp.season && (
                        <div className="text-[11px] text-[#86868b] mt-1">{sp.season} Season</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
