'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api/events';
const HOTEL_API = 'https://uht.chad-157.workers.dev/api/hotels';
const UPLOAD_API = 'https://uht.chad-157.workers.dev/api/upload/image';

interface EventItem {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  start_date: string;
  end_date: string;
  status: string;
  tournament_name: string | null;
  tournament_location: string | null;
  tournament_id: string | null;
  venue_id: string | null;
  registration_count: number;
  total_revenue_cents: number | null;
  age_groups: string | null;
  divisions: string | null;
  slots_count: number | null;
  is_sold_out: number;
  hide_availability: number;
  show_participants: number;
  information: string | null;
  description: string | null;
  season: string | null;
  timezone: string | null;
  rules_url: string | null;
  logo_url: string | null;
  banner_url: string | null;
  price_cents: number | null;
  deposit_cents: number | null;
  multi_event_discount_pct: number | null;
  registration_open_date: string | null;
  registration_deadline: string | null;
  sanction_number: string | null;
}

interface EventHotel {
  id: string;
  event_id: string;
  hotel_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  rate_description: string | null;
  booking_url: string | null;
  booking_code: string | null;
  room_block_count: number | null;
  price_per_night: number | null;
  sort_order: number;
  image_url: string | null;
}

interface Venue {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string | null;
  num_rinks: number;
}

// --- Helpers ---
const fmtDate = (d: string) => {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const fmtDateFull = (d: string) => {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const daysUntil = (d: string) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d + 'T12:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const statusColor = (status: string) => {
  switch (status) {
    case 'registration_open': return 'bg-green-100 text-green-700';
    case 'published': return 'bg-[#f0f7ff] text-[#003e79]';
    case 'active': return 'bg-[#e0efff] text-[#003e79]';
    case 'completed': return 'bg-[#fafafa] text-[#6e6e73]';
    case 'cancelled': return 'bg-red-100 text-red-700';
    case 'draft': return 'bg-amber-100 text-amber-700';
    default: return 'bg-[#fafafa] text-[#6e6e73]';
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'registration_open': return 'Reg. Open';
    case 'registration_closed': return 'Reg. Closed';
    default: return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  }
};


// --- Standard age groups & divisions ---
const STANDARD_AGE_GROUPS = ['Mite', 'Squirt', 'Pee Wee', 'Bantam', 'Midget', '16u/JV', '18u/Var.'];
const STANDARD_DIVISIONS = ['AA', 'Gold', 'A1', 'A2', 'Silver', 'A3', 'B1', 'Bronze', 'B2', 'B3', 'House', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3'];
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const TIMEZONES = ['Eastern (EST)', 'Central (CST)', 'Mountain (MST)', 'Pacific (PST)'];
const SEASONS = ['fall', 'winter', 'spring', 'summer'];

// --- Hotel Notification Banner ---
function HotelNotificationBanner({ eventId }: { eventId: string }) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; message: string } | null>(null);

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/needs-hotel-count/${eventId}`);
        const json = await res.json() as any;
        if (json.success) setCount(json.data.count || 0);
      } catch {} finally { setLoading(false); }
    })();
  }, [eventId]);

  const sendNotifications = async () => {
    setSending(true);
    setResult(null);
    try {
      const token = localStorage.getItem('uht_token');
      const res = await fetch(`${API_BASE}/${eventId}/notify-hotels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });
      const json = await res.json() as any;
      if (json.success) {
        setResult({ sent: json.data.emailsSent, message: json.data.message });
        setCount(0);
      } else {
        setResult({ sent: 0, message: json.error || 'Failed to send notifications.' });
      }
    } catch {
      setResult({ sent: 0, message: 'Network error. Please try again.' });
    } finally { setSending(false); }
  };

  if (loading || (count === 0 && !result)) return null;

  return (
    <div className="mb-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
          </div>
          <div>
            {count > 0 ? (
              <>
                <p className="text-sm font-semibold text-amber-900">{count} team{count !== 1 ? 's' : ''} waiting for hotel info</p>
                <p className="text-xs text-amber-700">These teams indicated they need a hotel during registration.</p>
              </>
            ) : result ? (
              <>
                <p className="text-sm font-semibold text-emerald-800">{result.message}</p>
              </>
            ) : null}
          </div>
        </div>
        {count > 0 && (
          <button
            onClick={sendNotifications}
            disabled={sending}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {sending ? 'Sending...' : 'Send Hotel Notifications'}
          </button>
        )}
      </div>
      {result && result.sent > 0 && (
        <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-sm text-emerald-800 font-medium">{result.message}</p>
        </div>
      )}
      {result && result.sent === 0 && result.message.includes('Failed') && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{result.message}</p>
        </div>
      )}
    </div>
  );
}

