'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Fallbacks in case API is unreachable
const FALLBACK_AGE_GROUPS = ['Mite (8U)', 'Squirt (10U)', 'Pee Wee (12U)', 'Bantam (14U)', '16U / JV', '18U / Varsity'];
const FALLBACK_DIVISIONS = ['AA', 'Gold', 'A1', 'A2', 'Silver', 'B1', 'Bronze', 'House'];
const FALLBACK_LEAGUES = ['COHL', 'NIHL', 'AHAI', 'Other'];
const FALLBACK_TEAM_TYPES = ['Draft (no cuts)', 'Tournament team', 'Tryout', 'Regular Season Team', 'Added Players'];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const API = 'https://uht.chad-157.workers.dev/api';

interface FormData {
  // Team info
  name: string;
  ageGroup: string;
  divisionLevel: string;
  city: string;
  state: string;
  website: string;
  hometownLeague: string;
  teamType: string;
  // USA Hockey
  usaHockeyTeamId: string;
  usaHockeyRosterUrl: string;
  // Head Coach
  headCoachName: string;
  headCoachEmail: string;
  headCoachPhone: string;
  // Manager
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  // Season Record
  wins: string;
  losses: string;
  ties: string;
  goalsFor: string;
  goalsAgainst: string;
}

const initialForm: FormData = {
  name: '', ageGroup: '', divisionLevel: '', city: '', state: '', website: '',
  hometownLeague: '', teamType: '',
  usaHockeyTeamId: '', usaHockeyRosterUrl: '',
  headCoachName: '', headCoachEmail: '', headCoachPhone: '',
  managerName: '', managerEmail: '', managerPhone: '',
  wins: '', losses: '', ties: '', goalsFor: '', goalsAgainst: '',
};

