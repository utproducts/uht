'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import RosterImport from '../components/RosterImport';

const FALLBACK_AGE_GROUPS = ['Mite (8U)', 'Squirt (10U)', 'Pee Wee (12U)', 'Bantam (14U)', '16U / JV', '18U / Varsity'];
const FALLBACK_DIVISIONS = ['AA', 'Gold', 'A1', 'A2', 'Silver', 'B1', 'Bronze', 'House'];
const FALLBACK_TEAM_TYPES = ['Draft (no cuts)', 'Tournament team', 'Tryout', 'Regular Season Team', 'Added Players'];

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

const API = 'https://uht.chad-157.workers.dev/api';

interface Organization {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  logo_url: string | null;
}

interface FormData {
  // Org
  orgId: string;
  orgName: string;
  // Team
  ageGroup: string;
  divisionLevel: string;
  city: string;
  state: string;
  website: string;
  hometownLeague: string;
  teamType: string;
  // Head Coach
  headCoachName: string;
  headCoachEmail: string;
  headCoachPhone: string;
  // Manager
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  // Season
  season: string;
  // Season Record
  wins: string;
  losses: string;
  ties: string;
  goalsFor: string;
  goalsAgainst: string;
}

const initialForm: FormData = {
  orgId: '', orgName: '',
  ageGroup: '', divisionLevel: '', city: '', state: '', website: '',
  hometownLeague: '', teamType: '', season: '',
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

// Derive display team name from org + age group + division
function deriveTeamName(orgName: string, ageGroup: string, division: string): string {
  const parts = [orgName];
  if (ageGroup) parts.push(ageGroup);
  if (division) parts.push(division);
  return parts.join(' ');
}

export default function CreateTeamPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(initialForm);
  const [step, setStep] = useState(1);
  // Step 1: Organization search  Step 2: Age Group + Division  Step 3: Coaching Staff  Step 4: Review + Submit  Step 5: Roster
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editTeamId, setEditTeamId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [redirectAfter, setRedirectAfter] = useState<string | null>(null);
  const [createdTeamId, setCreatedTeamId] = useState<string | null>(null);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [rosterShareToken, setRosterShareToken] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [rosterLinkCopied, setRosterLinkCopied] = useState(false);

  // Duplicate team warning
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateTeam, setDuplicateTeam] = useState<any>(null);

  // Org search
  const [orgSearch, setOrgSearch] = useState('');
  const [orgResults, setOrgResults] = useState<Organization[]>([]);
  const [orgSearching, setOrgSearching] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [creatingNewOrg, setCreatingNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgCity, setNewOrgCity] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Season type selector
  const [seasonType, setSeasonType] = useState<'spring' | 'fall' | ''>('');

  // Org request (fall teams)
  const [orgRequestSent, setOrgRequestSent] = useState(false);
  const [orgRequestSending, setOrgRequestSending] = useState(false);
  const [requestingOrg, setRequestingOrg] = useState(false);
  const [reqOrgName, setReqOrgName] = useState('');
  const [reqOrgCity, setReqOrgCity] = useState('');
  const [reqCoachName, setReqCoachName] = useState('');
  const [reqCoachEmail, setReqCoachEmail] = useState('');

  // Roster state
  const [rosterPlayers, setRosterPlayers] = useState<Array<{
    id?: string; firstName: string; lastName: string; jerseyNumber: string;
    position: string; shoots: string;
  }>>([]);
  const [importingRoster, setImportingRoster] = useState(false);
  const [importResult, setImportResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [noRosterYet, setNoRosterYet] = useState(false);
  const [settingRosterPending, setSettingRosterPending] = useState(false);

  // Back navigation
  const [backLink, setBackLink] = useState<{ href: string; label: string }>({ href: '/events', label: 'Back to Events' });

  // Dynamic lookups from API
  const [ageGroups, setAgeGroups] = useState<string[]>(FALLBACK_AGE_GROUPS);
  const [divisions, setDivisions] = useState<string[]>(FALLBACK_DIVISIONS);
  const [stateDivisions, setStateDivisions] = useState<Record<string, string[]>>({});
  const [teamTypes, setTeamTypes] = useState<string[]>(FALLBACK_TEAM_TYPES);

  useEffect(() => {
    const token = localStorage.getItem('uht_token');
    if (!token) {
      router.push('/login?redirect=/create-team');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const redir = params.get('redirect');
    if (redir) setRedirectAfter(redir);
    const fromParam = params.get('from');
    if (fromParam) setBackLink({ href: fromParam, label: getBackLabel(fromParam) });

    // Check for edit mode
    const editParam = params.get('edit');
    if (editParam) {
      setIsEditMode(true);
      setEditTeamId(editParam);
      setEditLoading(true);
      (async () => {
        try {
          const authToken = localStorage.getItem('uht_token');
          const headers: Record<string, string> = {};
          if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
          const res = await fetch(`${API}/teams/${editParam}`, { headers });
          const json = await res.json() as any;
          if (json.success && json.data) {
            const t = json.data;
            // Parse season record if it exists (format: "5-3-1 (GF: 20, GA: 15)")
            let wins = '', losses = '', ties = '', goalsFor = '', goalsAgainst = '';
            if (t.season_record) {
              const recordMatch = t.season_record.match(/^(\d+)-(\d+)-(\d+)/);
              if (recordMatch) { wins = recordMatch[1]; losses = recordMatch[2]; ties = recordMatch[3]; }
              const gfMatch = t.season_record.match(/GF:\s*(\d+)/);
              const gaMatch = t.season_record.match(/GA:\s*(\d+)/);
              if (gfMatch) goalsFor = gfMatch[1];
              if (gaMatch) goalsAgainst = gaMatch[1];
            }
            setForm({
              orgId: t.organization_id || '',
              orgName: t.organization_name || '',
              ageGroup: t.age_group || '',
              divisionLevel: t.division_level || '',
              city: t.city || '',
              state: t.state || '',
              website: t.website || '',
              hometownLeague: t.hometown_league || '',
              teamType: t.team_type || '',
              season: t.season || '',
              headCoachName: t.head_coach_name || '',
              headCoachEmail: t.head_coach_email || '',
              headCoachPhone: t.head_coach_phone || '',
              managerName: t.manager_name || '',
              managerEmail: t.manager_email || '',
              managerPhone: t.manager_phone || '',
              wins, losses, ties, goalsFor, goalsAgainst,
            });
            if (t.organization_id && t.organization_name) {
              setSelectedOrg({ id: t.organization_id, name: t.organization_name, city: t.city, state: t.state, logo_url: null });
            }
            if (t.season === 'spring' || t.season === 'fall') setSeasonType(t.season as 'spring' | 'fall');
            setStep(2); // Skip org selection in edit mode
          }
        } catch {
          setError('Failed to load team data');
        }
        setEditLoading(false);
      })();
    }

    // Load lookups
    (async () => {
      try {
        const res = await fetch(`${API}/lookups?active=true`);
        const json = await res.json() as any;
        const items: { category: string; value: string; sort_order: number }[] = json.data || [];
        const byCategory = (cat: string) => items.filter(i => i.category === cat).map(i => i.value);
        const ag = byCategory('age_group');
        const dv = byCategory('division');
        const tt = byCategory('team_type');
        if (ag.length) setAgeGroups(ag);
        if (dv.length) setDivisions(dv);
        if (tt.length) setTeamTypes(tt);
      } catch {}
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

  // Org search with debounce
  const searchOrgs = useCallback(async (query: string, state: string) => {
    if (query.length < 2 && !state) {
      setOrgResults([]);
      return;
    }
    setOrgSearching(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (state) params.set('state', state);
      const res = await fetch(`${API}/organizations/search?${params}`);
      const json = await res.json() as any;
      setOrgResults(json.data || []);
    } catch {
      setOrgResults([]);
    }
    setOrgSearching(false);
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (selectedOrg || creatingNewOrg || requestingOrg) return; // Don't search while org is selected or requesting
    searchTimeoutRef.current = setTimeout(() => {
      searchOrgs(orgSearch, form.state);
    }, 300);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [orgSearch, form.state, selectedOrg, creatingNewOrg, requestingOrg, searchOrgs]);

  const set = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const selectOrg = (org: Organization) => {
    setSelectedOrg(org);
    setForm(prev => ({ ...prev, orgId: org.id, orgName: org.name }));
    if (org.state && !form.state) set('state', org.state);
    if (org.city && !form.city) set('city', org.city || '');
    setOrgSearch('');
    setOrgResults([]);
  };

  const clearOrg = () => {
    setSelectedOrg(null);
    setForm(prev => ({ ...prev, orgId: '', orgName: '' }));
    setCreatingNewOrg(false);
    setNewOrgName('');
    setNewOrgCity('');
  };

  const startCreateNewOrg = () => {
    setCreatingNewOrg(true);
    setNewOrgName(orgSearch); // Pre-fill with whatever they typed
    setOrgResults([]);
  };

  const confirmNewOrg = async () => {
    if (!newOrgName.trim()) return;
    setSaving(true);
    try {
      const authToken = localStorage.getItem('uht_token');
      const res = await fetch(`${API}/organizations/quick-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ name: newOrgName.trim(), city: newOrgCity.trim() || undefined, state: form.state || undefined }),
      });
      const json = await res.json() as any;
      if (json.success && json.data) {
        const org: Organization = { id: json.data.id, name: json.data.name, city: json.data.city, state: json.data.state, logo_url: null };
        selectOrg(org);
        setCreatingNewOrg(false);
      } else {
        setError(json.error || 'Failed to create organization');
      }
    } catch {
      setError('Network error creating organization');
    }
    setSaving(false);
  };

  // Derived team name
  const teamDisplayName = deriveTeamName(form.orgName, form.ageGroup, form.divisionLevel);

  // Step validations
  const canProceedStep1 = !!(selectedOrg || form.orgId) && !!form.state && !!seasonType;
  const canProceedStep2 = !!form.ageGroup;
  const canProceedStep3 = !!(form.headCoachName.trim() && form.headCoachEmail.trim());

  const createTeamRequest = async (skipDuplicate = false) => {
    setSaving(true);
    setError('');

    const seasonRecord = (form.wins || form.losses || form.ties)
      ? `${form.wins || '0'}-${form.losses || '0'}-${form.ties || '0'}${form.goalsFor ? ` (GF: ${form.goalsFor}, GA: ${form.goalsAgainst || '0'})` : ''}`
      : undefined;

    const payload: any = {
      name: teamDisplayName,
      ageGroup: form.ageGroup,
      divisionLevel: form.divisionLevel || undefined,
      organizationId: form.orgId || undefined,
      city: form.city.trim() || undefined,
      state: form.state || undefined,
      website: form.website.trim() || undefined,
      hometownLeague: form.hometownLeague || undefined,
      teamType: form.teamType || undefined,
      season: form.season || undefined,
      headCoachName: form.headCoachName.trim() || undefined,
      headCoachEmail: form.headCoachEmail.trim() || undefined,
      headCoachPhone: form.headCoachPhone.trim() || undefined,
      managerName: form.managerName.trim() || undefined,
      managerEmail: form.managerEmail.trim() || undefined,
      managerPhone: form.managerPhone.trim() || undefined,
      seasonRecord,
    };

    if (skipDuplicate) payload.skipDuplicateCheck = true;

    try {
      const authToken = localStorage.getItem('uht_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      // Edit mode: PATCH existing team
      if (isEditMode && editTeamId) {
        const res = await fetch(`${API}/teams/${editTeamId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(payload),
        });
        const data = await res.json() as any;
        if (!data.success) {
          setError(data.error || 'Failed to update team');
          setSaving(false);
          return;
        }
        // Update localStorage teams cache
        try {
          const existingTeams = JSON.parse(localStorage.getItem('uht_teams') || '[]');
          const idx = existingTeams.findIndex((t: any) => t.id === editTeamId);
          if (idx >= 0) {
            existingTeams[idx] = { ...existingTeams[idx], name: teamDisplayName, ageGroup: form.ageGroup };
            localStorage.setItem('uht_teams', JSON.stringify(existingTeams));
          }
        } catch {}
        setSaving(false);
        setSuccess(true);
        return;
      }

      // Create mode: POST new team
      const res = await fetch(`${API}/teams`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json() as any;
      if (!data.success) {
        if (data.error === 'duplicate_team' && data.existingTeam) {
          setDuplicateTeam(data.existingTeam);
          setShowDuplicateWarning(true);
          setSaving(false);
          return;
        }
        setError(data.error || 'Failed to create team');
        setSaving(false);
        return;
      }

      const existingTeams = JSON.parse(localStorage.getItem('uht_teams') || '[]');
      existingTeams.push({ id: data.data.id, name: teamDisplayName, ageGroup: form.ageGroup });
      localStorage.setItem('uht_teams', JSON.stringify(existingTeams));

      setCreatedTeamId(data.data.id);
      setCreatedInviteCode(data.data.inviteCode || null);
      setRosterShareToken(data.data.rosterShareToken || null);
      setSaving(false);

      setStep(5);
    } catch {
      setError('Network error. Please try again.');
      setSaving(false);
    }
  };

  const handleSubmit = async () => { await createTeamRequest(false); };
  const handleCreateAnyway = async () => {
    setShowDuplicateWarning(false);
    setDuplicateTeam(null);
    await createTeamRequest(true);
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

  const handleFinish = () => { setSuccess(true); };

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

  // =====================
  // SUCCESS SCREEN
  // =====================
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
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-[#1d1d1f]">{teamDisplayName || 'Team'} {isEditMode ? 'Updated!' : 'Created!'}</h2>
              {form.orgName && (
                <p className="text-sm text-[#6e6e73] mt-1">Part of <span className="font-medium">{form.orgName}</span></p>
              )}
            </div>

            {!isEditMode && createdInviteCode && (
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
                    Share this code with your {form.managerEmail ? 'coach' : 'manager'} or other team staff so they can link to this team.
                  </p>
                </div>
              </div>
            )}

            {!isEditMode && createdInviteCode && (
              <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden mb-5">
                <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-5 py-3">
                  <p className="text-white font-semibold text-sm flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Share with Parents
                  </p>
                </div>
                <div className="p-5">
                  <p className="text-sm text-[#6e6e73] mb-3">
                    Share this with parents so they can download the app, enter the team code, and get live scores, schedules, and updates.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-[#f5f5f7] rounded-xl px-4 py-2.5 border border-[#e8e8ed] text-xs font-mono text-[#1d1d1f] truncate select-all">
                      Team Code: {createdInviteCode}
                    </div>
                    <button onClick={() => {
                      const msg = `Follow ${teamDisplayName} on Ultimate Hockey Tournaments!\n\nDownload the app and use team code: ${createdInviteCode}\n\nhttps://apps.apple.com/app/id6786085393`;
                      navigator.clipboard.writeText(msg);
                      setRosterLinkCopied(true);
                      setTimeout(() => setRosterLinkCopied(false), 2500);
                    }}
                      className={"px-4 py-2.5 rounded-xl text-sm font-semibold transition shrink-0 " +
                        (rosterLinkCopied ? "bg-green-100 text-green-700" : "bg-green-600 text-white hover:bg-green-700")}>
                      {rosterLinkCopied ? 'Copied!' : 'Copy Message'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!isEditMode && invitedSomeone && (
              <div className="bg-[#f0f7ff] border border-[#003e79]/15 rounded-xl p-4 mb-5 flex items-start gap-3">
                <div className="w-8 h-8 bg-[#003e79] rounded-lg flex items-center justify-center text-white shrink-0 mt-0.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#003e79]">Invite email sent!</p>
                  <p className="text-xs text-[#6e6e73] mt-0.5">
                    {managerEmail && managerEmail !== creatorEmail && <>We sent an invite to <span className="font-medium">{managerEmail}</span>. </>}
                    {coachEmail && coachEmail !== creatorEmail && <>We sent an invite to <span className="font-medium">{coachEmail}</span>. </>}
                    They&apos;ll be automatically linked to {teamDisplayName || 'this team'} when they sign up.
                  </p>
                </div>
              </div>
            )}

            <button onClick={goToDashboard}
              className="w-full py-3.5 rounded-xl bg-[#003e79] text-white text-base font-semibold hover:bg-[#002d5a] transition">
              Go to My Teams
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =====================
  // STEP LABELS
  // =====================
  const stepLabels = isEditMode ? ['Team Details', 'Coaching Staff', 'Review & Save'] : ['Organization', 'Team Details', 'Coaching Staff', 'Review & Submit', 'Roster'];
  const totalSteps = isEditMode ? 3 : 5;
  // Map visual step index to actual step number for edit mode
  const editStepMap = [2, 3, 4]; // visual steps 1,2,3 map to actual steps 2,3,4

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

      {/* Duplicate Team Warning Modal */}
      {showDuplicateWarning && duplicateTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDuplicateWarning(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-amber-50 border-b border-amber-200 px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
              <div>
                <h3 className="font-bold text-[#1d1d1f]">Team Already Exists</h3>
                <p className="text-sm text-amber-700">A team with this name and age group is already registered.</p>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="bg-[#f5f5f7] rounded-xl p-4 mb-4">
                <p className="font-bold text-[#1d1d1f] text-lg">{duplicateTeam.name}</p>
                <p className="text-sm text-[#6e6e73] mt-1">{duplicateTeam.ageGroup}</p>
                {(duplicateTeam.city || duplicateTeam.state) && (
                  <p className="text-sm text-[#6e6e73]">{[duplicateTeam.city, duplicateTeam.state].filter(Boolean).join(', ')}</p>
                )}
                {duplicateTeam.headCoachName && (
                  <p className="text-sm text-[#6e6e73] mt-1">Coach: {duplicateTeam.headCoachName}</p>
                )}
              </div>
              <p className="text-sm text-[#1d1d1f] mb-4">
                If this is your team, you should <strong>join it</strong> using the invite code instead of creating a duplicate.
              </p>
              {duplicateTeam.inviteCode && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-center">
                  <p className="text-xs text-blue-600 font-semibold mb-1">Team Invite Code</p>
                  <p className="text-2xl font-mono font-bold text-[#003e79] tracking-widest">{duplicateTeam.inviteCode}</p>
                  <a href="/dashboard/coach/teams" className="inline-block mt-2 text-sm font-medium text-[#003e79] hover:underline">
                    Go to Dashboard to Join
                  </a>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setShowDuplicateWarning(false); setDuplicateTeam(null); }}
                  className="flex-1 py-3 rounded-xl border border-[#e8e8ed] text-sm font-semibold text-[#6e6e73] hover:bg-[#f5f5f7] transition">
                  Cancel
                </button>
                <button onClick={handleCreateAnyway}
                  className="flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition">
                  Create Anyway
                </button>
              </div>
              <p className="text-[11px] text-[#86868b] text-center mt-3">Only create a new team if you&apos;re sure this is a different team.</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex items-start justify-center p-6 pt-8">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-3xl font-semibold text-[#1d1d1f]">{isEditMode ? 'Edit Team' : 'Create Your Team'}</h1>
            <p className="mt-2 text-[#6e6e73]">{isEditMode ? 'Update your team details below' : 'Find your organization and register your team for tournaments'}</p>
          </div>

          {/* Edit mode loading */}
          {editLoading && (
            <div className="flex items-center justify-center py-12">
              <svg className="w-8 h-8 text-brand-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="ml-3 text-[#6e6e73]">Loading team data...</span>
            </div>
          )}

          {/* Step Indicator — clickable for completed steps */}
          {!editLoading && (
          <div className="flex items-center justify-center gap-1 mb-8">
            {stepLabels.map((label, idx) => {
              const visualStep = idx + 1;
              // In edit mode, map visual step to actual step number
              const s = isEditMode ? editStepMap[idx] : visualStep;
              const isCompleted = step > s;
              const isCurrent = step === s;
              // Can go back to any completed step (but not forward past current, and not step 5 since team is already created)
              const canClick = isCompleted && (isEditMode || s < 5);
              return (
                <div key={s} className="flex items-center gap-1">
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => { if (canClick) setStep(s); }}
                      disabled={!canClick}
                      className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all " +
                        (isCurrent ? "bg-brand-500 text-white" : isCompleted ? "bg-green-500 text-white hover:bg-green-600 cursor-pointer" : "bg-gray-200 text-[#6e6e73] cursor-default")}>
                      {isCompleted ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      ) : visualStep}
                    </button>
                    <span className={"text-[10px] mt-1 hidden sm:block " + (canClick ? "text-green-600 font-medium cursor-pointer" : "text-[#6e6e73]")}
                      onClick={() => { if (canClick) setStep(s); }}>
                      {label}
                    </span>
                  </div>
                  {visualStep < totalSteps && <div className={"w-6 h-0.5 mb-4 sm:mb-0 " + (step > s ? "bg-green-500" : "bg-gray-200")} />}
                </div>
              );
            })}
          </div>
          )}

          <div className="bg-white rounded-2xl shadow-soft p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
            )}

            {/* ========== STEP 1: Organization ========== */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-[#1d1d1f] mb-1">Find Your Organization</h2>
                  <p className="text-sm text-[#6e6e73]">
                    {seasonType === 'fall'
                      ? "Select your state, then search for your organization. If it doesn’t exist, you can request one and we’ll set it up for you."
                      : "Select your state, then search for your organization. If it doesn’t exist, you can create a new one."}
                  </p>
                </div>

                {/* Season Type Picker */}
                <div>
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-2">Season Type <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 gap-4">
                    <button type="button" onClick={() => { setSeasonType('spring'); set('season', 'spring'); }}
                      className={"flex flex-col items-center justify-center h-[140px] rounded-2xl border-2 transition-all " +
                        (seasonType === 'spring'
                          ? "border-green-500 bg-green-50"
                          : "border-gray-200 hover:border-gray-300 bg-white")}>
                      <svg className={"w-10 h-10 mb-2 " + (seasonType === 'spring' ? "text-green-600" : "text-gray-400")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <span className={"text-base font-semibold " + (seasonType === 'spring' ? "text-green-700" : "text-[#1d1d1f]")}>Spring Team</span>
                      <span className={"text-xs mt-0.5 " + (seasonType === 'spring' ? "text-green-600" : "text-[#6e6e73]")}>Spring/Summer season</span>
                    </button>
                    <button type="button" onClick={() => { setSeasonType('fall'); set('season', 'fall'); }}
                      className={"flex flex-col items-center justify-center h-[140px] rounded-2xl border-2 transition-all " +
                        (seasonType === 'fall'
                          ? "border-amber-500 bg-amber-50"
                          : "border-gray-200 hover:border-gray-300 bg-white")}>
                      <svg className={"w-10 h-10 mb-2 " + (seasonType === 'fall' ? "text-amber-600" : "text-gray-400")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3c0 1.5.5 3 2 4.5S10 10 10 12c0 1-1 3-3 4m8-13c0 1.5-.5 3-2 4.5S10 10 10 12c0 1 1 3 3 4m-1-8c2 0 4 1 5 3m-14 0c1-2 3-3 5-3" />
                      </svg>
                      <span className={"text-base font-semibold " + (seasonType === 'fall' ? "text-amber-700" : "text-[#1d1d1f]")}>Fall Team</span>
                      <span className={"text-xs mt-0.5 " + (seasonType === 'fall' ? "text-amber-600" : "text-[#6e6e73]")}>Fall/Winter season</span>
                    </button>
                  </div>
                </div>

                {/* State selector — only show after season type selected */}
                {seasonType && (
                <div>
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">State <span className="text-red-500">*</span></label>
                  <select value={form.state} onChange={e => { set('state', e.target.value); clearOrg(); }}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm bg-white">
                    <option value="">Select your state...</option>
                    {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                </div>
                )}

                {/* Selected Org Display */}
                {selectedOrg && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        </div>
                        <div>
                          <p className="font-semibold text-[#1d1d1f]">{selectedOrg.name}</p>
                          <p className="text-xs text-[#6e6e73]">{[selectedOrg.city, selectedOrg.state].filter(Boolean).join(', ') || 'Organization'}</p>
                        </div>
                      </div>
                      <button onClick={clearOrg} className="text-sm text-red-500 hover:text-red-700 font-medium">
                        Change
                      </button>
                    </div>
                  </div>
                )}

                {/* Create New Org Form */}
                {creatingNewOrg && !selectedOrg && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                      <h3 className="text-sm font-semibold text-blue-900">Create New Organization</h3>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-blue-900 mb-1.5">Organization Name <span className="text-red-500">*</span></label>
                      <input type="text" value={newOrgName} onChange={e => setNewOrgName(e.target.value)}
                        placeholder="e.g. Chicago Hawks, Affton Americans"
                        autoFocus
                        className="w-full px-4 py-3 rounded-xl border border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-blue-900 mb-1.5">City</label>
                      <input type="text" value={newOrgCity} onChange={e => setNewOrgCity(e.target.value)}
                        placeholder="e.g. Chicago"
                        className="w-full px-4 py-3 rounded-xl border border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm bg-white" />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => { setCreatingNewOrg(false); setNewOrgName(''); }}
                        className="px-5 py-2.5 rounded-xl border border-blue-200 text-sm font-medium text-blue-700 hover:bg-blue-100 transition">
                        Cancel
                      </button>
                      <button onClick={confirmNewOrg} disabled={!newOrgName.trim() || saving}
                        className={"px-5 py-2.5 rounded-xl text-sm font-medium transition " +
                          (newOrgName.trim() && !saving ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-blue-200 text-blue-400 cursor-not-allowed")}>
                        {saving ? 'Creating...' : 'Create Organization'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Org Request Sent Confirmation (fall teams) */}
                {orgRequestSent && seasonType === 'fall' && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                        <p className="font-semibold text-green-800">Your organization request has been submitted!</p>
                        <p className="text-sm text-green-700 mt-1">We&apos;ll review it and email you when it&apos;s ready. You&apos;ll receive a link to create your team.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Org Request Form (fall teams) */}
                {requestingOrg && !selectedOrg && seasonType === 'fall' && !orgRequestSent && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                      <h3 className="text-sm font-semibold text-amber-900">Request Organization</h3>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-amber-900 mb-1.5">Organization Name <span className="text-red-500">*</span></label>
                      <input type="text" value={reqOrgName} onChange={e => setReqOrgName(e.target.value)}
                        placeholder="e.g. Chicago Hawks, Affton Americans"
                        className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-amber-900 mb-1.5">City <span className="text-[#6e6e73] text-xs font-normal">(optional)</span></label>
                      <input type="text" value={reqOrgCity} onChange={e => setReqOrgCity(e.target.value)}
                        placeholder="e.g. Chicago"
                        className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-amber-900 mb-1.5">Coach Name <span className="text-red-500">*</span></label>
                      <input type="text" value={reqCoachName} onChange={e => setReqCoachName(e.target.value)}
                        placeholder="Your full name"
                        className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-amber-900 mb-1.5">Coach Email <span className="text-red-500">*</span></label>
                      <input type="email" value={reqCoachEmail} onChange={e => setReqCoachEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all text-sm bg-white" />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => { setRequestingOrg(false); setReqOrgName(''); setReqOrgCity(''); setReqCoachName(''); setReqCoachEmail(''); }}
                        className="px-5 py-2.5 rounded-xl border border-amber-200 text-sm font-medium text-amber-700 hover:bg-amber-100 transition">
                        Cancel
                      </button>
                      <button onClick={async () => {
                        if (!reqOrgName.trim() || !reqCoachName.trim() || !reqCoachEmail.trim()) return;
                        setOrgRequestSending(true);
                        try {
                          const res = await fetch(`${API}/organizations/requests`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              name: reqOrgName.trim(),
                              city: reqOrgCity.trim() || undefined,
                              state: form.state || undefined,
                              requestedByName: reqCoachName.trim(),
                              requestedByEmail: reqCoachEmail.trim(),
                            }),
                          });
                          const json = await res.json() as any;
                          if (json.success || res.ok) {
                            setOrgRequestSent(true);
                            setRequestingOrg(false);
                          } else {
                            setError(json.error || 'Failed to submit request');
                          }
                        } catch {
                          setError('Network error submitting request');
                        }
                        setOrgRequestSending(false);
                      }} disabled={!reqOrgName.trim() || !reqCoachName.trim() || !reqCoachEmail.trim() || orgRequestSending}
                        className={"px-5 py-2.5 rounded-xl text-sm font-medium transition " +
                          (reqOrgName.trim() && reqCoachName.trim() && reqCoachEmail.trim() && !orgRequestSending ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-amber-200 text-amber-400 cursor-not-allowed")}>
                        {orgRequestSending ? 'Submitting...' : 'Submit Request'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Org Search — show when state selected and no org selected and not creating new */}
                {form.state && !selectedOrg && !creatingNewOrg && !requestingOrg && !orgRequestSent && (
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Search Organization <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        {orgSearching ? (
                          <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        )}
                      </div>
                      <input type="text" value={orgSearch} onChange={e => setOrgSearch(e.target.value)}
                        placeholder="Start typing your organization name..."
                        autoFocus
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm" />
                    </div>

                    {/* Search Results */}
                    {orgResults.length > 0 && (
                      <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                        {orgResults.map(org => (
                          <button key={org.id} onClick={() => selectOrg(org)}
                            className="w-full text-left px-4 py-3 hover:bg-[#f5f5f7] transition border-b border-gray-100 last:border-b-0 flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                              {org.logo_url ? (
                                <img src={org.logo_url} alt="" className="w-6 h-6 rounded object-cover" />
                              ) : (
                                <span className="text-xs font-bold text-[#6e6e73]">{org.name.charAt(0)}</span>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-[#1d1d1f]">{org.name}</p>
                              {(org.city || org.state) && (
                                <p className="text-xs text-[#6e6e73]">{[org.city, org.state].filter(Boolean).join(', ')}</p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* No results — spring: create, fall: request */}
                    {orgSearch.length >= 2 && !orgSearching && orgResults.length === 0 && (
                      <div className="mt-2 border border-dashed border-gray-300 rounded-xl p-4 text-center">
                        <p className="text-sm text-[#6e6e73] mb-3">No organizations found matching &ldquo;{orgSearch}&rdquo;</p>
                        {seasonType === 'fall' ? (
                          <button onClick={() => { setRequestingOrg(true); setReqOrgName(orgSearch); setOrgResults([]); }}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            Request Organization
                          </button>
                        ) : (
                          <button onClick={startCreateNewOrg}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            Create &ldquo;{orgSearch}&rdquo;
                          </button>
                        )}
                      </div>
                    )}

                    {/* Bottom link — spring: create new, fall: request one */}
                    {orgSearch.length >= 2 && !orgSearching && orgResults.length > 0 && (
                      seasonType === 'fall' ? (
                        <button onClick={() => { setRequestingOrg(true); setReqOrgName(orgSearch); setOrgResults([]); }}
                          className="mt-2 w-full text-center py-2.5 text-sm text-amber-600 hover:text-amber-700 font-medium hover:bg-amber-50 rounded-xl transition flex items-center justify-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                          Don&apos;t see your org? Request one
                        </button>
                      ) : (
                        <button onClick={startCreateNewOrg}
                          className="mt-2 w-full text-center py-2.5 text-sm text-[#003e79] hover:text-[#002d5a] font-medium hover:bg-blue-50 rounded-xl transition flex items-center justify-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                          Don&apos;t see your org? Create a new one
                        </button>
                      )
                    )}
                  </div>
                )}

                <div className="pt-4 flex justify-end">
                  <button onClick={() => setStep(2)} disabled={!canProceedStep1}
                    className={"px-8 py-3 rounded-xl font-medium text-sm transition-all " +
                      (canProceedStep1 ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-gray-200 text-gray-400 cursor-not-allowed")}>
                    Next: Team Details
                  </button>
                </div>
              </div>
            )}

            {/* ========== STEP 2: Age Group + Division ========== */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-[#1d1d1f] mb-1">Team Details</h2>
                  <p className="text-sm text-[#6e6e73]">Select your age group and division. Your team name is automatically generated.</p>
                </div>

                {/* Org reminder */}
                <div className="bg-[#f5f5f7] rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-gray-200">
                    <span className="text-xs font-bold text-[#003e79]">{form.orgName.charAt(0)}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#1d1d1f]">{form.orgName}</p>
                    <p className="text-xs text-[#6e6e73]">{form.state}</p>
                  </div>
                  {!isEditMode && <button onClick={() => setStep(1)} className="text-xs text-[#003e79] hover:underline">Change</button>}
                  {isEditMode && <span className="text-xs text-[#86868b]">Locked</span>}
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
                      {[...(form.state && stateDivisions[form.state]?.length ? stateDivisions[form.state] : divisions)].sort((a, b) => a.localeCompare(b)).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    {form.state && stateDivisions[form.state]?.length > 0 && (
                      <p className="text-xs text-[#86868b] mt-1">Showing divisions for {form.state}</p>
                    )}
                  </div>
                </div>

                {/* Team name preview */}
                {form.ageGroup && (
                  <div className="bg-navy-50 border border-navy-100 rounded-xl p-4">
                    <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-1">Your Team Name</p>
                    <p className="text-lg font-bold text-[#003e79]">{teamDisplayName}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Hometown City</label>
                    <input type="text" value={form.city} onChange={e => set('city', e.target.value)}
                      placeholder="e.g. Chicago"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Hometown League</label>
                    <input type="text" value={form.hometownLeague} onChange={e => set('hometownLeague', e.target.value)}
                      placeholder="e.g. COHL, NIHL, AHAI"
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

                <div className="pt-4 flex justify-between">
                  {!isEditMode ? (
                    <button onClick={() => setStep(1)}
                      className="px-6 py-3 rounded-xl border border-gray-200 text-[#1d1d1f] text-sm font-medium hover:bg-gray-50 transition-all">
                      Back
                    </button>
                  ) : (
                    <a href={backLink.href}
                      className="px-6 py-3 rounded-xl border border-gray-200 text-[#1d1d1f] text-sm font-medium hover:bg-gray-50 transition-all inline-flex items-center">
                      Cancel
                    </a>
                  )}
                  <button onClick={() => setStep(3)} disabled={!canProceedStep2}
                    className={"px-8 py-3 rounded-xl font-medium text-sm transition-all " +
                      (canProceedStep2 ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-gray-200 text-gray-400 cursor-not-allowed")}>
                    Next: Coaching Staff
                  </button>
                </div>
              </div>
            )}

            {/* ========== STEP 3: Coaching Staff ========== */}
            {step === 3 && (
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
                  <button onClick={() => setStep(2)}
                    className="px-6 py-3 rounded-xl border border-gray-200 text-[#1d1d1f] text-sm font-medium hover:bg-gray-50 transition-all">
                    Back
                  </button>
                  <button onClick={() => setStep(4)} disabled={!canProceedStep3}
                    className={"px-8 py-3 rounded-xl font-medium text-sm transition-all " +
                      (canProceedStep3 ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-gray-200 text-gray-400 cursor-not-allowed")}>
                    Next: Review & Submit
                  </button>
                </div>
              </div>
            )}

            {/* ========== STEP 4: Review + Submit ========== */}
            {step === 4 && (
              <div className="space-y-5">
                <h2 className="text-xl font-semibold text-[#1d1d1f] mb-1">Review & Submit</h2>
                <p className="text-sm text-[#6e6e73] mb-4">Review your team details and optionally add your season record</p>

                <div className="bg-gray-50 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-[#1d1d1f] uppercase tracking-wide">Season Record <span className="text-[#6e6e73] font-normal normal-case">(optional — helps with seeding)</span></h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#6e6e73] mb-1">Wins</label>
                      <input type="number" min="0" value={form.wins} onChange={e => set('wins', e.target.value)} placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm text-center" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6e6e73] mb-1">Losses</label>
                      <input type="number" min="0" value={form.losses} onChange={e => set('losses', e.target.value)} placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm text-center" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6e6e73] mb-1">Ties</label>
                      <input type="number" min="0" value={form.ties} onChange={e => set('ties', e.target.value)} placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm text-center" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#6e6e73] mb-1">Goals For</label>
                      <input type="number" min="0" value={form.goalsFor} onChange={e => set('goalsFor', e.target.value)} placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm text-center" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6e6e73] mb-1">Goals Against</label>
                      <input type="number" min="0" value={form.goalsAgainst} onChange={e => set('goalsAgainst', e.target.value)} placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm text-center" />
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-navy-50 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-navy-800 mb-3">Team Summary</h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div className="text-[#6e6e73]">Organization</div>
                    <div className="font-medium text-[#1d1d1f]">{form.orgName}</div>
                    <div className="text-[#6e6e73]">Team Name</div>
                    <div className="font-medium text-[#003e79]">{teamDisplayName}</div>
                    <div className="text-[#6e6e73]">Age Group</div>
                    <div className="font-medium text-[#1d1d1f]">{form.ageGroup}</div>
                    {form.divisionLevel && <>
                      <div className="text-[#6e6e73]">Division</div>
                      <div className="font-medium text-[#1d1d1f]">{form.divisionLevel}</div>
                    </>}
                    <div className="text-[#6e6e73]">Location</div>
                    <div className="font-medium text-[#1d1d1f]">{form.city ? `${form.city}, ` : ''}{form.state}</div>
                    <div className="text-[#6e6e73]">Head Coach</div>
                    <div className="font-medium text-[#1d1d1f]">{form.headCoachName}</div>
                    {form.managerName && <>
                      <div className="text-[#6e6e73]">Manager</div>
                      <div className="font-medium text-[#1d1d1f]">{form.managerName}</div>
                    </>}
                  </div>
                </div>

                <div className="pt-4 flex justify-between">
                  <button onClick={() => setStep(3)}
                    className="px-6 py-3 rounded-xl border border-gray-200 text-[#1d1d1f] text-sm font-medium hover:bg-gray-50 transition-all">
                    Back
                  </button>
                  <button onClick={handleSubmit} disabled={saving}
                    className={"px-10 py-3 rounded-xl font-medium text-sm transition-all " +
                      (saving ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-brand-500 text-white hover:bg-brand-600")}>
                    {saving ? (isEditMode ? 'Saving Changes...' : 'Creating Team...') : (isEditMode ? 'Save Changes' : 'Create Team & Add Roster')}
                  </button>
                </div>
              </div>
            )}

            {/* ========== STEP 5: Roster ========== */}
            {step === 5 && createdTeamId && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-[#1d1d1f] mb-1">Team Roster</h2>
                    <p className="text-sm text-[#6e6e73]">Add your players so parents can claim them and get tournament updates</p>
                  </div>
                  {rosterPlayers.length > 0 && (
                    <span className="text-xs text-green-700 bg-green-100 px-3 py-1 rounded-full font-semibold">{rosterPlayers.length} players</span>
                  )}
                </div>

                {/* "Don't have roster yet" checkbox — only show when no players added */}
                {rosterPlayers.length === 0 && (
                  <label className="flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all select-none
                    ${noRosterYet ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'}"
                    onClick={() => {
                      const newVal = !noRosterYet;
                      setNoRosterYet(newVal);
                      if (newVal && createdTeamId) {
                        setSettingRosterPending(true);
                        fetch(`${API}/teams/set-roster-pending/${createdTeamId}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('uht_token')}` },
                          body: JSON.stringify({ roster_pending: true }),
                        }).finally(() => setSettingRosterPending(false));
                      }
                    }}>
                    <div className={"w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all " +
                      (noRosterYet ? "bg-amber-500 border-amber-500" : "border-gray-300 bg-white")}>
                      {noRosterYet && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </div>
                    <div>
                      <p className={"text-sm font-semibold " + (noRosterYet ? "text-amber-800" : "text-[#1d1d1f]")}>
                        I don&apos;t have my roster yet
                      </p>
                      <p className={"text-xs mt-0.5 " + (noRosterYet ? "text-amber-700" : "text-[#6e6e73]")}>
                        No problem! We&apos;ll send you a friendly reminder starting September 15th so your parents can register before the season.
                      </p>
                    </div>
                  </label>
                )}

                {/* Roster import section — hide if "don't have roster yet" is checked */}
                {!noRosterYet && (
                  <>
                    {/* Auto-import loading indicator */}
                    {importingRoster && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                        <svg className="w-5 h-5 text-blue-500 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <div>
                          <p className="text-sm font-semibold text-blue-900">Importing roster...</p>
                          <p className="text-xs text-blue-700 mt-0.5">Pulling player data from the URL you provided. This may take a moment.</p>
                        </div>
                      </div>
                    )}

                    {/* Import result message */}
                    {importResult && !importingRoster && (
                      <div className={`rounded-xl p-4 flex items-start gap-3 ${importResult.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                        {importResult.type === 'success' ? (
                          <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                        )}
                        <p className={`text-sm ${importResult.type === 'success' ? 'text-green-800' : 'text-amber-800'}`}>
                          {importResult.message}
                        </p>
                      </div>
                    )}

                    <RosterImport
                      teamId={createdTeamId}
                      compact
                      onPlayersAdded={(newPlayers) => {
                        setRosterPlayers(prev => [...prev, ...newPlayers]);
                        // Clear roster_pending if it was set
                        if (noRosterYet) {
                          setNoRosterYet(false);
                          fetch(`${API}/teams/set-roster-pending/${createdTeamId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('uht_token')}` },
                            body: JSON.stringify({ roster_pending: false }),
                          }).catch(() => {});
                        }
                      }}
                    />
                  </>
                )}

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

                {/* Share with parents — only show when players exist */}
                {createdInviteCode && rosterPlayers.length > 0 && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-green-900 flex items-center gap-2">
                          Now Share with Parents!
                          <span className="bg-green-200 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Important</span>
                        </h3>
                        <p className="text-sm text-green-800 mt-1.5 leading-relaxed">
                          Send this to your team parents (group chat, email, etc.). They&apos;ll download the app, enter the team code, and get live scores, schedules, and updates automatically.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white rounded-xl px-4 py-3 border border-green-200 text-sm text-[#1d1d1f] font-mono truncate select-all">
                        Team Code: {createdInviteCode}
                      </div>
                      <button onClick={() => {
                        const msg = `Follow ${teamDisplayName} on Ultimate Hockey Tournaments!\n\nDownload the app and use team code: ${createdInviteCode}\n\nhttps://apps.apple.com/app/id6786085393`;
                        navigator.clipboard.writeText(msg);
                        setRosterLinkCopied(true);
                        setTimeout(() => setRosterLinkCopied(false), 2500);
                      }}
                        className={"px-5 py-3 rounded-xl text-sm font-bold transition shrink-0 " +
                          (rosterLinkCopied ? "bg-green-100 text-green-700 border-2 border-green-300" : "bg-green-600 text-white hover:bg-green-700 shadow-sm")}>
                        {rosterLinkCopied ? 'Copied!' : 'Copy Message'}
                      </button>
                    </div>
                  </div>
                )}

                {/* "No roster yet" confirmation message */}
                {noRosterYet && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-amber-800">No worries — we&apos;ll remind you!</p>
                      <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                        Starting September 15th, we&apos;ll send you a weekly reminder to add your roster. Once you add players, we&apos;ll also track which parents have claimed their child and send you updates so everyone is registered before the first tournament.
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-4 flex justify-between items-center">
                  <p className="text-xs text-[#86868b]">You can always add more players later from your dashboard.</p>
                  <button onClick={handleFinish}
                    disabled={rosterPlayers.length === 0 && !noRosterYet}
                    className={"px-10 py-3 rounded-xl font-medium text-sm transition-all " +
                      (rosterPlayers.length > 0 || noRosterYet
                        ? "bg-brand-500 text-white hover:bg-brand-600"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed")}>
                    {rosterPlayers.length > 0 ? 'Finish' : noRosterYet ? 'Finish — Remind Me Later' : 'Add Players or Check the Box Above'}
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
