'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const API = 'https://uht.chad-157.workers.dev/api';

/* ── Types ── */
interface EventData {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  start_date: string;
  end_date: string;
  status: string;
  logo_url: string | null;
  banner_url: string | null;
  information: string | null;
  description: string | null;
  age_groups: string | null;
  divisions: string | null;
  price_cents: number | null;
  deposit_cents: number | null;
  multi_event_discount_pct: number | null;
  slots_count: number | null;
  is_sold_out: number;
  show_participants: number;
  registration_open_date: string | null;
  registration_deadline: string | null;
  rules_url: string | null;
  season: string | null;
  timezone: string | null;
  venue_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_state: string | null;
  schedule_published: number | null;
}

interface Hotel {
  id: string;
  event_id: string;
  name: string;
  city: string;
  state: string;
  rate_description: string | null;
  booking_url: string | null;
  description: string | null;
  room_type: string | null;
  rate_cents: number | null;
  amenities: string | null;
  image_url: string | null;
}

interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  website: string | null;
}

interface Rink {
  id: string;
  venue_id: string;
  name: string;
  surface_type: string | null;
  surface_size: string | null;
}

interface Division {
  id: string;
  age_group: string;
  division_level: string | null;
  price_cents: number;
  game_format: string | null;
  period_length_minutes: number;
  num_periods: number;
  max_teams: number | null;
  status: string;
  registered_count: number;
}

interface VenueWithRinks {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  website: string | null;
  rinks: Rink[];
}

/* ── Helpers ── */
function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
  if (s.getMonth() === e.getMonth()) {
    return `${s.toLocaleDateString('en-US', { month: 'long' })} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}, ${s.getFullYear()}`;
}