// --- Event Form Modal ---
function EventFormModal({ event, tournaments, venues, onClose, onSaved }: {
  event: EventItem | null; // null = create mode
  tournaments: { id: string; name: string }[];
  venues: Venue[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!event;
  const [activeTab, setActiveTab] = useState<'details' | 'hotels' | 'directors' | 'venues' | 'rules' | 'scorekeepers'>('details');
  const [step, setStep] = useState(1); // For create stepper: 1=Info, 2=Dates/Pricing, 3=Age/Divisions, 4=Venues, 5=Review
  const TOTAL_STEPS = 5;
  const [selectedVenueIds, setSelectedVenueIds] = useState<Set<string>>(new Set());
  const [primaryVenueId, setPrimaryVenueId] = useState<string | null>(null);
  const [venueSearch, setVenueSearch] = useState('');
  const [showAllVenues, setShowAllVenues] = useState(false);
  const [form, setForm] = useState({
    name: event?.name || '',
    city: event?.city || '',
    state: event?.state || 'IL',
    start_date: event?.start_date || '',
    end_date: event?.end_date || '',
    tournament_id: event?.tournament_id || '',
    venue_id: event?.venue_id || '',
    status: event?.status || 'draft',
    information: event?.information || '',
    description: event?.description || '',
    price_cents: event?.price_cents ? String(event.price_cents / 100) : '',
    deposit_cents: event?.deposit_cents ? String(event.deposit_cents / 100) : '',
    multi_event_discount_pct: event?.multi_event_discount_pct ? String(event.multi_event_discount_pct) : '',
    slots_count: event?.slots_count ? String(event.slots_count) : '100',
    age_groups: event?.age_groups ? (event.age_groups.startsWith('[') ? JSON.parse(event.age_groups) : event.age_groups.split(',').map((s: string) => s.trim())) as string[] : [] as string[],
    divisions: event?.divisions ? JSON.parse(event.divisions) as string[] : [] as string[],
    registration_open_date: event?.registration_open_date || '',
    registration_deadline: event?.registration_deadline || '',
    season: event?.season || '',
    timezone: event?.timezone || 'Central (CST)',
    rules_url: event?.rules_url || '',
    logo_url: event?.logo_url || '',
    banner_url: event?.banner_url || '',
    hide_availability: event?.hide_availability || 0,
    show_participants: event?.show_participants ?? 1,
    is_sold_out: event?.is_sold_out || 0,
    sanction_number: event?.sanction_number || '',
  });

  // Hotels state
  const [hotels, setHotels] = useState<EventHotel[]>([]);
  const [suggestedHotels, setSuggestedHotels] = useState<any[]>([]);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showAddManual, setShowAddManual] = useState(false);
  const [newHotel, setNewHotel] = useState({ hotel_name: '', rate_description: '', booking_url: '', booking_code: '', address: '', city: '', state: '', phone: '' });
  const [addingHotel, setAddingHotel] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  // Hotel search state
  const [hotelSearchQuery, setHotelSearchQuery] = useState('');
  const [hotelSearchState, setHotelSearchState] = useState('');
  const [hotelSearchResults, setHotelSearchResults] = useState<any[]>([]);
  const [hotelSearchLoading, setHotelSearchLoading] = useState(false);
  const [showHotelSearch, setShowHotelSearch] = useState(false);

  // Venue rinks state (for director-to-rink assignment)
  const [venueRinks, setVenueRinks] = useState<any[]>([]);

  // Venues tab state
  const [allVenuesList, setAllVenuesList] = useState<any[]>([]);
  const [venueCities, setVenueCities] = useState<any[]>([]);
  const [venueCityFilter, setVenueCityFilter] = useState<string | null>(null);
  const [assignedVenueIds, setAssignedVenueIds] = useState<Set<string>>(new Set());
  const [primaryVenueIdTab, setPrimaryVenueIdTab] = useState<string | null>(null);
  const [eventRinksMap, setEventRinksMap] = useState<Record<string, any[]>>({});
  const [loadingVenuesTab, setLoadingVenuesTab] = useState(false);
  const [savingVenues, setSavingVenues] = useState(false);
  const [venuesDirty, setVenuesDirty] = useState(false);
  const [venuesSaveStatus, setVenuesSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [venueSearchTab, setVenueSearchTab] = useState('');
  const [expandedVenueId, setExpandedVenueId] = useState<string | null>(null);
  const [addingRinkToVenue, setAddingRinkToVenue] = useState<string | null>(null);
  const [newRinkName, setNewRinkName] = useState('');
  const [newRinkSize, setNewRinkSize] = useState('');
  const [savingRink, setSavingRink] = useState(false);

  // Rules tab state
  interface ScheduleRule {
    ruleType: string;
    ruleValue: string;
    priority: number;
  }
  interface TeamRating {
    registration_id: string;
    team_id: string;
    team_name: string;
    team_city: string;
    team_state: string;
    mhr_rating: number | null;
    age_group: string;
    division_level: string | null;
  }
  const [scheduleRules, setScheduleRules] = useState<ScheduleRule[]>([]);
  const [teamRatings, setTeamRatings] = useState<TeamRating[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesSaveStatus, setRulesSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [rulesVenueRinks, setRulesVenueRinks] = useState<any[]>([]);

  // Division pricing state
  interface DivisionConfig {
    id?: string;
    age_group: string;
    division_level: string | null;
    max_teams: number | null;
    price_cents: number;
    period_length_minutes?: number | null;
    registered_count?: number;
  }
  const [divisionConfigs, setDivisionConfigs] = useState<DivisionConfig[]>([]);
  const [loadingDivisions, setLoadingDivisions] = useState(false);
  const [savingDivisions, setSavingDivisions] = useState(false);
  const [divisionSaveStatus, setDivisionSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Directors state
  const [directors, setDirectors] = useState<any[]>([]);
  const [directorOptions, setDirectorOptions] = useState<any[]>([]);
  const [loadingDirectors, setLoadingDirectors] = useState(false);
  const [loadingDirectorOptions, setLoadingDirectorOptions] = useState(false);
  const [selectedDirectorId, setSelectedDirectorId] = useState('');
  const [assigningDirector, setAssigningDirector] = useState(false);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Image upload state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // AI description generation state
  const [generatingDesc, setGeneratingDesc] = useState(false);

  const handleImageUpload = async (file: File, field: 'logo_url' | 'banner_url') => {
    const setUploading = field === 'logo_url' ? setUploadingLogo : setUploadingBanner;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(UPLOAD_API, { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success && json.url) {
        setForm(prev => ({ ...prev, [field]: json.url }));
      }
    } catch (e) { console.error('Upload failed', e); }
    setUploading(false);
  };

  // Persist create-mode form state to sessionStorage (#111)
  useEffect(() => {
    if (!isEdit) {
      const saved = sessionStorage.getItem('uht_create_event_form');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setForm(prev => ({ ...prev, ...parsed }));
          if (parsed._step) setStep(parsed._step);
          if (parsed._selectedVenueIds) setSelectedVenueIds(new Set(parsed._selectedVenueIds));
          if (parsed._primaryVenueId) setPrimaryVenueId(parsed._primaryVenueId);
          if (parsed._divisionConfigs) setDivisionConfigs(parsed._divisionConfigs);
        } catch {}
      }
    }
  }, []);

  useEffect(() => {
    if (!isEdit) {
      const toSave = { ...form, _step: step, _selectedVenueIds: Array.from(selectedVenueIds), _primaryVenueId: primaryVenueId, _divisionConfigs: divisionConfigs };
      sessionStorage.setItem('uht_create_event_form', JSON.stringify(toSave));
    }
  }, [form, step, selectedVenueIds, primaryVenueId, divisionConfigs, isEdit]);

  // Clear persisted state on close or successful save
  const clearPersistedForm = () => sessionStorage.removeItem('uht_create_event_form');

  const generateAIDescription = async () => {
    setGeneratingDesc(true);
    try {
      const ageList = form.age_groups.length > 0 ? form.age_groups.join(', ') : 'various age groups';
      const prompt = `Write a short, exciting marketing description (2-3 sentences max) for a youth hockey tournament called "${form.name}" in ${form.city}, ${form.state}. ${form.start_date && form.end_date ? `It runs from ${form.start_date} to ${form.end_date}.` : ''} Age groups: ${ageList}. Keep it professional, enthusiastic, and focused on the competitive experience. Do not use emojis.`;
      const res = await fetch('https://uht.chad-157.workers.dev/api/chatbot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const json = await res.json();
      if (json.success && json.data?.response) {
        setForm(prev => ({ ...prev, description: json.data.response }));
      }
    } catch (e) { console.error('AI generation failed', e); }
    setGeneratingDesc(false);
  };

  // Load hotels + venue rinks when in edit mode
  useEffect(() => {
    if (isEdit && event?.id) {
      setLoadingHotels(true);
      fetch(`${API_BASE}/admin/event-hotels/${event.id}`).then(r => r.json()).then(json => {
        if (json.success) setHotels(json.data);
        setLoadingHotels(false);
      }).catch(() => setLoadingHotels(false));
      // Load venue rinks for director assignment
      if (event.venue_id) {
        fetch(`https://uht.chad-157.workers.dev/api/venues/${event.venue_id}/rinks`).then(r => r.json()).then(json => {
          if (json.data && Array.isArray(json.data)) setVenueRinks(json.data);
        }).catch(() => {});
      }
    }
  }, [isEdit, event?.id]);

  // Load suggestions when hotels tab opens
  useEffect(() => {
    if (activeTab === 'hotels' && isEdit && event?.id && suggestedHotels.length === 0) {
      setLoadingSuggestions(true);
      fetch(`${HOTEL_API}/suggest/${event.id}`).then(r => r.json()).then(json => {
        if (json.success) setSuggestedHotels(json.data);
        setLoadingSuggestions(false);
      }).catch(() => setLoadingSuggestions(false));
    }
  }, [activeTab, isEdit, event?.id]);

  // Load venues + assigned when venues tab opens
  useEffect(() => {
    if (activeTab === 'venues' && isEdit && event?.id && allVenuesList.length === 0) {
      setLoadingVenuesTab(true);
      Promise.all([
        fetch('https://uht.chad-157.workers.dev/api/venues').then(r => r.json()),
        fetch(`https://uht.chad-157.workers.dev/api/events/admin/event-venues/${event.id}`).then(r => r.json()),
        fetch('https://uht.chad-157.workers.dev/api/cities').then(r => r.json()),
      ]).then(async ([venuesJson, assignedJson, citiesJson]) => {
        if (venuesJson.success) setAllVenuesList(venuesJson.data || []);
        if (citiesJson.success) setVenueCities((citiesJson.data || []).filter((c: any) => c.venue_count > 0));
        if (assignedJson.success && assignedJson.data) {
          const ids = new Set<string>(assignedJson.data.map((v: any) => v.venue_id));
          setAssignedVenueIds(ids);
          const primary = assignedJson.data.find((v: any) => v.is_primary);
          if (primary) setPrimaryVenueIdTab(primary.venue_id);
          // Load rinks for all assigned venues
          const rinksMap: Record<string, any[]> = {};
          await Promise.all(Array.from(ids).map(async (vid) => {
            try {
              const rRes = await fetch(`https://uht.chad-157.workers.dev/api/venues/${vid}/rinks`).then(r => r.json());
              if (rRes.success) rinksMap[vid] = rRes.data || [];
            } catch (_) {}
          }));
          setEventRinksMap(rinksMap);
        }
        setLoadingVenuesTab(false);
      }).catch(() => setLoadingVenuesTab(false));
    }
  }, [activeTab, isEdit, event?.id]);

  // Load division configs when in edit mode
  useEffect(() => {
    if (isEdit && event?.id) {
      setLoadingDivisions(true);
      fetch(`${API_BASE}/admin/${event.id}/divisions`).then(r => r.json()).then(json => {
        if (json.success && json.data.length > 0) {
          setDivisionConfigs(json.data.map((d: any) => ({
            id: d.id,
            age_group: d.age_group,
            division_level: d.division_level,
            max_teams: d.max_teams,
            price_cents: d.price_cents,
            period_length_minutes: d.period_length_minutes ?? null,
            registered_count: d.registered_count || 0,
          })));
        }
        setLoadingDivisions(false);
      }).catch(() => setLoadingDivisions(false));
    }
  }, [isEdit, event?.id]);

  // Auto-generate division rows when age groups change
  useEffect(() => {
    if (form.age_groups.length > 0) {
      setDivisionConfigs(prev => {
        const existing = new Map(prev.map(d => [d.age_group, d]));
        const updated: DivisionConfig[] = [];
        const defaultPrice = form.price_cents ? Math.round(parseFloat(form.price_cents) * 100) : 0;
        for (const ag of form.age_groups) {
          if (existing.has(ag)) {
            updated.push(existing.get(ag)!);
          } else {
            updated.push({ age_group: ag, division_level: null, max_teams: null, price_cents: defaultPrice, period_length_minutes: 12 });
          }
        }
        return updated;
      });
    }
  }, [form.age_groups]);

  // Save division configs
  const saveDivisions = async () => {
    if (!isEdit || !event?.id) return;
    setSavingDivisions(true);
    setDivisionSaveStatus('idle');
    try {
      const res = await fetch(`${API_BASE}/admin/${event.id}/divisions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ divisions: divisionConfigs }),
      });
      const json = await res.json();
      if (json.success) {
        setDivisionConfigs(json.data.map((d: any) => ({
          id: d.id, age_group: d.age_group, division_level: d.division_level,
          max_teams: d.max_teams, price_cents: d.price_cents, period_length_minutes: d.period_length_minutes ?? null, registered_count: d.registered_count || 0,
        })));
        setDivisionSaveStatus('saved');
        setTimeout(() => setDivisionSaveStatus('idle'), 2000);
      } else {
        setDivisionSaveStatus('error');
      }
    } catch {
      setDivisionSaveStatus('error');
    }
    setSavingDivisions(false);
  };

  // Load rules + team ratings when rules tab opens
  useEffect(() => {
    if (activeTab === 'rules' && isEdit && event?.id) {
      setLoadingRules(true);
      Promise.all([
        fetch(`https://uht.chad-157.workers.dev/api/scheduling/events/${event.id}/rules`, { headers: { 'X-Dev-Bypass': 'true' } }).then(r => r.json()),
        fetch(`https://uht.chad-157.workers.dev/api/scheduling/events/${event.id}/team-ratings`, { headers: { 'X-Dev-Bypass': 'true' } }).then(r => r.json()),
      ]).then(([rulesJson, ratingsJson]) => {
        if (rulesJson.success) {
          setScheduleRules((rulesJson.data || []).map((r: any) => ({ ruleType: r.rule_type, ruleValue: r.rule_value, priority: r.priority })));
        }
        if (ratingsJson.success) setTeamRatings(ratingsJson.data || []);
        setLoadingRules(false);
      }).catch(() => setLoadingRules(false));
      // Load rinks for rink rules
      if (event.venue_id) {
        fetch(`https://uht.chad-157.workers.dev/api/venues/${event.venue_id}/rinks`).then(r => r.json()).then(json => {
          if (json.success) setRulesVenueRinks(json.data || []);
        }).catch(() => {});
      }
    }
  }, [activeTab, isEdit, event?.id]);

  // Load directors when directors tab opens
  useEffect(() => {
    if (activeTab === 'directors' && isEdit && event?.id) {
      setLoadingDirectors(true);
      fetch(`https://uht.chad-157.workers.dev/api/director/events/${event.id}/directors`, {
        headers: { 'X-Dev-Bypass': 'true' }
      }).then(r => r.json()).then(json => {
        if (json.success) setDirectors(json.data);
        setLoadingDirectors(false);
      }).catch(() => setLoadingDirectors(false));
    }
  }, [activeTab, isEdit, event?.id]);

  // Load director options when directors tab opens
  useEffect(() => {
    if (activeTab === 'directors' && directorOptions.length === 0) {
      setLoadingDirectorOptions(true);
      fetch(`https://uht.chad-157.workers.dev/api/users?role=director`, {
        headers: { 'X-Dev-Bypass': 'true' }
      }).then(r => r.json()).then(json => {
        if (json.success) setDirectorOptions(json.data);
        setLoadingDirectorOptions(false);
      }).catch(() => setLoadingDirectorOptions(false));
    }
  }, [activeTab]);

  const toggleArrayItem = (field: 'age_groups' | 'divisions', item: string) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(item) ? prev[field].filter((i: string) => i !== item) : [...prev[field], item],
    }));
  };

  const handleLinkHotel = async (masterHotelId: string) => {
    if (!event?.id) return;
    setLinkingId(masterHotelId);
    try {
      const res = await fetch(`${HOTEL_API}/link/${event.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ master_hotel_id: masterHotelId }),
      });
      const json = await res.json();
      if (json.success) {
        setHotels(prev => [...prev, json.data]);
        setSuggestedHotels(prev => prev.map(h => h.id === masterHotelId ? { ...h, already_linked: true } : h));
      }
    } catch (e) { /* ignore */ }
    setLinkingId(null);
  };

  const handleAddHotel = async () => {
    if (!newHotel.hotel_name || !event?.id) return;
    setAddingHotel(true);
    try {
      const res = await fetch(`${API_BASE}/admin/event-hotels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, ...newHotel, sort_order: hotels.length }),
      });
      const json = await res.json();
      if (json.success) {
        setHotels(prev => [...prev, json.data]);
        setNewHotel({ hotel_name: '', rate_description: '', booking_url: '', booking_code: '', address: '', city: '', state: '', phone: '' });
        setShowAddManual(false);
      }
    } catch (e) { /* ignore */ }
    setAddingHotel(false);
  };

  const handleDeleteHotel = async (hotelId: string) => {
    try {
      await fetch(`${API_BASE}/admin/event-hotels/${hotelId}`, { method: 'DELETE' });
      setHotels(prev => prev.filter(h => h.id !== hotelId));
      // Un-mark from suggestions
      setSuggestedHotels(prev => prev.map(h => {
        const linked = hotels.find(eh => eh.id === hotelId);
        if (linked && (linked as any).master_hotel_id === h.id) return { ...h, already_linked: false };
        return h;
      }));
    } catch (e) { /* ignore */ }
  };

  const handleUpdateHotel = async (hotelId: string, updates: Partial<EventHotel>) => {
    try {
      const res = await fetch(`${API_BASE}/admin/event-hotels/${hotelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (json.success) {
        setHotels(prev => prev.map(h => h.id === hotelId ? { ...h, ...updates } : h));
      }
    } catch (e) { /* ignore */ }
  };

  const searchMasterHotels = async (query?: string, state?: string) => {
    setHotelSearchLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('search', query);
      if (state) params.set('state', state);
      const res = await fetch(`${HOTEL_API}/master?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        // Mark hotels already linked to this event
        const linkedMasterIds = new Set(hotels.map((h: any) => h.master_hotel_id).filter(Boolean));
        const results = (json.data || []).map((h: any) => ({
          ...h,
          already_linked: linkedMasterIds.has(h.id),
        }));
        setHotelSearchResults(results);
      }
    } catch (e) { /* ignore */ }
    setHotelSearchLoading(false);
  };

  const handleAssignDirector = async (rinkIds?: string[]) => {
    if (!selectedDirectorId || !event?.id) return;
    setAssigningDirector(true);
    try {
      const res = await fetch(`https://uht.chad-157.workers.dev/api/director/events/${event.id}/directors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
        body: JSON.stringify({ userId: selectedDirectorId, rinkIds: rinkIds || [] }),
      });
      const json = await res.json();
      if (json.success) {
        // Reload directors list
        const dirRes = await fetch(`https://uht.chad-157.workers.dev/api/director/events/${event.id}/directors`, { headers: { 'X-Dev-Bypass': 'true' } });
        const dirJson = await dirRes.json();
        if (dirJson.success) setDirectors(dirJson.data);
        setSelectedDirectorId('');
      }
    } catch (e) { /* ignore */ }
    setAssigningDirector(false);
  };

  const handleUpdateDirectorRinks = async (userId: string, rinkIds: string[]) => {
    if (!event?.id) return;
    try {
      await fetch(`https://uht.chad-157.workers.dev/api/director/events/${event.id}/directors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
        body: JSON.stringify({ userId, rinkIds }),
      });
      // Reload
      const dirRes = await fetch(`https://uht.chad-157.workers.dev/api/director/events/${event.id}/directors`, { headers: { 'X-Dev-Bypass': 'true' } });
      const dirJson = await dirRes.json();
      if (dirJson.success) setDirectors(dirJson.data);
    } catch (e) { /* ignore */ }
  };

  const handleRemoveDirector = async (userId: string) => {
    if (!event?.id) return;
    try {
      await fetch(`https://uht.chad-157.workers.dev/api/director/events/${event.id}/directors/${userId}`, {
        method: 'DELETE',
        headers: { 'X-Dev-Bypass': 'true' }
      });
      setDirectors(prev => prev.filter(d => d.user_id !== userId));
    } catch (e) { /* ignore */ }
  };

  const handleSave = async () => {
    if (!form.name || !form.city || !form.start_date || !form.end_date) return;
    setSaving(true);
    setResult('idle');
    try {
      const body: any = {
        name: form.name,
        city: form.city,
        state: form.state,
        start_date: form.start_date,
        end_date: form.end_date,
        tournament_id: form.tournament_id || null,
        venue_id: form.venue_id || null,
        status: form.status,
        information: form.information || null,
        description: form.description || null,
        price_cents: form.price_cents ? Math.round(parseFloat(form.price_cents) * 100) : null,
        deposit_cents: form.deposit_cents ? Math.round(parseFloat(form.deposit_cents) * 100) : null,
        multi_event_discount_pct: form.multi_event_discount_pct ? parseInt(form.multi_event_discount_pct) : 0,
        slots_count: form.slots_count ? parseInt(form.slots_count) : 100,
        age_groups: form.age_groups.length > 0 ? JSON.stringify(form.age_groups) : null,
        divisions: form.divisions.length > 0 ? JSON.stringify(form.divisions) : null,
        registration_open_date: form.registration_open_date || null,
        registration_deadline: form.registration_deadline || null,
        season: form.season || null,
        timezone: form.timezone || 'Central (CST)',
        rules_url: form.rules_url || null,
        logo_url: form.logo_url || null,
        banner_url: form.banner_url || null,
        hide_availability: form.hide_availability,
        show_participants: form.show_participants,
        is_sold_out: form.is_sold_out,
        sanction_number: form.sanction_number || null,
      };

      const url = isEdit ? `${API_BASE}/admin/update/${event!.id}` : `${API_BASE}/admin/create`;
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      if (json.success) {
        // For create mode, also save venue assignments + division pricing
        if (!isEdit && json.data?.id) {
          const newEventId = json.data.id;
          // Save venues
          if (selectedVenueIds.size > 0) {
            try {
              await fetch(`https://uht.chad-157.workers.dev/api/events/admin/event-venues/${newEventId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
                body: JSON.stringify({
                  venue_ids: Array.from(selectedVenueIds),
                  primary_venue_id: primaryVenueId,
                }),
              });
            } catch (_) {}
          }
          // Save per-division pricing
          if (divisionConfigs.length > 0 && divisionConfigs.some(d => d.price_cents > 0)) {
            try {
              await fetch(`${API_BASE}/admin/${newEventId}/divisions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
                body: JSON.stringify({ divisions: divisionConfigs }),
              });
            } catch (_) {}
          }
        }
        setResult('success');
        onSaved();
        if (!isEdit) {
          // Close modal after creating a new event
          clearPersistedForm();
          setTimeout(() => { onClose(); }, 600);
        } else {
          // Stay open in edit mode — just flash success and reset
          setSaving(false);
          setTimeout(() => setResult('idle'), 2000);
        }
      } else {
        throw new Error(json.error || 'Save failed');
      }
    } catch (e: any) {
      setResult('error');
      setErrorMsg(e.message || 'Failed to save');
      setSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none";
  const labelCls = "block text-sm font-medium text-[#3d3d3d] mb-1";

  const currentYear = new Date().getFullYear();
  const seasonOptions = SEASONS.flatMap(s => [currentYear, currentYear + 1].map(y => `${s}-${y}`));

  const STEP_LABELS = ['Event Info', 'Dates & Pricing', 'Age Groups & Divisions', 'Venues', 'Review & Create'];

  const toggleCreateVenue = (id: string) => {
    setSelectedVenueIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (primaryVenueId === id) setPrimaryVenueId(next.size > 0 ? Array.from(next)[0] : null);
      } else {
        next.add(id);
        if (next.size === 1) setPrimaryVenueId(id);
      }
      return next;
    });
  };

  const canAdvance = () => {
    if (step === 1) return !!(form.name && form.city && form.state);
    if (step === 2) return !!(form.start_date && form.end_date);
    return true;
  };

  // Venue filtering for create stepper
  const formStateNorm = normalizeState(form.state);
  const formStateDisplay = ABBREV_TO_STATE[formStateNorm] || form.state;
  const createStateVenues = venues.filter(v => normalizeState(v.state) === formStateNorm);
  const createOtherVenues = venues.filter(v => normalizeState(v.state) !== formStateNorm);
  let createDisplayVenues = createStateVenues;
  if (showAllVenues || venueSearch) createDisplayVenues = [...createStateVenues, ...createOtherVenues];
  if (venueSearch) {
    const q = venueSearch.toLowerCase();
    createDisplayVenues = createDisplayVenues.filter(v =>
      v.name.toLowerCase().includes(q) || v.city?.toLowerCase().includes(q) || v.state?.toLowerCase().includes(q)
    );
  }
  // Sort: selected first
  createDisplayVenues = [...createDisplayVenues].sort((a, b) => {
    const aS = selectedVenueIds.has(a.id) ? 0 : 1;
    const bS = selectedVenueIds.has(b.id) ? 0 : 1;
    if (aS !== bS) return aS - bS;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div className="bg-white rounded-2xl shadow-lg w-full overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-[#e8e8ed] px-6 py-4 rounded-t-2xl z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button onClick={() => { clearPersistedForm(); onClose(); }} className="flex items-center gap-1.5 text-sm text-[#6e6e73] hover:text-[#1d1d1f] font-medium transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Back to Events
              </button>
              <span className="text-[#d1d1d6]">|</span>
              <h3 className="text-lg font-bold text-[#1d1d1f]">{isEdit ? 'Edit Event' : 'Create Event'}</h3>
            </div>
            {isEdit && event && (
              <span className="text-xs text-[#86868b]">{event.name}</span>
            )}
          </div>

          {isEdit ? (
            /* Edit mode: Tabs */
            <div className="flex gap-1">
              <button onClick={() => setActiveTab('details')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === 'details' ? 'bg-[#003e79] text-white' : 'text-[#86868b] hover:bg-[#fafafa]'}`}>
                Event Details
              </button>
              <button onClick={() => setActiveTab('hotels')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === 'hotels' ? 'bg-[#003e79] text-white' : 'text-[#86868b] hover:bg-[#fafafa]'}`}>
                Hotels ({hotels.length})
              </button>
              <button onClick={() => setActiveTab('venues')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === 'venues' ? 'bg-[#003e79] text-white' : 'text-[#86868b] hover:bg-[#fafafa]'}`}>
                Venues
              </button>
              <button onClick={() => setActiveTab('directors')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === 'directors' ? 'bg-[#003e79] text-white' : 'text-[#86868b] hover:bg-[#fafafa]'}`}>
                Directors ({directors.length})
              </button>
              <button onClick={() => setActiveTab('rules')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === 'rules' ? 'bg-[#003e79] text-white' : 'text-[#86868b] hover:bg-[#fafafa]'}`}>
                Rules ({scheduleRules.length})
              </button>
              <button onClick={() => setActiveTab('scorekeepers')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === 'scorekeepers' ? 'bg-[#003e79] text-white' : 'text-[#86868b] hover:bg-[#fafafa]'}`}>
                Scorekeepers
              </button>
            </div>
          ) : (
            /* Create mode: Stepper */
            <div className="flex items-center gap-1">
              {STEP_LABELS.map((label, i) => {
                const stepNum = i + 1;
                const isActive = step === stepNum;
                const isDone = step > stepNum;
                return (
                  <button key={i} onClick={() => { if (isDone) setStep(stepNum); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      isActive ? 'bg-[#003e79] text-white' :
                      isDone ? 'bg-emerald-100 text-emerald-700 cursor-pointer hover:bg-emerald-200' :
                      'text-[#c8c8cd] cursor-default'
                    }`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isActive ? 'bg-white/20 text-white' :
                      isDone ? 'bg-emerald-600 text-white' :
                      'bg-[#e8e8ed] text-[#c8c8cd]'
                    }`}>
                      {isDone ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      ) : stepNum}
                    </span>
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ===== EDIT MODE: show all details in one tab ===== */}
          {isEdit && activeTab === 'details' && (
            <>
              {/* Event Name + Tournament */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Event Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Chi-Town Showdown 2026" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Tournament Template</label>
                  <select value={form.tournament_id} onChange={e => setForm({ ...form, tournament_id: e.target.value })} className={inputCls}>
                    <option value="">None</option>
                    {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>City *</label>
                  <input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                    placeholder="Chicago" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>State *</label>
                  <select value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} className={inputCls}>
                    {US_STATES.map(s => <option key={s} value={ABBREV_TO_STATE[s] || s}>{ABBREV_TO_STATE[s] || s}</option>)}
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Start Date *</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>End Date *</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Reg. Opens</label>
                  <input type="date" value={form.registration_open_date} onChange={e => setForm({ ...form, registration_open_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Reg. Deadline</label>
                  <input type="date" value={form.registration_deadline} onChange={e => setForm({ ...form, registration_deadline: e.target.value })} className={inputCls} />
                </div>
              </div>

              {/* Status + Pricing */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="registration_open">Registration Open</option>
                    <option value="registration_closed">Registration Closed</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Price ($)</label>
                  <input type="number" step="0.01" value={form.price_cents} onChange={e => setForm({ ...form, price_cents: e.target.value })}
                    placeholder="1795.00" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Deposit ($)</label>
                  <input type="number" step="0.01" value={form.deposit_cents} onChange={e => setForm({ ...form, deposit_cents: e.target.value })}
                    placeholder="350.00" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Multi-Event Discount %</label>
                  <input type="number" min="0" max="100" value={form.multi_event_discount_pct} onChange={e => setForm({ ...form, multi_event_discount_pct: e.target.value })}
                    placeholder="10" className={inputCls} />
                  <p className="text-xs text-[#86868b] mt-1">Discount when team registers for 2+ events</p>
                </div>
                <div>
                  <label className={labelCls}>Max Slots</label>
                  <input type="number" value={form.slots_count} onChange={e => setForm({ ...form, slots_count: e.target.value })}
                    placeholder="100" className={inputCls} />
                </div>
              </div>

              {/* Season + Timezone */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Season</label>
                  <select value={form.season} onChange={e => setForm({ ...form, season: e.target.value })} className={inputCls}>
                    <option value="">Not set</option>
                    {seasonOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Timezone</label>
                  <select value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} className={inputCls}>
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Sanction #</label>
                  <input type="text" value={form.sanction_number} onChange={e => setForm({ ...form, sanction_number: e.target.value })}
                    placeholder="e.g. 2026-IL-0001" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Rules URL</label>
                  <input type="url" value={form.rules_url} onChange={e => setForm({ ...form, rules_url: e.target.value })}
                    placeholder="https://..." className={inputCls} />
                </div>
              </div>

              {/* Logo + Banner Upload */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['logo_url', 'banner_url'] as const).map(field => {
                  const label = field === 'logo_url' ? 'Event Logo' : 'Banner Image';
                  const isUploading = field === 'logo_url' ? uploadingLogo : uploadingBanner;
                  const currentUrl = form[field];
                  return (
                    <div key={field}>
                      <label className={labelCls}>{label}</label>
                      {currentUrl ? (
                        <div className="relative group">
                          <img src={currentUrl} alt={label} className="w-full h-24 object-contain bg-[#f5f5f7] rounded-xl border border-[#e8e8ed]" />
                          <button type="button" onClick={() => setForm({ ...form, [field]: '' })}
                            className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-xs font-bold">
                            X
                          </button>
                        </div>
                      ) : (
                        <label className={`flex flex-col items-center justify-center h-24 rounded-xl border-2 border-dashed cursor-pointer transition ${isUploading ? 'border-[#003e79] bg-[#f0f7ff]' : 'border-[#d2d2d7] hover:border-[#003e79] hover:bg-[#f0f7ff]/50'}`}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageUpload(f, field); }}>
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, field); }} />
                          {isUploading ? (
                            <span className="text-xs text-[#003e79] font-medium flex items-center gap-2">
                              <span className="animate-spin h-4 w-4 border-2 border-[#003e79] border-t-transparent rounded-full" /> Uploading...
                            </span>
                          ) : (
                            <>
                              <svg className="w-6 h-6 text-[#86868b] mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              <span className="text-xs text-[#86868b]">Drop image or click to upload</span>
                            </>
                          )}
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Age Groups */}
              <div>
                <label className="block text-sm font-medium text-[#3d3d3d] mb-2">Age Groups</label>
                <div className="flex flex-wrap gap-2">
                  {STANDARD_AGE_GROUPS.map(ag => (
                    <button key={ag} type="button" onClick={() => toggleArrayItem('age_groups', ag)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        form.age_groups.includes(ag) ? 'bg-[#003e79] text-white' : 'bg-[#fafafa] text-[#6e6e73] hover:bg-[#e8e8ed]'
                      }`}>{ag}</button>
                  ))}
                </div>
              </div>

              {/* Divisions */}
              <div>
                <label className="block text-sm font-medium text-[#3d3d3d] mb-2">Divisions</label>
                <div className="flex flex-wrap gap-2">
                  {STANDARD_DIVISIONS.map(d => (
                    <button key={d} type="button" onClick={() => toggleArrayItem('divisions', d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        form.divisions.includes(d) ? 'bg-[#003e79] text-white' : 'bg-[#fafafa] text-[#6e6e73] hover:bg-[#e8e8ed]'
                      }`}>{d}</button>
                  ))}
                </div>
              </div>

              {/* Division Pricing Grid */}
              {divisionConfigs.length > 0 && (
                <div className="bg-[#f8f9fa] rounded-xl p-4 border border-[#e8e8ed]">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-[#3d3d3d]">Division Pricing</label>
                    {isEdit && (
                      <button onClick={saveDivisions} disabled={savingDivisions}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          divisionSaveStatus === 'saved' ? 'bg-emerald-100 text-emerald-700' :
                          divisionSaveStatus === 'error' ? 'bg-red-100 text-red-700' :
                          'bg-[#003e79] text-white hover:bg-[#002d5a]'
                        } disabled:opacity-50`}>
                        {savingDivisions ? 'Saving...' : divisionSaveStatus === 'saved' ? 'Saved!' : divisionSaveStatus === 'error' ? 'Error' : 'Save Divisions'}
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_80px_90px_80px] gap-2 text-xs font-semibold text-[#86868b] px-1">
                      <span>Age Group</span>
                      <span>Price ($)</span>
                      <span>Period (min)</span>
                      <span>Registered</span>
                    </div>
                    {divisionConfigs.map((div, idx) => (
                      <div key={div.age_group + idx} className="grid grid-cols-[1fr_80px_90px_80px] gap-2 items-center bg-white rounded-lg p-2 border border-[#e8e8ed]">
                        <span className="text-sm font-semibold text-[#1d1d1f]">{div.age_group}</span>
                        <input type="number" step="1" min="0"
                          value={div.price_cents ? (div.price_cents / 100).toFixed(0) : ''}
                          onChange={e => {
                            const val = e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0;
                            setDivisionConfigs(prev => prev.map((d, i) => i === idx ? { ...d, price_cents: val } : d));
                          }}
                          placeholder="0"
                          className="w-full px-2 py-1.5 rounded-lg border border-[#e8e8ed] text-sm text-center focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none" />
                        <input type="number" step="1" min="1" max="30"
                          value={div.period_length_minutes ?? ''}
                          onChange={e => {
                            const val = e.target.value ? parseInt(e.target.value) : null;
                            setDivisionConfigs(prev => prev.map((d, i) => i === idx ? { ...d, period_length_minutes: val } : d));
                          }}
                          placeholder="12"
                          className="w-full px-2 py-1.5 rounded-lg border border-[#e8e8ed] text-sm text-center focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none" />
                        <span className="text-sm text-center text-[#86868b]">{div.registered_count || 0}</span>
                      </div>
                    ))}
                  </div>
                  {!isEdit && (
                    <p className="text-xs text-[#86868b] mt-2">Division pricing will be saved after creating the event.</p>
                  )}
                </div>
              )}

              {/* Toggle Options */}
              <div className="flex flex-wrap gap-4 py-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.show_participants === 1} onChange={e => setForm({ ...form, show_participants: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded border-[#e8e8ed] text-[#003e79] focus:ring-[#003e79]/20" />
                  <span className="text-sm text-[#3d3d3d]">Show Participants</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.hide_availability === 1} onChange={e => setForm({ ...form, hide_availability: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded border-[#e8e8ed] text-[#003e79] focus:ring-[#003e79]/20" />
                  <span className="text-sm text-[#3d3d3d]">Hide Availability</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_sold_out === 1} onChange={e => setForm({ ...form, is_sold_out: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded border-[#e8e8ed] text-[#003e79] focus:ring-[#003e79]/20" />
                  <span className="text-sm text-[#3d3d3d]">Sold Out</span>
                </label>
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-[#3d3d3d]">Description (marketing copy)</label>
                  <button type="button" onClick={generateAIDescription} disabled={generatingDesc || !form.name}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 disabled:opacity-50 disabled:cursor-not-allowed">
                    {generatingDesc ? (
                      <><span className="animate-spin h-3 w-3 border-2 border-purple-500 border-t-transparent rounded-full" /> Generating...</>
                    ) : (
                      <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> AI Generate</>
                    )}
                  </button>
                </div>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} placeholder="Longer description for event page..."
                  className={inputCls + ' resize-none'} />
              </div>

              {/* Information */}
              <div>
                <label className={labelCls}>Event Information (shown to registrants)</label>
                <textarea value={form.information} onChange={e => setForm({ ...form, information: e.target.value })}
                  rows={3} placeholder="e.g. Mite-Midget: AA, A, B, C, D, House. 4 game guarantee!"
                  className={inputCls + ' resize-none'} />
              </div>
            </>
          )}

          {activeTab === 'directors' && (
            <>
              {/* Assigned Directors for this Event */}
              <div>
                <p className="text-sm font-semibold text-[#1d1d1f] mb-2">Event Directors ({directors.length})</p>
                {loadingDirectors ? (
                  <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" /></div>
                ) : directors.length > 0 ? (
                  <div className="space-y-3 mb-4">
                    {directors.map((d: any) => (
                      <div key={d.user_id} className="bg-white rounded-xl p-4 border border-[#e8e8ed] shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#e0efff] flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 text-[#003e79]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#1d1d1f]">{d.name || d.email}</p>
                            {d.email && <p className="text-xs text-[#86868b]">{d.email}</p>}
                          </div>
                          <button onClick={() => handleRemoveDirector(d.user_id)} className="p-1.5 hover:bg-red-50 rounded-lg transition text-red-400 hover:text-red-600 shrink-0" title="Remove director">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                        {/* Rink assignments */}
                        {venueRinks.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-[#f0f0f0]">
                            <p className="text-[10px] text-[#86868b] uppercase tracking-widest font-semibold mb-2">Assigned Rinks</p>
                            <div className="flex flex-wrap gap-2">
                              {venueRinks.map(rink => {
                                const isAssigned = d.rinks?.some((r: any) => r.id === rink.id);
                                const allRinks = !d.rinks || d.rinks.length === 0; // NULL rink_id = all rinks
                                return (
                                  <button
                                    key={rink.id}
                                    onClick={() => {
                                      const currentRinkIds: string[] = d.rinks?.map((r: any) => r.id) || [];
                                      let newRinkIds: string[];
                                      if (allRinks) {
                                        // Currently "all rinks" → switch to just this rink
                                        newRinkIds = [rink.id];
                                      } else if (isAssigned) {
                                        newRinkIds = currentRinkIds.filter(id => id !== rink.id);
                                      } else {
                                        newRinkIds = [...currentRinkIds, rink.id];
                                      }
                                      handleUpdateDirectorRinks(d.user_id, newRinkIds);
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                                      allRinks || isAssigned
                                        ? 'bg-[#f0f7ff] border-[#c0d8f0] text-[#003e79]'
                                        : 'bg-white border-[#e8e8ed] text-[#86868b] hover:border-[#c0d8f0]'
                                    }`}
                                  >
                                    {rink.name}
                                    {(allRinks || isAssigned) && ' ✓'}
                                  </button>
                                );
                              })}
                            </div>
                            {(!d.rinks || d.rinks.length === 0) && (
                              <p className="text-[10px] text-[#003e79] mt-1 italic">Covering all rinks. Click a rink to assign specific ones.</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#f5f5f7] rounded-xl p-5 text-center text-sm border border-dashed border-[#e8e8ed] mb-4">
                    <p className="text-[#86868b]">No directors assigned to this event yet</p>
                  </div>
                )}
              </div>

              {/* Add Director */}
              <div>
                <p className="text-sm font-semibold text-[#1d1d1f] mb-2">Assign Director</p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-[#3d3d3d] mb-1">Select Director</label>
                    {loadingDirectorOptions ? (
                      <div className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl bg-[#fafafa] text-sm text-[#86868b]">Loading...</div>
                    ) : (
                      <select value={selectedDirectorId} onChange={e => setSelectedDirectorId(e.target.value)} className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none">
                        <option value="">-- Choose a director --</option>
                        {directorOptions.map(d => (
                          <option key={d.id} value={d.id}>{d.name || d.email}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <button onClick={() => handleAssignDirector()} disabled={!selectedDirectorId || assigningDirector || loadingDirectorOptions}
                    className="px-4 py-2 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition disabled:opacity-50 disabled:cursor-not-allowed">
                    {assigningDirector ? 'Adding...' : 'Add Director'}
                  </button>
                </div>
                <p className="text-xs text-[#86868b] mt-2">Directors are added to all rinks by default. You can assign specific rinks after adding.</p>
              </div>
            </>
          )}

          {activeTab === 'venues' && (
            <>
              {loadingVenuesTab ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" /></div>
              ) : (
                <div className="space-y-4">
                  {/* Header + Save */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#1d1d1f]">
                        {assignedVenueIds.size === 0 ? 'No venues assigned' : `${assignedVenueIds.size} venue${assignedVenueIds.size > 1 ? 's' : ''} assigned`}
                      </p>
                      <p className="text-xs text-[#86868b]">Select venues for this event. Expand to see and manage rinks.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {venuesDirty && <span className="text-xs text-amber-600 font-medium">Unsaved</span>}
                      <button onClick={async () => {
                        setSavingVenues(true);
                        setVenuesSaveStatus('idle');
                        try {
                          const res = await fetch(`https://uht.chad-157.workers.dev/api/events/admin/event-venues/${event!.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
                            body: JSON.stringify({ venue_ids: Array.from(assignedVenueIds), primary_venue_id: primaryVenueIdTab }),
                          });
                          const json = await res.json() as any;
                          if (json.success) {
                            setVenuesSaveStatus('saved');
                            setVenuesDirty(false);
                            setTimeout(() => setVenuesSaveStatus('idle'), 2000);
                          } else { setVenuesSaveStatus('error'); }
                        } catch { setVenuesSaveStatus('error'); }
                        setSavingVenues(false);
                      }} disabled={savingVenues || !venuesDirty}
                        className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition ${
                          venuesSaveStatus === 'saved' ? 'bg-emerald-100 text-emerald-700' :
                          venuesSaveStatus === 'error' ? 'bg-red-100 text-red-700' :
                          venuesDirty ? 'bg-[#003e79] text-white hover:bg-[#002d5a]' :
                          'bg-[#e8e8ed] text-[#86868b] cursor-not-allowed'
                        }`}>
                        {savingVenues ? 'Saving...' : venuesSaveStatus === 'saved' ? 'Saved!' : venuesSaveStatus === 'error' ? 'Error' : 'Save Venues'}
                      </button>
                    </div>
                  </div>

                  {/* Assigned venues at top */}
                  {assignedVenueIds.size > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Array.from(assignedVenueIds).map(vid => {
                        const v = allVenuesList.find((x: any) => x.id === vid);
                        if (!v) return null;
                        const isPrimary = primaryVenueIdTab === vid;
                        const rinks = eventRinksMap[vid] || [];
                        return (
                          <div key={vid} className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 ${isPrimary ? 'border-[#003e79] bg-[#f0f7ff]' : 'border-[#e8e8ed] bg-[#fafafa]'}`}>
                            <span className="text-sm font-semibold text-[#1d1d1f]">{v.name}</span>
                            <span className="text-xs text-[#86868b]">{rinks.length} rink{rinks.length !== 1 ? 's' : ''}</span>
                            {isPrimary ? (
                              <span className="text-[10px] px-2 py-0.5 bg-[#003e79] text-white rounded-full font-bold">PRIMARY</span>
                            ) : (
                              <button onClick={() => { setPrimaryVenueIdTab(vid); setVenuesDirty(true); }}
                                className="text-[10px] px-2 py-0.5 bg-[#f5f5f7] text-[#86868b] hover:bg-[#e0efff] hover:text-[#003e79] rounded-full font-semibold transition">
                                Make Primary
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* City filter pills */}
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setVenueCityFilter(null)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition ${!venueCityFilter ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#86868b] hover:bg-[#e8e8ed]'}`}>
                      All ({allVenuesList.length})
                    </button>
                    {venueCities.map((city: any) => {
                      const count = allVenuesList.filter((v: any) => v.city_id === city.id).length;
                      return (
                        <button key={city.id} onClick={() => setVenueCityFilter(venueCityFilter === city.id ? null : city.id)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold transition ${venueCityFilter === city.id ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#86868b] hover:bg-[#e8e8ed]'}`}>
                          {city.name} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input type="search" value={venueSearchTab} onChange={e => setVenueSearchTab(e.target.value)}
                      placeholder="Search venues..." className="w-full pl-9 pr-4 py-2 rounded-xl text-sm bg-[#f5f5f7] border-none focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                  </div>

                  {/* Venue list */}
                  <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                    {(() => {
                      let venues = [...allVenuesList];
                      if (venueCityFilter) {
                        venues = venues.filter((v: any) => v.city_id === venueCityFilter);
                      }
                      if (venueSearchTab) {
                        const q = venueSearchTab.toLowerCase();
                        venues = venues.filter((v: any) => v.name.toLowerCase().includes(q) || v.city?.toLowerCase().includes(q) || v.state?.toLowerCase().includes(q));
                      }
                      // Sort: assigned first
                      venues.sort((a: any, b: any) => {
                        const aA = assignedVenueIds.has(a.id) ? 0 : 1;
                        const bA = assignedVenueIds.has(b.id) ? 0 : 1;
                        if (aA !== bA) return aA - bA;
                        return a.name.localeCompare(b.name);
                      });
                      return venues.map((v: any) => {
                        const isAssigned = assignedVenueIds.has(v.id);
                        const isExpanded = expandedVenueId === v.id;
                        const rinks = eventRinksMap[v.id] || [];
                        const isAddingRink = addingRinkToVenue === v.id;
                        return (
                          <div key={v.id} className={`rounded-xl border-2 transition ${isAssigned ? 'border-[#003e79] bg-[#f0f7ff]/30' : 'border-[#e8e8ed] hover:border-[#c8c8cd]'}`}>
                            {/* Venue row */}
                            <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => {
                              const next = new Set(assignedVenueIds);
                              if (next.has(v.id)) {
                                next.delete(v.id);
                                if (primaryVenueIdTab === v.id) setPrimaryVenueIdTab(next.size > 0 ? Array.from(next)[0] : null);
                              } else {
                                next.add(v.id);
                                if (next.size === 1) setPrimaryVenueIdTab(v.id);
                                // Load rinks if not loaded
                                if (!eventRinksMap[v.id]) {
                                  fetch(`https://uht.chad-157.workers.dev/api/venues/${v.id}/rinks`).then(r => r.json()).then(json => {
                                    if (json.success) setEventRinksMap(prev => ({ ...prev, [v.id]: json.data || [] }));
                                  }).catch(() => {});
                                }
                              }
                              setAssignedVenueIds(next);
                              setVenuesDirty(true);
                              setVenuesSaveStatus('idle');
                            }}>
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${isAssigned ? 'bg-[#003e79] border-[#003e79]' : 'border-[#c8c8cd] bg-white'}`}>
                                {isAssigned && (
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                )}
                              </div>
                              <div className="w-7 h-7 rounded-lg bg-[#003e79] text-white flex items-center justify-center text-xs font-bold shrink-0">
                                {v.rink_count || v.num_rinks || 0}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-[#1d1d1f] truncate">{v.name}</p>
                                <p className="text-xs text-[#86868b]">{v.city}, {v.state}</p>
                              </div>
                              {isAssigned && primaryVenueIdTab === v.id && (
                                <span className="text-[10px] px-2 py-0.5 bg-[#003e79] text-white rounded-full font-bold shrink-0">PRIMARY</span>
                              )}
                              {isAssigned && (
                                <button onClick={(e) => { e.stopPropagation(); setExpandedVenueId(isExpanded ? null : v.id);
                                  if (!isExpanded && !eventRinksMap[v.id]) {
                                    fetch(`https://uht.chad-157.workers.dev/api/venues/${v.id}/rinks`).then(r => r.json()).then(json => {
                                      if (json.success) setEventRinksMap(prev => ({ ...prev, [v.id]: json.data || [] }));
                                    }).catch(() => {});
                                  }
                                }} className="p-1 hover:bg-[#f5f5f7] rounded-lg transition text-[#86868b] shrink-0">
                                  <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                              )}
                            </div>

                            {/* Expanded rinks section */}
                            {isAssigned && isExpanded && (
                              <div className="px-3 pb-3 pt-0 border-t border-[#e8e8ed]">
                                <div className="pt-3 flex items-center justify-between mb-2">
                                  <p className="text-xs text-[#86868b] uppercase tracking-widest font-semibold">Rinks ({rinks.length})</p>
                                  <button onClick={() => { setAddingRinkToVenue(isAddingRink ? null : v.id); setNewRinkName(''); setNewRinkSize(''); }}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${isAddingRink ? 'bg-[#e8e8ed] text-[#86868b]' : 'bg-[#003e79] text-white hover:bg-[#002d5a]'}`}>
                                    {isAddingRink ? 'Cancel' : '+ Add Rink'}
                                  </button>
                                </div>

                                {/* Add rink inline form */}
                                {isAddingRink && (
                                  <div className="mb-3 p-3 bg-[#f0f7ff]/50 rounded-lg border border-[#e0efff]">
                                    <div className="flex gap-2 items-end">
                                      <div className="flex-1">
                                        <label className="block text-[11px] font-medium text-[#3d3d3d] mb-1">Rink Name *</label>
                                        <input type="text" value={newRinkName} onChange={e => setNewRinkName(e.target.value)}
                                          placeholder="e.g. Rink D" className="w-full px-2.5 py-1.5 border border-[#e8e8ed] rounded-lg text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none" />
                                      </div>
                                      <div className="w-28">
                                        <label className="block text-[11px] font-medium text-[#3d3d3d] mb-1">Size</label>
                                        <select value={newRinkSize} onChange={e => setNewRinkSize(e.target.value)}
                                          className="w-full px-2.5 py-1.5 border border-[#e8e8ed] rounded-lg text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none">
                                          <option value="">--</option>
                                          <option value="full">Full</option>
                                          <option value="olympic">Olympic</option>
                                          <option value="half">Half</option>
                                        </select>
                                      </div>
                                      <button onClick={async () => {
                                        if (!newRinkName.trim()) return;
                                        setSavingRink(true);
                                        try {
                                          const res = await fetch(`https://uht.chad-157.workers.dev/api/venues/${v.id}/rinks`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
                                            body: JSON.stringify({ name: newRinkName.trim(), surface_size: newRinkSize || undefined }),
                                          });
                                          const json = await res.json() as any;
                                          if (json.success) {
                                            setEventRinksMap(prev => ({ ...prev, [v.id]: [...(prev[v.id] || []), json.data] }));
                                            setNewRinkName(''); setNewRinkSize(''); setAddingRinkToVenue(null);
                                            if (event?.venue_id === v.id) setVenueRinks(prev => [...prev, json.data]);
                                          }
                                        } catch (_) {}
                                        setSavingRink(false);
                                      }} disabled={!newRinkName.trim() || savingRink}
                                        className="px-3 py-1.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-lg text-sm transition disabled:opacity-50 whitespace-nowrap">
                                        {savingRink ? '...' : 'Add'}
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {rinks.length === 0 ? (
                                  <p className="text-sm text-[#86868b] text-center py-2">No rinks. Add one above.</p>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2">
                                    {rinks.map((rink: any) => (
                                      <div key={rink.id} className="flex items-center justify-between border border-[#e8e8ed] rounded-lg px-2.5 py-2 bg-white">
                                        <div>
                                          <p className="font-semibold text-xs text-[#1d1d1f]">{rink.name}</p>
                                          {rink.surface_size && <p className="text-[10px] text-[#86868b] capitalize">{rink.surface_size}</p>}
                                        </div>
                                        <button onClick={async () => {
                                          if (!confirm(`Remove ${rink.name}?`)) return;
                                          try {
                                            await fetch(`https://uht.chad-157.workers.dev/api/venues/${v.id}/rinks/${rink.id}`, { method: 'DELETE', headers: { 'X-Dev-Bypass': 'true' } });
                                            setEventRinksMap(prev => ({ ...prev, [v.id]: (prev[v.id] || []).filter((r: any) => r.id !== rink.id) }));
                                            if (event?.venue_id === v.id) setVenueRinks(prev => prev.filter(r => r.id !== rink.id));
                                          } catch (_) {}
                                        }} className="p-1 hover:bg-red-50 rounded text-[#c8c8cd] hover:text-red-500 transition" title="Remove rink">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'rules' && (
            <>
              {loadingRules ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" /></div>
              ) : (
                <div className="space-y-5">
                  {/* Save button */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#1d1d1f]">Schedule Rules ({scheduleRules.length})</p>
                      <p className="text-xs text-[#86868b]">Configure rules before generating the schedule. These control matchups, time slots, and rink assignments.</p>
                    </div>
                    <button onClick={async () => {
                      setSavingRules(true);
                      setRulesSaveStatus('idle');
                      try {
                        // Save rules
                        const res = await fetch(`https://uht.chad-157.workers.dev/api/scheduling/events/${event!.id}/rules`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
                          body: JSON.stringify({ rules: scheduleRules }),
                        });
                        // Save MHR ratings
                        const ratingsToSave = teamRatings.filter(t => t.mhr_rating !== null).map(t => ({ registration_id: t.registration_id, mhr_rating: t.mhr_rating }));
                        if (ratingsToSave.length > 0) {
                          await fetch(`https://uht.chad-157.workers.dev/api/scheduling/events/${event!.id}/team-ratings`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
                            body: JSON.stringify({ ratings: ratingsToSave }),
                          });
                        }
                        const json = await res.json() as any;
                        if (json.success) {
                          setRulesSaveStatus('saved');
                          setTimeout(() => setRulesSaveStatus('idle'), 2000);
                        } else setRulesSaveStatus('error');
                      } catch { setRulesSaveStatus('error'); }
                      setSavingRules(false);
                    }} disabled={savingRules}
                      className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition ${
                        rulesSaveStatus === 'saved' ? 'bg-emerald-100 text-emerald-700' :
                        rulesSaveStatus === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-[#003e79] text-white hover:bg-[#002d5a]'
                      }`}>
                      {savingRules ? 'Saving...' : rulesSaveStatus === 'saved' ? 'Saved!' : rulesSaveStatus === 'error' ? 'Error' : 'Save All Rules'}
                    </button>
                  </div>

                  {/* 1. MHR Matchup Limits */}
                  <div className="bg-white rounded-xl border border-[#e8e8ed] shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#1d1d1f]">MHR Matchup Limits</p>
                        <p className="text-xs text-[#86868b]">Prevent mismatched games based on USA Hockey MHR ratings</p>
                      </div>
                    </div>
                    {(() => {
                      const mhrRule = scheduleRules.find(r => r.ruleType === 'mhr_matchup_limit');
                      const spread = mhrRule ? JSON.parse(mhrRule.ruleValue).max_spread : '';
                      return (
                        <div className="flex gap-3 items-center">
                          <label className="text-xs font-medium text-[#3d3d3d] whitespace-nowrap">Max MHR spread between opponents:</label>
                          <input type="number" value={spread} onChange={e => {
                            const val = e.target.value;
                            setScheduleRules(prev => {
                              const filtered = prev.filter(r => r.ruleType !== 'mhr_matchup_limit');
                              if (val && parseInt(val) > 0) {
                                filtered.push({ ruleType: 'mhr_matchup_limit', ruleValue: JSON.stringify({ max_spread: parseInt(val) }), priority: 10 });
                              }
                              return filtered;
                            });
                          }} placeholder="e.g. 30" className="w-24 px-3 py-1.5 border border-[#e8e8ed] rounded-lg text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none" />
                          <span className="text-xs text-[#86868b]">Teams with MHR difference greater than this won&apos;t be placed in the same pool</span>
                        </div>
                      );
                    })()}

                    {/* Team MHR ratings */}
                    {teamRatings.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-[#f0f0f0]">
                        <p className="text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">Team MHR Ratings ({teamRatings.filter(t => t.mhr_rating).length}/{teamRatings.length} set)</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                          {teamRatings.map(t => (
                            <div key={t.registration_id} className="flex items-center gap-2 px-2.5 py-1.5 bg-[#fafafa] rounded-lg">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-[#1d1d1f] truncate">{t.team_name}</p>
                                <p className="text-[10px] text-[#86868b]">{t.age_group}{t.division_level ? ` ${t.division_level}` : ''}</p>
                              </div>
                              <input type="number" value={t.mhr_rating ?? ''} onChange={e => {
                                const val = e.target.value ? parseInt(e.target.value) : null;
                                setTeamRatings(prev => prev.map(tr => tr.registration_id === t.registration_id ? { ...tr, mhr_rating: val } : tr));
                              }} placeholder="MHR" className="w-16 px-2 py-1 border border-[#e8e8ed] rounded-lg text-xs text-center focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-[#86868b] mt-2 italic">MHR ratings are pulled from USA Hockey. Enter manually if not yet imported.</p>
                      </div>
                    )}
                  </div>

                  {/* 2. Team Time Restrictions */}
                  <div className="bg-white rounded-xl border border-[#e8e8ed] shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#1d1d1f]">Team Time Restrictions</p>
                          <p className="text-xs text-[#86868b]">Set earliest start or latest end times for specific teams (e.g. flight schedules)</p>
                        </div>
                      </div>
                      <button onClick={() => {
                        setScheduleRules(prev => [...prev, {
                          ruleType: 'team_time_restriction',
                          ruleValue: JSON.stringify({ team_id: '', restriction: 'earliest_start', day: '', time: '' }),
                          priority: 5,
                        }]);
                      }} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition">
                        + Add Restriction
                      </button>
                    </div>
                    {scheduleRules.filter(r => r.ruleType === 'team_time_restriction').length === 0 ? (
                      <p className="text-xs text-[#86868b] text-center py-3">No team time restrictions set. Click &quot;+ Add Restriction&quot; to add one.</p>
                    ) : (
                      <div className="space-y-2">
                        {scheduleRules.map((rule, idx) => {
                          if (rule.ruleType !== 'team_time_restriction') return null;
                          const data = JSON.parse(rule.ruleValue);
                          return (
                            <div key={idx} className="flex gap-2 items-center bg-[#fafafa] rounded-lg p-2.5">
                              <select value={data.team_id} onChange={e => {
                                const updated = { ...data, team_id: e.target.value };
                                setScheduleRules(prev => prev.map((r, i) => i === idx ? { ...r, ruleValue: JSON.stringify(updated) } : r));
                              }} className="flex-1 px-2 py-1.5 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none">
                                <option value="">-- Select Team --</option>
                                {teamRatings.map(t => (
                                  <option key={t.team_id} value={t.team_id}>{t.team_name} ({t.age_group})</option>
                                ))}
                              </select>
                              <select value={data.restriction} onChange={e => {
                                const updated = { ...data, restriction: e.target.value };
                                setScheduleRules(prev => prev.map((r, i) => i === idx ? { ...r, ruleValue: JSON.stringify(updated) } : r));
                              }} className="w-36 px-2 py-1.5 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none">
                                <option value="earliest_start">Earliest Start</option>
                                <option value="latest_end">Latest End</option>
                              </select>
                              <input type="date" value={data.day} onChange={e => {
                                const updated = { ...data, day: e.target.value };
                                setScheduleRules(prev => prev.map((r, i) => i === idx ? { ...r, ruleValue: JSON.stringify(updated) } : r));
                              }} className="w-36 px-2 py-1.5 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                              <input type="time" value={data.time} onChange={e => {
                                const updated = { ...data, time: e.target.value };
                                setScheduleRules(prev => prev.map((r, i) => i === idx ? { ...r, ruleValue: JSON.stringify(updated) } : r));
                              }} className="w-28 px-2 py-1.5 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                              <button onClick={() => setScheduleRules(prev => prev.filter((_, i) => i !== idx))}
                                className="p-1 hover:bg-red-50 rounded text-[#c8c8cd] hover:text-red-500 transition shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 3. Age Group → Rink Mapping */}
                  <div className="bg-white rounded-xl border border-[#e8e8ed] shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#e0efff] flex items-center justify-center">
                          <svg className="w-4 h-4 text-[#003e79]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#1d1d1f]">Age Group → Rink Mapping</p>
                          <p className="text-xs text-[#86868b]">Assign specific age groups to preferred rinks</p>
                        </div>
                      </div>
                      <button onClick={() => {
                        setScheduleRules(prev => [...prev, {
                          ruleType: 'age_group_rinks',
                          ruleValue: JSON.stringify({ ageGroup: '', rinkIds: [] }),
                          priority: 3,
                        }]);
                      }} className="px-3 py-1.5 bg-[#003e79] text-white rounded-lg text-xs font-semibold hover:bg-[#002d5a] transition">
                        + Add Mapping
                      </button>
                    </div>
                    {rulesVenueRinks.length === 0 ? (
                      <p className="text-xs text-[#86868b] text-center py-3">Assign a venue with rinks first to configure rink mappings.</p>
                    ) : scheduleRules.filter(r => r.ruleType === 'age_group_rinks').length === 0 ? (
                      <p className="text-xs text-[#86868b] text-center py-3">No age group → rink mappings. Any age group can play on any rink.</p>
                    ) : (
                      <div className="space-y-2">
                        {scheduleRules.map((rule, idx) => {
                          if (rule.ruleType !== 'age_group_rinks') return null;
                          const data = JSON.parse(rule.ruleValue);
                          const ageGroups = form.age_groups.length > 0 ? form.age_groups : ['8U','10U','12U','14U','16U','18U'];
                          return (
                            <div key={idx} className="flex gap-2 items-start bg-[#fafafa] rounded-lg p-2.5">
                              <select value={data.ageGroup} onChange={e => {
                                const updated = { ...data, ageGroup: e.target.value };
                                setScheduleRules(prev => prev.map((r, i) => i === idx ? { ...r, ruleValue: JSON.stringify(updated) } : r));
                              }} className="w-24 px-2 py-1.5 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none">
                                <option value="">Age</option>
                                {ageGroups.map((ag: string) => <option key={ag} value={ag}>{ag}</option>)}
                              </select>
                              <div className="flex-1">
                                <div className="flex flex-wrap gap-1.5">
                                  {rulesVenueRinks.map((rink: any) => {
                                    const isSelected = (data.rinkIds || []).includes(rink.id);
                                    return (
                                      <button key={rink.id} onClick={() => {
                                        const newIds = isSelected ? data.rinkIds.filter((id: string) => id !== rink.id) : [...(data.rinkIds || []), rink.id];
                                        const updated = { ...data, rinkIds: newIds };
                                        setScheduleRules(prev => prev.map((r, i) => i === idx ? { ...r, ruleValue: JSON.stringify(updated) } : r));
                                      }} className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                                        isSelected ? 'bg-[#f0f7ff] border-[#99b5d6] text-[#003e79]' : 'bg-white border-[#e8e8ed] text-[#86868b] hover:border-[#c0d8f0]'
                                      }`}>
                                        {rink.name} {isSelected && '✓'}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <button onClick={() => setScheduleRules(prev => prev.filter((_, i) => i !== idx))}
                                className="p-1 hover:bg-red-50 rounded text-[#c8c8cd] hover:text-red-500 transition shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 4. Rink Availability Windows */}
                  <div className="bg-white rounded-xl border border-[#e8e8ed] shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#1d1d1f]">Rink Availability Windows</p>
                          <p className="text-xs text-[#86868b]">Set when each rink is available or block off times (e.g. public skate, Zamboni)</p>
                        </div>
                      </div>
                      <button onClick={() => {
                        setScheduleRules(prev => [...prev, {
                          ruleType: 'rink_blocked_times',
                          ruleValue: JSON.stringify({ rinkId: '', blocked: [{ start: '12:00', end: '13:00', date: '' }] }),
                          priority: 8,
                        }]);
                      }} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition">
                        + Block Time
                      </button>
                    </div>
                    {rulesVenueRinks.length === 0 ? (
                      <p className="text-xs text-[#86868b] text-center py-3">Assign a venue with rinks first to configure availability.</p>
                    ) : (
                      <div className="space-y-3">
                        {/* Per-rink first/last game times */}
                        <div>
                          <p className="text-[10px] text-[#86868b] uppercase tracking-widest font-semibold mb-2">First / Last Game Time per Rink</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {rulesVenueRinks.map((rink: any) => {
                              const firstRule = scheduleRules.find(r => r.ruleType === 'rink_first_game' && JSON.parse(r.ruleValue).rinkId === rink.id);
                              const lastRule = scheduleRules.find(r => r.ruleType === 'rink_last_game' && JSON.parse(r.ruleValue).rinkId === rink.id);
                              const firstTime = firstRule ? JSON.parse(firstRule.ruleValue).time : '';
                              const lastTime = lastRule ? JSON.parse(lastRule.ruleValue).time : '';
                              return (
                                <div key={rink.id} className="flex items-center gap-2 bg-[#fafafa] rounded-lg p-2">
                                  <span className="text-xs font-semibold text-[#1d1d1f] w-20 shrink-0">{rink.name}</span>
                                  <input type="time" value={firstTime} onChange={e => {
                                    setScheduleRules(prev => {
                                      const filtered = prev.filter(r => !(r.ruleType === 'rink_first_game' && JSON.parse(r.ruleValue).rinkId === rink.id));
                                      if (e.target.value) filtered.push({ ruleType: 'rink_first_game', ruleValue: JSON.stringify({ rinkId: rink.id, time: e.target.value }), priority: 8 });
                                      return filtered;
                                    });
                                  }} className="w-24 px-2 py-1 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none" title="First game" />
                                  <span className="text-[10px] text-[#86868b]">to</span>
                                  <input type="time" value={lastTime} onChange={e => {
                                    setScheduleRules(prev => {
                                      const filtered = prev.filter(r => !(r.ruleType === 'rink_last_game' && JSON.parse(r.ruleValue).rinkId === rink.id));
                                      if (e.target.value) filtered.push({ ruleType: 'rink_last_game', ruleValue: JSON.stringify({ rinkId: rink.id, time: e.target.value }), priority: 8 });
                                      return filtered;
                                    });
                                  }} className="w-24 px-2 py-1 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none" title="Last game" />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Blocked time slots */}
                        {scheduleRules.filter(r => r.ruleType === 'rink_blocked_times').length > 0 && (
                          <div>
                            <p className="text-[10px] text-[#86868b] uppercase tracking-widest font-semibold mb-2">Blocked Time Slots</p>
                            <div className="space-y-2">
                              {scheduleRules.map((rule, idx) => {
                                if (rule.ruleType !== 'rink_blocked_times') return null;
                                const data = JSON.parse(rule.ruleValue);
                                const blocked = data.blocked?.[0] || { start: '', end: '' };
                                return (
                                  <div key={idx} className="flex gap-2 items-center bg-[#fafafa] rounded-lg p-2.5">
                                    <select value={data.rinkId} onChange={e => {
                                      const updated = { ...data, rinkId: e.target.value };
                                      setScheduleRules(prev => prev.map((r, i) => i === idx ? { ...r, ruleValue: JSON.stringify(updated) } : r));
                                    }} className="w-28 px-2 py-1.5 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none">
                                      <option value="">Rink</option>
                                      {rulesVenueRinks.map((rk: any) => <option key={rk.id} value={rk.id}>{rk.name}</option>)}
                                    </select>
                                    <input type="date" value={blocked.date || ''} onChange={e => {
                                      const updated = { ...data, blocked: [{ ...blocked, date: e.target.value || null }] };
                                      setScheduleRules(prev => prev.map((r, i) => i === idx ? { ...r, ruleValue: JSON.stringify(updated) } : r));
                                    }} className="w-36 px-2 py-1.5 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none" title="Date (blank = all days)" />
                                    <input type="time" value={blocked.start} onChange={e => {
                                      const updated = { ...data, blocked: [{ ...blocked, start: e.target.value }] };
                                      setScheduleRules(prev => prev.map((r, i) => i === idx ? { ...r, ruleValue: JSON.stringify(updated) } : r));
                                    }} className="w-24 px-2 py-1.5 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                                    <span className="text-xs text-[#86868b]">to</span>
                                    <input type="time" value={blocked.end} onChange={e => {
                                      const updated = { ...data, blocked: [{ ...blocked, end: e.target.value }] };
                                      setScheduleRules(prev => prev.map((r, i) => i === idx ? { ...r, ruleValue: JSON.stringify(updated) } : r));
                                    }} className="w-24 px-2 py-1.5 border border-[#e8e8ed] rounded-lg text-xs focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                                    <button onClick={() => setScheduleRules(prev => prev.filter((_, i) => i !== idx))}
                                      className="p-1 hover:bg-red-50 rounded text-[#c8c8cd] hover:text-red-500 transition shrink-0">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              )}
            </>
          )}

          {activeTab === 'hotels' && (
            <>
              {/* Hotel Notification Banner */}
              <HotelNotificationBanner eventId={event?.id || ''} />

              {/* Linked Hotels for this Event */}
              <div>
                <p className="text-sm font-semibold text-[#1d1d1f] mb-2">Event Hotels ({hotels.length})</p>
                {loadingHotels ? (
                  <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" /></div>
                ) : hotels.length > 0 ? (
                  <div className="space-y-3">
                    {hotels.map(h => (
                      <div key={h.id} className="bg-white rounded-xl p-4 border border-[#e8e8ed] shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#f0f7ff] flex items-center justify-center shrink-0 mt-0.5">
                            <svg className="w-4 h-4 text-[#003e79]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#1d1d1f]">{h.hotel_name}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              {(h.city || h.state) && <span className="text-xs text-[#86868b]">{[h.city, h.state].filter(Boolean).join(', ')}</span>}
                              {h.phone && <span className="text-xs text-[#86868b]">{h.phone}</span>}
                            </div>
                          </div>
                          <button onClick={() => handleDeleteHotel(h.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition text-red-400 hover:text-red-600 shrink-0" title="Remove from event">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                        {/* Editable pricing & details */}
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[10px] text-[#86868b] uppercase tracking-widest font-semibold mb-1">Price / Night</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[#86868b]">$</span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={h.price_per_night ? Math.round(h.price_per_night / 100) : ''}
                                placeholder="—"
                                onChange={e => {
                                  const dollars = parseInt(e.target.value);
                                  const cents = isNaN(dollars) ? null : dollars * 100;
                                  setHotels(prev => prev.map(x => x.id === h.id ? { ...x, price_per_night: cents } : x));
                                }}
                                onBlur={e => {
                                  const dollars = parseInt(e.target.value);
                                  const cents = isNaN(dollars) ? null : dollars * 100;
                                  handleUpdateHotel(h.id, { price_per_night: cents } as any);
                                }}
                                className="w-full border border-[#e8e8ed] rounded-lg pl-6 pr-2 py-1.5 text-sm text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#86868b] uppercase tracking-widest font-semibold mb-1">Rate Note</label>
                            <input
                              type="text"
                              value={h.rate_description || ''}
                              placeholder="e.g. Group Rate"
                              onChange={e => setHotels(prev => prev.map(x => x.id === h.id ? { ...x, rate_description: e.target.value } : x))}
                              onBlur={e => handleUpdateHotel(h.id, { rate_description: e.target.value || null } as any)}
                              className="w-full border border-[#e8e8ed] rounded-lg px-2.5 py-1.5 text-sm text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#86868b] uppercase tracking-widest font-semibold mb-1">Booking Code</label>
                            <input
                              type="text"
                              value={h.booking_code || ''}
                              placeholder="—"
                              onChange={e => setHotels(prev => prev.map(x => x.id === h.id ? { ...x, booking_code: e.target.value } : x))}
                              onBlur={e => handleUpdateHotel(h.id, { booking_code: e.target.value || null } as any)}
                              className="w-full border border-[#e8e8ed] rounded-lg px-2.5 py-1.5 text-sm text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#86868b] uppercase tracking-widest font-semibold mb-1">Room Block</label>
                            <input
                              type="number"
                              min={0}
                              value={h.room_block_count || ''}
                              placeholder="—"
                              onChange={e => {
                                const val = parseInt(e.target.value);
                                setHotels(prev => prev.map(x => x.id === h.id ? { ...x, room_block_count: isNaN(val) ? null : val } : x));
                              }}
                              onBlur={e => {
                                const val = parseInt(e.target.value);
                                handleUpdateHotel(h.id, { room_block_count: isNaN(val) ? null : val } as any);
                              }}
                              className="w-full border border-[#e8e8ed] rounded-lg px-2.5 py-1.5 text-sm text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                            />
                          </div>
                        </div>
                        {((h as any).contact_name || (h as any).contact_email) && (
                          <div className="flex flex-wrap gap-x-3 mt-2.5 pt-2 border-t border-[#e8e8ed]">
                            <span className="text-xs text-[#6e6e73] font-medium">Rep: {(h as any).contact_name || 'N/A'}</span>
                            {(h as any).contact_email && <span className="text-xs text-[#003e79]">{(h as any).contact_email}</span>}
                            {(h as any).contact_phone && <span className="text-xs text-[#86868b]">{(h as any).contact_phone}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#f5f5f7] rounded-xl p-5 text-center text-sm border border-dashed border-[#e8e8ed]">
                    <p className="text-[#86868b] mb-1">No hotels assigned to this event yet</p>
                    <p className="text-[#86868b] text-xs">Select from suggested hotels below or add manually</p>
                  </div>
                )}
              </div>

              {/* Search Hotels from Master Database */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-[#1d1d1f]">Search Hotel Database</p>
                  {!showHotelSearch && suggestedHotels.filter(h => !h.already_linked).length > 0 && (
                    <span className="text-xs text-[#86868b]">{suggestedHotels.filter(h => !h.already_linked).length} suggested for {event?.state}</span>
                  )}
                </div>

                {/* Quick suggestions (auto-loaded based on event location) */}
                {!showHotelSearch && (
                  <>
                    {loadingSuggestions ? (
                      <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#003e79]" /></div>
                    ) : suggestedHotels.filter(h => !h.already_linked).length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                        {suggestedHotels.filter(h => !h.already_linked).map(h => (
                          <div key={h.id} className="flex items-center gap-2 bg-[#f5f5f7] rounded-xl p-2.5 border border-[#e8e8ed] hover:border-[#99b5d6] transition">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-[#1d1d1f] truncate">{h.hotel_name}</p>
                              <p className="text-[10px] text-[#86868b]">{h.city}, {h.state}</p>
                              {h.default_rate_description && <p className="text-[10px] text-[#003e79]">{h.default_rate_description}</p>}
                            </div>
                            <button onClick={() => handleLinkHotel(h.id)} disabled={linkingId === h.id}
                              className="px-2.5 py-1.5 bg-[#003e79] hover:bg-[#002d5a] text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 shrink-0">
                              {linkingId === h.id ? '...' : '+ Add'}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <button onClick={() => { setShowHotelSearch(true); searchMasterHotels('', ''); }}
                      className="text-sm text-[#003e79] hover:text-[#002d5a] font-medium transition flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      Search all hotels by name or state
                    </button>
                  </>
                )}

                {/* Full search panel */}
                {showHotelSearch && (
                  <div className="bg-white border border-[#e8e8ed] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[#1d1d1f]">Find Hotels</p>
                      <button onClick={() => setShowHotelSearch(false)} className="text-xs text-[#86868b] hover:text-[#6e6e73]">Close</button>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <input
                          type="text"
                          value={hotelSearchQuery}
                          onChange={e => setHotelSearchQuery(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') searchMasterHotels(hotelSearchQuery, hotelSearchState); }}
                          placeholder="Search by hotel name or city..."
                          className="w-full pl-9 pr-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                        />
                      </div>
                      <select
                        value={hotelSearchState}
                        onChange={e => { setHotelSearchState(e.target.value); searchMasterHotels(hotelSearchQuery, e.target.value); }}
                        className="px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none bg-white min-w-[100px]"
                      >
                        <option value="">All States</option>
                        {['IL', 'IN', 'MI', 'MN', 'MO', 'OH', 'WI'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button onClick={() => searchMasterHotels(hotelSearchQuery, hotelSearchState)}
                        className="px-4 py-2 bg-[#003e79] hover:bg-[#002d5a] text-white text-sm font-semibold rounded-xl transition">
                        Search
                      </button>
                    </div>

                    {hotelSearchLoading ? (
                      <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#003e79]" /></div>
                    ) : hotelSearchResults.length > 0 ? (
                      <div className="max-h-64 overflow-y-auto space-y-1.5">
                        {hotelSearchResults.map(h => (
                          <div key={h.id} className={"flex items-center gap-3 rounded-xl p-2.5 border transition " +
                            (h.already_linked ? "bg-emerald-50/50 border-emerald-200" : "bg-[#f5f5f7] border-[#e8e8ed] hover:border-[#99b5d6]")}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-[#1d1d1f] truncate">{h.hotel_name}</p>
                              <p className="text-[10px] text-[#86868b]">{h.city}, {h.state}{h.address ? ` · ${h.address}` : ''}</p>
                              {h.default_rate_description && <p className="text-[10px] text-[#003e79]">{h.default_rate_description}</p>}
                            </div>
                            {h.already_linked ? (
                              <span className="px-2.5 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-semibold rounded-lg shrink-0">Added</span>
                            ) : (
                              <button onClick={async () => {
                                await handleLinkHotel(h.id);
                                setHotelSearchResults(prev => prev.map(x => x.id === h.id ? { ...x, already_linked: true } : x));
                              }} disabled={linkingId === h.id}
                                className="px-2.5 py-1.5 bg-[#003e79] hover:bg-[#002d5a] text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 shrink-0">
                                {linkingId === h.id ? '...' : '+ Add'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#86868b] text-center py-3">
                        {hotelSearchQuery || hotelSearchState ? 'No hotels found matching your search' : 'Enter a search term or select a state to find hotels'}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Manual Add (collapsed by default) */}
              <div>
                {!showAddManual ? (
                  <button onClick={() => setShowAddManual(true)}
                    className="text-sm text-[#003e79] hover:text-[#003e79] font-medium transition">
                    + Add hotel manually
                  </button>
                ) : (
                  <div className="bg-white border border-[#e8e8ed] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[#1d1d1f]">Add Hotel Manually</p>
                      <button onClick={() => setShowAddManual(false)} className="text-xs text-[#86868b] hover:text-[#6e6e73]">Cancel</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Hotel Name *</label>
                        <input type="text" value={newHotel.hotel_name} onChange={e => setNewHotel({ ...newHotel, hotel_name: e.target.value })}
                          placeholder="e.g. Hilton Rosemont" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Rate / Description</label>
                        <input type="text" value={newHotel.rate_description} onChange={e => setNewHotel({ ...newHotel, rate_description: e.target.value })}
                          placeholder="e.g. $129/night - Group Rate" className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>City</label>
                        <input type="text" value={newHotel.city} onChange={e => setNewHotel({ ...newHotel, city: e.target.value })}
                          placeholder="Rosemont" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>State</label>
                        <input type="text" value={newHotel.state} onChange={e => setNewHotel({ ...newHotel, state: e.target.value })}
                          placeholder="IL" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Phone</label>
                        <input type="tel" value={newHotel.phone} onChange={e => setNewHotel({ ...newHotel, phone: e.target.value })}
                          placeholder="(847) 555-0123" className={inputCls} />
                      </div>
                    </div>
                    <button onClick={handleAddHotel} disabled={!newHotel.hotel_name || addingHotel}
                      className="px-4 py-2 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition disabled:opacity-50">
                      {addingHotel ? 'Adding...' : 'Add Hotel'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'scorekeepers' && isEdit && event?.id && (
            <ScorekeepersTab eventId={event.id} />
          )}

          {/* ===== CREATE MODE STEPPER VIEWS ===== */}
          {!isEdit && step === 1 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Event Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Chi-Town Showdown 2026" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Tournament Template</label>
                  <select value={form.tournament_id} onChange={e => setForm({ ...form, tournament_id: e.target.value })} className={inputCls}>
                    <option value="">None</option>
                    {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>City *</label>
                  <input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                    placeholder="Chicago" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>State *</label>
                  <select value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} className={inputCls}>
                    {US_STATES.map(s => <option key={s} value={ABBREV_TO_STATE[s] || s}>{ABBREV_TO_STATE[s] || s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Season</label>
                  <select value={form.season} onChange={e => setForm({ ...form, season: e.target.value })} className={inputCls}>
                    <option value="">Not set</option>
                    {seasonOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="registration_open">Registration Open</option>
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-[#3d3d3d]">Description</label>
                  <button type="button" onClick={generateAIDescription} disabled={generatingDesc || !form.name}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 disabled:opacity-50 disabled:cursor-not-allowed">
                    {generatingDesc ? (
                      <><span className="animate-spin h-3 w-3 border-2 border-purple-500 border-t-transparent rounded-full" /> Generating...</>
                    ) : (
                      <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> AI Generate</>
                    )}
                  </button>
                </div>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} placeholder="Brief event description" className={inputCls + ' resize-none'} />
              </div>
            </>
          )}

          {!isEdit && step === 2 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Start Date *</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>End Date *</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Reg. Opens</label>
                  <input type="date" value={form.registration_open_date} onChange={e => setForm({ ...form, registration_open_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Reg. Deadline</label>
                  <input type="date" value={form.registration_deadline} onChange={e => setForm({ ...form, registration_deadline: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Price ($)</label>
                  <input type="number" step="0.01" value={form.price_cents} onChange={e => setForm({ ...form, price_cents: e.target.value })}
                    placeholder="1795.00" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Deposit ($)</label>
                  <input type="number" step="0.01" value={form.deposit_cents} onChange={e => setForm({ ...form, deposit_cents: e.target.value })}
                    placeholder="350.00" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Multi-Event Discount %</label>
                  <input type="number" min="0" max="100" value={form.multi_event_discount_pct} onChange={e => setForm({ ...form, multi_event_discount_pct: e.target.value })}
                    placeholder="10" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Max Slots</label>
                  <input type="number" value={form.slots_count} onChange={e => setForm({ ...form, slots_count: e.target.value })}
                    placeholder="100" className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Timezone</label>
                  <select value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} className={inputCls}>
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Sanction #</label>
                  <input type="text" value={form.sanction_number} onChange={e => setForm({ ...form, sanction_number: e.target.value })}
                    placeholder="e.g. 2026-IL-0001" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Rules URL</label>
                <input type="url" value={form.rules_url} onChange={e => setForm({ ...form, rules_url: e.target.value })}
                  placeholder="https://..." className={inputCls} />
              </div>
            </>
          )}

          {!isEdit && step === 3 && (
            <>
              <div>
                <label className="block text-sm font-medium text-[#3d3d3d] mb-2">Age Groups</label>
                <div className="flex flex-wrap gap-2">
                  {STANDARD_AGE_GROUPS.map(ag => (
                    <button key={ag} type="button" onClick={() => toggleArrayItem('age_groups', ag)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        form.age_groups.includes(ag) ? 'bg-[#003e79] text-white' : 'bg-[#fafafa] text-[#6e6e73] hover:bg-[#e8e8ed]'
                      }`}>{ag}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#3d3d3d] mb-2">Divisions</label>
                <div className="flex flex-wrap gap-2">
                  {STANDARD_DIVISIONS.map(d => (
                    <button key={d} type="button" onClick={() => toggleArrayItem('divisions', d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        form.divisions.includes(d) ? 'bg-[#003e79] text-white' : 'bg-[#fafafa] text-[#6e6e73] hover:bg-[#e8e8ed]'
                      }`}>{d}</button>
                  ))}
                </div>
              </div>

              {/* Per-division pricing in create mode */}
              {divisionConfigs.length > 0 && (
                <div className="bg-[#f8f9fa] rounded-xl p-4 border border-[#e8e8ed]">
                  <label className="block text-sm font-medium text-[#3d3d3d] mb-3">Pricing by Age Group</label>
                  <p className="text-xs text-[#86868b] mb-3">Set different prices for younger vs older divisions. Leave blank to use the base price (${form.price_cents || '0'}).</p>
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_100px_90px] gap-2 text-xs font-semibold text-[#86868b] px-1">
                      <span>Age Group</span>
                      <span>Price ($)</span>
                      <span>Period (min)</span>
                    </div>
                    {divisionConfigs.map((div, idx) => (
                      <div key={div.age_group + idx} className="grid grid-cols-[1fr_100px_90px] gap-2 items-center bg-white rounded-lg p-2 border border-[#e8e8ed]">
                        <span className="text-sm font-semibold text-[#1d1d1f]">{div.age_group}</span>
                        <input type="number" step="1" min="0"
                          value={div.price_cents ? (div.price_cents / 100).toFixed(0) : ''}
                          onChange={e => {
                            const val = e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0;
                            setDivisionConfigs(prev => prev.map((d, i) => i === idx ? { ...d, price_cents: val } : d));
                          }}
                          placeholder={form.price_cents || '0'}
                          className="w-full px-2 py-1.5 rounded-lg border border-[#e8e8ed] text-sm text-center focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none" />
                        <input type="number" step="1" min="1" max="30"
                          value={div.period_length_minutes ?? ''}
                          onChange={e => {
                            const val = e.target.value ? parseInt(e.target.value) : null;
                            setDivisionConfigs(prev => prev.map((d, i) => i === idx ? { ...d, period_length_minutes: val } : d));
                          }}
                          placeholder="12"
                          className="w-full px-2 py-1.5 rounded-lg border border-[#e8e8ed] text-sm text-center focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Logo upload in create mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['logo_url', 'banner_url'] as const).map(field => {
                  const label = field === 'logo_url' ? 'Event Logo' : 'Banner Image';
                  const isUploading = field === 'logo_url' ? uploadingLogo : uploadingBanner;
                  const currentUrl = form[field];
                  return (
                    <div key={field}>
                      <label className={labelCls}>{label}</label>
                      {currentUrl ? (
                        <div className="relative group">
                          <img src={currentUrl} alt={label} className="w-full h-24 object-contain bg-[#f5f5f7] rounded-xl border border-[#e8e8ed]" />
                          <button type="button" onClick={() => setForm({ ...form, [field]: '' })}
                            className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-xs font-bold">
                            X
                          </button>
                        </div>
                      ) : (
                        <label className={`flex flex-col items-center justify-center h-24 rounded-xl border-2 border-dashed cursor-pointer transition ${isUploading ? 'border-[#003e79] bg-[#f0f7ff]' : 'border-[#d2d2d7] hover:border-[#003e79] hover:bg-[#f0f7ff]/50'}`}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageUpload(f, field); }}>
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, field); }} />
                          {isUploading ? (
                            <span className="text-xs text-[#003e79] font-medium flex items-center gap-2">
                              <span className="animate-spin h-4 w-4 border-2 border-[#003e79] border-t-transparent rounded-full" /> Uploading...
                            </span>
                          ) : (
                            <>
                              <svg className="w-6 h-6 text-[#86868b] mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              <span className="text-xs text-[#86868b]">Drop image or click to upload</span>
                            </>
                          )}
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>

              <div>
                <label className={labelCls}>Event Information (shown to registrants)</label>
                <textarea value={form.information} onChange={e => setForm({ ...form, information: e.target.value })}
                  rows={3} placeholder="e.g. Mite-Midget: AA, A, B, C, D, House. 4 game guarantee!"
                  className={inputCls + ' resize-none'} />
              </div>
            </>
          )}

          {!isEdit && step === 4 && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#1d1d1f]">Select Venues for this Event</p>
                  <p className="text-xs text-[#86868b]">
                    {selectedVenueIds.size === 0 ? 'No venues selected yet' : `${selectedVenueIds.size} venue${selectedVenueIds.size > 1 ? 's' : ''} selected`}
                  </p>
                </div>
              </div>

              {/* Search + Filter */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="search" value={venueSearch} onChange={e => setVenueSearch(e.target.value)}
                    placeholder="Search venues..." className="w-full pl-9 pr-4 py-2 rounded-xl text-sm bg-[#f5f5f7] border-none focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                </div>
                {!showAllVenues && !venueSearch && createOtherVenues.length > 0 && (
                  <button onClick={() => setShowAllVenues(true)} className="text-xs text-[#003e79] font-semibold hover:underline whitespace-nowrap">
                    Show all states
                  </button>
                )}
                {(showAllVenues || venueSearch) && (
                  <button onClick={() => { setShowAllVenues(false); setVenueSearch(''); }} className="text-xs text-[#86868b] font-semibold hover:underline whitespace-nowrap">
                    {formStateDisplay} only
                  </button>
                )}
              </div>

              {/* Unified venue list — selected venues stay in place with expanded controls */}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {createDisplayVenues.length === 0 ? (
                  <p className="text-sm text-[#86868b] text-center py-6">
                    {venueSearch ? `No venues matching "${venueSearch}"` : `No venues in ${formStateDisplay}`}
                  </p>
                ) : createDisplayVenues.map(v => {
                  const isChecked = selectedVenueIds.has(v.id);
                  const isPrimary = primaryVenueId === v.id;
                  return (
                    <div key={v.id}
                      className={`rounded-xl border-2 transition ${isChecked ? 'border-[#003e79] bg-[#f0f7ff]/30' : 'border-[#e8e8ed] hover:border-[#c8c8cd]'}`}>
                      <div className="flex items-center gap-4 p-3 cursor-pointer" onClick={() => toggleCreateVenue(v.id)}>
                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${isChecked ? 'bg-[#003e79] border-[#003e79]' : 'border-[#c8c8cd] bg-white'}`}>
                          {isChecked && (
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          )}
                        </div>
                        <div className="w-8 h-8 rounded-lg bg-[#003e79] text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {v.num_rinks || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-[#1d1d1f] truncate">{v.name}</p>
                          <p className="text-xs text-[#86868b]">{v.city}, {v.state}</p>
                        </div>
                        {isChecked && isPrimary && (
                          <span className="text-[10px] px-2 py-0.5 bg-[#003e79] text-white rounded-full font-bold shrink-0">PRIMARY</span>
                        )}
                        {isChecked && !isPrimary && (
                          <button onClick={e => { e.stopPropagation(); setPrimaryVenueId(v.id); }}
                            className="text-[10px] px-2 py-0.5 bg-white text-[#003e79] border border-[#003e79] hover:bg-[#003e79] hover:text-white rounded-full font-semibold transition shrink-0">
                            Set Primary
                          </button>
                        )}
                        {normalizeState(v.state) !== formStateNorm && !isChecked && (
                          <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full font-semibold border border-amber-200 shrink-0">{v.state}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!isEdit && step === 5 && (
            <>
              <div className="bg-[#f8f9fa] rounded-xl p-5 space-y-4">
                <h4 className="font-bold text-[#1d1d1f] text-base">Review Your Event</h4>

                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <p className="text-[#86868b] text-xs">Event Name</p>
                    <p className="font-semibold text-[#1d1d1f]">{form.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[#86868b] text-xs">Location</p>
                    <p className="font-semibold text-[#1d1d1f]">{form.city}, {form.state}</p>
                  </div>
                  <div>
                    <p className="text-[#86868b] text-xs">Dates</p>
                    <p className="font-semibold text-[#1d1d1f]">{form.start_date ? fmtDateFull(form.start_date) : '—'} — {form.end_date ? fmtDateFull(form.end_date) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[#86868b] text-xs">Price</p>
                    <p className="font-semibold text-[#1d1d1f]">{form.price_cents ? `$${parseFloat(form.price_cents).toLocaleString()}` : 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-[#86868b] text-xs">Age Groups</p>
                    <p className="font-semibold text-[#1d1d1f]">{form.age_groups.length > 0 ? form.age_groups.join(', ') : 'None'}</p>
                  </div>
                  <div>
                    <p className="text-[#86868b] text-xs">Divisions</p>
                    <p className="font-semibold text-[#1d1d1f]">{form.divisions.length > 0 ? form.divisions.join(', ') : 'None'}</p>
                  </div>
                  <div>
                    <p className="text-[#86868b] text-xs">Venues</p>
                    <p className="font-semibold text-[#1d1d1f]">
                      {selectedVenueIds.size === 0 ? 'None' :
                        Array.from(selectedVenueIds).map(vid => venues.find(x => x.id === vid)?.name || vid).join(', ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#86868b] text-xs">Status</p>
                    <p className="font-semibold text-[#1d1d1f]">{statusLabel(form.status)}</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {result === 'error' && (
            <div className="px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{errorMsg}</div>
          )}
        </div>

        {/* Footer: Different for edit vs create */}
        <div className="sticky bottom-0 bg-white border-t border-[#e8e8ed] px-6 py-4 rounded-b-2xl flex gap-3">
          {isEdit ? (
            <>
              <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-[#fafafa] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-xl text-sm transition">Cancel</button>
              <button onClick={handleSave} disabled={saving || (!isEdit && result === 'success') || !form.name || !form.city || !form.start_date || !form.end_date}
                className={`flex-1 px-4 py-2.5 font-semibold rounded-xl text-sm transition ${
                  result === 'success' ? 'bg-green-500 text-white' : 'bg-[#003e79] hover:bg-[#002d5a] text-white'
                } ${saving || !form.name || !form.city || !form.start_date || !form.end_date ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {result === 'success' ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => step === 1 ? onClose() : setStep(step - 1)}
                className="px-5 py-2.5 bg-[#fafafa] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-xl text-sm transition">
                {step === 1 ? 'Cancel' : 'Back'}
              </button>
              <div className="flex-1" />
              <p className="self-center text-xs text-[#86868b]">Step {step} of {TOTAL_STEPS}</p>
              <div className="flex-1" />
              {step < TOTAL_STEPS ? (
                <button onClick={() => setStep(step + 1)} disabled={!canAdvance()}
                  className={`px-6 py-2.5 font-semibold rounded-xl text-sm transition bg-[#003e79] hover:bg-[#002d5a] text-white ${!canAdvance() ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Next
                </button>
              ) : (
                <button onClick={handleSave} disabled={saving || result === 'success' || !form.name || !form.city || !form.start_date || !form.end_date}
                  className={`px-6 py-2.5 font-semibold rounded-xl text-sm transition ${
                    result === 'success' ? 'bg-green-500 text-white' : 'bg-[#003e79] hover:bg-[#002d5a] text-white'
                  } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {result === 'success' ? 'Created!' : saving ? 'Creating...' : 'Create Event'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Event Card ---
function EventCard({ event, onViewDetails, onEdit, onDuplicate, onDelete }: { event: EventItem; onViewDetails: (id: string) => void; onEdit: (e: EventItem) => void; onDuplicate: (id: string) => void; onDelete: (e: EventItem) => void }) {
  const days = daysUntil(event.start_date);
  const isPast = days < 0;
  const ageGroups = event.age_groups ? (event.age_groups.startsWith('[') ? JSON.parse(event.age_groups) : event.age_groups.split(',').map((s: string) => s.trim())) : [];
  const revenue = event.total_revenue_cents ? (event.total_revenue_cents / 100) : 0;

  return (
    <div className={`bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition group ${isPast ? 'opacity-75' : ''}`}>
      {/* Top bar with status */}
      <div className="h-1.5 bg-gradient-to-r from-[#003e79] to-blue-600" />

      <div className="p-4">
        {/* Header Row */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            {event.logo_url ? (
              <img src={event.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-[#f5f5f7] border border-[#e8e8ed] shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f0f7ff] to-blue-50 border border-[#e8e8ed] flex items-center justify-center shrink-0">
                <span className="text-base"></span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-[#1d1d1f] truncate leading-tight">{event.tournament_name || event.name}</h3>
              <p className="text-xs text-[#86868b] truncate">{event.name}</p>
            </div>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ml-2 ${statusColor(event.status)}`}>
            {statusLabel(event.status)}
          </span>
        </div>

        {/* Date + Location */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-xs text-[#6e6e73]">
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span className="font-medium">{fmtDate(event.start_date)} - {fmtDate(event.end_date)}</span>
          </div>
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span>{event.city}, {event.state}</span>
          </div>
          {!isPast && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${days <= 7 ? 'bg-red-50 text-red-600' : days <= 30 ? 'bg-amber-50 text-amber-600' : 'bg-[#f5f5f7] text-[#86868b]'}`}>
              {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `${days}d`}
            </span>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-[#f5f5f7] rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-[#003e79]">{event.registration_count}</div>
            <div className="text-[10px] text-[#86868b] font-medium">Teams</div>
          </div>
          <div className="bg-[#f5f5f7] rounded-lg p-2 text-center min-w-0">
            <div className={`font-bold text-green-600 truncate ${revenue >= 100000 ? 'text-xs' : revenue >= 10000 ? 'text-sm' : 'text-lg'}`}>${revenue > 0 ? revenue.toLocaleString() : '0'}</div>
            <div className="text-[10px] text-[#86868b] font-medium">Revenue</div>
          </div>
          <div className="bg-[#f5f5f7] rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-[#1d1d1f]">{event.slots_count || 100}</div>
            <div className="text-[10px] text-[#86868b] font-medium">Slots</div>
          </div>
        </div>

        {/* Age Groups Tags */}
        {ageGroups.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {ageGroups.map((ag: string) => (
              <span key={ag} className="text-[10px] px-1.5 py-0.5 bg-[#f0f7ff] text-[#003e79] rounded-full font-medium">{ag}</span>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-1.5 pt-3 border-t border-[#e8e8ed]">
          <button
            onClick={() => onViewDetails(event.id)}
            className="flex-1 px-3 py-1.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-lg text-xs transition"
          >
            View Details
          </button>
          <button onClick={() => onEdit(event)} className="px-3 py-1.5 bg-[#fafafa] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-lg text-xs transition">
            Edit
          </button>
          <button onClick={() => onDuplicate(event.id)} className="px-2 py-1.5 bg-[#fafafa] hover:bg-[#e8e8ed] text-[#86868b] rounded-lg text-xs transition" title="Duplicate">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
          <button onClick={() => onDelete(event)} className="px-2 py-1.5 bg-[#fafafa] hover:bg-red-100 text-[#86868b] hover:text-red-600 rounded-lg text-xs transition" title="Delete">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Payment Status Helpers ---
const paymentStatusColor = (s: string) => {
  switch (s) {
    case 'paid': return 'bg-green-100 text-green-700';
    case 'partial': return 'bg-amber-100 text-amber-700';
    case 'refunded': return 'bg-red-100 text-red-700';
    case 'comp': return 'bg-purple-100 text-purple-700';
    default: return 'bg-[#fafafa] text-[#6e6e73]';
  }
};

const paymentStatusLabel = (s: string) => {
  switch (s) {
    case 'paid': return 'Paid';
    case 'partial': return 'Partial';
    case 'unpaid': return 'Unpaid';
    case 'refunded': return 'Refunded';
    case 'comp': return 'Comp';
    default: return 'Unpaid';
  }
};

// --- Edit Registration Modal ---
function EditRegistrationModal({ reg, eventId, hotels, onClose, onSaved }: {
  reg: any;
  eventId: string;
  hotels: string[];
  onClose: () => void;
  onSaved: (updated: any) => void;
}) {
  const [teamName, setTeamName] = useState(reg.team_name || '');
  const [ageGroup, setAgeGroup] = useState(reg.age_group || '');
  const [divisions, setDivisions] = useState<any[]>([]);
  const [paymentStatus, setPaymentStatus] = useState(reg.payment_status || 'unpaid');
  const [paymentAmount, setPaymentAmount] = useState(reg.payment_amount_cents ? (reg.payment_amount_cents / 100).toString() : '');
  const [paymentMethod, setPaymentMethod] = useState(reg.payment_method || '');
  const [hotelAssigned, setHotelAssigned] = useState(reg.hotel_assigned || '');
  const [notes, setNotes] = useState(reg.notes || '');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const prefs = [reg.hotel_pref_1, reg.hotel_pref_2, reg.hotel_pref_3].filter(Boolean);

  // Load event divisions for age group dropdown
  useEffect(() => {
    fetch(`${API_BASE}/admin/${eventId}/divisions`)
      .then(r => r.json())
      .then(json => { if (json.success) setDivisions(json.data); })
      .catch(() => {});
  }, [eventId]);

  const handleSave = async () => {
    setSaving(true);
    setSaveResult('idle');
    setErrorMsg('');
    try {
      const body: any = {
        payment_status: paymentStatus,
        payment_amount_cents: paymentAmount ? Math.round(parseFloat(paymentAmount) * 100) : null,
        payment_method: paymentMethod || null,
        hotel_assigned: hotelAssigned || null,
        notes: notes || null,
      };
      // Include team name if changed
      if (teamName !== reg.team_name) {
        body.team_name = teamName;
      }
      // Include age group change via event_division_id
      if (ageGroup !== reg.age_group) {
        const newDiv = divisions.find(d => d.age_group === ageGroup);
        if (newDiv) body.event_division_id = newDiv.id;
      }
      const res = await fetch(`${API_BASE}/admin/registration/${reg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Server error ${res.status}: ${errText}`);
      }
      const json = await res.json();
      if (json.success) {
        setSaveResult('success');
        onSaved(json.data);
        setTimeout(() => onClose(), 800);
      } else {
        throw new Error(json.error || 'Save failed');
      }
    } catch (e: any) {
      console.error('Save error:', e);
      setSaveResult('error');
      setErrorMsg(e.message || 'Failed to save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#e8e8ed] px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[#1d1d1f]">{reg.team_name}</h3>
              <p className="text-sm text-[#86868b]">{reg.age_group} {reg.division ? `· ${reg.division}` : ''}</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[#fafafa] rounded-lg transition">
              <svg className="w-5 h-5 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Team Info */}
          <div>
            <div className="text-xs font-semibold text-[#86868b] uppercase tracking-wide mb-3">Team Details</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#3d3d3d] mb-1">Team Name</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#3d3d3d] mb-1">Age Group</label>
                <select
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none"
                >
                  {divisions.length > 0 ? divisions.map((d: any) => (
                    <option key={d.id} value={d.age_group}>{d.age_group}</option>
                  )) : (
                    <option value={ageGroup}>{ageGroup}</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Manager Info (read-only) */}
          {(reg.manager_first_name || reg.email1) && (
          <div className="bg-[#f5f5f7] rounded-xl p-4">
            <div className="text-xs font-semibold text-[#86868b] uppercase tracking-wide mb-2">Contact Info</div>
            <div className="text-sm text-[#3d3d3d]">
              <span className="font-medium">{reg.manager_first_name} {reg.manager_last_name}</span>
              {reg.email1 && <span className="block text-[#86868b]">{reg.email1}</span>}
              {reg.phone && <span className="block text-[#86868b]">{reg.phone}</span>}
            </div>
          </div>
          )}

          {/* Payment Section */}
          <div>
            <div className="text-xs font-semibold text-[#86868b] uppercase tracking-wide mb-3">Payment</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#3d3d3d] mb-1">Status</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none"
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="refunded">Refunded</option>
                  <option value="comp">Comp</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#3d3d3d] mb-1">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-[#3d3d3d] mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none"
              >
                <option value="">Not specified</option>
                <option value="credit_card">Credit Card</option>
                <option value="check">Check</option>
                <option value="cash">Cash</option>
                <option value="wire">Wire Transfer</option>
                <option value="comp">Comp / Free</option>
              </select>
            </div>
          </div>

          {/* Hotel Section */}
          <div>
            <div className="text-xs font-semibold text-[#86868b] uppercase tracking-wide mb-3">Hotel Assignment</div>

            {/* Show team preferences */}
            {prefs.length > 0 && (
              <div className="bg-[#f0f7ff] rounded-xl p-3 mb-3">
                <div className="text-xs font-semibold text-[#003e79] mb-1.5">Team Preferences</div>
                <div className="space-y-1">
                  {prefs.map((p: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-[#e0ecf7] text-[#003e79] text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="text-[#3d3d3d]">{p}</span>
                      {!hotelAssigned && (
                        <button
                          onClick={() => setHotelAssigned(p)}
                          className="ml-auto text-[10px] px-2 py-0.5 bg-[#f0f7ff] hover:bg-[#e0ecf7] text-[#003e79] rounded-full font-medium transition"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reg.hotel_choice === 'Local Team' && (
              <div className="bg-[#f5f5f7] rounded-xl p-3 mb-3 text-sm text-[#6e6e73]">
                <span className="font-medium">Local Team</span> — no hotel needed
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#3d3d3d] mb-1">Assigned Hotel</label>
              <select
                value={hotelAssigned}
                onChange={(e) => setHotelAssigned(e.target.value)}
                className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none"
              >
                <option value="">Not assigned</option>
                {hotels.map((h) => (
                  <option key={h} value={h}>{h}{prefs.includes(h) ? ` (Choice #${prefs.indexOf(h) + 1})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wide mb-2">Admin Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes about this team..."
              className="w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none resize-none"
            />
          </div>
        </div>

        {/* Error message */}
        {saveResult === 'error' && (
          <div className="mx-6 mb-2 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            {errorMsg}
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-[#e8e8ed] px-6 py-4 rounded-b-2xl flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-[#fafafa] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-xl text-sm transition">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saveResult === 'success'}
            className={`flex-1 px-4 py-2.5 font-semibold rounded-xl text-sm transition ${
              saveResult === 'success' ? 'bg-green-500 text-white' : 'bg-[#003e79] hover:bg-[#002d5a] text-white'
            } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {saveResult === 'success' ? 'Saved! Closing...' : saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   VENUES TAB
   ══════════════════════════════════════════ */
// State name ↔ abbreviation mapping
const STATE_ABBREVS: Record<string, string> = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
};
const ABBREV_TO_STATE: Record<string, string> = Object.fromEntries(Object.entries(STATE_ABBREVS).map(([k,v]) => [v, k]));

function normalizeState(s: string | null | undefined): string {
  if (!s) return '';
  const upper = s.trim().toUpperCase();
  if (upper.length === 2) return upper; // already abbreviation
  return STATE_ABBREVS[s.trim()] || STATE_ABBREVS[s.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')] || upper;
}

function VenuesTab({ eventId, eventState, onVenueChanged }: {
  eventId: string;
  eventState: string;
  onVenueChanged: () => void;
}) {
  const [allVenues, setAllVenues] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [search, setSearch] = useState('');
  const [expandedVenue, setExpandedVenue] = useState<string | null>(null);
  const [venueRinksMap, setVenueRinksMap] = useState<Record<string, any[]>>({});
  const [dirty, setDirty] = useState(false);

  // Load all venues, cities, and currently assigned
  useEffect(() => {
    Promise.all([
      fetch('https://uht.chad-157.workers.dev/api/venues').then(r => r.json()),
      fetch(`https://uht.chad-157.workers.dev/api/events/admin/event-venues/${eventId}`).then(r => r.json()),
      fetch('https://uht.chad-157.workers.dev/api/cities').then(r => r.json()),
    ]).then(([venuesJson, assignedJson, citiesJson]) => {
      if (venuesJson.success) setAllVenues(venuesJson.data || []);
      if (citiesJson.success) setCities((citiesJson.data || []).filter((c: any) => c.venue_count > 0));
      if (assignedJson.success && assignedJson.data) {
        const ids = new Set<string>(assignedJson.data.map((v: any) => v.venue_id));
        setAssignedIds(ids);
        const primary = assignedJson.data.find((v: any) => v.is_primary);
        if (primary) setPrimaryId(primary.venue_id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [eventId]);

  // Load rinks for expanded venue
  useEffect(() => {
    if (!expandedVenue || venueRinksMap[expandedVenue]) return;
    fetch(`https://uht.chad-157.workers.dev/api/venues/${expandedVenue}/rinks`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setVenueRinksMap(prev => ({ ...prev, [expandedVenue]: json.data || [] }));
      }).catch(() => {});
  }, [expandedVenue]);

  const toggleVenue = (id: string) => {
    setAssignedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (primaryId === id) setPrimaryId(next.size > 0 ? Array.from(next)[0] : null);
      } else {
        next.add(id);
        if (next.size === 1) setPrimaryId(id);
      }
      return next;
    });
    setDirty(true);
    setSaveStatus('idle');
  };

  const makePrimary = (id: string) => {
    setPrimaryId(id);
    setDirty(true);
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch(`https://uht.chad-157.workers.dev/api/events/admin/event-venues/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
        body: JSON.stringify({
          venue_ids: Array.from(assignedIds),
          primary_venue_id: primaryId,
        }),
      });
      const json = await res.json() as any;
      if (json.success) {
        setSaveStatus('saved');
        setDirty(false);
        onVenueChanged();
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
    setSaving(false);
  };

  // Filter venues by city and search
  let displayVenues = [...allVenues];
  if (cityFilter) {
    displayVenues = displayVenues.filter(v => v.city_id === cityFilter);
  }
  if (search) {
    const q = search.toLowerCase();
    displayVenues = displayVenues.filter(v =>
      v.name.toLowerCase().includes(q) || v.city?.toLowerCase().includes(q) || v.state?.toLowerCase().includes(q)
    );
  }
  // Sort: assigned first, then alphabetical
  displayVenues = displayVenues.sort((a, b) => {
    const aAssigned = assignedIds.has(a.id) ? 0 : 1;
    const bAssigned = assignedIds.has(b.id) ? 0 : 1;
    if (aAssigned !== bAssigned) return aAssigned - bAssigned;
    return a.name.localeCompare(b.name);
  });

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + Save */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#1d1d1f]">Event Venues</h3>
          <p className="text-sm text-[#86868b]">
            {assignedIds.size === 0 ? 'No venues selected' : `${assignedIds.size} venue${assignedIds.size > 1 ? 's' : ''} selected`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
          )}
          <button onClick={handleSave} disabled={saving || !dirty}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
              saveStatus === 'saved' ? 'bg-emerald-100 text-emerald-700' :
              saveStatus === 'error' ? 'bg-red-100 text-red-700' :
              dirty ? 'bg-[#003e79] text-white hover:bg-[#002d5a]' :
              'bg-[#e8e8ed] text-[#86868b] cursor-not-allowed'
            }`}>
            {saving ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error — Retry' : 'Save Venues'}
          </button>
        </div>
      </div>

      {/* Assigned summary */}
      {assignedIds.size > 0 && (
        <div className="bg-white rounded-2xl shadow-lg p-4">
          <p className="text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-3">Assigned Venues</p>
          <div className="flex flex-wrap gap-2">
            {Array.from(assignedIds).map(vid => {
              const v = allVenues.find(x => x.id === vid);
              if (!v) return null;
              const isPrimary = primaryId === vid;
              return (
                <div key={vid} className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 ${isPrimary ? 'border-[#003e79] bg-[#f0f7ff]' : 'border-[#e8e8ed] bg-[#fafafa]'}`}>
                  <span className="text-sm font-semibold text-[#1d1d1f]">{v.name}</span>
                  <span className="text-xs text-[#86868b]">{v.city}, {v.state}</span>
                  {isPrimary ? (
                    <span className="text-[10px] px-2 py-0.5 bg-[#003e79] text-white rounded-full font-bold">PRIMARY</span>
                  ) : (
                    <button onClick={() => makePrimary(vid)} className="text-[10px] px-2 py-0.5 bg-[#f5f5f7] text-[#86868b] hover:bg-[#e0efff] hover:text-[#003e79] rounded-full font-semibold transition">
                      Make Primary
                    </button>
                  )}
                  <button onClick={() => toggleVenue(vid)} className="text-[#86868b] hover:text-red-500 transition ml-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* City filter + Search */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        {/* City filter pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setCityFilter(null)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${
              !cityFilter ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#86868b] hover:bg-[#e8e8ed]'
            }`}
          >
            All ({allVenues.length})
          </button>
          {cities.map(city => {
            const count = allVenues.filter(v => v.city_id === city.id).length;
            return (
              <button
                key={city.id}
                onClick={() => setCityFilter(cityFilter === city.id ? null : city.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${
                  cityFilter === city.id ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#86868b] hover:bg-[#e8e8ed]'
                }`}
              >
                {city.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search venues..." className="w-full pl-9 pr-4 py-2 rounded-xl text-sm bg-[#f5f5f7] border-none focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
        </div>

        {displayVenues.length === 0 ? (
          <p className="text-sm text-[#86868b] text-center py-8">
            {search ? `No venues matching "${search}"` : 'No venues in this city.'}
          </p>
        ) : (
          <div className="space-y-2">
            {displayVenues.map(v => {
              const isChecked = assignedIds.has(v.id);
              const isExpanded = expandedVenue === v.id;
              const rinks = venueRinksMap[v.id];
              return (
                <div key={v.id} className={`rounded-xl border-2 transition ${isChecked ? 'border-[#003e79] bg-[#f0f7ff]/30' : 'border-[#e8e8ed] hover:border-[#c8c8cd]'}`}>
                  <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={() => toggleVenue(v.id)}>
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${isChecked ? 'bg-[#003e79] border-[#003e79]' : 'border-[#c8c8cd] bg-white'}`}>
                      {isChecked && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      )}
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-[#003e79] text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {v.rink_count || v.num_rinks || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#1d1d1f] truncate">{v.name}</p>
                      <p className="text-xs text-[#86868b]">{v.city}, {v.state}{v.address ? ` · ${v.address}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isChecked && primaryId === v.id && (
                        <span className="text-[10px] px-2 py-0.5 bg-[#003e79] text-white rounded-full font-bold">PRIMARY</span>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setExpandedVenue(isExpanded ? null : v.id); }}
                        className="p-1.5 hover:bg-[#f5f5f7] rounded-lg transition text-[#86868b]">
                        <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-[#e8e8ed]">
                      <div className="pt-3">
                        {!rinks ? (
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#003e79] mx-auto" />
                        ) : rinks.length === 0 ? (
                          <p className="text-xs text-[#86868b]">No rinks configured.</p>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {rinks.map((rink: any) => (
                              <div key={rink.id} className="border border-[#e8e8ed] rounded-lg p-2.5">
                                <p className="font-semibold text-xs text-[#1d1d1f]">{rink.name}</p>
                                {rink.surface_size && <p className="text-[11px] text-[#86868b]">{rink.surface_size}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Locker Rooms Tab Component ---
function LockerRoomsTab({ eventId }: { eventId: string }) {
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { home: string; away: string }>>({});
  const [sendingPush, setSendingPush] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<{ gameId: string; sent: number } | null>(null);
  const [filterDivision, setFilterDivision] = useState('all');

  const token = typeof window !== 'undefined' ? localStorage.getItem('uht_token') : null;
  const apiFetch = (url: string, opts?: any) => fetch(url, { ...opts, headers: { ...(opts?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

  const loadGames = () => {
    setLoading(true);
    apiFetch(`${API_BASE.replace('/api/events', '/api/scoring')}/events/${eventId}/games`)
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setGames(json.data || []);
          // Pre-populate edits with existing locker room values
          const initialEdits: Record<string, { home: string; away: string }> = {};
          (json.data || []).forEach((g: any) => {
            initialEdits[g.id] = {
              home: g.home_locker_room || '',
              away: g.away_locker_room || '',
            };
          });
          setEdits(initialEdits);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadGames(); }, [eventId]);

  const saveLockerRoom = async (gameId: string) => {
    const edit = edits[gameId];
    if (!edit) return;
    setSaving(gameId);
    try {
      await apiFetch(`${API_BASE.replace('/api/events', '/api/push')}/games/${gameId}/locker-rooms`, {
        method: 'PATCH',
        body: JSON.stringify({
          home_locker_room: edit.home || null,
          away_locker_room: edit.away || null,
        }),
      });
      loadGames();
    } catch {}
    setSaving(null);
  };

  const sendLockerRoomPush = async (gameId: string) => {
    setSendingPush(gameId);
    setPushResult(null);
    try {
      const res = await apiFetch(`${API_BASE.replace('/api/events', '/api/push')}/send-locker-room`, {
        method: 'POST',
        body: JSON.stringify({ game_id: gameId }),
      });
      const json = await res.json();
      if (json.success) {
        setPushResult({ gameId, sent: json.data.sent });
      }
    } catch {}
    setSendingPush(null);
  };

  const updateEdit = (gameId: string, field: 'home' | 'away', value: string) => {
    setEdits(prev => ({
      ...prev,
      [gameId]: { ...prev[gameId], [field]: value },
    }));
  };

  const hasChanges = (game: any) => {
    const edit = edits[game.id];
    if (!edit) return false;
    return (edit.home || '') !== (game.home_locker_room || '') || (edit.away || '') !== (game.away_locker_room || '');
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>;

  if (games.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p className="font-semibold text-[#1d1d1f] text-lg">No games scheduled</p>
        <p className="text-sm text-[#6e6e73] mt-1">Build the game schedule first before assigning locker rooms.</p>
      </div>
    );
  }

  const divisions = Array.from(new Set(games.map(g => g.division_name || g.age_group || 'Unknown'))).sort();
  const filteredGames = filterDivision === 'all' ? games : games.filter(g => (g.division_name || g.age_group || 'Unknown') === filterDivision);

  const formatTime = (t: string | null) => {
    if (!t) return '—';
    try {
      const d = new Date(t);
      if (isNaN(d.getTime())) {
        const [h, m] = t.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
      }
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch { return t; }
  };

  const assignedCount = games.filter(g => g.home_locker_room || g.away_locker_room).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <p className="text-sm text-[#86868b] mb-1">Total Games</p>
          <p className="text-2xl font-bold text-[#1d1d1f]">{games.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <p className="text-sm text-[#86868b] mb-1">Locker Rooms Assigned</p>
          <p className="text-2xl font-bold text-green-600">{assignedCount}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <p className="text-sm text-[#86868b] mb-1">Unassigned</p>
          <p className="text-2xl font-bold text-orange-500">{games.length - assignedCount}</p>
        </div>
      </div>

      {/* Push result toast */}
      {pushResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="text-sm text-green-800 font-medium">Push notification sent to {pushResult.sent} device(s)</p>
          <button onClick={() => setPushResult(null)} className="ml-auto text-green-600 hover:text-green-800 text-xs font-medium">Dismiss</button>
        </div>
      )}

      {/* Games table */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[#1d1d1f]">Locker Room Assignments</h3>
          {divisions.length > 1 && (
            <select
              value={filterDivision}
              onChange={e => setFilterDivision(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-[#003e79] outline-none"
            >
              <option value="all">All Divisions</option>
              {divisions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>

        <div className="border border-[#e8e8ed] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-[#86868b] text-xs uppercase tracking-wide">
                <th className="px-3 py-2 text-left">Game #</th>
                <th className="px-3 py-2 text-left">Matchup</th>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Rink</th>
                <th className="px-3 py-2 text-left">Home Locker</th>
                <th className="px-3 py-2 text-left">Away Locker</th>
                <th className="px-3 py-2 text-center w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredGames.map(g => {
                const edit = edits[g.id] || { home: '', away: '' };
                const changed = hasChanges(g);
                const hasLocker = g.home_locker_room || g.away_locker_room;
                return (
                  <tr key={g.id} className="border-t border-[#e8e8ed] hover:bg-[#fafafa] transition">
                    <td className="px-3 py-2.5 font-medium text-[#1d1d1f]">#{g.game_number}</td>
                    <td className="px-3 py-2.5 text-[#1d1d1f]">{g.home_team_name || g.notes?.split(' vs ')?.[0] || 'TBD'} vs {g.away_team_name || g.notes?.split(' vs ')?.[1] || 'TBD'}</td>
                    <td className="px-3 py-2.5 text-[#6e6e73]">{formatTime(g.start_time)}</td>
                    <td className="px-3 py-2.5 text-[#6e6e73]">{g.rink_name || '—'}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={edit.home}
                        onChange={e => updateEdit(g.id, 'home', e.target.value)}
                        placeholder="e.g. Room A"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-[#003e79] focus:ring-1 focus:ring-blue-100 outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={edit.away}
                        onChange={e => updateEdit(g.id, 'away', e.target.value)}
                        placeholder="e.g. Room B"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-[#003e79] focus:ring-1 focus:ring-blue-100 outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {changed && (
                          <button
                            onClick={() => saveLockerRoom(g.id)}
                            disabled={saving === g.id}
                            className="px-3 py-1 rounded-lg bg-[#003e79] text-white text-xs font-semibold hover:bg-[#002d5a] transition disabled:opacity-50"
                          >
                            {saving === g.id ? '...' : 'Save'}
                          </button>
                        )}
                        {hasLocker && !changed && (
                          <button
                            onClick={() => sendLockerRoomPush(g.id)}
                            disabled={sendingPush === g.id}
                            className="px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition disabled:opacity-50"
                            title="Send push notification to team followers"
                          >
                            {sendingPush === g.id ? '...' : '📲 Push'}
                          </button>
                        )}
                        {hasLocker && !changed && (
                          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" title="Assigned" />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Scorekeepers Tab Component ---
function ScorekeepersTab({ eventId }: { eventId: string }) {
  const [games, setGames] = useState<any[]>([]);
  const [scorekeepers, setScorekeepers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set());
  const [selectedScorekeeper, setSelectedScorekeeper] = useState('');
  const [searchUser, setSearchUser] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('uht_token') : null;
  const apiFetch = (url: string, opts?: any) => fetch(url, { ...opts, headers: { ...(opts?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

  const loadData = () => {
    setLoading(true);
    Promise.all([
      apiFetch(`${API_BASE.replace('/api/events', '/api/scoring')}/events/${eventId}/games`).then(r => r.json()),
      apiFetch(`${API_BASE.replace('/api/events', '/api/scoring')}/events/${eventId}/scorekeepers`).then(r => r.json()),
      apiFetch(`${API_BASE.replace('/api/events', '/api')}/users?role=scorekeeper`).then(r => r.json()),
    ]).then(([gamesJson, skJson, usersJson]) => {
      if (gamesJson.success) setGames(gamesJson.data || []);
      if (skJson.success) setScorekeepers(skJson.data || []);
      if (usersJson.success) setAllUsers((usersJson.data || []).filter((u: any) => u.roles?.includes('scorekeeper') || u.role === 'scorekeeper'));
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [eventId]);

  const assignScorekeeper = async () => {
    if (!selectedScorekeeper || selectedGames.size === 0) return;
    setAssigning(true);
    try {
      const res = await apiFetch(`${API_BASE.replace('/api/events', '/api/scoring')}/games/assign-scorekeeper`, {
        method: 'POST',
        body: JSON.stringify({ gameIds: Array.from(selectedGames), scorekeeperId: selectedScorekeeper }),
      });
      const json = await res.json();
      if (json.success) {
        setSelectedGames(new Set());
        setSelectedScorekeeper('');
        loadData();
      }
    } catch {}
    setAssigning(false);
  };

  const unassignGames = async (gameIds: string[]) => {
    try {
      await apiFetch(`${API_BASE.replace('/api/events', '/api/scoring')}/games/unassign-scorekeeper`, {
        method: 'POST',
        body: JSON.stringify({ gameIds, eventId }),
      });
      loadData();
    } catch {}
  };

  const toggleGame = (id: string) => {
    setSelectedGames(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedGames.size === games.length) setSelectedGames(new Set());
    else setSelectedGames(new Set(games.map(g => g.id)));
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>;

  const assignedGames = games.filter(g => g.scorekeeper_id);
  const unassignedGames = games.filter(g => !g.scorekeeper_id);

  const formatTime = (t: string | null) => {
    if (!t) return '—';
    try {
      const [h, m] = t.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
    } catch { return t; }
  };

  const filteredUsers = allUsers.filter(u =>
    !searchUser || `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(searchUser.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Currently Assigned Scorekeepers */}
      {scorekeepers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-[#1d1d1f] mb-4">Assigned Scorekeepers</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scorekeepers.map((sk: any) => (
              <div key={sk.user_id} className="flex items-center gap-3 p-3 bg-[#f5f5f7] rounded-xl">
                <div className="w-10 h-10 bg-[#003e79] rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {(sk.first_name?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[#1d1d1f] truncate">{sk.first_name} {sk.last_name}</p>
                  <p className="text-xs text-[#86868b]">{sk.game_count} game{sk.game_count !== 1 ? 's' : ''} assigned</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assign Scorekeeper to Games */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-[#1d1d1f] mb-4">Assign Scorekeeper to Games</h3>

        {games.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-[#86868b]">No games scheduled for this event yet.</p>
            <p className="text-sm text-[#86868b] mt-1">Use the Schedule Builder to create games first.</p>
          </div>
        ) : (
          <>
            {/* Scorekeeper selector + assign button */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search scorekeepers..."
                  value={searchUser}
                  onChange={e => setSearchUser(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-[#003e79] focus:ring-2 focus:ring-blue-100 outline-none"
                />
                {searchUser && filteredUsers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl mt-1 shadow-lg z-10 max-h-48 overflow-y-auto">
                    {filteredUsers.map(u => (
                      <button key={u.id} onClick={() => { setSelectedScorekeeper(u.id); setSearchUser(`${u.first_name} ${u.last_name}`); }}
                        className={"w-full text-left px-4 py-2.5 text-sm hover:bg-[#f5f5f7] transition " + (selectedScorekeeper === u.id ? 'bg-blue-50 text-[#003e79] font-medium' : 'text-[#1d1d1f]')}>
                        {u.first_name} {u.last_name} <span className="text-[#86868b]">({u.email})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={assignScorekeeper}
                disabled={assigning || !selectedScorekeeper || selectedGames.size === 0}
                className={"px-6 py-2.5 rounded-xl font-semibold text-sm transition " +
                  (assigning || !selectedScorekeeper || selectedGames.size === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-[#003e79] text-white hover:bg-[#002d5a]')}
              >
                {assigning ? 'Assigning...' : `Assign to ${selectedGames.size} Game${selectedGames.size !== 1 ? 's' : ''}`}
              </button>
            </div>

            {/* Unassigned Games */}
            {unassignedGames.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-sm font-semibold text-[#1d1d1f]">Unassigned Games ({unassignedGames.length})</p>
                  <button onClick={selectAll} className="text-xs text-[#003e79] font-medium hover:underline">
                    {selectedGames.size === games.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="border border-[#e8e8ed] rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#fafafa] text-[#86868b] text-xs uppercase tracking-wide">
                      <th className="px-3 py-2 text-left w-8"></th>
                      <th className="px-3 py-2 text-left">Game</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Time</th>
                      <th className="px-3 py-2 text-left">Rink</th>
                      <th className="px-3 py-2 text-left">Division</th>
                    </tr></thead>
                    <tbody>
                      {unassignedGames.map(g => (
                        <tr key={g.id} onClick={() => toggleGame(g.id)}
                          className={"border-t border-[#e8e8ed] cursor-pointer transition " + (selectedGames.has(g.id) ? 'bg-blue-50' : 'hover:bg-[#fafafa]')}>
                          <td className="px-3 py-2.5">
                            <input type="checkbox" checked={selectedGames.has(g.id)} onChange={() => toggleGame(g.id)}
                              className="rounded border-gray-300 text-[#003e79] focus:ring-[#003e79]" />
                          </td>
                          <td className="px-3 py-2.5 font-medium text-[#1d1d1f]">{g.home_team_name || 'TBD'} vs {g.away_team_name || 'TBD'}</td>
                          <td className="px-3 py-2.5 text-[#6e6e73]">{g.game_date || '—'}</td>
                          <td className="px-3 py-2.5 text-[#6e6e73]">{formatTime(g.start_time)}</td>
                          <td className="px-3 py-2.5 text-[#6e6e73]">{g.rink_name || g.rink_id || '—'}</td>
                          <td className="px-3 py-2.5"><span className="px-2 py-0.5 bg-[#f0f7ff] text-[#003e79] rounded-full text-xs font-medium">{g.division_name || g.age_group || '—'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Assigned Games */}
            {assignedGames.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[#1d1d1f] mb-3">Assigned Games ({assignedGames.length})</p>
                <div className="border border-[#e8e8ed] rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#fafafa] text-[#86868b] text-xs uppercase tracking-wide">
                      <th className="px-3 py-2 text-left">Game</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Time</th>
                      <th className="px-3 py-2 text-left">Rink</th>
                      <th className="px-3 py-2 text-left">Scorekeeper</th>
                      <th className="px-3 py-2 text-left w-20"></th>
                    </tr></thead>
                    <tbody>
                      {assignedGames.map(g => (
                        <tr key={g.id} className="border-t border-[#e8e8ed]">
                          <td className="px-3 py-2.5 font-medium text-[#1d1d1f]">{g.home_team_name || 'TBD'} vs {g.away_team_name || 'TBD'}</td>
                          <td className="px-3 py-2.5 text-[#6e6e73]">{g.game_date || '—'}</td>
                          <td className="px-3 py-2.5 text-[#6e6e73]">{formatTime(g.start_time)}</td>
                          <td className="px-3 py-2.5 text-[#6e6e73]">{g.rink_name || g.rink_id || '—'}</td>
                          <td className="px-3 py-2.5 text-[#003e79] font-medium">{g.scorekeeper_name || '—'}</td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => unassignGames([g.id])} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- Event Detail Overlay ---
function EventDetail({ eventId, onBack, onEdit }: { eventId: string; onBack: () => void; onEdit?: (event: any) => void }) {
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'participants' | 'venues' | 'hotels' | 'schedules' | 'locker_rooms' | 'scorekeepers'>('overview');
  const [editingReg, setEditingReg] = useState<any>(null);
  const [hotels, setHotels] = useState<string[]>([]);
  const [hotelReport, setHotelReport] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/admin/detail/${eventId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setEvent(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // Fetch available hotels for this event
    fetch(`${API_BASE}/admin/hotels/${eventId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setHotels(json.data);
      })
      .catch(() => {});
  }, [eventId]);

  // Load hotel report when tab opens
  useEffect(() => {
    if (tab === 'hotels' && !hotelReport && !loadingReport) {
      setLoadingReport(true);
      fetch(`${HOTEL_API}/report/${eventId}`)
        .then(r => r.json())
        .then(json => {
          if (json.success) setHotelReport(json.data);
          setLoadingReport(false);
        })
        .catch(() => setLoadingReport(false));
    }
  }, [tab, eventId]);

  const handleRegSaved = (updated: any) => {
    if (!event) return;
    const newRegs = event.registrations.map((r: any) => r.id === updated.id ? updated : r);
    setEvent({ ...event, registrations: newRegs });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
      </div>
    );
  }

  if (!event) {
    return <div className="text-center py-20 text-[#86868b]">Event not found.</div>;
  }

  const summary = event.registration_summary || [];
  // Derive age groups from registration summary if the JSON field is empty
  const ageGroups = event.age_groups ? (event.age_groups.startsWith('[') ? JSON.parse(event.age_groups) : event.age_groups.split(',').map((s: string) => s.trim())) : summary.length > 0 ? summary.map((s: any) => s.age_group) : [];
  const divisions = event.divisions ? JSON.parse(event.divisions) : [];
  const allRegistrations = event.registrations || [];
  // Show ALL registrations (pending + approved + denied) so admins can manage them all
  const registrations = allRegistrations.filter((r: any) => r.status !== 'denied' && r.status !== 'withdrawn');
  const approvedRegistrations = allRegistrations.filter((r: any) => r.status === 'approved');
  const totalRevenue = approvedRegistrations.filter((r: any) => r.payment_status === 'paid').reduce((sum: number, r: any) => sum + (r.payment_amount_cents || 0), 0);

  // Group registrations by age_group, stable sort by team_name within each group
  const grouped: Record<string, any[]> = {};
  registrations.forEach((r: any) => {
    const ag = r.age_group || 'Unknown';
    if (!grouped[ag]) grouped[ag] = [];
    grouped[ag].push(r);
  });
  // Sort each group by team name so rows don't jump on status change
  Object.values(grouped).forEach(arr => arr.sort((a: any, b: any) => (a.team_name || '').localeCompare(b.team_name || '')));

  return (
    <div>
      {/* Back button + Header */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-[#003e79] hover:text-[#002d5a] font-medium text-sm mb-4 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Back to Events
      </button>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
        <div className="h-2 bg-gradient-to-r from-[#003e79] to-blue-600" />
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl"></span>
                <h1 className="text-2xl font-extrabold text-[#1d1d1f]">{event.name}</h1>
              </div>
              <p className="text-[#86868b]">
                {fmtDateFull(event.start_date)} - {fmtDateFull(event.end_date)} &middot; {event.city}, {event.state}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${statusColor(event.status)}`}>
                {statusLabel(event.status)}
              </span>
              {onEdit && (
                <button
                  onClick={() => onEdit(event)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-lg text-sm transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                  Edit Event
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[#f0f7ff] rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-[#003e79]">{registrations.length}</div>
              <div className="text-xs text-[#003e79] font-medium mt-1">Teams Registered</div>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-600">${(totalRevenue / 100).toLocaleString()}</div>
              <div className="text-xs text-green-500 font-medium mt-1">Revenue</div>
            </div>
            <div className="bg-[#f5f5f7] rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-[#1d1d1f]">{event.slots_count || 100}</div>
              <div className="text-xs text-[#86868b] font-medium mt-1">Max Slots</div>
            </div>
            <div className="bg-[#f0f7ff] rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-[#003e79]">{ageGroups.length}</div>
              <div className="text-xs text-[#003e79] font-medium mt-1">Age Groups</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1 w-fit mb-6">
        {(['overview', 'participants', 'venues', 'hotels', 'schedules', 'locker_rooms', 'scorekeepers'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            {t === 'overview' ? 'Overview' : t === 'participants' ? `Participants (${registrations.length})` : t === 'venues' ? 'Venues' : t === 'hotels' ? 'Hotel Report' : t === 'schedules' ? 'Schedules' : t === 'locker_rooms' ? 'Locker Rooms' : 'Scorekeepers'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Info */}
          {event.information && (
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-3">Event Information</h3>
              <p className="text-[#3d3d3d] leading-relaxed">{event.information}</p>
            </div>
          )}

          {/* Age Groups + Divisions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-3">Age Groups</h3>
              <div className="flex flex-wrap gap-2">
                {ageGroups.map((ag: string) => {
                  const count = grouped[ag]?.length || 0;
                  return (
                    <span key={ag} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#f0f7ff] text-[#003e79] rounded-full text-sm font-medium">
                      {ag}
                      {count > 0 && <span className="bg-[#003e79] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{count}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-3">Divisions</h3>
              <div className="flex flex-wrap gap-2">
                {divisions.map((d: string) => (
                  <span key={d} className="px-3 py-1.5 bg-[#fafafa] text-[#3d3d3d] rounded-full text-sm font-medium">{d}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Registration Summary by Age Group */}
          {summary.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-3">Registration Breakdown</h3>
              <div className="space-y-2">
                {summary.map((s: any) => {
                  const pct = Math.min(100, (s.team_count / (event.slots_count || 100)) * 100 * (ageGroups.length || 1));
                  return (
                    <div key={s.age_group} className="flex items-center gap-3">
                      <span className="w-20 text-sm font-medium text-[#3d3d3d]">{s.age_group}</span>
                      <div className="flex-1 bg-[#fafafa] rounded-full h-3 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#003e79] to-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-bold text-[#1d1d1f] w-16 text-right">{s.team_count} teams</span>
                      <span className="text-sm text-green-600 font-medium w-20 text-right">${(s.revenue_cents / 100).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'participants' && (
        <div className="space-y-4">
          {editingReg && (
            <EditRegistrationModal
              reg={editingReg}
              eventId={eventId}
              hotels={hotels}
              onClose={() => setEditingReg(null)}
              onSaved={handleRegSaved}
            />
          )}
          {Object.keys(grouped).sort().map((ageGroup) => {
            const groupPaid = grouped[ageGroup].filter((r: any) => r.payment_status === 'paid').length;
            const groupHotel = grouped[ageGroup].filter((r: any) => r.hotel_assigned).length;
            const groupApproved = grouped[ageGroup].filter((r: any) => r.status === 'approved').length;
            const groupPending = grouped[ageGroup].filter((r: any) => !r.status || r.status === 'pending').length;
            const groupWaitlisted = grouped[ageGroup].filter((r: any) => r.status === 'waitlisted').length;
            return (
            <div key={ageGroup} className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-[#f5f5f7] px-5 py-3 border-b border-[#e8e8ed] flex items-center justify-between">
                <h3 className="font-bold text-[#1d1d1f]">{ageGroup}</h3>
                <div className="flex items-center gap-3">
                  {groupPending > 0 && <span className="text-[11px] text-orange-600 font-medium">{groupPending} pending</span>}
                  <span className="text-[11px] text-green-600 font-medium">{groupApproved} approved</span>
                  {groupWaitlisted > 0 && <span className="text-[11px] text-amber-600 font-medium">{groupWaitlisted} waitlisted</span>}
                  <span className="text-[11px] text-[#003e79] font-medium">{groupPaid}/{grouped[ageGroup].length} paid</span>
                  <span className="text-sm text-[#86868b] font-medium">{grouped[ageGroup].length} team{grouped[ageGroup].length !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#f5f5f7] text-left">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold text-[#6e6e73]">Team</th>
                      <th className="px-4 py-2.5 font-semibold text-[#6e6e73]">Manager</th>
                      <th className="px-4 py-2.5 font-semibold text-[#6e6e73]">Contact</th>
                      <th className="px-4 py-2.5 font-semibold text-[#6e6e73]">Division</th>
                      <th className="px-4 py-2.5 font-semibold text-[#6e6e73]">Status</th>
                      <th className="px-4 py-2.5 font-semibold text-[#6e6e73]">Payment</th>
                      <th className="px-4 py-2.5 font-semibold text-[#6e6e73]">Hotel</th>
                      <th className="px-4 py-2.5 font-semibold text-[#6e6e73] w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[ageGroup].map((reg: any) => (
                      <tr key={reg.id} className={"border-b border-[#e8e8ed] hover:bg-[#f5f5f7] transition" + (reg.status === 'denied' ? ' opacity-50' : '')}>
                        <td className="px-4 py-3 font-medium text-[#1d1d1f]">{reg.team_name}</td>
                        <td className="px-4 py-3 text-[#6e6e73] text-xs">
                          {reg.manager_first_name ? `${reg.manager_first_name} ${reg.manager_last_name || ''}`.trim() : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[#6e6e73] text-xs">{reg.email1}</div>
                          {reg.phone && <div className="text-[#86868b] text-[11px]">{reg.phone}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {reg.division ? (
                            <span className="text-xs font-medium px-2 py-0.5 bg-[#fafafa] text-[#3d3d3d] rounded">{reg.division}</span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={reg.status || 'pending'}
                            onChange={async (e) => {
                              const newStatus = e.target.value;
                              // Optimistic update — apply immediately so UI doesn't jump
                              handleRegSaved({ ...reg, status: newStatus });
                              try {
                                const res = await fetch(`${API_BASE}/admin/registration/${reg.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ status: newStatus }),
                                });
                                const json = await res.json() as any;
                                if (json.success) {
                                  handleRegSaved(json.data);
                                } else {
                                  // Revert on failure
                                  handleRegSaved(reg);
                                }
                              } catch {
                                // Revert on error
                                handleRegSaved(reg);
                              }
                            }}
                            className={`text-xs font-semibold rounded-lg px-2 py-1.5 border-0 cursor-pointer focus:ring-2 focus:ring-[#003e79]/20 outline-none transition ${
                              reg.status === 'approved' ? 'bg-green-100 text-green-700' :
                              reg.status === 'denied' ? 'bg-red-100 text-red-700' :
                              reg.status === 'waitlisted' ? 'bg-amber-100 text-amber-700' :
                              'bg-orange-100 text-orange-700'
                            }`}
                          >
                            <option value="pending">⏳ Pending</option>
                            <option value="approved">✅ Approved</option>
                            <option value="denied">❌ Denied</option>
                            <option value="waitlisted">📋 Waitlisted</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${paymentStatusColor(reg.payment_status || 'unpaid')}`}>
                              {paymentStatusLabel(reg.payment_status || 'unpaid')}
                            </span>
                            {reg.payment_amount_cents ? (
                              <span className="text-xs font-medium text-[#3d3d3d]">${(reg.payment_amount_cents / 100).toLocaleString()}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {reg.hotel_assigned ? (
                            <div>
                              <span className="text-xs font-medium text-[#003e79]">{reg.hotel_assigned}</span>
                              <span className="block text-[10px] text-green-600 font-medium">Assigned</span>
                            </div>
                          ) : reg.hotel_choice === 'Local Team' ? (
                            <span className="text-xs text-[#86868b]">Local Team</span>
                          ) : reg.hotel_pref_1 ? (
                            <div>
                              <span className="text-xs text-[#86868b] truncate block max-w-[120px]">{reg.hotel_pref_1}</span>
                              <span className="text-[10px] text-amber-500 font-medium">Needs assignment</span>
                            </div>
                          ) : (
                            <span className="text-xs text-[#86868b]">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setEditingReg(reg)}
                            className="p-1.5 hover:bg-[#f0f7ff] text-[#86868b] hover:text-[#003e79] rounded-lg transition"
                            title="Edit registration"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {tab === 'venues' && (
        <VenuesTab eventId={eventId} eventState={event.state} onVenueChanged={() => {
          // Reload event data
          fetch(`${API_BASE}/admin/detail/${eventId}`).then(r => r.json()).then(json => {
            if (json.success) setEvent(json.data);
          });
        }} />
      )}

      {tab === 'hotels' && (
        <div className="space-y-6">
          {loadingReport ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
            </div>
          ) : !hotelReport ? (
            <div className="bg-white rounded-2xl shadow-lg p-6 text-center text-[#86868b]">
              <p>Unable to load hotel report.</p>
            </div>
          ) : (
            <>
              {/* Report Header Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                  <div className="text-xl font-bold text-[#1d1d1f]">{hotelReport.total_teams}</div>
                  <div className="text-[11px] text-[#86868b] mt-1">Total Teams</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                  <div className="text-xl font-bold text-green-600">{hotelReport.total_assigned}</div>
                  <div className="text-[11px] text-[#86868b] mt-1">Hotel Assigned</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                  <div className="text-xl font-bold text-amber-600">{hotelReport.total_unassigned}</div>
                  <div className="text-[11px] text-[#86868b] mt-1">Unassigned</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                  <div className="text-xl font-bold text-[#003e79]">{hotelReport.total_local}</div>
                  <div className="text-[11px] text-[#86868b] mt-1">Local Teams</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                  <div className="text-xl font-bold text-[#003e79]">{hotelReport.event_nights}</div>
                  <div className="text-[11px] text-[#86868b] mt-1">Event Nights</div>
                </div>
              </div>

              {/* Hotel Breakdown */}
              {hotelReport.hotels?.map((h: any) => (
                <div key={h.hotel_id} className="bg-white rounded-2xl shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-50 to-[#f0f7ff] px-5 py-4 border-b border-blue-100">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-[#1d1d1f] text-lg">{h.hotel_name}</h3>
                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                          {h.contact_name && (
                            <span className="text-xs text-[#003e79] font-medium">Rep: {h.contact_name} {h.contact_email ? `(${h.contact_email})` : ''}</span>
                          )}
                          {h.rate_description && (
                            <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{h.rate_description}</span>
                          )}
                          {h.booking_code && (
                            <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">Code: {h.booking_code}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-[#003e79]">{h.teams_assigned}</div>
                        <div className="text-[10px] text-[#86868b]">teams</div>
                      </div>
                    </div>
                    {/* Key metrics */}
                    <div className="grid grid-cols-4 gap-3 mt-3">
                      <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
                        <div className="text-sm font-bold text-[#1d1d1f]">{h.total_players}</div>
                        <div className="text-[10px] text-[#86868b]">Players</div>
                      </div>
                      <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
                        <div className="text-sm font-bold text-[#1d1d1f]">{h.estimated_rooms}</div>
                        <div className="text-[10px] text-[#86868b]">Est. Rooms</div>
                      </div>
                      <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
                        <div className="text-sm font-bold text-[#1d1d1f]">{h.estimated_nights}</div>
                        <div className="text-[10px] text-[#86868b]">Room Nights</div>
                      </div>
                      <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
                        <div className="text-sm font-bold text-[#1d1d1f]">{h.room_block_count || '—'}</div>
                        <div className="text-[10px] text-[#86868b]">Block Size</div>
                      </div>
                    </div>
                  </div>

                  {/* Teams list */}
                  {h.teams?.length > 0 && (
                    <div className="divide-y divide-[#e8e8ed]">
                      {h.teams.map((t: any, i: number) => (
                        <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-[#f5f5f7] transition">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-[#1d1d1f] truncate">{t.team_name}</span>
                              <span className="text-[10px] bg-[#fafafa] text-[#6e6e73] px-2 py-0.5 rounded-full">{t.age_group}</span>
                              {t.division && <span className="text-[10px] bg-[#f0f7ff] text-[#003e79] px-2 py-0.5 rounded-full">{t.division}</span>}
                            </div>
                            <div className="text-xs text-[#86868b] mt-0.5">
                              {t.manager_name && <span>{t.manager_name}</span>}
                              {t.manager_email && <span className="ml-2 text-[#86868b]">{t.manager_email}</span>}
                              {t.manager_phone && <span className="ml-2 text-[#86868b]">{t.manager_phone}</span>}
                            </div>
                          </div>
                          <div className="text-right ml-3">
                            <div className="text-sm font-bold text-[#1d1d1f]">{t.roster_count}</div>
                            <div className="text-[10px] text-[#86868b]">players</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {h.teams?.length === 0 && (
                    <div className="px-5 py-4 text-center text-sm text-[#86868b]">No teams assigned yet</div>
                  )}
                </div>
              ))}

              {/* Unassigned Teams */}
              {hotelReport.unassigned_teams?.length > 0 && (
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                  <div className="bg-amber-50 px-5 py-4 border-b border-amber-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-amber-800">Unassigned Teams</h3>
                        <p className="text-xs text-amber-600 mt-0.5">These teams have not been assigned a hotel yet</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-amber-600">{hotelReport.unassigned_teams.length}</div>
                        <div className="text-[10px] text-[#86868b]">teams</div>
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-[#e8e8ed]">
                    {hotelReport.unassigned_teams.map((t: any, i: number) => (
                      <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-[#f5f5f7]">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-[#1d1d1f]">{t.team_name}</span>
                            <span className="text-[10px] bg-[#fafafa] text-[#6e6e73] px-2 py-0.5 rounded-full">{t.age_group}</span>
                          </div>
                          <div className="text-xs text-[#86868b] mt-0.5">
                            {t.manager_name && <span>{t.manager_name}</span>}
                            {t.manager_email && <span className="ml-2 text-[#86868b]">{t.manager_email}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'schedules' && (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <svg className="w-14 h-14 mx-auto text-[#003e79] mb-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
          <p className="font-semibold text-[#1d1d1f] text-lg">No schedule yet</p>
          <p className="text-sm text-[#6e6e73] mt-1 mb-5">Build the game schedule for this event in the Schedule Builder.</p>
          <a
            href="/admin/schedule"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#003e79] text-white font-semibold text-sm hover:bg-[#002d5a] transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Open Schedule Builder
          </a>
        </div>
      )}

      {tab === 'locker_rooms' && (
        <LockerRoomsTab eventId={eventId} />
      )}

      {tab === 'scorekeepers' && (
        <ScorekeepersTab eventId={eventId} />
      )}
    </div>
  );
}

// --- Month helpers ---
const getMonthKey = (d: string) => {
  const dt = new Date(d + 'T12:00:00');
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthLabel = (key: string) => {
  const [y, m] = key.split('-');
  const dt = new Date(parseInt(y), parseInt(m) - 1, 1);
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

// --- Main Admin Events Page ---
export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [seasonFilter, setSeasonFilter] = useState<string>('2026-27');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventItem | null | 'create'>(null);
  const [tournaments, setTournaments] = useState<{ id: string; name: string }[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<EventItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [importState, setImportState] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle');
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importResult, setImportResult] = useState<any>(null);
  const [importDragOver, setImportDragOver] = useState(false);

  const reloadEvents = () => setRefreshKey(k => k + 1);

  // Excel import helpers
  const loadXLSX = useCallback((): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).XLSX) { resolve((window as any).XLSX); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload = () => resolve((window as any).XLSX);
      s.onerror = () => reject(new Error('Failed to load SheetJS'));
      document.head.appendChild(s);
    });
  }, []);

  const parseExcelFile = useCallback(async (file: File) => {
    const XLSX = await loadXLSX();
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const mapped = rows.filter((r: any) => r['Event Name']?.toString().trim()).map((r: any) => {
      const fmtDate = (v: any) => {
        if (!v) return '';
        if (v instanceof Date) return v.toISOString().split('T')[0];
        return String(v).trim();
      };
      return {
        name: String(r['Event Name'] || '').trim(),
        city: String(r['City'] || '').trim(),
        state: String(r['State'] || '').trim(),
        start_date: fmtDate(r['Start Date']),
        end_date: fmtDate(r['End Date']),
        status: String(r['Status'] || 'draft').trim().toLowerCase(),
        age_groups: String(r['Age Groups'] || '').trim(),
        price_dollars: r['Price ($)'] ? Number(r['Price ($)']) : null,
        deposit_dollars: r['Deposit ($)'] ? Number(r['Deposit ($)']) : null,
        slots_count: r['Team Slots'] ? Number(r['Team Slots']) : null,
        registration_open_date: fmtDate(r['Reg. Opens']),
        registration_deadline: fmtDate(r['Reg. Deadline']),
        description: String(r['Description'] || '').trim() || null,
        season: String(r['Season'] || '').trim() || null,
      };
    });
    setImportRows(mapped);
    setImportState('preview');
  }, []);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseExcelFile(file);
  }, [parseExcelFile]);

  const handleImportDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setImportDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseExcelFile(file);
  }, [parseExcelFile]);

  const runImport = useCallback(async () => {
    setImportState('importing');
    try {
      const res = await fetch('https://uht.chad-157.workers.dev/api/events/admin/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: importRows }),
      });
      const json = await res.json();
      setImportResult(json.data);
      setImportState('done');
      reloadEvents();
    } catch {
      setImportResult({ created: 0, failed: importRows.length, total: importRows.length, results: [{ name: 'All', error: 'Network error' }] });
      setImportState('done');
    }
  }, [importRows]);

  const closeImport = () => {
    setShowImport(false);
    setImportState('idle');
    setImportRows([]);
    setImportResult(null);
    setImportDragOver(false);
  };

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/admin/list?filter=${filter}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setEvents(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filter, refreshKey]);

  // Fetch tournaments + venues for form dropdowns
  useEffect(() => {
    fetch(`${API_BASE}/admin/tournaments`)
      .then(r => r.json())
      .then(json => { if (json.success) setTournaments(json.data.map((t: any) => ({ id: t.id, name: t.name }))); })
      .catch(() => {});
    fetch(`${API_BASE}/admin/venues`)
      .then(r => r.json())
      .then(json => { if (json.success) setVenues(json.data); })
      .catch(() => {});
  }, []);

  const handleDuplicate = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/duplicate/${id}`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        reloadEvents();
      }
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/delete/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setDeleteConfirm(null);
        reloadEvents();
      }
    } catch (e) { console.error(e); }
  };

  // Map DB season values to hockey-year display buckets
  const seasonBucket = (dbSeason: string | null): string => {
    const s = (dbSeason || '').toLowerCase();
    if (s.includes('fall-2026') || s.includes('winter-2026') || s.includes('winter-2027')) return '2026-27';
    if (s === '2025/2026' || s.includes('fall-2025') || s.includes('winter-2025')) return '2025-26';
    if (s === '2024/2025' || s.includes('fall-2024') || s.includes('winter-2024')) return '2024-25';
    // Future-proof: try to extract year from season string
    const yearMatch = s.match(/(\d{4})/);
    if (yearMatch) {
      const y = parseInt(yearMatch[1]);
      const month = s.includes('fall') ? 10 : s.includes('winter') ? 1 : 10;
      // If the season starts in fall of year Y, it's the Y-(Y+1) season
      if (s.includes('fall')) return `${y}-${String(y + 1).slice(2)}`;
      if (s.includes('winter') || s.includes('spring')) return `${y - 1}-${String(y).slice(2)}`;
      // Format like "2025/2026" → "2025-26"
      if (s.includes('/')) return `${y}-${String(y + 1).slice(2)}`;
    }
    return 'other';
  };

  // Build dynamic season options from actual data
  const seasonOptions = useMemo(() => {
    const bucketCounts = new Map<string, number>();
    for (const e of events) {
      const bucket = seasonBucket(e.season);
      bucketCounts.set(bucket, (bucketCounts.get(bucket) || 0) + 1);
    }
    return Array.from(bucketCounts.entries())
      .sort((a, b) => b[0].localeCompare(a[0])) // newest first
      .map(([bucket, count]) => ({ bucket, count }));
  }, [events]);

  // Get unique months from events for month filter
  const seasonEvents = seasonFilter === 'all' ? events : events.filter(e => seasonBucket(e.season) === seasonFilter);
  const months = Array.from(new Set(seasonEvents.map(e => getMonthKey(e.start_date)))).sort();

  // Reset month filter when switching tabs/seasons if that month doesn't exist
  const activeMonth = monthFilter !== 'all' && !months.includes(monthFilter) ? 'all' : monthFilter;

  const filtered = events.filter((e) => {
    const matchesSearch = !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.tournament_name && e.tournament_name.toLowerCase().includes(search.toLowerCase())) ||
      e.city.toLowerCase().includes(search.toLowerCase());
    const matchesMonth = activeMonth === 'all' || getMonthKey(e.start_date) === activeMonth;
    const matchesSeason = seasonFilter === 'all' || seasonBucket(e.season) === seasonFilter;
    return matchesSearch && matchesMonth && matchesSeason;
  }).sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

  // Stats
  const totalTeams = events.reduce((sum, e) => sum + e.registration_count, 0);
  const totalRevenue = events.reduce((sum, e) => sum + (e.total_revenue_cents || 0), 0);

  // Full-page edit/create mode
  if (editingEvent) {
    return (
      <div className="bg-[#fafafa] min-h-full">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <EventFormModal
            event={editingEvent === 'create' ? null : editingEvent}
            tournaments={tournaments}
            venues={venues}
            onClose={() => setEditingEvent(null)}
            onSaved={reloadEvents}
          />
        </div>
      </div>
    );
  }

  if (selectedEventId) {
    return (
      <div className="bg-[#fafafa] min-h-full">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <EventDetail eventId={selectedEventId} onBack={() => setSelectedEventId(null)} onEdit={(evt) => setEditingEvent(evt)} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#fafafa] min-h-full">

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeImport}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8ed]">
              <h2 className="text-lg font-bold text-[#1d1d1f]">Import Events from Excel</h2>
              <button onClick={closeImport} className="text-[#86868b] hover:text-[#1d1d1f] text-xl font-bold">×</button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(85vh-130px)]">
              {importState === 'idle' && (
                <div>
                  <div
                    className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors ${importDragOver ? 'border-[#003e79] bg-[#f0f7ff]' : 'border-[#e8e8ed] hover:border-[#003e79]/40'}`}
                    onDragOver={e => { e.preventDefault(); setImportDragOver(true); }}
                    onDragLeave={() => setImportDragOver(false)}
                    onDrop={handleImportDrop}
                  >
                    <svg className="w-12 h-12 mx-auto text-[#86868b] mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9.75m0 0l2.25-2.25M9.75 15l2.25 2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6.75A2.25 2.25 0 0018 4.5H6A2.25 2.25 0 003.75 6.75v11.25c0 1.242 1.008 2.25 2.25 2.25z" />
                    </svg>
                    <p className="text-[#1d1d1f] font-semibold mb-1">Drop your Excel file here</p>
                    <p className="text-sm text-[#86868b] mb-4">or click to browse (.xlsx, .xls, .csv)</p>
                    <label className="inline-block px-5 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm cursor-pointer transition-colors">
                      Choose File
                      <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} className="hidden" />
                    </label>
                  </div>
                  <p className="text-xs text-[#86868b] mt-3 text-center">Use the UHT Event Import Template for best results. Required columns: Event Name, City, State, Start Date, End Date</p>
                </div>
              )}

              {importState === 'preview' && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    </div>
                    <p className="text-sm font-semibold text-[#1d1d1f]">{importRows.length} event{importRows.length !== 1 ? 's' : ''} found — review before importing</p>
                  </div>
                  <div className="bg-white rounded-xl border border-[#e8e8ed] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#e8e8ed] bg-[#fafafa]">
                          <th className="text-left px-3 py-2 font-semibold text-[#86868b] text-xs">#</th>
                          <th className="text-left px-3 py-2 font-semibold text-[#86868b] text-xs">Event Name</th>
                          <th className="text-left px-3 py-2 font-semibold text-[#86868b] text-xs">Location</th>
                          <th className="text-left px-3 py-2 font-semibold text-[#86868b] text-xs">Dates</th>
                          <th className="text-left px-3 py-2 font-semibold text-[#86868b] text-xs">Age Groups</th>
                          <th className="text-right px-3 py-2 font-semibold text-[#86868b] text-xs">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((row, i) => {
                          const missing = !row.name || !row.city || !row.state || !row.start_date || !row.end_date;
                          return (
                            <tr key={i} className={`border-b border-[#f5f5f7] ${missing ? 'bg-red-50' : ''}`}>
                              <td className="px-3 py-2 text-[#86868b]">{i + 1}</td>
                              <td className="px-3 py-2 font-medium text-[#1d1d1f]">{row.name || <span className="text-red-500">Missing</span>}</td>
                              <td className="px-3 py-2 text-[#6e6e73]">{row.city}{row.state ? `, ${row.state}` : ''}</td>
                              <td className="px-3 py-2 text-[#6e6e73] whitespace-nowrap">{row.start_date} – {row.end_date}</td>
                              <td className="px-3 py-2 text-[#6e6e73] text-xs">{row.age_groups || '—'}</td>
                              <td className="px-3 py-2 text-right text-[#6e6e73]">{row.price_dollars ? `$${row.price_dollars}` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importState === 'importing' && (
                <div className="py-12 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#003e79] mx-auto mb-4" />
                  <p className="text-[#1d1d1f] font-semibold">Importing {importRows.length} events...</p>
                  <p className="text-sm text-[#86868b] mt-1">This may take a moment</p>
                </div>
              )}

              {importState === 'done' && importResult && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${importResult.failed === 0 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                      {importResult.failed === 0 ? (
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      ) : (
                        <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-[#1d1d1f]">{importResult.created} of {importResult.total} events created</p>
                      {importResult.failed > 0 && <p className="text-sm text-amber-600">{importResult.failed} failed — see details below</p>}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-[#e8e8ed] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#e8e8ed] bg-[#fafafa]">
                          <th className="text-left px-3 py-2 font-semibold text-[#86868b] text-xs">Event</th>
                          <th className="text-left px-3 py-2 font-semibold text-[#86868b] text-xs">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.results?.map((r: any, i: number) => (
                          <tr key={i} className="border-b border-[#f5f5f7]">
                            <td className="px-3 py-2 font-medium text-[#1d1d1f]">{r.name}</td>
                            <td className="px-3 py-2">
                              {r.error ? (
                                <span className="text-red-600 text-xs">{r.error}</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                  Created
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#e8e8ed] flex justify-between">
              <button onClick={closeImport} className="px-4 py-2 text-[#6e6e73] hover:text-[#1d1d1f] font-semibold text-sm transition">
                {importState === 'done' ? 'Close' : 'Cancel'}
              </button>
              {importState === 'preview' && (
                <button onClick={runImport} className="px-6 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition-colors">
                  Import {importRows.length} Event{importRows.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-1">Delete Event</h3>
              <p className="text-sm text-[#86868b] mb-1">Are you sure you want to delete</p>
              <p className="text-sm font-semibold text-[#1d1d1f] mb-4">{deleteConfirm.name}?</p>
              <p className="text-xs text-red-500 mb-5">This will also delete all {deleteConfirm.registration_count} registration(s). This cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 bg-[#fafafa] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-xl text-sm transition">Cancel</button>
                <button onClick={() => handleDelete(deleteConfirm.id)} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Event Management</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)} className="px-4 py-2 bg-white hover:bg-[#fafafa] text-[#003e79] border border-[#003e79] font-semibold rounded-xl text-sm transition flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
            Import Excel
          </button>
          <button onClick={() => setEditingEvent('create')} className="px-4 py-2 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition">
            + Create Event
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="max-w-7xl mx-auto px-6 mt-2">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-[#1d1d1f]">{events.length}</div>
            <div className="text-xs text-[#86868b] mt-1">{filter === 'upcoming' ? 'Upcoming' : filter === 'past' ? 'Past' : 'Total'} Events</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-[#003e79]">{totalTeams}</div>
            <div className="text-xs text-[#86868b] mt-1">Teams Registered</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">${(totalRevenue / 100).toLocaleString()}</div>
            <div className="text-xs text-[#86868b] mt-1">Total Revenue</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto px-6 mt-6 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Filter Toggle */}
          <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1">
            {(['upcoming', 'past', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setMonthFilter('all'); }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  filter === f ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1 max-w-xs">
            <input
              type="text"
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] outline-none"
            />
          </div>

          {/* View Toggle */}
          <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition ${viewMode === 'grid' ? 'bg-white shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}
              title="Grid view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition ${viewMode === 'list' ? 'bg-white shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}
              title="List view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 5.25h16.5m-16.5-10.5h16.5" /></svg>
            </button>
          </div>
        </div>

        {/* Season Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-[#86868b] uppercase tracking-wide mr-1">Season:</span>
          {seasonOptions.map(({ bucket, count }) => (
            <button
              key={bucket}
              onClick={() => { setSeasonFilter(bucket); setMonthFilter('all'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                seasonFilter === bucket ? 'bg-[#003e79] text-white shadow' : 'bg-white text-[#6e6e73] hover:bg-[#fafafa] shadow-sm'
              }`}
            >
              {bucket} <span className="opacity-60">({count})</span>
            </button>
          ))}
          <button
            onClick={() => { setSeasonFilter('all'); setMonthFilter('all'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              seasonFilter === 'all' ? 'bg-[#003e79] text-white shadow' : 'bg-white text-[#6e6e73] hover:bg-[#fafafa] shadow-sm'
            }`}
          >
            All Seasons <span className="opacity-60">({events.length})</span>
          </button>
        </div>

        {/* Month Filter */}
        {months.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-[#86868b] uppercase tracking-wide mr-1">Month:</span>
            <button
              onClick={() => setMonthFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeMonth === 'all' ? 'bg-[#003e79] text-white shadow' : 'bg-white text-[#6e6e73] hover:bg-[#fafafa] shadow-sm'
              }`}
            >
              All
            </button>
            {months.map((m) => {
              const count = seasonEvents.filter(e => getMonthKey(e.start_date) === m).length;
              return (
                <button
                  key={m}
                  onClick={() => setMonthFilter(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    activeMonth === m ? 'bg-[#003e79] text-white shadow' : 'bg-white text-[#6e6e73] hover:bg-[#fafafa] shadow-sm'
                  }`}
                >
                  {getMonthLabel(m)} <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Events Grid */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-[#86868b] mb-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
            <p className="text-[#86868b] font-medium">No {filter} events found</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
            {filtered.map((event) => (
              <EventCard key={event.id} event={event} onViewDetails={setSelectedEventId} onEdit={setEditingEvent} onDuplicate={handleDuplicate} onDelete={setDeleteConfirm} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e8e8ed] bg-[#fafafa]">
                  <th className="text-left px-4 py-3 font-semibold text-[#86868b] text-xs uppercase tracking-wide">Event</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#86868b] text-xs uppercase tracking-wide">Dates</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#86868b] text-xs uppercase tracking-wide">Location</th>
                  <th className="text-center px-4 py-3 font-semibold text-[#86868b] text-xs uppercase tracking-wide">Teams</th>
                  <th className="text-center px-4 py-3 font-semibold text-[#86868b] text-xs uppercase tracking-wide">Revenue</th>
                  <th className="text-center px-4 py-3 font-semibold text-[#86868b] text-xs uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#86868b] text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((event) => {
                  const statusColors: Record<string, string> = {
                    published: 'bg-blue-100 text-blue-700',
                    registration_open: 'bg-green-100 text-green-700',
                    draft: 'bg-gray-100 text-gray-600',
                    completed: 'bg-[#e8e8ed] text-[#6e6e73]',
                    sold_out: 'bg-red-100 text-red-700',
                  };
                  const statusLabel = event.status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Draft';
                  return (
                    <tr key={event.id} className="border-b border-[#f5f5f7] hover:bg-[#fafafa] transition cursor-pointer" onClick={() => setSelectedEventId(event.id)}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#1d1d1f]">{event.name}</div>
                        {event.tournament_name && <div className="text-xs text-[#86868b]">{event.tournament_name}</div>}
                      </td>
                      <td className="px-4 py-3 text-[#6e6e73] whitespace-nowrap">{fmtDate(event.start_date)} – {fmtDate(event.end_date)}</td>
                      <td className="px-4 py-3 text-[#6e6e73]">{event.city}, {event.state}</td>
                      <td className="px-4 py-3 text-center font-semibold text-[#003e79]">{event.registration_count}</td>
                      <td className="px-4 py-3 text-center font-semibold text-green-600">${((event.total_revenue_cents || 0) / 100).toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[event.status] || 'bg-gray-100 text-gray-600'}`}>{statusLabel}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={(e) => { e.stopPropagation(); setEditingEvent(event); }} className="text-[#003e79] hover:text-[#002d5a] text-xs font-semibold mr-3">Edit</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDuplicate(event.id); }} className="text-[#6e6e73] hover:text-[#1d1d1f] text-xs font-semibold mr-3">Duplicate</button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(event); }} className="text-[#86868b] hover:text-red-600 text-xs font-semibold">Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
