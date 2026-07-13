import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Share,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
// Logo upload uses base64 JSON to avoid RN FormData/multipart issues
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch, getUser, getToken } from '../services/auth';
import { API_URL } from '../constants/api';
import { getOrganizationsByState, searchOrganizations, getLookupValues, getStateDivisionLevels, getTeamsByOrgDivision } from '../services/api';
import ScreenHeader from '../components/ScreenHeader';

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

export default function CreateTeamScreen({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { organizationId: routeOrgId, organizationName: routeOrgName, fromOnboarding, editRosterTeamId, editRosterTeamName } = route.params || {};

  const [teamName, setTeamName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [divisionLevel, setDivisionLevel] = useState('');
  const [state, setState] = useState('');
  const [coachName, setCoachName] = useState('');
  const [coachEmail, setCoachEmail] = useState('');
  const [coachPhone, setCoachPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAgeGroupPicker, setShowAgeGroupPicker] = useState(false);
  const [showDivisionPicker, setShowDivisionPicker] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [createdTeam, setCreatedTeam] = useState<{ name: string; inviteCode?: string; rosterShareToken?: string } | null>(null);

  // Organization selection (now inline instead of from route params)
  const [selectedOrgId, setSelectedOrgId] = useState(routeOrgId || '');
  const [selectedOrgName, setSelectedOrgName] = useState(routeOrgName || '');
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [showOrgPicker, setShowOrgPicker] = useState(false);
  const [orgSearchQuery, setOrgSearchQuery] = useState('');

  // DB-loaded age groups and division levels
  const [dbAgeGroups, setDbAgeGroups] = useState<string[]>([]);
  const [dbDivisionLevels, setDbDivisionLevels] = useState<string[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);

  // Roster import step state
  const [showRosterStep, setShowRosterStep] = useState(false);
  const [createdTeamId, setCreatedTeamId] = useState('');
  const [rosterTab, setRosterTab] = useState<'url' | 'paste' | 'manual'>('url');
  const [importUrl, setImportUrl] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [newPlayer, setNewPlayer] = useState({ firstName: '', lastName: '', jerseyNumber: '', position: '', shoots: '' });
  const [addedPlayers, setAddedPlayers] = useState<Array<{ id?: string; firstName: string; lastName: string; jerseyNumber: string; position: string; shoots: string }>>([]);
  const [importing, setImporting] = useState(false);
  const [rosterMessage, setRosterMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewPlayers, setPreviewPlayers] = useState<Array<{ firstName: string; lastName: string; jerseyNumber: string; position: string; shoots: string }>>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [pendingTeamData, setPendingTeamData] = useState<{ name: string; inviteCode?: string; rosterShareToken?: string } | null>(null);

  // Duplicate team detection state
  const [duplicateTeam, setDuplicateTeam] = useState<{
    id: string; name: string; ageGroup: string; city?: string; state?: string;
    inviteCode?: string; headCoachName?: string; playerCount?: number;
  } | null>(null);
  const [joiningDuplicate, setJoiningDuplicate] = useState(false);

  // Existing team review step state (duplicate prevention)
  const [existingTeams, setExistingTeams] = useState<any[]>([]);
  const [loadingExistingTeams, setLoadingExistingTeams] = useState(false);
  const [reviewedExistingTeams, setReviewedExistingTeams] = useState(false);
  const [hasSearchedTeams, setHasSearchedTeams] = useState(false);

  // Logo upload step state
  const [showLogoStep, setShowLogoStep] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [orgLogos, setOrgLogos] = useState<string[]>([]);
  const [loadingOrgLogos, setLoadingOrgLogos] = useState(false);

  // If opened in roster-only mode (from TeamDetail "Add Players"), jump to roster step
  useEffect(() => {
    if (editRosterTeamId) {
      setCreatedTeamId(editRosterTeamId);
      setShowRosterStep(true);
    }
  }, [editRosterTeamId]);

  // Auto-fill coach info from logged-in user
  useEffect(() => {
    (async () => {
      const user = await getUser();
      if (user) {
        if (user.name && !coachName) setCoachName(user.name);
        if (user.email && !coachEmail) setCoachEmail(user.email);
        if (user.phone && !coachPhone) setCoachPhone(user.phone);
      }
    })();
  }, []);

  // Load age groups from DB on mount
  useEffect(() => {
    (async () => {
      setLoadingLookups(true);
      try {
        const ageData = await getLookupValues('age_group');
        if (Array.isArray(ageData) && ageData.length > 0) {
          setDbAgeGroups(ageData.map((item: any) => item.value));
        }
      } catch (e) {
        console.warn('Failed to load age groups from DB');
      } finally {
        setLoadingLookups(false);
      }
    })();
  }, []);

  // Load organizations when state changes
  useEffect(() => {
    if (!state) {
      setOrganizations([]);
      setSelectedOrgId('');
      setSelectedOrgName('');
      return;
    }
    (async () => {
      setLoadingOrgs(true);
      setSelectedOrgId('');
      setSelectedOrgName('');
      setAgeGroup('');
      setDivisionLevel('');
      try {
        const stateEntry = US_STATES.find((s) => s.code === state);
        const orgs = await getOrganizationsByState(stateEntry?.name || state);
        setOrganizations(orgs || []);
      } catch {
        setOrganizations([]);
      } finally {
        setLoadingOrgs(false);
      }
    })();
  }, [state]);

  // Load division levels when state changes (state-specific levels from DB)
  useEffect(() => {
    if (!state) {
      setDbDivisionLevels([]);
      return;
    }
    (async () => {
      try {
        const levels = await getStateDivisionLevels(state);
        if (Array.isArray(levels) && levels.length > 0) {
          setDbDivisionLevels(levels.map((item: any) => item.level_name));
        } else {
          // Fallback to global divisions if no state-specific ones
          const divData = await getLookupValues('division');
          if (Array.isArray(divData) && divData.length > 0) {
            setDbDivisionLevels(divData.map((item: any) => item.value));
          }
        }
      } catch {
        setDbDivisionLevels([]);
      }
    })();
  }, [state]);

  // Reset existing teams review when selections change
  useEffect(() => {
    setExistingTeams([]);
    setReviewedExistingTeams(false);
    setHasSearchedTeams(false);
  }, [selectedOrgId, ageGroup, divisionLevel]);

  // Fetch existing teams for review when age group is selected (and optionally division)
  async function loadExistingTeams() {
    if (!selectedOrgId || !ageGroup) return;
    setLoadingExistingTeams(true);
    setHasSearchedTeams(false);
    try {
      const teams = await getTeamsByOrgDivision(selectedOrgId, ageGroup, divisionLevel || undefined);
      setExistingTeams(teams || []);
    } catch {
      setExistingTeams([]);
    } finally {
      setLoadingExistingTeams(false);
      setHasSearchedTeams(true);
    }
  }

  // Debounced live org search as user types
  const orgSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!state || !showOrgPicker) return;

    // Clear any pending debounce
    if (orgSearchTimer.current) clearTimeout(orgSearchTimer.current);

    const query = orgSearchQuery.trim();

    // If empty query, reload all orgs for the state
    if (!query) {
      setLoadingOrgs(true);
      const stateEntry = US_STATES.find((s) => s.code === state);
      getOrganizationsByState(stateEntry?.name || state)
        .then((orgs) => setOrganizations(orgs || []))
        .catch(() => setOrganizations([]))
        .finally(() => setLoadingOrgs(false));
      return;
    }

    // Debounce search by 300ms
    orgSearchTimer.current = setTimeout(async () => {
      setLoadingOrgs(true);
      try {
        const stateEntry = US_STATES.find((s) => s.code === state);
        const results = await searchOrganizations(query, stateEntry?.name || state);
        setOrganizations(results || []);
      } catch {
        setOrganizations([]);
      } finally {
        setLoadingOrgs(false);
      }
    }, 300);

    return () => {
      if (orgSearchTimer.current) clearTimeout(orgSearchTimer.current);
    };
  }, [orgSearchQuery, state, showOrgPicker]);

  async function handleCreate() {
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }
    if (!ageGroup) {
      setError('Age group is required');
      return;
    }
    if (!state) {
      setError('State is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Find the full state name from code for consistent DB storage
      const stateEntry = US_STATES.find((s) => s.code === state);
      const stateName = stateEntry ? stateEntry.name : state;

      const res = await authFetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: teamName.trim(),
          ageGroup,
          divisionLevel: divisionLevel || undefined,
          organizationId: selectedOrgId || undefined,
          state: stateName || undefined,
          headCoachName: coachName.trim() || undefined,
          headCoachEmail: coachEmail.trim() || undefined,
          headCoachPhone: coachPhone.trim() || undefined,
        }),
      });

      const json = await res.json() as any;

      if (json.success) {
        // Save team data and go to roster import step
        setPendingTeamData({
          name: teamName.trim(),
          inviteCode: json.data?.inviteCode,
          rosterShareToken: json.data?.rosterShareToken || json.data?.roster_share_token,
        });
        setCreatedTeamId(json.data?.id || json.data?.teamId || '');
        setShowRosterStep(true);
      } else if (json.error === 'duplicate_team') {
        // Show in-screen duplicate warning UI instead of basic Alert
        const existing = json.existingTeam;
        setDuplicateTeam({
          id: existing?.id || '',
          name: existing?.name || teamName.trim(),
          ageGroup: existing?.ageGroup || ageGroup,
          city: existing?.city,
          state: existing?.state,
          inviteCode: existing?.inviteCode,
          headCoachName: existing?.headCoachName,
          playerCount: existing?.playerCount,
        });
      } else {
        setError(json.error || 'Failed to create team');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ==================
  // Duplicate Team Handlers
  // ==================
  async function handleJoinDuplicate() {
    if (!duplicateTeam?.inviteCode) {
      Alert.alert('Cannot Join', 'This team does not have a join code. Try contacting the coach directly or create your own team.');
      return;
    }
    setJoiningDuplicate(true);
    try {
      const res = await authFetch('/api/follows/by-code', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: duplicateTeam.inviteCode }),
      });
      const json = await res.json() as any;
      if (json.success) {
        Alert.alert(
          'Team Joined!',
          `You're now following ${duplicateTeam.name}. You can find it on your My Teams page.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } else {
        Alert.alert('Error', json.error || 'Could not join team. Try again.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setJoiningDuplicate(false);
    }
  }

  async function handleCreateAnyway() {
    setSaving(true);
    setDuplicateTeam(null);
    try {
      const stEntry = US_STATES.find((s) => s.code === state);
      const stName = stEntry ? stEntry.name : state;
      const res2 = await authFetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: teamName.trim(),
          ageGroup,
          divisionLevel: divisionLevel || undefined,
          organizationId: selectedOrgId || undefined,
          state: stName || undefined,
          headCoachName: coachName.trim() || undefined,
          headCoachEmail: coachEmail.trim() || undefined,
          headCoachPhone: coachPhone.trim() || undefined,
          skipDuplicateCheck: true,
        }),
      });
      const json2 = await res2.json() as any;
      if (json2.success) {
        setPendingTeamData({
          name: teamName.trim(),
          inviteCode: json2.data?.inviteCode,
          rosterShareToken: json2.data?.rosterShareToken || json2.data?.roster_share_token,
        });
        setCreatedTeamId(json2.data?.id || json2.data?.teamId || '');
        setShowRosterStep(true);
      } else {
        setError(json2.error || 'Failed to create team');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ==================
  // Roster Import Helpers
  // ==================
  function normalizePosition(raw: string): string {
    if (!raw) return '';
    const lp = raw.toLowerCase().trim();
    if (lp.startsWith('f') || lp === 'c' || lp === 'lw' || lp === 'rw' || lp === 'center' || lp === 'wing') return 'forward';
    if (lp.startsWith('d') || lp === 'ld' || lp === 'rd') return 'defense';
    if (lp.startsWith('g')) return 'goalie';
    return '';
  }

  function normalizeShoots(raw: string): string {
    if (!raw) return '';
    const ls = raw.toLowerCase().trim();
    if (ls.startsWith('l')) return 'left';
    if (ls.startsWith('r')) return 'right';
    return '';
  }

  function stripJerseyPrefix(raw: string): string {
    return raw.replace(/^[HA]\s+/, '').trim();
  }

  function parseRows(rows: string[][]): Array<{ firstName: string; lastName: string; jerseyNumber: string; awayJerseyNumber?: string; position: string; shoots: string }> {
    if (rows.length === 0) return [];
    const firstRow = rows[0].map(c => c.toLowerCase().trim());
    let colMap: Record<string, number> = {};
    let startRow = 0;
    const headerKeywords = ['jersey', '#', 'first', 'last', 'name', 'pos', 'shoot', 'usa', 'number', 'dob'];
    const isHeader = firstRow.some(c => headerKeywords.some(kw => c.includes(kw)));
    if (isHeader) {
      startRow = 1;
      for (let i = 0; i < firstRow.length; i++) {
        const h = firstRow[i];
        if (h.includes('jersey') || h === '#' || h === 'no' || (h === 'number' && i === 0)) colMap.jersey = i;
        else if (h.includes('first')) colMap.firstName = i;
        else if (h.includes('last')) colMap.lastName = i;
        else if (h === 'name' || h === 'player') colMap.fullName = i;
        else if (h.includes('pos')) colMap.position = i;
        else if (h.includes('shoot')) colMap.shoots = i;
        else if (h.includes('dob') || h.includes('birth')) colMap.dob = i;
      }
    }

    // Detect USA Hockey H/A jersey format
    let awayJerseyCol = -1;
    const sampleRow = rows[startRow];
    if (colMap.jersey !== undefined && sampleRow) {
      const jerseyVal = (sampleRow[colMap.jersey] || '').trim();
      if (/^H\s+\d/.test(jerseyVal) || /^H\s*$/.test(jerseyVal)) {
        const nextCol = colMap.jersey + 1;
        const nextVal = (sampleRow[nextCol] || '').trim();
        if (/^A\s+\d/.test(nextVal) || /^A\s*$/.test(nextVal)) {
          awayJerseyCol = nextCol;
          if (colMap.position !== undefined && colMap.position === awayJerseyCol) {
            colMap.position = awayJerseyCol + 1;
          }
          if (colMap.dob !== undefined && colMap.dob >= awayJerseyCol) {
            colMap.dob = colMap.dob + 1;
          }
        }
      }
    }

    if (Object.keys(colMap).length === 0) {
      const sample = rows[startRow] || [];
      if (sample.length >= 3) {
        if (/^\d{1,3}$/.test(sample[0]?.trim()) || /^[HA]\s+\d/.test(sample[0]?.trim())) {
          colMap = { jersey: 0, firstName: 1, lastName: 2, position: 3, shoots: 4 };
        } else if (sample[0]?.includes(',')) {
          colMap = { fullName: 0, jersey: 1, position: 2, shoots: 3 };
        } else {
          colMap = { firstName: 0, lastName: 1, jersey: 2, position: 3, shoots: 4 };
        }
      }
    }
    const players: Array<{ firstName: string; lastName: string; jerseyNumber: string; awayJerseyNumber?: string; position: string; shoots: string }> = [];
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (row.every(c => !c.trim())) continue;
      let firstName = '', lastName = '';
      if (colMap.fullName !== undefined && row[colMap.fullName]) {
        const name = row[colMap.fullName].trim();
        if (name.includes(',')) {
          const parts = name.split(',').map(s => s.trim());
          lastName = parts[0]; firstName = parts[1] || '';
        } else {
          const parts = name.split(/\s+/);
          firstName = parts[0] || ''; lastName = parts.slice(1).join(' ') || '';
        }
      } else {
        firstName = (colMap.firstName !== undefined ? row[colMap.firstName] : '')?.trim() || '';
        lastName = (colMap.lastName !== undefined ? row[colMap.lastName] : '')?.trim() || '';
      }
      if (!firstName && !lastName) continue;

      let jerseyNumber = (colMap.jersey !== undefined ? row[colMap.jersey] : '')?.trim() || '';
      jerseyNumber = stripJerseyPrefix(jerseyNumber);
      let awayJerseyNumber = '';
      if (awayJerseyCol >= 0) {
        awayJerseyNumber = stripJerseyPrefix((row[awayJerseyCol] || '').trim());
      }
      let posRaw = colMap.position !== undefined ? row[colMap.position] || '' : '';
      if (posRaw.trim().toLowerCase() === 'none') posRaw = '';

      players.push({
        firstName, lastName, jerseyNumber,
        awayJerseyNumber: awayJerseyNumber || undefined,
        position: normalizePosition(posRaw),
        shoots: normalizeShoots(colMap.shoots !== undefined ? row[colMap.shoots] || '' : ''),
      });
    }
    return players;
  }

  async function handleUrlImport() {
    if (!importUrl.trim() || !createdTeamId) return;
    setImporting(true);
    setRosterMessage(null);
    try {
      const res = await authFetch(`/api/teams/${createdTeamId}/import-roster`, {
        method: 'POST',
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json() as any;
      if (data.success && data.data?.players?.length > 0) {
        const imported = data.data.players.map((p: any) => ({
          id: p.id, firstName: p.firstName || p.first_name || '', lastName: p.lastName || p.last_name || '',
          jerseyNumber: p.jerseyNumber || p.jersey_number || '', position: p.position || '', shoots: p.shoots || '',
        }));
        setAddedPlayers(prev => [...prev, ...imported]);
        setRosterMessage({ type: 'success', text: `Imported ${data.data.added || imported.length} players!` });
        setImportUrl('');
      } else {
        setRosterMessage({ type: 'error', text: data.error || 'No players found at that URL. Try pasting your roster instead.' });
      }
    } catch {
      setRosterMessage({ type: 'error', text: 'Failed to import. Check the URL and try again.' });
    }
    setImporting(false);
  }

  function handleParsePaste() {
    if (!pastedText.trim()) return;
    setRosterMessage(null);
    // Parse pasted text: split by newlines, then by tabs or commas
    const lines = pastedText.trim().split('\n').filter(l => l.trim());
    const rows = lines.map(line => {
      // Try tab-separated first, then comma-separated
      if (line.includes('\t')) return line.split('\t');
      return line.split(',');
    });
    const players = parseRows(rows);
    if (players.length > 0) {
      setPreviewPlayers(players);
      setShowPreview(true);
    } else {
      setRosterMessage({ type: 'error', text: 'Could not parse player data. Try tab-separated or comma-separated format.' });
    }
  }

  async function confirmPreviewPlayers() {
    if (previewPlayers.length === 0 || !createdTeamId) return;
    setImporting(true);
    setRosterMessage(null);
    try {
      const res = await authFetch(`/api/teams/${createdTeamId}/players/bulk`, {
        method: 'POST',
        body: JSON.stringify({ players: previewPlayers }),
      });
      const data = await res.json() as any;
      if (data.success) {
        const saved = (data.data.players || []).map((p: any) => ({
          id: p.id, firstName: p.firstName || '', lastName: p.lastName || '',
          jerseyNumber: p.jerseyNumber || '', position: p.position || '', shoots: p.shoots || '',
        }));
        setAddedPlayers(prev => [...prev, ...saved]);
        setRosterMessage({ type: 'success', text: `Added ${data.data.added} players to roster!` });
        setPreviewPlayers([]);
        setShowPreview(false);
        setPastedText('');
      } else {
        setRosterMessage({ type: 'error', text: data.error || 'Failed to save players' });
      }
    } catch {
      setRosterMessage({ type: 'error', text: 'Network error. Please try again.' });
    }
    setImporting(false);
  }

  async function handleManualAdd() {
    if (!newPlayer.firstName.trim() || !newPlayer.lastName.trim() || !createdTeamId) return;
    setImporting(true);
    setRosterMessage(null);
    try {
      const res = await authFetch(`/api/teams/${createdTeamId}/players`, {
        method: 'POST',
        body: JSON.stringify(newPlayer),
      });
      const data = await res.json() as any;
      if (data.success) {
        setAddedPlayers(prev => [...prev, { id: data.data?.id, ...newPlayer }]);
        setNewPlayer({ firstName: '', lastName: '', jerseyNumber: '', position: '', shoots: '' });
        setRosterMessage({ type: 'success', text: `Added ${newPlayer.firstName} ${newPlayer.lastName}` });
      } else {
        setRosterMessage({ type: 'error', text: data.error || 'Failed to add player' });
      }
    } catch {
      setRosterMessage({ type: 'error', text: 'Network error' });
    }
    setImporting(false);
  }

  function finishRosterStep() {
    // If in roster-only mode, just go back to TeamDetail
    if (editRosterTeamId) {
      navigation.goBack();
      return;
    }
    setShowRosterStep(false);
    // Go to logo step instead of directly to success
    setShowLogoStep(true);
    // Check if org has existing logos to suggest
    if (createdTeamId) {
      setLoadingOrgLogos(true);
      authFetch(`/api/teams/${createdTeamId}/org-logos`)
        .then(r => r.json())
        .then((json: any) => {
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            setOrgLogos(json.data);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingOrgLogos(false));
    }
  }

  async function handlePickLogo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Error', 'Could not read image data');
      return;
    }
    const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    await uploadLogoBase64(asset.base64, mimeType);
  }

  async function uploadLogoBase64(base64Data: string, mimeType: string) {
    if (!createdTeamId) return;
    setUploadingLogo(true);
    try {
      const token = await getToken();

      const uploadResult = await fetch(`${API_URL}/api/teams/${createdTeamId}/logo-base64`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ data: base64Data, mimeType }),
      });

      const json = await uploadResult.json() as any;
      if (json.success && json.data?.logo_url) {
        setLogoUrl(json.data.logo_url);
      } else {
        Alert.alert('Upload Failed', json.error || 'Could not upload logo');
      }
    } catch {
      Alert.alert('Upload Failed', 'Network error. Please try again.');
    }
    setUploadingLogo(false);
  }

  async function useOrgLogo(orgLogoUrl: string) {
    if (!createdTeamId) return;
    setUploadingLogo(true);
    try {
      // Download the org logo and re-upload it for this team
      const res = await authFetch(`/api/teams/${createdTeamId}`, {
        method: 'PATCH',
        body: JSON.stringify({ logoUrl: orgLogoUrl }),
      });
      const json = await res.json() as any;
      if (json.success) {
        setLogoUrl(orgLogoUrl);
      }
    } catch {}
    setUploadingLogo(false);
  }

  function finishLogoStep() {
    setShowLogoStep(false);
    if (pendingTeamData) {
      setCreatedTeam(pendingTeamData);
    }
  }

  function renderPicker(
    items: string[],
    selected: string,
    onSelect: (v: string) => void,
    onClose: () => void,
    displayLabels?: string[],
  ) {
    return (
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerScroll}>
            {items.map((item, idx) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.pickerItem,
                  selected === item && styles.pickerItemSelected,
                ]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    selected === item && styles.pickerItemTextSelected,
                  ]}
                >
                  {displayLabels ? displayLabels[idx] : item}
                </Text>
                {selected === item && (
                  <Ionicons name="checkmark" size={20} color={colors.cyan} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    );
  }

  async function shareInvite(type: 'players' | 'coaches') {
    if (!createdTeam) return;
    if (type === 'players') {
      const rosterUrl = createdTeam.rosterShareToken
        ? `https://ultimatetournaments.com/roster/${createdTeam.rosterShareToken}`
        : null;
      const message = rosterUrl
        ? `You've been invited to join ${createdTeam.name} on UHT! Claim your spot:\n${rosterUrl}`
        : `You've been invited to join ${createdTeam.name} on Ultimate Hockey Tournaments! Download the UHT app to get started.`;
      try { await Share.share({ message }); } catch {}
    } else {
      const code = createdTeam.inviteCode || '';
      const message = `You've been invited to coach ${createdTeam.name} on UHT!\n\nJoin code: ${code}\n\nDownload the UHT app and use this code to join the team as a coach.`;
      try { await Share.share({ message }); } catch {}
    }
  }

  // ==================
  // Duplicate Team Found Screen
  // ==================
  if (duplicateTeam) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Team Already Exists" showBack onBack={() => setDuplicateTeam(null)} />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={dupStyles.warningBanner}>
            <Ionicons name="alert-circle" size={28} color="#F59E0B" />
            <Text style={dupStyles.warningTitle}>We Found a Match</Text>
            <Text style={dupStyles.warningText}>
              A team with this name and age group already exists. You can join it instead of creating a duplicate.
            </Text>
          </View>

          <View style={dupStyles.teamCard}>
            <View style={dupStyles.teamCardHeader}>
              <Ionicons name="people" size={24} color={colors.navy} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={dupStyles.teamName}>{duplicateTeam.name}</Text>
                <Text style={dupStyles.teamMeta}>{duplicateTeam.ageGroup}</Text>
              </View>
            </View>

            {(duplicateTeam.city || duplicateTeam.state) && (
              <View style={dupStyles.detailRow}>
                <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                <Text style={dupStyles.detailText}>
                  {[duplicateTeam.city, duplicateTeam.state].filter(Boolean).join(', ')}
                </Text>
              </View>
            )}

            {duplicateTeam.headCoachName && (
              <View style={dupStyles.detailRow}>
                <Ionicons name="person-outline" size={16} color={colors.textMuted} />
                <Text style={dupStyles.detailText}>Coach: {duplicateTeam.headCoachName}</Text>
              </View>
            )}

            {duplicateTeam.inviteCode && (
              <View style={dupStyles.detailRow}>
                <Ionicons name="key-outline" size={16} color={colors.textMuted} />
                <Text style={dupStyles.detailText}>Team Code: {duplicateTeam.inviteCode}</Text>
              </View>
            )}
          </View>

          {/* Join this team */}
          <TouchableOpacity
            style={dupStyles.joinButton}
            onPress={handleJoinDuplicate}
            disabled={joiningDuplicate}
            activeOpacity={0.8}
          >
            {joiningDuplicate ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={20} color={colors.white} />
                <Text style={dupStyles.joinButtonText}>Join This Team</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={dupStyles.dividerRow}>
            <View style={dupStyles.dividerLine} />
            <Text style={dupStyles.dividerText}>OR</Text>
            <View style={dupStyles.dividerLine} />
          </View>

          {/* Create anyway */}
          <TouchableOpacity
            style={dupStyles.createAnywayButton}
            onPress={handleCreateAnyway}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color={colors.navy} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color={colors.navy} />
                <Text style={dupStyles.createAnywayText}>This is a different team — create it anyway</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Go back */}
          <TouchableOpacity
            style={dupStyles.goBackButton}
            onPress={() => setDuplicateTeam(null)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={18} color={colors.textMuted} />
            <Text style={dupStyles.goBackText}>Go back and edit</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // Show roster import step after team creation
  if (showRosterStep && createdTeamId) {
    // Preview mode: show parsed players for confirmation
    if (showPreview && previewPlayers.length > 0) {
      return (
        <View style={styles.container}>
          <ScreenHeader title="Review Players" showBack onBack={() => { setShowPreview(false); setPreviewPlayers([]); }} />
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionTitle}>Found {previewPlayers.length} Players</Text>
            <Text style={styles.sectionSubtitle}>Review the roster below, then tap Import All.</Text>

            {previewPlayers.map((p, i) => (
              <View key={i} style={rosterStyles.previewRow}>
                <View style={rosterStyles.previewNum}>
                  <Text style={rosterStyles.previewNumText}>{p.jerseyNumber || '-'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={rosterStyles.previewName}>{p.firstName} {p.lastName}</Text>
                  <Text style={rosterStyles.previewDetail}>
                    {p.position ? p.position.charAt(0).toUpperCase() + p.position.slice(1) : 'No pos.'}{p.shoots ? ` · ${p.shoots.charAt(0).toUpperCase() + p.shoots.slice(1)}` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setPreviewPlayers(prev => prev.filter((_, j) => j !== i))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={[styles.createButton, importing && styles.createButtonDisabled]}
              onPress={confirmPreviewPlayers}
              disabled={importing || previewPlayers.length === 0}
              activeOpacity={0.8}
            >
              {importing ? <ActivityIndicator color={colors.white} /> : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={colors.white} />
                  <Text style={styles.createButtonText}>Import {previewPlayers.length} Players</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }

    // Main roster import step
    return (
      <View style={styles.container}>
        <ScreenHeader title={editRosterTeamId ? `Add Roster — ${editRosterTeamName || 'Team'}` : "Add Roster"} showBack={!!editRosterTeamId} onBack={editRosterTeamId ? () => navigation.goBack() : undefined} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <Text style={styles.sectionTitle}>Import Your Roster</Text>
            <Text style={styles.sectionSubtitle}>
              Add your players now or skip and do it later from the coach dashboard.
            </Text>

            {/* Players added so far */}
            {addedPlayers.length > 0 && (
              <View style={rosterStyles.addedBanner}>
                <Ionicons name="people" size={18} color={colors.success} />
                <Text style={rosterStyles.addedBannerText}>{addedPlayers.length} player{addedPlayers.length !== 1 ? 's' : ''} added</Text>
              </View>
            )}

            {/* Message */}
            {rosterMessage && (
              <View style={[rosterStyles.msgBanner, rosterMessage.type === 'error' ? styles.errorBanner : rosterStyles.successBanner]}>
                <Ionicons name={rosterMessage.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={18} color={rosterMessage.type === 'success' ? colors.success : colors.error} />
                <Text style={[rosterMessage.type === 'error' ? styles.errorText : rosterStyles.successText]}>{rosterMessage.text}</Text>
              </View>
            )}

            {/* Tab Selector */}
            <View style={rosterStyles.tabRow}>
              {([
                { key: 'url' as const, label: 'USA Hockey URL', icon: 'link-outline' as const },
                { key: 'paste' as const, label: 'Paste', icon: 'clipboard-outline' as const },
                { key: 'manual' as const, label: 'Manual', icon: 'person-add-outline' as const },
              ]).map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  style={[rosterStyles.tab, rosterTab === tab.key && rosterStyles.tabActive]}
                  onPress={() => { setRosterTab(tab.key); setRosterMessage(null); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={tab.icon} size={18} color={rosterTab === tab.key ? colors.navy : colors.textMuted} />
                  <Text style={[rosterStyles.tabText, rosterTab === tab.key && rosterStyles.tabTextActive]}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* URL Import Tab */}
            {rosterTab === 'url' && (
              <View style={rosterStyles.tabContent}>
                <Text style={rosterStyles.tabDesc}>Paste your USA Hockey roster page URL to auto-import players.</Text>
                <TextInput
                  style={styles.input}
                  value={importUrl}
                  onChangeText={setImportUrl}
                  placeholder="https://..."
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="url"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[rosterStyles.actionBtn, (!importUrl.trim() || importing) && rosterStyles.actionBtnDisabled]}
                  onPress={handleUrlImport}
                  disabled={!importUrl.trim() || importing}
                  activeOpacity={0.8}
                >
                  {importing ? <ActivityIndicator color={colors.white} size="small" /> : (
                    <>
                      <Ionicons name="cloud-download-outline" size={18} color={colors.white} />
                      <Text style={rosterStyles.actionBtnText}>Import from URL</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Paste Tab */}
            {rosterTab === 'paste' && (
              <View style={rosterStyles.tabContent}>
                <Text style={rosterStyles.tabDesc}>Copy rows from a spreadsheet or type player data. Use tab or comma to separate columns.</Text>
                <TextInput
                  style={[styles.input, { height: 140, textAlignVertical: 'top' }]}
                  value={pastedText}
                  onChangeText={setPastedText}
                  placeholder={"Jersey #, First Name, Last Name, Position, Shoots\n12, John, Smith, Forward, Left\n7, Jane, Doe, Defense, Right"}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={6}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[rosterStyles.actionBtn, !pastedText.trim() && rosterStyles.actionBtnDisabled]}
                  onPress={handleParsePaste}
                  disabled={!pastedText.trim()}
                  activeOpacity={0.8}
                >
                  <Ionicons name="search-outline" size={18} color={colors.white} />
                  <Text style={rosterStyles.actionBtnText}>Parse & Preview</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Manual Entry Tab */}
            {rosterTab === 'manual' && (
              <View style={rosterStyles.tabContent}>
                <Text style={rosterStyles.tabDesc}>Add players one at a time.</Text>

                <Text style={styles.label}>First Name *</Text>
                <TextInput
                  style={styles.input}
                  value={newPlayer.firstName}
                  onChangeText={v => setNewPlayer(p => ({ ...p, firstName: v }))}
                  placeholder="First name"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                />

                <Text style={styles.label}>Last Name *</Text>
                <TextInput
                  style={styles.input}
                  value={newPlayer.lastName}
                  onChangeText={v => setNewPlayer(p => ({ ...p, lastName: v }))}
                  placeholder="Last name"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                />

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Jersey #</Text>
                    <TextInput
                      style={styles.input}
                      value={newPlayer.jerseyNumber}
                      onChangeText={v => setNewPlayer(p => ({ ...p, jerseyNumber: v }))}
                      placeholder="#"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.label}>Position</Text>
                    <View style={rosterStyles.posRow}>
                      {['forward', 'defense', 'goalie'].map(pos => (
                        <TouchableOpacity
                          key={pos}
                          style={[rosterStyles.posChip, newPlayer.position === pos && rosterStyles.posChipActive]}
                          onPress={() => setNewPlayer(p => ({ ...p, position: p.position === pos ? '' : pos }))}
                        >
                          <Text style={[rosterStyles.posChipText, newPlayer.position === pos && rosterStyles.posChipTextActive]}>
                            {pos.charAt(0).toUpperCase() + pos.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                <Text style={styles.label}>Shoots</Text>
                <View style={rosterStyles.posRow}>
                  {['left', 'right'].map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[rosterStyles.posChip, newPlayer.shoots === s && rosterStyles.posChipActive]}
                      onPress={() => setNewPlayer(p => ({ ...p, shoots: p.shoots === s ? '' : s }))}
                    >
                      <Text style={[rosterStyles.posChipText, newPlayer.shoots === s && rosterStyles.posChipTextActive]}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[rosterStyles.actionBtn, (!newPlayer.firstName.trim() || !newPlayer.lastName.trim() || importing) && rosterStyles.actionBtnDisabled]}
                  onPress={handleManualAdd}
                  disabled={!newPlayer.firstName.trim() || !newPlayer.lastName.trim() || importing}
                  activeOpacity={0.8}
                >
                  {importing ? <ActivityIndicator color={colors.white} size="small" /> : (
                    <>
                      <Ionicons name="person-add" size={18} color={colors.white} />
                      <Text style={rosterStyles.actionBtnText}>Add Player</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Players list */}
            {addedPlayers.length > 0 && (
              <View style={rosterStyles.playersList}>
                <Text style={[styles.sectionTitle, { fontSize: 16, marginBottom: 8 }]}>Roster ({addedPlayers.length})</Text>
                {addedPlayers.map((p, i) => (
                  <View key={p.id || i} style={rosterStyles.playerRow}>
                    <View style={rosterStyles.jerseyBadge}>
                      <Text style={rosterStyles.jerseyBadgeText}>{p.jerseyNumber || '-'}</Text>
                    </View>
                    <Text style={rosterStyles.playerName}>{p.firstName} {p.lastName}</Text>
                    <Text style={rosterStyles.playerPos}>
                      {p.position ? p.position.charAt(0).toUpperCase() : ''}
                      {p.shoots ? ` · ${p.shoots.charAt(0).toUpperCase()}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Bottom buttons */}
            <View style={rosterStyles.bottomBtns}>
              <TouchableOpacity
                style={[styles.createButton, { flex: 1 }]}
                onPress={finishRosterStep}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle" size={20} color={colors.white} />
                <Text style={styles.createButtonText}>{addedPlayers.length > 0 ? 'Done' : 'Skip for Now'}</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // Show logo upload step after roster import
  if (showLogoStep && createdTeamId) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Team Logo" showBack={false} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={{ alignItems: 'center', paddingTop: spacing.xl }}>
            {/* Logo preview / upload area */}
            <TouchableOpacity
              style={logoStyles.logoCircle}
              onPress={handlePickLogo}
              disabled={uploadingLogo}
              activeOpacity={0.7}
            >
              {uploadingLogo ? (
                <ActivityIndicator size="large" color={colors.cyan} />
              ) : logoUrl ? (
                <Image source={{ uri: logoUrl }} style={logoStyles.logoImage} />
              ) : (
                <View style={logoStyles.logoPlaceholder}>
                  <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
                  <Text style={logoStyles.logoPlaceholderText}>Add Logo</Text>
                </View>
              )}
            </TouchableOpacity>

            {logoUrl ? (
              <TouchableOpacity onPress={handlePickLogo} style={{ marginTop: spacing.md }}>
                <Text style={{ color: colors.cyan, ...fonts.semibold, fontSize: 14 }}>Change Logo</Text>
              </TouchableOpacity>
            ) : (
              <Text style={logoStyles.hint}>Tap to upload your team logo</Text>
            )}

            {/* Org logo suggestion */}
            {loadingOrgLogos ? (
              <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.navy} />
            ) : orgLogos.length > 0 && !logoUrl ? (
              <View style={logoStyles.orgSection}>
                <Text style={logoStyles.orgTitle}>Use your organization's logo?</Text>
                <Text style={logoStyles.orgSubtitle}>Other teams in your org use this logo</Text>
                <View style={logoStyles.orgLogoRow}>
                  {orgLogos.map((url, i) => (
                    <TouchableOpacity
                      key={i}
                      style={logoStyles.orgLogoOption}
                      onPress={() => useOrgLogo(url)}
                      disabled={uploadingLogo}
                      activeOpacity={0.7}
                    >
                      <Image source={{ uri: url }} style={logoStyles.orgLogoImg} />
                      <Text style={logoStyles.orgLogoUseText}>Use This</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          {/* Continue / Skip buttons */}
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xxxl }}>
            <TouchableOpacity
              style={styles.createButton}
              onPress={finishLogoStep}
              activeOpacity={0.8}
            >
              <Text style={styles.createButtonText}>{logoUrl ? 'Continue' : 'Skip for Now'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Show success/invite screen after team creation
  if (createdTeam) {
    return (
      <View style={styles.container}>
        <ScreenHeader
          title="Team Created!"
          showBack={false}
        />
        <ScrollView contentContainerStyle={styles.successContent}>
          <View style={styles.successIconContainer}>
            <Ionicons name="checkmark-circle" size={80} color={colors.success} />
          </View>
          <Text style={styles.successTitle}>{createdTeam.name}</Text>
          <Text style={styles.successSubtitle}>Your team is ready! Now invite your players and coaches.</Text>

          {/* Invite Players/Parents */}
          <View style={styles.inviteCard}>
            <View style={styles.inviteCardHeader}>
              <Ionicons name="people-outline" size={24} color={colors.navy} />
              <Text style={styles.inviteCardTitle}>Invite Players & Parents</Text>
            </View>
            <Text style={styles.inviteCardDesc}>
              Share a link so parents can claim their player on the roster.
            </Text>
            <TouchableOpacity
              style={styles.inviteShareBtn}
              onPress={() => shareInvite('players')}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={18} color={colors.white} />
              <Text style={styles.inviteShareBtnText}>Share Roster Link</Text>
            </TouchableOpacity>
          </View>

          {/* Invite Coaches */}
          <View style={styles.inviteCard}>
            <View style={styles.inviteCardHeader}>
              <Ionicons name="shield-outline" size={24} color={colors.navy} />
              <Text style={styles.inviteCardTitle}>Invite Coaches</Text>
            </View>
            <Text style={styles.inviteCardDesc}>
              Share this code with assistant coaches so they can join your team.
            </Text>
            {createdTeam.inviteCode ? (
              <View style={styles.inviteCodeBox}>
                <Text style={styles.inviteCodeLabel}>TEAM CODE</Text>
                <Text style={styles.inviteCodeValue}>{createdTeam.inviteCode}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.inviteShareBtn, { backgroundColor: colors.cyan }]}
              onPress={() => shareInvite('coaches')}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={18} color={colors.white} />
              <Text style={styles.inviteShareBtnText}>Share Coach Invite</Text>
            </TouchableOpacity>
          </View>

          {/* Done button */}
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => {
              if (fromOnboarding) {
                navigation.replace('Main');
              } else {
                navigation.goBack();
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Create Team"
        showBack
        onBack={() => navigation.goBack()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* 1. State */}
          <Text style={styles.label}>State *</Text>
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => setShowStatePicker(true)}
          >
            <Text
              style={[
                styles.selectInputText,
                !state && styles.selectInputPlaceholder,
              ]}
            >
              {state
                ? `${US_STATES.find((s) => s.code === state)?.name} (${state})`
                : 'Select state'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {/* 2. Organization (only show after state is selected) */}
          {state ? (
            <>
              <Text style={styles.label}>Organization *</Text>
              <TouchableOpacity
                style={styles.selectInput}
                onPress={() => setShowOrgPicker(true)}
              >
                <Text
                  style={[
                    styles.selectInputText,
                    !selectedOrgName && styles.selectInputPlaceholder,
                  ]}
                >
                  {selectedOrgName || 'Select organization'}
                </Text>
                <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {selectedOrgName ? (
                <View style={styles.orgBanner}>
                  <Ionicons name="business-outline" size={18} color={colors.navy} />
                  <Text style={styles.orgBannerText}>{selectedOrgName}</Text>
                </View>
              ) : null}
            </>
          ) : null}

          {/* 3. Age Group (only show after org is selected) */}
          {selectedOrgId ? (
            <>
              <Text style={styles.label}>Age Group *</Text>
              <TouchableOpacity
                style={styles.selectInput}
                onPress={() => setShowAgeGroupPicker(true)}
                disabled={loadingLookups}
              >
                <Text
                  style={[
                    styles.selectInputText,
                    !ageGroup && styles.selectInputPlaceholder,
                  ]}
                >
                  {loadingLookups ? 'Loading...' : (ageGroup || 'Select age group')}
                </Text>
                <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </>
          ) : null}

          {/* 4. Division Level (only show after age group is selected) */}
          {ageGroup ? (
            <>
              <Text style={styles.label}>Division Level</Text>
              <TouchableOpacity
                style={styles.selectInput}
                onPress={() => setShowDivisionPicker(true)}
              >
                <Text
                  style={[
                    styles.selectInputText,
                    !divisionLevel && styles.selectInputPlaceholder,
                  ]}
                >
                  {divisionLevel || 'Select division (optional)'}
                </Text>
                <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </>
          ) : null}

          {/* 5. Existing Team Review (show after age group selected, BEFORE team name) */}
          {ageGroup && selectedOrgId && !reviewedExistingTeams ? (
            <>
              <View style={styles.sectionDivider} />
              <View style={reviewStyles.reviewSection}>
                <Ionicons name="search" size={24} color={colors.navy} />
                <Text style={reviewStyles.reviewTitle}>Check for Existing Teams</Text>
                <Text style={reviewStyles.reviewDesc}>
                  Before creating a new team, let's make sure your team doesn't already exist for {selectedOrgName} — {ageGroup}{divisionLevel ? ` — ${divisionLevel}` : ''}.
                </Text>
                <TouchableOpacity
                  style={reviewStyles.reviewButton}
                  onPress={loadExistingTeams}
                  disabled={loadingExistingTeams}
                  activeOpacity={0.8}
                >
                  {loadingExistingTeams ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Ionicons name="people-outline" size={18} color={colors.white} />
                      <Text style={reviewStyles.reviewButtonText}>Show Existing Teams</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Existing teams list */}
                {hasSearchedTeams && existingTeams.length > 0 ? (
                  <View style={reviewStyles.teamsList}>
                    <Text style={reviewStyles.teamsListTitle}>
                      {existingTeams.length} team{existingTeams.length !== 1 ? 's' : ''} found
                    </Text>
                    {existingTeams.map((team: any) => (
                      <View key={team.id} style={reviewStyles.teamCard}>
                        <View style={reviewStyles.teamCardTop}>
                          <Ionicons name="people" size={20} color={colors.navy} />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={reviewStyles.teamCardName}>{team.name}</Text>
                            <Text style={reviewStyles.teamCardMeta}>
                              {team.age_group}{team.division_level ? ` · ${team.division_level}` : ''}
                              {team.player_count ? ` · ${team.player_count} players` : ''}
                            </Text>
                            {team.head_coach_name ? (
                              <Text style={reviewStyles.teamCardCoach}>Coach: {team.head_coach_name}</Text>
                            ) : null}
                          </View>
                        </View>
                        <TouchableOpacity
                          style={reviewStyles.joinTeamBtn}
                          onPress={() => {
                            setDuplicateTeam({
                              id: team.id,
                              name: team.name,
                              ageGroup: team.age_group,
                              city: team.city,
                              state: team.state,
                              inviteCode: team.invite_code,
                              headCoachName: team.head_coach_name,
                              playerCount: team.player_count,
                            });
                          }}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="log-in-outline" size={16} color={colors.navy} />
                          <Text style={reviewStyles.joinTeamBtnText}>This Is My Team</Text>
                        </TouchableOpacity>
                      </View>
                    ))}

                    <TouchableOpacity
                      style={reviewStyles.notListedBtn}
                      onPress={() => setReviewedExistingTeams(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="add-circle-outline" size={20} color={colors.cyan} />
                      <Text style={reviewStyles.notListedBtnText}>My team is not listed — create new</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* No existing teams found */}
                {hasSearchedTeams && existingTeams.length === 0 ? (
                  <View style={reviewStyles.noTeamsFound}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                    <Text style={reviewStyles.noTeamsText}>No existing teams found. You're clear to create!</Text>
                    <TouchableOpacity
                      style={reviewStyles.continueBtn}
                      onPress={() => setReviewedExistingTeams(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={reviewStyles.continueBtnText}>Continue</Text>
                      <Ionicons name="arrow-forward" size={18} color={colors.white} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          {/* 6. Team Name (show after reviewed existing teams) */}
          {reviewedExistingTeams && selectedOrgId ? (
            <>
              <View style={styles.sectionDivider} />
              <Text style={styles.label}>Team Name *</Text>
              <TextInput
                style={styles.input}
                value={teamName}
                onChangeText={setTeamName}
                placeholder="e.g. Chicago Jets"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
              />
            </>
          ) : null}

          {/* Coach Info Section (show after reviewed existing teams) */}
          {reviewedExistingTeams && selectedOrgId ? (
            <>
              <View style={styles.sectionDivider} />
              <Text style={styles.sectionTitle}>Head Coach Info</Text>
              <Text style={styles.sectionSubtitle}>
                Auto-filled from your account. Edit if creating team for your head coach.
              </Text>

              <Text style={styles.label}>Head Coach Name</Text>
              <TextInput
                style={styles.input}
                value={coachName}
                onChangeText={setCoachName}
                placeholder="Coach name"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
              />

              <Text style={styles.label}>Head Coach Email</Text>
              <TextInput
                style={styles.input}
                value={coachEmail}
                onChangeText={setCoachEmail}
                placeholder="coach@email.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.label}>Head Coach Phone</Text>
              <TextInput
                style={styles.input}
                value={coachPhone}
                onChangeText={setCoachPhone}
                placeholder="(555) 555-5555"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />

              {/* Create Button */}
              <TouchableOpacity
                style={[
                  styles.createButton,
                  saving && styles.createButtonDisabled,
                ]}
                onPress={handleCreate}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={20} color={colors.white} />
                    <Text style={styles.createButtonText}>Create Team</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Pickers */}
      {showAgeGroupPicker &&
        renderPicker(
          dbAgeGroups,
          ageGroup,
          setAgeGroup,
          () => setShowAgeGroupPicker(false),
        )}
      {showDivisionPicker &&
        renderPicker(
          dbDivisionLevels,
          divisionLevel,
          setDivisionLevel,
          () => setShowDivisionPicker(false),
        )}
      {showStatePicker &&
        renderPicker(
          US_STATES.map((s) => s.code),
          state,
          setState,
          () => setShowStatePicker(false),
          US_STATES.map((s) => `${s.name} (${s.code})`),
        )}
      {showOrgPicker && (
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerContainer, { maxHeight: '85%' }]}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Organization</Text>
              <TouchableOpacity onPress={() => { setShowOrgPicker(false); setOrgSearchQuery(''); }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            {/* Live search bar */}
            <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: radii.sm, paddingHorizontal: spacing.md, height: 44 }}>
                <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: spacing.sm }} />
                <TextInput
                  style={{ flex: 1, fontSize: 16, color: colors.text, padding: 0 }}
                  value={orgSearchQuery}
                  onChangeText={setOrgSearchQuery}
                  placeholder="Search organizations..."
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
                {orgSearchQuery.length > 0 ? (
                  <TouchableOpacity onPress={() => setOrgSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            {loadingOrgs ? (
              <View style={{ padding: spacing.xxl, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.navy} />
                <Text style={{ marginTop: spacing.md, color: colors.textMuted }}>Searching...</Text>
              </View>
            ) : (
              <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled">
                {organizations.length === 0 ? (
                  <Text style={{ padding: spacing.lg, textAlign: 'center', color: colors.textMuted }}>
                    {orgSearchQuery.trim() ? 'No organizations found. Try a different search.' : 'No organizations found.'}
                  </Text>
                ) : (
                  organizations.map((org: any) => (
                    <TouchableOpacity
                      key={org.id}
                      style={[
                        styles.pickerItem,
                        selectedOrgId === org.id && styles.pickerItemSelected,
                      ]}
                      onPress={() => {
                        setSelectedOrgId(org.id);
                        setSelectedOrgName(org.name);
                        setShowOrgPicker(false);
                        setOrgSearchQuery('');
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickerItemText, selectedOrgId === org.id && styles.pickerItemTextSelected]}>
                          {org.name}
                        </Text>
                        {org.city ? (
                          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
                            {org.city}, {org.state}
                          </Text>
                        ) : null}
                      </View>
                      {selectedOrgId === org.id && (
                        <Ionicons name="checkmark" size={20} color={colors.cyan} />
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  orgBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoBg,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  orgBannerText: {
    fontSize: 15,
    color: colors.navy,
    ...fonts.semibold,
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorBg,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    ...fonts.medium,
    flex: 1,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    ...fonts.semibold,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    ...fonts.regular,
  },
  selectInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectInputText: {
    fontSize: 16,
    color: colors.text,
    ...fonts.regular,
  },
  selectInputPlaceholder: {
    color: colors.textMuted,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    color: colors.text,
    ...fonts.bold,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.regular,
    lineHeight: 20,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginTop: spacing.xxxl,
    gap: spacing.sm,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 17,
    color: colors.white,
    ...fonts.bold,
  },

  // Picker overlay
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: {
    fontSize: 18,
    ...fonts.bold,
    color: colors.text,
  },
  pickerScroll: {
    paddingHorizontal: spacing.lg,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerItemSelected: {
    backgroundColor: colors.highlight,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  pickerItemText: {
    fontSize: 16,
    color: colors.text,
    ...fonts.medium,
  },
  pickerItemTextSelected: {
    color: colors.navy,
    ...fonts.bold,
  },

  // Success / Invite screen
  successContent: {
    padding: spacing.lg,
    paddingBottom: 100,
    alignItems: 'center' as const,
  },
  successIconContainer: {
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontSize: 24,
    color: colors.text,
    ...fonts.bold,
    textAlign: 'center' as const,
    marginBottom: spacing.sm,
  },
  successSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    ...fonts.regular,
    textAlign: 'center' as const,
    lineHeight: 22,
    marginBottom: spacing.xxl,
  },
  inviteCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    width: '100%' as any,
  },
  inviteCardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  inviteCardTitle: {
    fontSize: 17,
    color: colors.text,
    ...fonts.bold,
  },
  inviteCardDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  inviteShareBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.navy,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  inviteShareBtnText: {
    fontSize: 15,
    color: colors.white,
    ...fonts.bold,
  },
  inviteCodeBox: {
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    padding: spacing.md,
    alignItems: 'center' as const,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviteCodeLabel: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.semibold,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  inviteCodeValue: {
    fontSize: 28,
    color: colors.navy,
    ...fonts.bold,
    letterSpacing: 3,
  },
  doneButton: {
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxxl,
    marginTop: spacing.xl,
  },
  doneButtonText: {
    fontSize: 16,
    color: colors.navy,
    ...fonts.bold,
  },
});

const rosterStyles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tabActive: {
    borderColor: colors.navy,
    backgroundColor: colors.infoBg || '#f0f7ff',
  },
  tabText: {
    fontSize: 11,
    color: colors.textMuted,
    ...fonts.semibold,
    textAlign: 'center',
  },
  tabTextActive: {
    color: colors.navy,
  },
  tabContent: {
    marginBottom: spacing.lg,
  },
  tabDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionBtnText: {
    fontSize: 15,
    color: colors.white,
    ...fonts.bold,
  },
  addedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: radii.sm,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  addedBannerText: {
    fontSize: 14,
    color: '#166534',
    ...fonts.semibold,
  },
  msgBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  successBanner: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  successText: {
    fontSize: 14,
    color: '#166534',
    ...fonts.medium,
    flex: 1,
  },
  posRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  posChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  posChipActive: {
    borderColor: colors.navy,
    backgroundColor: colors.infoBg || '#f0f7ff',
  },
  posChipText: {
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.semibold,
  },
  posChipTextActive: {
    color: colors.navy,
  },
  playersList: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  jerseyBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jerseyBadgeText: {
    fontSize: 13,
    color: colors.white,
    ...fonts.bold,
  },
  playerName: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    ...fonts.medium,
  },
  playerPos: {
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.regular,
  },
  bottomBtns: {
    flexDirection: 'row',
    gap: 12,
    marginTop: spacing.xxl,
    marginBottom: spacing.xxl,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  previewNum: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewNumText: {
    fontSize: 14,
    color: colors.white,
    ...fonts.bold,
  },
  previewName: {
    fontSize: 15,
    color: colors.text,
    ...fonts.semibold,
  },
  previewDetail: {
    fontSize: 13,
    color: colors.textMuted,
    ...fonts.regular,
    marginTop: 2,
  },
});

const logoStyles = StyleSheet.create({
  logoCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  logoPlaceholder: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  logoPlaceholderText: {
    fontSize: 14,
    color: colors.textMuted,
    ...fonts.medium,
  },
  hint: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    marginTop: spacing.md,
  },
  orgSection: {
    marginTop: spacing.xxxl,
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: spacing.xl,
  },
  orgTitle: {
    fontSize: 17,
    color: colors.text,
    ...fonts.semibold,
    marginBottom: spacing.xs,
  },
  orgSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    ...fonts.regular,
    marginBottom: spacing.lg,
  },
  orgLogoRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'center',
  },
  orgLogoOption: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  orgLogoImg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.cyan,
  },
  orgLogoUseText: {
    fontSize: 13,
    color: colors.cyan,
    ...fonts.semibold,
  },
});

const reviewStyles = StyleSheet.create({
  reviewSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  reviewTitle: {
    ...fonts.bold,
    fontSize: 18,
    color: colors.navy,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  reviewDesc: {
    ...fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    lineHeight: 20,
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 8,
    width: '100%',
  },
  reviewButtonText: {
    ...fonts.semibold,
    fontSize: 15,
    color: colors.white,
  },
  teamsList: {
    width: '100%',
    marginTop: spacing.lg,
  },
  teamsListTitle: {
    ...fonts.semibold,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  teamCard: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  teamCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  teamCardName: {
    ...fonts.semibold,
    fontSize: 16,
    color: colors.navy,
  },
  teamCardMeta: {
    ...fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  teamCardCoach: {
    ...fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  joinTeamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: radii.sm,
    paddingVertical: 10,
    marginTop: spacing.sm,
    gap: 6,
  },
  joinTeamBtnText: {
    ...fonts.semibold,
    fontSize: 14,
    color: colors.navy,
  },
  notListedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: spacing.sm,
    gap: 8,
    borderWidth: 2,
    borderColor: colors.cyan,
    borderRadius: radii.md,
    borderStyle: 'dashed',
  },
  notListedBtnText: {
    ...fonts.semibold,
    fontSize: 14,
    color: colors.cyan,
  },
  noTeamsFound: {
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
  noTeamsText: {
    ...fonts.regular,
    fontSize: 14,
    color: colors.success,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: spacing.md,
    gap: 8,
  },
  continueBtnText: {
    ...fonts.semibold,
    fontSize: 15,
    color: colors.white,
  },
});

const dupStyles = StyleSheet.create({
  warningBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningTitle: {
    fontSize: 20,
    ...fonts.bold,
    color: '#92400E',
    marginTop: spacing.sm,
  },
  warningText: {
    fontSize: 14,
    ...fonts.regular,
    color: '#92400E',
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  teamCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  teamName: {
    fontSize: 18,
    ...fonts.bold,
    color: colors.text,
  },
  teamMeta: {
    fontSize: 14,
    ...fonts.regular,
    color: colors.textMuted,
    marginTop: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
  },
  detailText: {
    fontSize: 14,
    ...fonts.regular,
    color: colors.textSecondary,
  },
  joinButton: {
    backgroundColor: '#059669',
    borderRadius: radii.md,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.lg,
  },
  joinButtonText: {
    color: colors.white,
    fontSize: 17,
    ...fonts.bold,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: 13,
    ...fonts.semibold,
    color: colors.textMuted,
  },
  createAnywayButton: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  createAnywayText: {
    color: colors.navy,
    fontSize: 15,
    ...fonts.semibold,
  },
  goBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
  },
  goBackText: {
    fontSize: 14,
    ...fonts.regular,
    color: colors.textMuted,
  },
});
