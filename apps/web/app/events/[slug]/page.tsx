'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const API = 'https://uht.chad-157.workers.dev/api';

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
}

interface Hotel {
  id: string;
  event_id: string;
  name: string;
  city: string;
  state: string;
  rate_description: string | null;
  booking_url: string | null;
}

/* ── helpers ── */
function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const mo = s.toLocaleString('en-US', { month: 'short' });
  if (s.getMonth() === e.getMonth()) {
    return `${mo} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  const mo2 = e.toLocaleString('en-US', { month: 'short' });
  return `${mo} ${s.getDate()} – ${mo2} ${e.getDate()}, ${s.getFullYear()}`;
}

function formatPrice(cents: number | null) {
  if (!cents) return '';
  return `$${(cents / 100).toLocaleString()}`;
}

function parseJsonArray(s: string | null): string[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

function statusLabel(status: string) {
  switch (status) {
    case 'registration_open': return 'Registration Open';
    case 'completed': return 'Completed';
    case 'active': return 'In Progress';
    case 'registration_closed': return 'Registration Closed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case 'registration_open': return 'bg-emerald-500 text-white';
    case 'completed': return 'bg-gray-500 text-white';
    case 'active': return 'bg-blue-500 text-white';
    case 'registration_closed': return 'bg-amber-500 text-white';
    default: return 'bg-gray-400 text-white';
  }
}

function cityGradient(city: string): string {
  const c = city.toLowerCase();
  if (c.includes('chicago')) return 'from-[#003e79] to-[#00264d]';
  if (c.includes('st. louis') || c.includes('st louis')) return 'from-[#1a3a5c] to-[#0d1f33]';
  if (c.includes('south bend')) return 'from-[#0c4a1e] to-[#082d12]';
  if (c.includes('ann arbor')) return 'from-[#00274c] to-[#001a33]';
  if (c.includes('madison')) return 'from-[#c5050c] to-[#7a0308]';
  if (c.includes('holland')) return 'from-[#4a2c0f] to-[#2d1a09]';
  return 'from-[#003e79] to-[#001f3f]';
}

const ageDefinitions: Record<string, string> = {
  'Mite': '8 & Under',
  'Squirt': '10 & Under',
  'Pee Wee': '12 & Under',
  'Bantam': '14 & Under',
  'Midget': '18 & Under',
  '16u': '16 & Under',
  '18u': '18 & Under',
};

const periodLengths: Record<string, string> = {
  'Mite': '11 min',
  'Squirt': '12 min',
  'Pee Wee': '12 min',
  'Bantam': '13 min',
  '16u': '14 min',
  '18u': '14 min',
};

/* ── Tab Navigation ── */
function TabNav() {
  return (
    <div className="bg-gradient-to-r from-[#003e79]/95 to-[#002851]/95 backdrop-blur-md border-b border-[#00ccff]/20 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="flex items-center gap-0 overflow-x-auto">
          <button className="px-4 py-3 text-sm font-semibold border-b-2 border-[#00ccff] text-[#00ccff] transition-colors">
            Event Info
          </button>
          <button className="px-4 py-3 text-sm font-semibold border-b-2 border-transparent text-white/60 hover:text-white transition-colors">
            Schedule
          </button>
          <button className="px-4 py-3 text-sm font-semibold border-b-2 border-transparent text-white/60 hover:text-white transition-colors">
            Hotels
          </button>
          <button className="px-4 py-3 text-sm font-semibold border-b-2 border-transparent text-white/60 hover:text-white transition-colors">
            Rules
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Event Detail Page ── */
export default function EventDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [event, setEvent] = useState<EventData | null>(null);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API}/events/${slug}`);
        if (!res.ok) {
          setError('Event not found');
          setLoading(false);
          return;
        }
        const json = await res.json();
        const eventData = json.data;
        setEvent(eventData);

        // Fetch hotels if event loaded successfully
        if (eventData.id) {
          try {
            const hotelsRes = await fetch(`${API}/events/admin/event-hotels/${eventData.id}`);
            if (hotelsRes.ok) {
              const hotelsJson = await hotelsRes.json();
              setHotels(hotelsJson.data || []);
            }
          } catch (err) {
            console.warn('Failed to load hotels:', err);
          }
        }
      } catch (err) {
        console.error('Failed to load event:', err);
        setError('Failed to load event data');
      }
      setLoading(false);
    };

    if (slug) {
      fetchEvent();
    }
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a1929] via-[#051e35] to-[#051e35]">
        <div className="h-64 bg-gradient-to-r from-gray-700 to-gray-800 animate-pulse" />
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-white rounded-2xl p-6 animate-pulse">
                <div className="h-40 bg-gray-200 rounded" />
              </div>
            </div>
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 animate-pulse">
                <div className="h-40 bg-gray-200 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a1929] via-[#051e35] to-[#051e35] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Event Not Found</h1>
          <p className="text-white/60 mb-6">{error || 'This event could not be loaded'}</p>
          <a href="/events" className="inline-block px-6 py-3 rounded-lg bg-[#00ccff] text-[#003e79] font-semibold hover:bg-[#00b8e6] transition-colors">
            Back to Events
          </a>
        </div>
      </div>
    );
  }

  const ageGroups = parseJsonArray(event.age_groups);
  const divisions = parseJsonArray(event.divisions);
  const isUpcoming = event.status === 'registration_open' || event.status === 'active';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a1929] via-[#051e35] to-[#051e35]">
      {/* Hero Header */}
      <div className={`relative bg-gradient-to-br ${cityGradient(event.city)} min-h-[400px] flex items-center justify-center overflow-hidden`}>
        {/* Diagonal stripe pattern */}
        <div className="absolute inset-0 bg-diagonal-stripes opacity-10 pointer-events-none" />

        {/* Watermark logo */}
        {event.logo_url && (
          <img
            src={event.logo_url}
            alt=""
            className="absolute inset-0 w-full h-full object-contain opacity-[0.08] scale-[1.8] blur-[1px] pointer-events-none select-none"
          />
        )}

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-16 w-full">
          <div className="flex flex-col md:flex-row items-start gap-8 md:items-center">
            {/* Logo */}
            <div className="w-32 h-32 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center shrink-0 overflow-hidden border border-white/20">
              {event.logo_url ? (
                <img src={event.logo_url} alt={event.name} className="w-full h-full object-contain p-3" />
              ) : (
                <span className="text-5xl">🏒</span>
              )}
            </div>

            {/* Details */}
            <div className="flex-1">
              <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">{event.name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold ${statusColor(event.status)}`}>
                  {statusLabel(event.status)}
                </span>
                <span className="text-white/70 text-lg">{event.city}, {event.state}</span>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-3 border border-white/20">
                  <p className="text-[#00ccff] text-xs font-semibold uppercase">Dates</p>
                  <p className="text-white font-semibold text-sm mt-1">{formatDateRange(event.start_date, event.end_date)}</p>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-3 border border-white/20">
                  <p className="text-[#00ccff] text-xs font-semibold uppercase">Age Groups</p>
                  <p className="text-white font-semibold text-sm mt-1">{ageGroups.length} groups</p>
                </div>
                {event.price_cents && (
                  <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-3 border border-white/20">
                    <p className="text-[#00ccff] text-xs font-semibold uppercase">Starting Price</p>
                    <p className="text-white font-semibold text-sm mt-1">{formatPrice(event.price_cents)}</p>
                  </div>
                )}
                {event.deposit_cents && (
                  <div className="bg-white/10 backdrop-blur rounded-lg px-4 py-3 border border-white/20">
                    <p className="text-[#00ccff] text-xs font-semibold uppercase">Deposit</p>
                    <p className="text-white font-semibold text-sm mt-1">{formatPrice(event.deposit_cents)}</p>
                  </div>
                )}
              </div>

              {/* Age group pills */}
              {ageGroups.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-6">
                  {ageGroups.map(ag => (
                    <span key={ag} className="px-3 py-1.5 bg-[#00ccff]/20 text-[#00ccff] text-sm font-semibold rounded-full border border-[#00ccff]/50">
                      {ag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* CTA Button */}
            {isUpcoming && (
              <a
                href={`/register?event=${event.slug}&eventId=${event.id}`}
                className="px-8 py-4 rounded-xl bg-[#00ccff] text-[#003e79] font-bold text-lg hover:bg-[#00b8e6] active:scale-95 transition-all shadow-lg shrink-0"
              >
                Register Now
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <TabNav />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Event Information */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
              <h2 className="text-2xl font-bold text-[#003e79] mb-4">Event Information</h2>
              {event.information && (
                <p className="text-[#6e6e73] leading-relaxed mb-6">{event.information}</p>
              )}
              {event.description && (
                <p className="text-[#6e6e73] leading-relaxed mb-6">{event.description}</p>
              )}

              {/* Age Definitions */}
              {ageGroups.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold text-[#1d1d1f] mb-4">Age Level Definitions</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {ageGroups.map(ag => (
                      <div key={ag} className="bg-gradient-to-br from-[#003e79]/5 to-[#00ccff]/5 rounded-lg px-4 py-3 border border-[#003e79]/10">
                        <p className="font-semibold text-[#003e79] text-sm">{ag}</p>
                        <p className="text-[#6e6e73] text-xs mt-1">{ageDefinitions[ag] || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skill Levels / Divisions */}
              {divisions.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold text-[#1d1d1f] mb-3">Divisions</h3>
                  <div className="flex flex-wrap gap-2">
                    {divisions.map(div => (
                      <span key={div} className="px-3 py-1.5 bg-[#f5f5f7] text-[#1d1d1f] text-sm font-medium rounded-lg">
                        {div}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Format & Pricing */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
              <h2 className="text-2xl font-bold text-[#003e79] mb-6">Format & Pricing</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-[#003e79] to-[#002851] text-white">
                      <th className="text-left px-4 py-3 font-semibold rounded-tl-lg">Age Group</th>
                      <th className="text-center px-4 py-3 font-semibold">Period Length</th>
                      <th className="text-right px-4 py-3 font-semibold rounded-tr-lg">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ageGroups.map((ag, idx) => (
                      <tr key={ag} className={idx % 2 === 0 ? 'bg-[#f9fafb]' : 'bg-white'}>
                        <td className="px-4 py-3 font-medium text-[#1d1d1f]">{ag}</td>
                        <td className="px-4 py-3 text-center text-[#6e6e73]">{periodLengths[ag] || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#003e79]">{formatPrice(event.price_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hotels */}
            {hotels.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
                <h2 className="text-2xl font-bold text-[#003e79] mb-6">Hotel Partners</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {hotels.map(hotel => (
                    <div key={hotel.id} className="bg-gradient-to-br from-[#003e79]/5 to-[#00ccff]/5 rounded-lg p-4 border border-[#003e79]/10 hover:border-[#00ccff] transition-colors">
                      <h3 className="font-semibold text-[#1d1d1f] text-sm">{hotel.name}</h3>
                      <p className="text-xs text-[#6e6e73] mt-1">{hotel.city}, {hotel.state}</p>
                      {hotel.rate_description && (
                        <p className="text-sm font-semibold text-[#003e79] mt-2">{hotel.rate_description}</p>
                      )}
                      {hotel.booking_url && (
                        <a
                          href={hotel.booking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-3 text-[#00ccff] hover:text-[#0099bf] text-xs font-semibold transition-colors"
                        >
                          Book Now →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Quick Info Card */}
            <div className="bg-gradient-to-br from-[#003e79] to-[#002851] rounded-2xl shadow-lg p-8 text-white border border-[#00ccff]/20">
              <h3 className="font-bold text-xl mb-5">Quick Info</h3>
              <div className="space-y-4 text-sm mb-8">
                <div className="flex justify-between items-start">
                  <span className="text-white/70">Event</span>
                  <span className="font-semibold text-right flex-1 ml-2">{event.name}</span>
                </div>
                <div className="h-px bg-white/10" />
                <div className="flex justify-between items-start">
                  <span className="text-white/70">Dates</span>
                  <span className="font-semibold text-right flex-1 ml-2">{formatDateRange(event.start_date, event.end_date)}</span>
                </div>
                <div className="h-px bg-white/10" />
                <div className="flex justify-between items-start">
                  <span className="text-white/70">Location</span>
                  <span className="font-semibold text-right flex-1 ml-2">{event.city}, {event.state}</span>
                </div>
                <div className="h-px bg-white/10" />
                {event.slots_count && (
                  <>
                    <div className="flex justify-between items-start">
                      <span className="text-white/70">Total Slots</span>
                      <span className="font-semibold text-right flex-1 ml-2">{event.slots_count}</span>
                    </div>
                    <div className="h-px bg-white/10" />
                  </>
                )}
                <div className="flex justify-between items-start">
                  <span className="text-white/70">Status</span>
                  <span className="font-semibold text-right flex-1 ml-2 text-[#00ccff]">{statusLabel(event.status)}</span>
                </div>
              </div>

              {isUpcoming && (
                <a
                  href={`/register?event=${event.slug}&eventId=${event.id}`}
                  className="block w-full text-center bg-[#00ccff] hover:bg-[#00b8e6] text-[#003e79] font-bold py-3 rounded-lg transition-colors active:scale-95"
                >
                  Register Now
                </a>
              )}
            </div>

            {/* Pricing Info */}
            {event.price_cents && (
              <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
                <h3 className="font-bold text-lg text-[#003e79] mb-4">Pricing</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#6e6e73]">Registration Fee</span>
                    <span className="font-bold text-[#003e79]">{formatPrice(event.price_cents)}</span>
                  </div>
                  {event.deposit_cents && (
                    <div className="flex justify-between">
                      <span className="text-[#6e6e73]">Deposit Required</span>
                      <span className="font-bold text-[#003e79]">{formatPrice(event.deposit_cents)}</span>
                    </div>
                  )}
                  {event.multi_event_discount_pct && event.multi_event_discount_pct > 0 && (
                    <>
                      <div className="h-px bg-[#e8e8ed]" />
                      <div className="flex justify-between items-center p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                        <span className="text-emerald-700 font-semibold">Multi-Event Discount</span>
                        <span className="font-bold text-emerald-700">{event.multi_event_discount_pct}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Rules */}
            {event.rules_url && (
              <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
                <h3 className="font-bold text-lg text-[#003e79] mb-4">Tournament Rules</h3>
                <a
                  href={event.rules_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block w-full text-center px-4 py-2.5 rounded-lg bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#003e79] font-semibold transition-colors text-sm"
                >
                  View Rules PDF →
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