function formatPrice(cents: number | null) {
  if (!cents) return '';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function parseJsonArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'published':
    case 'registration_open': return 'Registration Open';
    case 'completed': return 'Completed';
    case 'active': return 'In Progress';
    case 'registration_closed': return 'Registration Closed';
    case 'cancelled': return 'Cancelled';
    case 'sold_out': return 'Sold Out';
    default: return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

function statusStyle(status: string): { bg: string; text: string; dot: string } {
  switch (status) {
    case 'published':
    case 'registration_open': return { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' };
    case 'active': return { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' };
    case 'registration_closed': return { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' };
    case 'completed': return { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
    case 'sold_out': return { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' };
    default: return { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
  }
}

const ageDefinitions: Record<string, string> = {
  'Mite': '8 & Under',
  'Squirt': '10 & Under',
  'Pee Wee': '12 & Under',
  'Bantam': '14 & Under',
  'Midget': '18 & Under',
  '16u': '16 & Under',
  '16u/JV': '16 & Under',
  '18u': '18 & Under',
  '18u/Var.': '18 & Under',
  'Girls 8u': 'Girls 8 & Under',
  'Girls 10u': 'Girls 10 & Under',
  'Girls 12u': 'Girls 12 & Under',
  'Girls 14u': 'Girls 14 & Under',
  'Adult': '18+',
  'JV': 'Junior Varsity',
  'Varsity': 'Varsity',
};

const skillLevels = ['AA', 'A', 'B', 'C', 'D', 'House'];

const TABS = ['Event Info', 'Schedule', 'Hotels', 'Rules'] as const;
type Tab = (typeof TABS)[number];

/* ── SVG Icons ── */
function CalendarIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  );
}

function DirectionsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m0-8.25a1.5 1.5 0 113 0V15m0-8.25a1.5 1.5 0 113 0m-3 0v.75m3-.75v8.25m0 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 003 0V9.75m0 0a1.5 1.5 0 00-3 0" />
    </svg>
  );
}

/* ── Main Component ── */
export default function EventDetail({ slug }: { slug: string }) {
  const [event, setEvent] = useState<EventData | null>(null);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [rinks, setRinks] = useState<Rink[]>([]);
  const [eventDivisions, setEventDivisions] = useState<Division[]>([]);
  const [eventVenues, setEventVenues] = useState<VenueWithRinks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('Event Info');

  const router = useRouter();

  const sectionRefs = {
    'Event Info': useRef<HTMLDivElement>(null),
    'Schedule': useRef<HTMLDivElement>(null),
    'Hotels': useRef<HTMLDivElement>(null),
    'Rules': useRef<HTMLDivElement>(null),
  };

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API}/events/${slug}`);
        if (!res.ok) { setError('Event not found'); setLoading(false); return; }
        const json = await res.json();
        const eventData = json.data;
        setEvent(eventData);

        // Fetch hotels
        if (eventData.id) {
          try {
            const hotelsRes = await fetch(`${API}/events/admin/event-hotels/${eventData.id}`);
            if (hotelsRes.ok) {
              const hotelsJson = await hotelsRes.json();
              setHotels(hotelsJson.data || []);
            }
          } catch {}
        }

        // Fetch venue & rinks (legacy single venue fallback)
        if (eventData.venue_id) {
          try {
            const venueRes = await fetch(`${API}/venues/${eventData.venue_id}`);
            if (venueRes.ok) {
              const venueJson = await venueRes.json();
              setVenue(venueJson.data?.venue || null);
              setRinks(venueJson.data?.rinks || []);
            }
          } catch {}
        }

        // Fetch all event venues with rinks (city-matched)
        if (eventData.id) {
          try {
            const venuesRes = await fetch(`${API}/events/event-venues/${eventData.id}`);
            if (venuesRes.ok) {
              const venuesJson = await venuesRes.json();
              setEventVenues(venuesJson.data || []);
            }
          } catch {}
        }

        // Fetch divisions with real pricing
        if (eventData.id) {
          try {
            const divRes = await fetch(`${API}/events/event-divisions/${eventData.id}`);
            if (divRes.ok) {
              const divJson = await divRes.json();
              setEventDivisions(divJson.data || []);
            }
          } catch {}
        }
      } catch (err) {
        setError('Failed to load event data');
      }
      setLoading(false);
    };
    if (slug) fetchEvent();
  }, [slug]);

  // Auto-redirect to schedule page when schedule is live
  useEffect(() => {
    if (event && event.schedule_published === 1) {
      router.replace(`/events/${slug}/schedule`);
    }
  }, [event, slug, router]);

  const scrollToSection = (tab: Tab) => {
    setActiveTab(tab);
    sectionRefs[tab]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ── Loading State ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        <div className="h-[360px] bg-gradient-to-r from-[#003e79] to-[#005599] animate-pulse" />
        <div className="max-w-6xl mx-auto px-6 -mt-6">
          <div className="bg-white rounded-2xl p-8 shadow-lg animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-2/3 mb-4" />
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-8" />
            <div className="grid grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Error State ── */
  if (error || !event) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-20 h-20 bg-[#f5f5f7] rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">🏒</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1d1d1f] mb-3">Event Not Found</h1>
          <p className="text-[#6e6e73] mb-8">{error || 'This event could not be loaded.'}</p>
          <a href="/events" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#003e79] text-white font-semibold hover:bg-[#002d5a] transition-colors">
            Back to Events
          </a>
        </div>
      </div>
    );
  }

  const ageGroups = parseJsonArray(event.age_groups);
  const divisions = parseJsonArray(event.divisions);
  const isUpcoming = event.status === 'registration_open' || event.status === 'published' || event.status === 'active';
  const ss = statusStyle(event.status);

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* ═══════ HERO ═══════ */}
      <div className="relative bg-gradient-to-br from-[#003e79] via-[#005599] to-[#0077cc] overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-[0.04]">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-white translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-white -translate-x-1/4 translate-y-1/4" />
        </div>
        {event.logo_url && (
          <img src={event.logo_url} alt="" className="absolute right-0 top-0 h-full w-auto opacity-[0.06] scale-125 blur-[2px] pointer-events-none select-none" />
        )}

        {/* Breadcrumbs */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-6">
          <nav className="flex items-center gap-2 text-sm text-white/50">
            <a href="/events" className="hover:text-white/80 transition-colors">Events</a>
            <span>/</span>
            <span className="text-white/70">{event.name}</span>
          </nav>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 pb-20">
          <div className="flex flex-col lg:flex-row items-start gap-8">
            {/* Logo */}
            <div className="w-28 h-28 lg:w-36 lg:h-36 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center shrink-0 overflow-hidden border border-white/20 shadow-lg">
              {event.logo_url ? (
                <img src={event.logo_url} alt={event.name} className="w-full h-full object-contain p-3" />
              ) : (
                <span className="text-5xl">🏒</span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${ss.bg} ${ss.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${ss.dot}`} />
                  {statusLabel(event.status)}
                </span>
                {event.season && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white/80 border border-white/20">
                    {event.season}
                  </span>
                )}
              </div>

              <h1 className="text-3xl lg:text-5xl font-bold text-white leading-tight tracking-tight">{event.name}</h1>

              <div className="flex flex-wrap items-center gap-4 mt-4 text-white/80 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon />
                  {formatDateRange(event.start_date, event.end_date)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPinIcon />
                  {event.city}, {event.state}
                </span>
                {ageGroups.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <UsersIcon />
                    {ageGroups.length} age groups
                  </span>
                )}
              </div>

              {/* Age group pills */}
              {ageGroups.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-5">
                  {ageGroups.map(ag => (
                    <span key={ag} className="px-3 py-1.5 bg-white/10 backdrop-blur-sm text-white text-xs font-semibold rounded-full border border-white/20">
                      {ag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* CTA */}
            <div className="shrink-0 flex flex-col items-end gap-3">
              {event.price_cents && (
                <div className="text-right">
                  <p className="text-white/50 text-xs font-medium uppercase tracking-wider">Starting at</p>
                  <p className="text-white text-3xl font-bold">{formatPrice(event.price_cents)}</p>
                  <p className="text-white/50 text-xs">per team</p>
                </div>
              )}
              {isUpcoming && (
                <a
                  href={`/register?event=${event.slug}&eventId=${event.id}`}
                  className="mt-2 px-8 py-3.5 rounded-full bg-[#00ccff] text-[#003e79] font-bold text-base hover:bg-[#00e6ff] active:scale-95 transition-all shadow-lg shadow-[#00ccff]/30"
                >
                  Register Now
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ TAB BAR ═══════ */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#e8e8ed] shadow-sm">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-0 overflow-x-auto -mb-px">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => scrollToSection(tab)}
                className={
                  "px-5 py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap " +
                  (activeTab === tab
                    ? "border-[#003e79] text-[#003e79]"
                    : "border-transparent text-[#86868b] hover:text-[#1d1d1f]")
                }
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════ MAIN CONTENT ═══════ */}
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ─── LEFT COLUMN ─── */}
          <div className="lg:col-span-2 space-y-8">

            {/* EVENT INFO */}
            <section ref={sectionRefs['Event Info']}>
              <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="px-8 pt-8 pb-2">
                  <h2 className="text-xl font-bold text-[#1d1d1f] mb-1">Event Information</h2>
                  <p className="text-sm text-[#86868b]">Everything you need to know about this tournament</p>
                </div>

                <div className="px-8 pb-8">
                  {/* Skill Levels */}
                  {(eventDivisions.length > 0 || ageGroups.length > 0) && (
                    <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-[#003e79]/[0.03] to-[#00ccff]/[0.03] border border-[#003e79]/10">
                      <p className="text-sm font-semibold text-[#003e79] mb-2">Skill Levels Available</p>
                      <div className="flex flex-wrap gap-2">
                        {(divisions.length > 0 ? divisions : skillLevels).map(level => (
                          <span key={level} className="px-3 py-1 bg-white text-[#003e79] text-xs font-semibold rounded-full border border-[#003e79]/15 shadow-sm">
                            {level}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Age Level Definitions */}
                  {ageGroups.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-bold text-[#1d1d1f] mb-1">Age Level Definitions</h3>
                      <p className="text-xs text-[#86868b] mb-3">Spring age level determined by age, not birth year</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {ageGroups.map(ag => (
                          <div key={ag} className="flex items-center gap-3 p-3 rounded-xl bg-[#f5f5f7] border border-[#e8e8ed]">
                            <div className="w-9 h-9 rounded-lg bg-[#003e79]/10 flex items-center justify-center shrink-0">
                              <span className="text-[#003e79] font-bold text-xs">{ag.slice(0, 2).toUpperCase()}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#1d1d1f] truncate">{ag}</p>
                              <p className="text-xs text-[#6e6e73]">{ageDefinitions[ag] || '—'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Description — supports HTML from WYSIWYG editor */}
                  {(event.information || event.description) && (
                    <div className="mt-6">
                      <h3 className="text-sm font-bold text-[#1d1d1f] mb-3">About This Event</h3>
                      {event.information && (
                        <div
                          className="text-sm text-[#6e6e73] leading-relaxed mb-3 prose prose-sm max-w-none [&_a]:text-[#003e79] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-[#1d1d1f] [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-[#1d1d1f] [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-[#1d1d1f] [&_p]:mb-2"
                          dangerouslySetInnerHTML={{ __html: event.information }}
                        />
                      )}
                      {event.description && (
                        <div
                          className="text-sm text-[#6e6e73] leading-relaxed prose prose-sm max-w-none [&_a]:text-[#003e79] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2"
                          dangerouslySetInnerHTML={{ __html: event.description }}
                        />
                      )}
                    </div>
                  )}

                  {/* 4 Game Guarantee callout */}
                  <div className="mt-6 flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">4 Game Guarantee</p>
                      <p className="text-xs text-emerald-600">Every team is guaranteed at least 4 games (3 pool play + bracket)</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ARENAS */}
            {(eventVenues.length > 0 || venue) && (
              <section>
                <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden">
                  <div className="px-8 pt-8 pb-2">
                    <h2 className="text-xl font-bold text-[#1d1d1f] mb-1">Arenas</h2>
                    <p className="text-sm text-[#86868b]">
                      {eventVenues.length > 0
                        ? `${eventVenues.length} venue${eventVenues.length > 1 ? 's' : ''} — where the games take place`
                        : 'Where the games take place'}
                    </p>
                  </div>
                  <div className="px-8 pb-8 mt-4 space-y-3">
                    {(eventVenues.length > 0 ? eventVenues : (venue ? [{ ...venue, rinks }] : [])).map((v: any) => (
                      <div key={v.id} className="p-4 rounded-xl border border-[#e8e8ed] bg-[#fafafa] hover:border-[#003e79]/20 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[#003e79]/10 flex items-center justify-center shrink-0 mt-0.5">
                              <BuildingIcon />
                            </div>
                            <div>
                              <p className="font-semibold text-[#1d1d1f] text-sm">{v.name}</p>
                              <p className="text-xs text-[#6e6e73] mt-0.5">
                                {v.address}{v.city ? `, ${v.city}` : ''}{v.state ? `, ${v.state}` : ''}{v.zip ? ` ${v.zip}` : ''}
                              </p>
                              {v.rinks && v.rinks.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {v.rinks.map((rink: Rink) => (
                                    <span key={rink.id} className="px-2 py-0.5 bg-[#f0f7ff] text-[#003e79] text-xs font-medium rounded-md">
                                      {rink.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          {v.address && (
                            <a
                              href={`https://www.google.com/maps/place/${encodeURIComponent((v.address || '') + ', ' + (v.city || '') + ', ' + (v.state || '') + ' ' + (v.zip || ''))}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#003e79] text-white text-xs font-semibold hover:bg-[#002d5a] transition-colors"
                            >
                              <MapPinIcon />
                              Directions
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* FORMAT & PRICING */}
            {(eventDivisions.length > 0 || ageGroups.length > 0) && (
              <section>
                <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden">
                  <div className="px-8 pt-8 pb-2">
                    <h2 className="text-xl font-bold text-[#1d1d1f] mb-1">Format & Pricing</h2>
                    <p className="text-sm text-[#86868b]">Period lengths and registration fees by age group</p>
                  </div>
                  <div className="px-8 pb-8 mt-4">
                    <div className="rounded-xl border border-[#e8e8ed] overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[#003e79]">
                            <th className="text-left px-5 py-3 text-xs font-bold text-white uppercase tracking-wider">Age Group</th>
                            <th className="text-center px-5 py-3 text-xs font-bold text-white uppercase tracking-wider">Format</th>
                            <th className="text-center px-5 py-3 text-xs font-bold text-white uppercase tracking-wider">Period Length</th>
                            <th className="text-center px-5 py-3 text-xs font-bold text-white uppercase tracking-wider">Spots</th>
                            <th className="text-right px-5 py-3 text-xs font-bold text-white uppercase tracking-wider">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eventDivisions.length > 0 ? (
                            eventDivisions.map((div, idx) => (
                              <tr key={div.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}>
                                <td className="px-5 py-3.5 font-semibold text-[#1d1d1f]">
                                  {div.age_group}
                                  {div.division_level && (
                                    <span className="ml-1.5 text-xs font-medium text-[#86868b]">({div.division_level})</span>
                                  )}
                                </td>
                                <td className="px-5 py-3.5 text-center text-[#6e6e73]">
                                  {div.game_format || `${div.num_periods}x${div.period_length_minutes}`}
                                </td>
                                <td className="px-5 py-3.5 text-center text-[#6e6e73]">
                                  {div.period_length_minutes} min
                                </td>
                                <td className="px-5 py-3.5 text-center text-[#6e6e73]">
                                  {div.max_teams ? (
                                    <span>
                                      {div.registered_count}/{div.max_teams}
                                      {div.registered_count >= (div.max_teams || 0) && (
                                        <span className="ml-1 text-xs font-bold text-red-500">FULL</span>
                                      )}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td className="px-5 py-3.5 text-right font-bold text-[#003e79]">
                                  {formatPrice(div.price_cents)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            ageGroups.map((ag, idx) => (
                              <tr key={ag} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}>
                                <td className="px-5 py-3.5 font-semibold text-[#1d1d1f]">{ag}</td>
                                <td className="px-5 py-3.5 text-center text-[#6e6e73]">—</td>
                                <td className="px-5 py-3.5 text-center text-[#6e6e73]">—</td>
                                <td className="px-5 py-3.5 text-center text-[#6e6e73]">—</td>
                                <td className="px-5 py-3.5 text-right font-bold text-[#003e79]">
                                  {formatPrice(event.price_cents)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {event.deposit_cents && (
                      <p className="mt-3 text-xs text-[#86868b]">
                        Deposit of {formatPrice(event.deposit_cents)} due at registration. Balance due before event start.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* SCHEDULE LINK */}
            <section ref={sectionRefs['Schedule']}>
              <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="px-8 py-8">
                  <h2 className="text-xl font-bold text-[#1d1d1f] mb-1">Schedule</h2>
                  <p className="text-sm text-[#86868b] mb-6">Game schedules, scores, and standings for this tournament</p>
                  <a
                    href={`/events/${event.slug}/schedule`}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#003e79] text-white font-semibold text-sm hover:bg-[#002d5a] transition-colors shadow-sm"
                  >
                    <CalendarIcon />
                    View Full Schedule
                    <ArrowIcon />
                  </a>
                </div>
              </div>
            </section>

            {/* HOTELS */}
            <section ref={sectionRefs['Hotels']}>
              <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="px-8 pt-8 pb-2">
                  <h2 className="text-xl font-bold text-[#1d1d1f] mb-1">Accommodation</h2>
                  <p className="text-sm text-[#86868b]">Partnered hotels with special tournament rates</p>
                </div>
                <div className="px-8 pb-8 mt-4">
                  {hotels.length > 0 ? (
                    <div className="space-y-3">
                      {hotels.map(hotel => (
                        <div key={hotel.id} className="group rounded-xl border border-[#e8e8ed] hover:border-[#003e79]/20 transition-all overflow-hidden">
                          <div className="p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-[#1d1d1f] text-sm">{hotel.name}</h3>
                                </div>
                                <p className="text-xs text-[#86868b] mt-1">{hotel.city}, {hotel.state}</p>
                                {hotel.room_type && (
                                  <p className="text-xs text-[#6e6e73] mt-1">{hotel.room_type}</p>
                                )}
                                {hotel.rate_description && (
                                  <p className="text-sm text-[#6e6e73] mt-2 leading-relaxed line-clamp-2">{hotel.rate_description}</p>
                                )}
                                {hotel.description && !hotel.rate_description && (
                                  <p className="text-sm text-[#6e6e73] mt-2 leading-relaxed line-clamp-2">{hotel.description}</p>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                {hotel.rate_cents ? (
                                  <>
                                    <p className="text-lg font-bold text-[#003e79]">{formatPrice(hotel.rate_cents)}</p>
                                    <p className="text-xs text-[#86868b]">per night</p>
                                  </>
                                ) : hotel.rate_description && (
                                  <p className="text-sm font-bold text-[#003e79]">{hotel.rate_description}</p>
                                )}
                              </div>
                            </div>
                            {hotel.booking_url && (
                              <div className="mt-4 pt-3 border-t border-[#e8e8ed]">
                                <a
                                  href={hotel.booking_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#f0f7ff] text-[#003e79] text-xs font-semibold hover:bg-[#e0efff] transition-colors"
                                >
                                  Book Now
                                  <ArrowIcon />
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-[#f5f5f7] border border-[#e8e8ed]">
                      <BuildingIcon />
                      <p className="text-sm text-[#6e6e73]">Hotel partner information will be posted soon. Check back for special tournament rates.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* RULES */}
            <section ref={sectionRefs['Rules']}>
              <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="px-8 py-8">
                  <h2 className="text-xl font-bold text-[#1d1d1f] mb-1">Tournament Rules</h2>
                  <p className="text-sm text-[#86868b] mb-6">Official rules and regulations for all participants</p>
                  {event.rules_url ? (
                    <a
                      href={event.rules_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#003e79] text-white font-semibold text-sm hover:bg-[#002d5a] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      View Rules PDF
                      <ArrowIcon />
                    </a>
                  ) : (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-[#f5f5f7] border border-[#e8e8ed]">
                      <svg className="w-5 h-5 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <p className="text-sm text-[#6e6e73]">Tournament rules will be posted before the event. Check back for updates.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* ─── RIGHT SIDEBAR ─── */}
          <div className="space-y-6">

            {/* Quick Info Card */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden sticky top-[65px]">
              <div className="bg-gradient-to-br from-[#003e79] to-[#005599] px-6 py-5">
                <h3 className="font-bold text-white text-base">Quick Info</h3>
              </div>
              <div className="px-6 py-5 space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <CalendarIcon />
                  <div>
                    <p className="text-xs text-[#86868b] font-medium uppercase tracking-wider">Dates</p>
                    <p className="font-semibold text-[#1d1d1f] mt-0.5">{formatDateRange(event.start_date, event.end_date)}</p>
                  </div>
                </div>
                <div className="h-px bg-[#e8e8ed]" />
                <div className="flex items-start gap-3">
                  <MapPinIcon />
                  <div>
                    <p className="text-xs text-[#86868b] font-medium uppercase tracking-wider">Location</p>
                    <p className="font-semibold text-[#1d1d1f] mt-0.5">{event.city}, {event.state}</p>
                  </div>
                </div>
                <div className="h-px bg-[#e8e8ed]" />
                <div className="flex items-start gap-3">
                  <UsersIcon />
                  <div>
                    <p className="text-xs text-[#86868b] font-medium uppercase tracking-wider">Age Groups</p>
                    <p className="font-semibold text-[#1d1d1f] mt-0.5">{ageGroups.length > 0 ? ageGroups.join(', ') : 'TBA'}</p>
                  </div>
                </div>
                {event.timezone && (
                  <>
                    <div className="h-px bg-[#e8e8ed]" />
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-xs text-[#86868b] font-medium uppercase tracking-wider">Timezone</p>
                        <p className="font-semibold text-[#1d1d1f] mt-0.5">{event.timezone}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Pricing */}
              {event.price_cents && (
                <div className="px-6 pb-5 pt-1">
                  <div className="p-4 rounded-xl bg-[#f5f5f7] border border-[#e8e8ed]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-[#86868b] font-medium">Starting at</span>
                      <span className="text-lg font-bold text-[#003e79]">{formatPrice(event.price_cents)}</span>
                    </div>
                    {event.deposit_cents && (
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-[#86868b] font-medium">Deposit</span>
                        <span className="text-sm font-semibold text-[#1d1d1f]">{formatPrice(event.deposit_cents)}</span>
                      </div>
                    )}
                    {typeof event.multi_event_discount_pct === 'number' && event.multi_event_discount_pct > 0 && (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 mt-2">
                        <span className="text-xs text-emerald-700 font-semibold">Multi-Event Discount</span>
                        <span className="text-sm font-bold text-emerald-700">{event.multi_event_discount_pct}% off</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Register Button */}
              {isUpcoming && (
                <div className="px-6 pb-6">
                  <a
                    href={`/register?event=${event.slug}&eventId=${event.id}`}
                    className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-[#003e79] text-white font-bold text-sm hover:bg-[#002d5a] transition-colors shadow-sm"
                  >
                    Register Your Team
                    <ArrowIcon />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