export default function CreateTeamPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(initialForm);
  const [step, setStep] = useState(1); // 1 = Team Info, 2 = Coaching Staff, 3 = USA Hockey & Record
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [redirectAfter, setRedirectAfter] = useState<string | null>(null);

  // Dynamic lookups from API
  const [ageGroups, setAgeGroups] = useState<string[]>(FALLBACK_AGE_GROUPS);
  const [divisions, setDivisions] = useState<string[]>(FALLBACK_DIVISIONS);
  const [leagues, setLeagues] = useState<string[]>(FALLBACK_LEAGUES);
  const [teamTypes, setTeamTypes] = useState<string[]>(FALLBACK_TEAM_TYPES);

  useEffect(() => {
    // Check auth
    const token = localStorage.getItem('uht_token');
    if (!token) {
      router.push('/login?redirect=/create-team');
      return;
    }
    // Check for redirect param (e.g., after creating team, go back to event registration)
    const params = new URLSearchParams(window.location.search);
    const redir = params.get('redirect');
    if (redir) setRedirectAfter(redir);

    // Load dynamic lookups
    (async () => {
      try {
        const res = await fetch(`${API}/lookups?active=true`);
        const json = await res.json() as any;
        const items: { category: string; value: string; sort_order: number }[] = json.data || [];
        const byCategory = (cat: string) => items.filter(i => i.category === cat).map(i => i.value);
        const ag = byCategory('age_group');
        const dv = byCategory('division');
        const lg = byCategory('league');
        const tt = byCategory('team_type');
        if (ag.length) setAgeGroups(ag);
        if (dv.length) setDivisions(dv);
        if (lg.length) setLeagues(lg);
        if (tt.length) setTeamTypes(tt);
      } catch {}
    })();
  }, [router]);

  const set = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const canProceedStep1 = form.name.trim() && form.ageGroup && form.city.trim();
  const canProceedStep2 = form.headCoachName.trim() && form.headCoachEmail.trim();

  const handleSubmit = async () => {
    setSaving(true);
    setError('');

    const seasonRecord = (form.wins || form.losses || form.ties)
      ? `${form.wins || '0'}-${form.losses || '0'}-${form.ties || '0'}${form.goalsFor ? ` (GF: ${form.goalsFor}, GA: ${form.goalsAgainst || '0'})` : ''}`
      : undefined;

    const payload = {
      name: form.name.trim(),
      ageGroup: form.ageGroup,
      divisionLevel: form.divisionLevel || undefined,
      city: form.city.trim() || undefined,
      state: form.state || undefined,
      website: form.website.trim() || undefined,
      hometownLeague: form.hometownLeague || undefined,
      teamType: form.teamType || undefined,
      usaHockeyTeamId: form.usaHockeyTeamId.trim() || undefined,
      usaHockeyRosterUrl: form.usaHockeyRosterUrl.trim() || undefined,
      headCoachName: form.headCoachName.trim() || undefined,
      headCoachEmail: form.headCoachEmail.trim() || undefined,
      headCoachPhone: form.headCoachPhone.trim() || undefined,
      managerName: form.managerName.trim() || undefined,
      managerEmail: form.managerEmail.trim() || undefined,
      managerPhone: form.managerPhone.trim() || undefined,
      seasonRecord,
    };

    try {
      const res = await fetch(`${API}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as any;
      if (!data.success) {
        setError(data.error || 'Failed to create team');
        setSaving(false);
        return;
      }

      // Store team info in localStorage so events page can find it
      const existingTeams = JSON.parse(localStorage.getItem('uht_teams') || '[]');
      existingTeams.push({ id: data.data.id, name: form.name.trim(), ageGroup: form.ageGroup });
      localStorage.setItem('uht_teams', JSON.stringify(existingTeams));

      setSuccess(true);
      setTimeout(() => {
        if (redirectAfter) {
          router.push(redirectAfter);
        } else {
          const role = localStorage.getItem('uht_role') || 'coach';
          router.push('/dashboard/' + role);
        }
      }, 1500);
    } catch (err) {
      setError('Network error. Please try again.');
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
        <nav className="bg-navy-700 px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
            <span className="text-white font-semibold text-lg">Ultimate Tournaments</span>
          </a>
        </nav>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-[#1d1d1f]">Team Created!</h2>
            <p className="text-[#6e6e73] mt-2">Redirecting you back...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
      <nav className="bg-navy-700 px-6 py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-3">
          <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
          <span className="text-white font-semibold text-lg">Ultimate Tournaments</span>
        </a>
        <a href="/events" className="text-white/70 text-sm hover:text-white transition-colors">Back to Events</a>
      </nav>

      <div className="flex-1 flex items-start justify-center p-6 pt-8">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-3xl font-semibold text-[#1d1d1f]">Create Your Team</h1>
            <p className="mt-2 text-[#6e6e73]">Register your team to start signing up for tournaments</p>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors " +
                  (step === s ? "bg-brand-500 text-white" : step > s ? "bg-green-500 text-white" : "bg-gray-200 text-[#6e6e73]")}>
                  {step > s ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  ) : s}
                </div>
                {s < 3 && <div className={"w-12 h-0.5 " + (step > s ? "bg-green-500" : "bg-gray-200")} />}
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-soft p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
            )}

            {/* STEP 1: Team Info */}
            {step === 1 && (
              <div className="space-y-5">
                <h2 className="text-xl font-semibold text-[#1d1d1f] mb-1">Team Information</h2>
                <p className="text-sm text-[#6e6e73] mb-4">Tell us about your team</p>

                <div>
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Team Name <span className="text-red-500">*</span></label>
                  <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="e.g. Chicago Hawks 12U AA"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Age Group <span className="text-red-500">*</span></label>
                    <select value={form.ageGroup} onChange={e => set('ageGroup', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm bg-white">
                      <option value="">Select...</option>
                      {ageGroups.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Division Level</label>
                    <select value={form.divisionLevel} onChange={e => set('divisionLevel', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm bg-white">
                      <option value="">Select...</option>
                      {divisions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Hometown City <span className="text-red-500">*</span></label>
                    <input type="text" value={form.city} onChange={e => set('city', e.target.value)}
                      placeholder="e.g. Chicago"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">State</label>
                    <select value={form.state} onChange={e => set('state', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm bg-white">
                      <option value="">Select...</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Hometown League</label>
                    <select value={form.hometownLeague} onChange={e => set('hometownLeague', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm bg-white">
                      <option value="">Select...</option>
                      {leagues.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Team Website</label>
                    <input type="url" value={form.website} onChange={e => set('website', e.target.value)}
                      placeholder="https://..."
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Team Type</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {teamTypes.map(tt => (
                      <button key={tt} type="button" onClick={() => set('teamType', tt)}
                        className={"px-3 py-2.5 rounded-xl border text-sm transition-all text-left " +
                          (form.teamType === tt ? "border-brand-400 bg-brand-50 text-brand-600 font-medium" : "border-gray-200 hover:border-gray-300 text-[#1d1d1f]")}>
                        {tt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button onClick={() => setStep(2)} disabled={!canProceedStep1}
                    className={"px-8 py-3 rounded-xl font-medium text-sm transition-all " +
                      (canProceedStep1 ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-gray-200 text-gray-400 cursor-not-allowed")}>
                    Next: Coaching Staff
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Coaching Staff */}
            {step === 2 && (
              <div className="space-y-5">
                <h2 className="text-xl font-semibold text-[#1d1d1f] mb-1">Coaching Staff</h2>
                <p className="text-sm text-[#6e6e73] mb-4">Head coach information is required for tournament communications</p>

                <div className="bg-gray-50 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-[#1d1d1f] uppercase tracking-wide">Head Coach</h3>
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Full Name <span className="text-red-500">*</span></label>
                    <input type="text" value={form.headCoachName} onChange={e => set('headCoachName', e.target.value)}
                      placeholder="First and Last Name"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm bg-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Email <span className="text-red-500">*</span></label>
                      <input type="email" value={form.headCoachEmail} onChange={e => set('headCoachEmail', e.target.value)}
                        placeholder="coach@email.com"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Phone</label>
                      <input type="tel" value={form.headCoachPhone} onChange={e => set('headCoachPhone', e.target.value)}
                        placeholder="(555) 555-5555"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm bg-white" />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-[#1d1d1f] uppercase tracking-wide">Team Manager <span className="text-[#6e6e73] font-normal normal-case">(optional)</span></h3>
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Full Name</label>
                    <input type="text" value={form.managerName} onChange={e => set('managerName', e.target.value)}
                      placeholder="First and Last Name"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm bg-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Email</label>
                      <input type="email" value={form.managerEmail} onChange={e => set('managerEmail', e.target.value)}
                        placeholder="manager@email.com"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Phone</label>
                      <input type="tel" value={form.managerPhone} onChange={e => set('managerPhone', e.target.value)}
                        placeholder="(555) 555-5555"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm bg-white" />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-between">
                  <button onClick={() => setStep(1)}
                    className="px-6 py-3 rounded-xl border border-gray-200 text-[#1d1d1f] text-sm font-medium hover:bg-gray-50 transition-all">
                    Back
                  </button>
                  <button onClick={() => setStep(3)} disabled={!canProceedStep2}
                    className={"px-8 py-3 rounded-xl font-medium text-sm transition-all " +
                      (canProceedStep2 ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-gray-200 text-gray-400 cursor-not-allowed")}>
                    Next: USA Hockey & Record
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: USA Hockey & Season Record */}
            {step === 3 && (
              <div className="space-y-5">
                <h2 className="text-xl font-semibold text-[#1d1d1f] mb-1">USA Hockey & Season Record</h2>
                <p className="text-sm text-[#6e6e73] mb-4">Link your USA Hockey roster to auto-import player data</p>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-blue-900">USA Hockey Roster Link</h3>
                      <p className="text-xs text-blue-700 mt-1">
                        Go to <a href="https://www.usahockey.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">usahockey.com</a>,
                        find your team, and paste the roster URL below. We&apos;ll pull your player data automatically.
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-900 mb-1.5">USA Hockey Team ID</label>
                    <input type="text" value={form.usaHockeyTeamId} onChange={e => set('usaHockeyTeamId', e.target.value)}
                      placeholder="e.g. 123456"
                      className="w-full px-4 py-3 rounded-xl border border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-900 mb-1.5">USA Hockey Roster URL</label>
                    <input type="url" value={form.usaHockeyRosterUrl} onChange={e => set('usaHockeyRosterUrl', e.target.value)}
                      placeholder="https://www.usahockey.com/teams/..."
                      className="w-full px-4 py-3 rounded-xl border border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm bg-white" />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-[#1d1d1f] uppercase tracking-wide">Season Record <span className="text-[#6e6e73] font-normal normal-case">(optional — helps with seeding)</span></h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#6e6e73] mb-1">Wins</label>
                      <input type="number" min="0" value={form.wins} onChange={e => set('wins', e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm text-center" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6e6e73] mb-1">Losses</label>
                      <input type="number" min="0" value={form.losses} onChange={e => set('losses', e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm text-center" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6e6e73] mb-1">Ties</label>
                      <input type="number" min="0" value={form.ties} onChange={e => set('ties', e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm text-center" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#6e6e73] mb-1">Goals For</label>
                      <input type="number" min="0" value={form.goalsFor} onChange={e => set('goalsFor', e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm text-center" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6e6e73] mb-1">Goals Against</label>
                      <input type="number" min="0" value={form.goalsAgainst} onChange={e => set('goalsAgainst', e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm text-center" />
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-navy-50 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-navy-800 mb-3">Team Summary</h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div className="text-[#6e6e73]">Team</div>
                    <div className="font-medium text-[#1d1d1f]">{form.name}</div>
                    <div className="text-[#6e6e73]">Age Group</div>
                    <div className="font-medium text-[#1d1d1f]">{form.ageGroup}</div>
                    {form.divisionLevel && <>
                      <div className="text-[#6e6e73]">Division</div>
                      <div className="font-medium text-[#1d1d1f]">{form.divisionLevel}</div>
                    </>}
                    <div className="text-[#6e6e73]">Location</div>
                    <div className="font-medium text-[#1d1d1f]">{form.city}{form.state ? `, ${form.state}` : ''}</div>
                    <div className="text-[#6e6e73]">Head Coach</div>
                    <div className="font-medium text-[#1d1d1f]">{form.headCoachName}</div>
                    {form.managerName && <>
                      <div className="text-[#6e6e73]">Manager</div>
                      <div className="font-medium text-[#1d1d1f]">{form.managerName}</div>
                    </>}
                    {form.usaHockeyTeamId && <>
                      <div className="text-[#6e6e73]">USA Hockey ID</div>
                      <div className="font-medium text-[#1d1d1f]">{form.usaHockeyTeamId}</div>
                    </>}
                  </div>
                </div>

                <div className="pt-4 flex justify-between">
                  <button onClick={() => setStep(2)}
                    className="px-6 py-3 rounded-xl border border-gray-200 text-[#1d1d1f] text-sm font-medium hover:bg-gray-50 transition-all">
                    Back
                  </button>
                  <button onClick={handleSubmit} disabled={saving}
                    className={"px-10 py-3 rounded-xl font-medium text-sm transition-all " +
                      (saving ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-brand-500 text-white hover:bg-brand-600")}>
                    {saving ? 'Creating Team...' : 'Create Team'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="text-center text-xs text-[#6e6e73] mt-6">
            Need help? Contact us at <a href="mailto:info@ultimatetournaments.com" className="text-brand-500 hover:underline">info@ultimatetournaments.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
