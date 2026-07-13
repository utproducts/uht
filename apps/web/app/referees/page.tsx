'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';

interface City {
  id: string;
  name: string;
  state: string;
}

export default function RefereesPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [loadingCities, setLoadingCities] = useState(true);

  // Form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cityId, setCityId] = useState('');
  const [experience, setExperience] = useState('');
  const [certifications, setCertifications] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/cities`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setCities(json.data);
        setLoadingCities(false);
      })
      .catch(() => setLoadingCities(false));
  }, []);

  // Group cities by state
  const citiesByState: Record<string, City[]> = {};
  cities.forEach(c => {
    if (!citiesByState[c.state]) citiesByState[c.state] = [];
    citiesByState[c.state].push(c);
  });
  const sortedStates = Object.keys(citiesByState).sort();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !cityId) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/referees/interest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone: phone || undefined,
          city_id: cityId,
          experience: experience || undefined,
          certifications: certifications || undefined,
          message: message || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSubmitted(true);
      } else {
        setError(json.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    }
    setSubmitting(false);
  };

  const inputCls = "w-full px-4 py-3 border border-[#e8e8ed] rounded-xl text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none transition text-sm bg-white";

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#003e79] via-[#005599] to-[#00ccff]">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#00ccff]/20 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 pt-16 pb-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-1.5 rounded-full mb-6">
            <span className="w-2 h-2 bg-[#00ccff] rounded-full animate-pulse" />
            <span className="text-white/80 text-sm font-semibold">Now Recruiting</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">Become a Referee</h1>
          <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
            We&apos;re always looking for talented officials to join our team. Whether you&apos;re an experienced ref or just getting started, we want to hear from you.
          </p>
        </div>

        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
            <path d="M0 60V0c240 40 480 60 720 60s480-20 720-60v60H0z" fill="#fafafa" />
          </svg>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
          {/* Left: Info Cards */}
          <div className="lg:col-span-2 space-y-6">
            {/* Why Ref */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-4">Why Ref with Us?</h3>
              <div className="space-y-4">
                {[
                  { icon: '💰', title: 'Competitive Pay', desc: 'Per-game rates that reflect your experience. Direct ACH deposits — no waiting for checks.' },
                  { icon: '📅', title: 'Flexible Schedule', desc: 'Pick the events and games that work for you. Weekend tournaments across the Midwest.' },
                  { icon: '🏒', title: 'Great Hockey', desc: 'Officiate competitive youth hockey at well-organized, professionally-run tournaments.' },
                  { icon: '📈', title: 'Grow Your Career', desc: 'Build your officiating resume and get exposure to higher levels of play.' },
                ].map(item => (
                  <div key={item.title} className="flex gap-3">
                    <span className="text-2xl shrink-0">{item.icon}</span>
                    <div>
                      <h4 className="font-semibold text-[#1d1d1f] text-sm">{item.title}</h4>
                      <p className="text-xs text-[#6e6e73] mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Locations */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-4">Our Locations</h3>
              {loadingCities ? (
                <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#003e79]" /></div>
              ) : (
                <div className="space-y-3">
                  {sortedStates.map(state => (
                    <div key={state}>
                      <p className="text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">{state}</p>
                      <div className="flex flex-wrap gap-2">
                        {citiesByState[state].map(city => (
                          <span key={city.id} className="inline-block px-3 py-1 bg-[#f0f7ff] text-[#003e79] rounded-full text-xs font-semibold">
                            {city.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Form */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6 sm:p-8">
              {submitted ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-[#1d1d1f] mb-2">Thanks for Your Interest!</h2>
                  <p className="text-[#6e6e73] max-w-md mx-auto">
                    We&apos;ve received your information and will be in touch soon. Keep an eye on your email for next steps.
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-[#1d1d1f] mb-1">Interested? Let Us Know</h2>
                  <p className="text-sm text-[#6e6e73] mb-6">Fill out the form below and we&apos;ll get back to you about upcoming opportunities in your area.</p>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">First Name *</label>
                        <input
                          type="text"
                          required
                          value={firstName}
                          onChange={e => setFirstName(e.target.value)}
                          placeholder="John"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Last Name *</label>
                        <input
                          type="text"
                          required
                          value={lastName}
                          onChange={e => setLastName(e.target.value)}
                          placeholder="Smith"
                          className={inputCls}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Email *</label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="john@example.com"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Phone</label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          placeholder="(555) 123-4567"
                          className={inputCls}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Preferred Location *</label>
                      <select
                        required
                        value={cityId}
                        onChange={e => setCityId(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">Select a city...</option>
                        {sortedStates.map(state => (
                          <optgroup key={state} label={state}>
                            {citiesByState[state].map(city => (
                              <option key={city.id} value={city.id}>{city.name}, {city.state}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Experience Level</label>
                      <select
                        value={experience}
                        onChange={e => setExperience(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">Select...</option>
                        <option value="none">No experience — willing to learn</option>
                        <option value="beginner">Beginner — a few games under my belt</option>
                        <option value="intermediate">Intermediate — 1-3 seasons</option>
                        <option value="experienced">Experienced — 3+ seasons</option>
                        <option value="advanced">Advanced — USA Hockey certified, high-level experience</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Certifications</label>
                      <input
                        type="text"
                        value={certifications}
                        onChange={e => setCertifications(e.target.value)}
                        placeholder="e.g., USA Hockey Level 2, state certified..."
                        className={inputCls}
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Anything Else?</label>
                      <textarea
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        placeholder="Tell us about yourself, your availability, or anything else..."
                        rows={3}
                        className={inputCls + ' resize-none'}
                      />
                    </div>

                    {error && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-medium">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting || !firstName.trim() || !lastName.trim() || !email.trim() || !cityId}
                      className="w-full py-3 bg-[#003e79] hover:bg-[#002d5a] text-white font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {submitting ? 'Submitting...' : 'Submit Interest'}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
