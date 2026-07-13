'use client';

import { useState, useEffect } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';

interface Event {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  start_date: string;
  end_date: string;
  status: string;
  logo_url: string | null;
  information: string | null;
  age_groups: string | null;
  price_cents: number | null;
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const mo = s.toLocaleString('en-US', { month: 'long' });
  if (s.getMonth() === e.getMonth()) {
    return `${mo} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  const mo2 = e.toLocaleString('en-US', { month: 'long' });
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
    case 'active': return 'In Progress';
    case 'registration_closed': return 'Registration Closed';
    default: return status;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'registration_open': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'active': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'registration_closed': return 'bg-amber-50 text-amber-700 border-amber-200';
    default: return 'bg-gray-100 text-gray-500 border-gray-200';
  }
}

function cityGradient(city: string): string {
  const c = city.toLowerCase();
  if (c.includes('chicago')) return 'from-[#003e79] via-[#005a9e] to-[#00ccff]';
  if (c.includes('st. louis') || c.includes('st louis')) return 'from-[#1a3a5c] via-[#2a5a8c] to-[#00ccff]';
  if (c.includes('south bend')) return 'from-[#0c4a1e] via-[#1a7a3a] to-[#00ccbb]';
  if (c.includes('ann arbor')) return 'from-[#00274c] via-[#003d7a] to-[#00aaff]';
  if (c.includes('madison')) return 'from-[#c5050c] via-[#e23a3a] to-[#ff6b6b]';
  if (c.includes('holland')) return 'from-[#4a2c0f] via-[#8a5a2a] to-[#dda040]';
  return 'from-[#003e79] via-[#005599] to-[#00ccff]';
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr + 'T12:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function EventCard({ event }: { event: Event }) {
  const ageGroups = parseJsonArray(event.age_groups);
  const isUpcoming = event.status === 'registration_open' || event.status === 'active';
  const days = daysUntil(event.start_date);

  return (
    <div className="group bg-white rounded-2xl overflow-hidden shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_40px_-12px_rgba(0,62,121,0.18)] transition-all duration-300 hover:-translate-y-1 border border-[#e8e8ed]">
      {/* Card Header */}
      <div className={`relative bg-gradient-to-br ${cityGradient(event.city)} h-52 flex items-center justify-center overflow-hidden`}>
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />

        <div className="relative z-10">
          {event.logo_url ? (
            <img
              src={event.logo_url}
              alt={event.name}
              className="w-36 h-36 object-contain drop-shadow-xl group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-36 h-36 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <span className="text-5xl">🏒</span>
            </div>
          )}
        </div>

        {/* Status badge */}
        <div className="absolute top-3 right-3 z-10">
          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusBadge(event.status)} bg-white/90 backdrop-blur-sm`}>
            {statusLabel(event.status)}
          </span>
        </div>

        {/* Countdown */}
        {isUpcoming && days > 0 && days <= 90 && (
          <div className="absolute top-3 left-3 z-10">
            <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/90 backdrop-blur-sm text-[#003e79]">
              {days} day{days !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Price */}
        {event.price_cents && isUpcoming && (
          <div className="absolute bottom-3 right-3 z-10">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-white/90 backdrop-blur-sm text-[#003e79]">
              {formatPrice(event.price_cents)}
            </span>
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-5">
        <h3 className="text-lg font-bold text-[#1d1d1f] leading-snug group-hover:text-[#003e79] transition-colors">
          {event.name}
        </h3>

        <div className="mt-2 space-y-1">
          <p className="flex items-center gap-2 text-sm text-[#3d3d3d]">
            <svg className="w-4 h-4 text-[#6e6e73]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {event.city}, {event.state}
          </p>
          <p className="flex items-center gap-2 text-sm text-[#3d3d3d]">
            <svg className="w-4 h-4 text-[#6e6e73]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            {formatDateRange(event.start_date, event.end_date)}
          </p>
        </div>

        {ageGroups.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ageGroups.slice(0, 4).map(ag => (
              <span key={ag} className="inline-block px-2.5 py-0.5 bg-[#f0f7ff] text-[#003e79] text-xs font-medium rounded-md">
                {ag}
              </span>
            ))}
            {ageGroups.length > 4 && (
              <span className="inline-block px-2.5 py-0.5 bg-[#f5f5f7] text-[#86868b] text-xs font-medium rounded-md">
                +{ageGroups.length - 4}
              </span>
            )}
          </div>
        )}

        {event.information && (
          <p className="text-sm text-[#4a4a4a] mt-3 line-clamp-2 leading-relaxed">{event.information}</p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <a
            href={`/register?event=${event.slug}&eventId=${event.id}`}
            className="flex-1 text-center px-4 py-2.5 rounded-full text-sm font-semibold text-white bg-[#003e79] hover:bg-[#002d5a] active:scale-[0.98] transition-all"
          >
            Register
          </a>
          <a
            href={`/events/${event.slug}`}
            className="px-4 py-2.5 rounded-full text-sm font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors"
          >
            Details
          </a>
        </div>
      </div>
    </div>
  );
}

export default function UpcomingEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/events?per_page=50`);
        const json = await res.json();
        let data: Event[] = json.data || [];
        // Only upcoming events, sorted by start date
        data = data
          .filter(e => e.status !== 'completed' && e.status !== 'cancelled')
          .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
          .slice(0, 3);
        setEvents(data);
      } catch (err) {
        console.error('Failed to load events:', err);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl overflow-hidden bg-white shadow-sm border border-[#e8e8ed] animate-pulse">
            <div className="h-52 bg-gradient-to-br from-[#e8e8ed] to-[#f5f5f7]" />
            <div className="p-5 space-y-3">
              <div className="h-5 bg-[#f5f5f7] rounded-lg w-3/4" />
              <div className="h-4 bg-[#f5f5f7] rounded-lg w-1/2" />
              <div className="flex gap-2 mt-3">
                <div className="h-6 w-16 bg-[#f5f5f7] rounded-md" />
                <div className="h-6 w-16 bg-[#f5f5f7] rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-16">
        <h3 className="text-xl font-bold text-[#1d1d1f] mb-2">No upcoming events</h3>
        <p className="text-[#6e6e73]">New tournaments are being added — check back soon!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {events.map(event => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
