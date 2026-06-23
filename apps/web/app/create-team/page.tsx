'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import RosterImport from '../components/RosterImport';

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

function getBackLabel(path: string): string {
  if (path.includes('/dashboard/coach')) return 'Back to My Teams';
  if (path.includes('/dashboard/manager')) return 'Back to Dashboard';
  if (path.includes('/dashboard')) return 'Back to Dashboard';
  if (path.includes('/register')) return 'Back to Registration';
  return 'Back to Events';
}

export default function CreateTeamPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(initialForm);
  const [step, setStep] = useState(1); // 1 = Team Info, 2 = Coaching Staff, 3 = USA Hockey & Record, 4 = Roster
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [redirectAfter, setRedirectAfter] = useState<string | null>(null);
  const [createdTeamId, setCreatedTeamId] = useState<string | null>(null);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Roster state
  const [rosterPlayers, setRosterPlayers] = useState<Array<{
    id?: string; firstName: string; lastName: string; jerseyNumber: string;
    position: string; shoots: string; usaHockeyNumber: string;
  }>>([]);
  const [importingRoster, setImportingRoster] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ firstName: '', lastName: '', jerseyNumber: '', position: '', shoots: '', usaHockeyNumber: '' });

  // Back navigation
  const [backLink, setBackLink] = useState<{ href: string; label: string }>({ href: '/events', label: 'Back to Events' });

  // Dynamic lookups from API
  const [ageGroups, setAgeGroups] = useState<string[]>(FALLBACK_AGE_GROUPS);
  const [divisions, setDivisions] = useState<string[]>(FALLBACK_DIVISIONS);
  const [stateDivisions, setStateDivisions] = useState<Record<string, string[]>>({});
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

    // Track where the user came from for the back button
    const fromParam = params.get('from');
    if (fromParam) setBackLink({ href: fromParam, label: getBackLabel(fromParam) });

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
      // Load state-based divisions
      try {
        const sdRes = await fetch(`${API}/lookups/state-divisions`);
        const sdJson = await sdRes.json() as any;
        if (sdJson.success && sdJson.data) {
          const byState: Record<string, string[]> = {};
          for (const item of sdJson.data) {
            if (!byState[item.state]) byState[item.state] = [];
            byState[item.state].push(item.level_name);
          }
          setStateDivisions(byState);
        }
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
      const authToken = localStorage.getItem('uht_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${API}/teams`, {
        method: 'POST',
        headers,
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

      setCreatedTeamId(data.data.id);
      setCreatedInviteCode(data.data.inviteCode || null);
      setSaving(false);

      // Auto-import from USA Hockey URL if provided
      if (form.usaHockeyRosterUrl.trim()) {
        setStep(4);
        handleImportFromUrl(data.data.id);
      } else {
        setStep(4);
      }
    } catch (err) {
      setError('Network error. Please try again.');
      setSaving(false);
    }
  };

  const handleImportFromUrl = async (teamId: string) => {
    setImportingRoster(true);
    setRosterError('');
    try {
      const authToken = localStorage.getItem('uht_token');
      const res = await fetch(`${API}/teams/${teamId}/import-roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ url: form.usaHockeyRosterUrl.trim() }),
      });
      const data = await res.json() as any;
      if (data.success && data.data?.players?.length > 0) {
        setRosterPlayers(data.data.players.map((p: any) => ({
          id: p.id, firstName: p.firstName, lastName: p.lastName,
          jerseyNumber: p.jerseyNumber || '', position: p.position || '',
          shoots: p.shoots || '', usaHockeyNumber: p.usaHockeyNumber || '',
        })));
      } else {
        setRosterError(data.error || 'No players found. Try pasting your roster or adding players manually.');
      }
    } catch {
      setRosterError('Failed to import. Try pasting your roster or adding players manually.');
    }
    setImportingRoster(false);
  };

  const handlePasteImport = async () => {
    if (!pastedText.trim() || !createdTeamId) return;
    setImportingRoster(true);
    setRosterError('');
    try {
      const authToken = localStorage.getItem('uht_token');
      const res = await fetch(`${API}/teams/${createdTeamId}/import-roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ pastedData: pastedText }),
      });
      const data = await res.json() as any;
      if (data.success && data.data?.players?.length > 0) {
        setRosterPlayers(prev => [...prev, ...data.data.players.map((p: any) => ({
          id: p.id, firstName: p.firstName, lastName: p.lastName,
          jerseyNumber: p.jerseyNumber || '', position: p.position || '',
          shoots: p.shoots || '', usaHockeyNumber: p.usaHockeyNumber || '',
        }))]);
        setPastedText('');
        setPasteMode(false);
      } else {
        setRosterError(data.error || 'Could not parse roster data.');
      }
    } catch {
      setRosterError('Failed to import pasted data.');
    }
    setImportingRoster(false);
  };

  const handleAddPlayer = async () => {
    if (!newPlayer.firstName.trim() || !newPlayer.lastName.trim() || !createdTeamId) return;
    try {
      const authToken = localStorage.getItem('uht_token');
      const res = await fetch(`${API}/teams/${createdTeamId}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(newPlayer),
      });
      const data = await res.json() as any;
      if (data.success) {
        setRosterPlayers(prev => [...prev, { id: data.data.id, ...newPlayer }]);
        setNewPlayer({ firstName: '', lastName: '', jerseyNumber: '', position: '', shoots: '', usaHockeyNumber: '' });
        setShowAddForm(false);
      }
    } catch {}
  };

  const handleRemovePlayer = async (playerId: string) => {
    if (!createdTeamId) return;
    try {
      const authToken = localStorage.getItem('uht_token');
      await fetch(`${API}/teams/${createdTeamId}/players/${playerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setRosterPlayers(prev => prev.filter(p => p.id !== playerId));
    } catch {}
  };

  const handleFinish = () => {
    setSuccess(true);
  };

  const goToDashboard = () => {
    if (redirectAfter) {
      router.push(redirectAfter);
    } else {
      const role = localStorage.getItem('uht_role') || 'coach';
      router.push('/dashboard/' + role + '/teams');
    }
  };

  const copyInviteCode = () => {
    if (createdInviteCode) {
      navigator.clipboard.writeText(createdInviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    }
  };

  if (success) {
    const managerEmail = form.managerEmail?.trim();
    const coachEmail = form.headCoachEmail?.trim();
    const creatorEmail = (() => { try { const u = JSON.parse(localStorage.getItem('uht_user') || '{}'); return u.email || ''; } catch { return ''; } })();
    const invitedSomeone = (managerEmail && managerEmail !== creatorEmail) || (coachEmail && coachEmail !== creatorEmail);

    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
        <nav className="bg-navy-700 px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
            <span className="text-white font-semibold text-lg">Ultimate Tournaments</span>
          </a>
        </nav>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            {/* Success header */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-[#1d1d1f]">{form.name || 'Team'} Created!</h2>
            </div>

            {/* Invite code card */}
            {createdInviteCode && (
              <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden mb-5">
                <div className="bg-gradient-to-r from-[#003e79] to-[#005599] px-5 py-3">
                  <p className="text-white font-semibold text-sm flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                    Your Team Invite Code
                  </p>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <div className="bg-[#f5f5f7] rounded-xl px-6 py-3 border-2 border-dashed border-[#d2d2d7]">
                      <span className="text-3xl font-mono font-bold tracking-[0.3em] text-[#003e79] select-all">{createdInviteCode}</span>
                    </div>
                    <button onClick={copyInviteCode}
                      className={"flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold transition " +
                        (codeCopied ? "bg-green-100 text-green-700" : "bg-[#003e79] text-white hover:bg-[#002d5a]")}>
                      {codeCopied ? (
                        <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Copied!</>
                      ) : (
                        <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy</>
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-[#6e6e73] text-center leading-relaxed">
                    Share this code with your {form.managerEmail ? 'coach' : 'manager'} or other team staff so they can link to this team when they create their account.
                  </p>
                </div>
              </div>
            )}

            {/* Sent invite notice */}
            {invitedSomeone && (
              <div className="bg-[#f0f7ff] border border-[#003e79]/15 rounded-xl p-4 mb-5 flex items-start gap-3">
                <div className="w-8 h-8 bg-[#003e79] rounded-lg flex items-center justify-center text-white shrink-0 mt-0.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#003e79]">Invite email sent!</p>
                  <p className="text-xs text-[#6e6e73] mt-0.5">
                    {managerEmail && managerEmail !== creatorEmail && <>We sent an invite to <span className="font-medium">{managerEmail}</span>. </>}
                    {coachEmail && coachEmail !== creatorEmail && <>We sent an invite to <span className="font-medium">{coachEmail}</span>. </>}
                    They&apos;ll be automatically linked to {form.name || 'this team'} when they sign up.
                  </p>
                </div>
              </div>
            )}

            {/* Continue button */}
            <button onClick={goToDashboard}
              className="w-full py-3.5 rounded-xl bg-[#003e79] text-white text-base font-semibold hover:bg-[#002d5a] transition">
              Go to My Teams
            </button>
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
        <a href={backLink.href} className="text-white/70 text-sm hover:text-white transition-colors flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          {backLink.label}
        </a>
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
            {[1, 2, 3, 4].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors " +
                  (step === s ? "bg-brand-500 text-white" : step > s ? "bg-green-500 text-white" : "bg-gray-200 text-[#6e6e73]")}>
                  {step > s ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  ) : s}
                </div>
                {s < 4 && <div className={"w-8 h-0.5 " + (step > s ? "bg-green-500" : "bg-gray-200")} />}
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
                      {(form.state && stateDivisions[form.state]?.length ? stateDivisions[form.state] : divisions).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    {form.state && stateDivisions[form.state]?.length > 0 && (
                      <p className="text-xs text-[#86868b] mt-1">Showing divisions for {form.state}</p>
                    )}
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
                    <input type="text" value={form.hometownLeague} onChange={e => set('hometownLeague', e.target.value)}
                      placeholder="e.g. COHL, NIHL, AHAI"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm" />
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
                    {saving ? 'Creating Team...' : 'Next: Add Roster'}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Roster */}
            {step === 4 && createdTeamId && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-[#1d1d1f] mb-1">Team Roster</h2>
                    <p className="text-sm text-[#6e6e73]">Add your players — upload a file, paste from a spreadsheet, import from USA Hockey, or add manually</p>
                  </div>
                  <span className="text-xs text-[#86868b] bg-gray-100 px-3 py-1 rounded-full">{rosterPlayers.length} players</span>
                </div>

                <RosterImport
                  teamId={createdTeamId}
                  compact
                  onPlayersAdded={(newPlayers) => {
                    setRosterPlayers(prev => [...prev, ...newPlayers]);
                  }}
                />

                {/* Roster Table */}
                {rosterPlayers.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-4 py-2.5 font-medium text-[#6e6e73] w-12">#</th>
                          <th className="px-4 py-2.5 font-medium text-[#6e6e73]">Name</th>
                          <th className="px-4 py-2.5 font-medium text-[#6e6e73]">Position</th>
                          <th className="px-4 py-2.5 font-medium text-[#6e6e73]">Shoots</th>
                          <th className="px-4 py-2.5 font-medium text-[#6e6e73] w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rosterPlayers.map((p, i) => (
                          <tr key={p.id || i} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-[#1d1d1f] font-medium">{p.jerseyNumber || '—'}</td>
                            <td className="px-4 py-2.5 text-[#1d1d1f]">{p.firstName} {p.lastName}</td>
                            <td className="px-4 py-2.5 text-[#6e6e73] capitalize">{p.position || '—'}</td>
                            <td className="px-4 py-2.5 text-[#6e6e73] capitalize">{p.shoots || '—'}</td>
                            <td className="px-4 py-2.5">
                              {p.id && (
                                <button onClick={() => handleRemovePlayer(p.id!)}
                                  className="text-red-400 hover:text-red-600 transition">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="pt-4 flex justify-between items-center">
                  <p className="text-xs text-[#86868b]">You can always add more players later from your dashboard.</p>
                  <button onClick={handleFinish}
                    className="px-10 py-3 rounded-xl font-medium text-sm bg-brand-500 text-white hover:bg-brand-600 transition-all">
                    {rosterPlayers.length > 0 ? 'Finish' : 'Skip & Finish'}
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
