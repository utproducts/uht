'use client';

import { useState, useEffect, useRef } from 'react';
import { Oswald } from 'next/font/google';

const oswald = Oswald({ subsets: ['latin'], weight: ['700'] });
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
  age_groups: string | null;
  price_cents: number | null;
}

function isEventPast(ev: Event): boolean {
  const end = new Date(ev.end_date + 'T23:59:59');
  return end < new Date();
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const mo = s.toLocaleString('en-US', { month: 'short' });
  if (s.getMonth() === e.getMonth()) return `${mo} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  const mo2 = e.toLocaleString('en-US', { month: 'short' });
  return `${mo} ${s.getDate()} – ${mo2} ${e.getDate()}, ${s.getFullYear()}`;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr + 'T12:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/* ---------- Animated counter hook ---------- */
function useCountUp(target: number, duration = 2000) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
          setValue(Math.round(eased * target));
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.3 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return { value, ref };
}

/* ---------- City photo data ---------- */
const CITY_SHOWCASE = [
  { name: 'Chicago', state: 'IL', image: 'https://images.unsplash.com/photo-1494522855154-9297ac14b55f?w=600&q=80', tagline: 'Hockey Capital of the Midwest' },
  { name: 'Wisconsin Dells', state: 'WI', image: 'https://images.unsplash.com/photo-1627319704960-7bb15934f478?w=600&q=80', tagline: 'Where Hockey Meets Vacation' },
  { name: 'St. Louis', state: 'MO', image: 'https://images.unsplash.com/photo-1675906798393-89cbae461520?w=600&q=80', tagline: 'Blues Country Hockey' },
  { name: 'South Bend', state: 'IN', image: 'https://images.unsplash.com/photo-1508507596652-540da01c3453?w=600&q=80', tagline: 'Fighting Irish Territory' },
  { name: 'Madison', state: 'WI', image: 'https://images.unsplash.com/photo-1748276122946-bbbd8f1d4f94?w=600&q=80', tagline: 'Big Ten Hockey Town' },
  { name: 'Holland', state: 'MI', image: 'https://images.unsplash.com/photo-1602076693004-ba674acf4389?w=600&q=80', tagline: 'Lake Michigan Charm' },
  { name: 'Ann Arbor', state: 'MI', image: 'https://images.unsplash.com/photo-1508760215803-36f2ec2b7713?w=600&q=80', tagline: 'Wolverine Hockey Excellence' },
];

/* ---------- Testimonials ---------- */
const TESTIMONIALS = [
  {
    quote: "Best-run tournament we've ever been to. The communication, the scheduling, the venues — everything was top-notch. Our kids had the time of their lives.",
    name: 'Mike D.',
    role: 'Travel Coach, Chicago',
    avatar: '🏒',
  },
  {
    quote: "We've been doing UHT events for three years now. The Wisconsin Dells tournaments are our favorite — the kids play great hockey and then we hit the waterparks. It's become our family tradition.",
    name: 'Sarah K.',
    role: 'Hockey Parent, Milwaukee',
    avatar: '⭐',
  },
  {
    quote: "The level of competition is excellent. My players have grown so much from these tournaments. UHT knows how to put together balanced divisions that challenge every team.",
    name: 'Coach Tom R.',
    role: 'Team Manager, St. Louis',
    avatar: '🏆',
  },
];

/* ---------- Action photos for gallery ---------- */
const GALLERY_PHOTOS = [
  { src: 'https://images.unsplash.com/photo-1580748141549-71748dbe0bdc?w=500&q=80', alt: 'Hockey arena action' },
  { src: 'https://images.unsplash.com/photo-1515703407324-5f753afd8be8?w=500&q=80', alt: 'Hockey goal net' },
  { src: 'https://images.unsplash.com/photo-1486128105845-91daff43f404?w=500&q=80', alt: 'Ice hockey game with referee' },
  { src: 'https://images.unsplash.com/photo-1549598145-86b354509082?w=500&q=80', alt: 'Hockey player in full gear' },
  { src: 'https://images.unsplash.com/photo-1517339763538-9bb6c388613a?w=500&q=80', alt: 'Hockey arena game' },
  { src: 'https://images.unsplash.com/photo-1545471977-94cac22e71ed?w=500&q=80', alt: 'Ice hockey players' },
];

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/events?per_page=200`);
        const json = await res.json();
        setEvents(json.data || []);
      } catch {
        // fallback
      }
      setLoading(false);
    })();
  }, []);

  const allUpcoming = events
    .filter(e => !isEventPast(e))
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  const upcomingEvents = allUpcoming.slice(0, 4);
  const carouselEvents = allUpcoming.slice(0, 12);

  const totalEvents = events.length;

  /* Counter refs — hardcoded stats for social proof */
  const eventsCounter = useCountUp(totalEvents || 36, 2000);
  const teamsCounter = useCountUp(1500, 2000);
  const citiesCounter = useCountUp(7, 1500);
  const statesCounter = useCountUp(4, 1200);

  return (
    <>
      {/* ═══════════════════════ HERO ═══════════════════════ */}
      <section className="relative overflow-hidden bg-[#001d3d] min-h-[75vh] flex items-center pb-28">
        {/* Background image with overlay */}
        <div className="absolute inset-0">
          <img
            src="/hero-bg.webp"
            alt=""
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#001d3d]/90 via-[#001d3d]/70 to-[#001d3d]/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#001d3d] via-transparent to-[#001d3d]/30" />
        </div>

        {/* Subtle accent glow */}
        <div className="absolute top-20 right-[15%] w-64 h-64 bg-[#00ccff]/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-10 left-[5%] w-80 h-80 bg-[#003e79]/20 rounded-full blur-[120px]" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-14 sm:py-20 w-full">
          <div className="max-w-4xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 mb-8">
              <span className="w-2 h-2 rounded-full bg-[#00ccff] animate-pulse" />
              <span className="text-sm text-white/80 font-medium">2026–27 Season Now Open</span>
            </div>

            <h1 className={oswald.className + " text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold uppercase tracking-tight text-white leading-[0.95]"}>
              THIS IS WHERE
              <br />
              <span className="bg-gradient-to-r from-[#00ccff] via-[#00e5ff] to-[#a0e8ff] bg-clip-text text-transparent">
                CHAMPIONS
              </span>
              <br />
              COMPETE.
            </h1>

            <p className="mt-6 sm:mt-8 text-lg sm:text-xl text-white/60 max-w-xl leading-relaxed">
              The Midwest&apos;s premier youth and adult hockey tournament series.
              7 cities. 36+ events. One mission — the best tournament experience in hockey.
            </p>

            <div className="mt-10 flex items-center gap-4 flex-wrap">
              <a
                href="/events"
                className="group px-8 py-4 rounded-full bg-[#00ccff] text-[#001d3d] font-bold text-base hover:bg-[#33d6ff] active:scale-[0.98] transition-all shadow-[0_0_30px_rgba(0,204,255,0.3)]"
              >
                Browse Events
                <svg className="inline-block w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </a>
              <a
                href="/register"
                className="px-8 py-4 rounded-full bg-white/10 backdrop-blur-sm text-white font-semibold text-base border border-white/20 hover:bg-white/20 active:scale-[0.98] transition-all"
              >
                Register Your Team
              </a>
            </div>

            {/* App Store badge */}
            <div className="mt-8 flex items-center gap-3">
              <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/8 backdrop-blur-sm border border-white/10 hover:bg-white/12 transition-all cursor-default">
                <svg className="w-7 h-7 text-white flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                <div>
                  <p className="text-[10px] text-white/50 uppercase tracking-wider leading-none">Coming Soon on the</p>
                  <p className="text-white font-semibold text-base leading-tight">App Store</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ── Upcoming Events Logo Carousel ── */}
        {carouselEvents.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 z-20">
            {/* Top edge fade */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="bg-[#001d3d]/80 backdrop-blur-md py-4 overflow-hidden">
              <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-semibold text-center mb-3">Upcoming Events</p>
              <div className="relative">
                {/* Fade edges */}
                <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#001d3d]/90 to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#001d3d]/90 to-transparent z-10 pointer-events-none" />
                {/* Scrolling track — duplicated for seamless loop */}
                <div className="flex animate-[scroll_40s_linear_infinite] hover:[animation-play-state:paused] w-max">
                  {[...carouselEvents, ...carouselEvents, ...carouselEvents].map((ev, i) => (
                    <a
                      key={`${ev.id}-${i}`}
                      href={`/events/${ev.slug}`}
                      className="flex-shrink-0 flex items-center gap-3 mx-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/15 transition-all group"
                    >
                      {ev.logo_url ? (
                        <img src={ev.logo_url} alt="" className="w-8 h-8 object-contain rounded-lg flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm">🏒</span>
                        </div>
                      )}
                      <div className="whitespace-nowrap">
                        <p className="text-white text-xs font-semibold group-hover:text-[#00ccff] transition-colors">{ev.name}</p>
                        <p className="text-white/40 text-[10px]">{ev.city} · {formatDateRange(ev.start_date, ev.end_date)}</p>
                      </div>
                      {daysUntil(ev.start_date) > 0 && daysUntil(ev.start_date) <= 120 && (
                        <span className="ml-1 px-2 py-0.5 rounded-full bg-[#00ccff]/15 text-[#00ccff] text-[10px] font-bold whitespace-nowrap">
                          {daysUntil(ev.start_date)}d
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom fade into content */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-t from-[#fafafa] to-transparent z-30" />
      </section>

      {/* ═══════════════════════ STATS BAR ═══════════════════════ */}
      <section className="relative bg-[#fafafa] pt-6 z-10">
        <div className="max-w-5xl mx-auto px-6 sm:px-8">
          <div className="bg-white rounded-2xl shadow-[0_4px_40px_-10px_rgba(0,0,0,0.12)] border border-[#e8e8ed] grid grid-cols-2 md:grid-cols-4 divide-x divide-[#e8e8ed]">
            {[
              { ref: eventsCounter.ref, val: eventsCounter.value, suffix: '+', label: 'Events', icon: '📅' },
              { ref: teamsCounter.ref, val: teamsCounter.value, suffix: '+', label: 'Teams Registered', icon: '🏒' },
              { ref: citiesCounter.ref, val: citiesCounter.value, suffix: '', label: 'Cities', icon: '🏙️' },
              { ref: statesCounter.ref, val: statesCounter.value, suffix: '', label: 'States', icon: '🗺️' },
            ].map((stat, i) => (
              <div key={i} ref={stat.ref} className="px-6 py-8 text-center">
                <div className="text-3xl sm:text-4xl font-extrabold text-[#003e79]">
                  {stat.val}{stat.suffix}
                </div>
                <p className="text-sm text-[#6e6e73] mt-1 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ MOBILE APP ═══════════════════════ */}
      <section className="bg-[#fafafa] pt-14 pb-2">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="relative bg-gradient-to-br from-[#001d3d] via-[#002d5a] to-[#003e79] rounded-3xl overflow-hidden">
            {/* Background accents */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#00ccff]/10 rounded-full -translate-y-1/3 translate-x-1/4 blur-[80px]" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#00ccff]/8 rounded-full translate-y-1/3 -translate-x-1/4 blur-[60px]" />

            <div className="relative z-10 px-8 sm:px-12 lg:px-16 pt-10 sm:pt-12 pb-0">
              {/* Header row — text left, badge right on desktop */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00ccff]/15 border border-[#00ccff]/20 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00ccff] animate-pulse" />
                    <span className="text-xs text-[#00ccff] font-semibold">Coming Soon</span>
                  </div>
                  <h2 className={oswald.className + " text-2xl sm:text-3xl lg:text-4xl font-bold uppercase tracking-tight text-white leading-[0.95]"}>
                    UHT IN YOUR{' '}
                    <span className="bg-gradient-to-r from-[#00ccff] to-[#a0e8ff] bg-clip-text text-transparent">POCKET</span>
                  </h2>
                  <p className="text-white/50 text-sm sm:text-base mt-2 max-w-lg">
                    Register, track schedules, get live scores, and manage your team — all from the UHT app.
                  </p>
                </div>

                {/* App Store badge */}
                <div className="inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-white text-[#001d3d] hover:bg-white/90 transition-all cursor-default shadow-lg flex-shrink-0">
                  <svg className="w-7 h-7 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                  <div>
                    <p className="text-[9px] text-[#6e6e73] uppercase tracking-wider leading-none">Coming Soon on the</p>
                    <p className="text-[#1d1d1f] font-bold text-base leading-tight">App Store</p>
                  </div>
                </div>
              </div>

              {/* Real app screenshots */}
              <div className="flex gap-3 sm:gap-4 overflow-x-auto sm:overflow-visible pb-0 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory sm:snap-none sm:grid sm:grid-cols-5" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                {[
                  { src: '/app-screen-1.png', alt: 'Events — browse upcoming tournaments' },
                  { src: '/app-screen-2.png', alt: 'Game Center — live scores and standings' },
                  { src: '/app-screen-3.png', alt: 'Lodging — exclusive tournament hotel rates' },
                  { src: '/app-screen-4.png', alt: 'Venues — rink details and directions' },
                  { src: '/app-screen-5.png', alt: 'My Teams — manage your teams and rosters' },
                ].map((screen, i) => (
                  <div key={i} className="flex-shrink-0 w-[200px] sm:w-auto snap-center" style={{ filter: 'drop-shadow(0 0 12px rgba(0, 204, 255, 0.4)) drop-shadow(0 0 30px rgba(0, 204, 255, 0.15))' }}>
                    <img
                      src={screen.src}
                      alt={screen.alt}
                      className="w-full h-auto rounded-t-xl"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ UPCOMING EVENTS ═══════════════════════ */}
      <section className="bg-[#fafafa] pt-16 pb-20">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-[#00ccff] text-sm font-bold uppercase tracking-widest mb-2">Don&apos;t Miss Out</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-[#1d1d1f]">Upcoming Events</h2>
            </div>
            <a href="/events" className="hidden sm:flex items-center gap-2 text-sm text-[#003e79] font-semibold hover:text-[#00ccff] transition-colors">
              View all events
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {[0,1,2,3].map(i => (
                <div key={i} className="rounded-2xl bg-white border border-[#e8e8ed] animate-pulse overflow-hidden">
                  <div className="h-3 bg-gradient-to-r from-[#e8e8ed] to-[#f5f5f7]" />
                  <div className="p-5 space-y-3">
                    <div className="h-12 w-12 bg-[#f5f5f7] rounded-xl" />
                    <div className="h-5 bg-[#f5f5f7] rounded-lg w-3/4" />
                    <div className="h-4 bg-[#f5f5f7] rounded-lg w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {upcomingEvents.map((ev) => {
                const days = daysUntil(ev.start_date);
                return (
                  <a
                    key={ev.id}
                    href={`/events/${ev.slug}`}
                    className="group bg-white rounded-2xl overflow-hidden border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_40px_-12px_rgba(0,62,121,0.18)] hover:-translate-y-1 transition-all duration-300"
                  >
                    {/* Accent bar */}
                    <div className="h-1.5 bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff]" />
                    <div className="p-5">
                      <div className="flex items-start gap-3 mb-3">
                        {ev.logo_url ? (
                          <img src={ev.logo_url} alt="" className="w-12 h-12 object-contain rounded-xl flex-shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-[#f0f7ff] flex items-center justify-center flex-shrink-0">
                            <span className="text-xl">🏒</span>
                          </div>
                        )}
                        {days > 0 && days <= 90 && (
                          <span className="ml-auto text-xs font-bold text-[#003e79] bg-[#f0f7ff] px-2.5 py-1 rounded-full whitespace-nowrap">
                            {days}d
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-[#1d1d1f] text-base leading-snug group-hover:text-[#003e79] transition-colors line-clamp-2">
                        {ev.name}
                      </h3>
                      <p className="text-sm text-[#6e6e73] mt-1.5">{ev.city}, {ev.state}</p>
                      <p className="text-sm text-[#6e6e73] mt-0.5">{formatDateRange(ev.start_date, ev.end_date)}</p>
                      <div className="mt-4 flex items-center gap-3">
                        <span className="flex-1 text-center px-3 py-2 rounded-full text-sm font-semibold text-white bg-[#003e79] group-hover:bg-[#002d5a] transition-colors">
                          Register
                        </span>
                        <span className="px-3 py-2 rounded-full text-sm font-semibold text-[#003e79] bg-[#f0f7ff] group-hover:bg-[#e0efff] transition-colors">
                          Details
                        </span>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}

          <div className="mt-8 text-center sm:hidden">
            <a href="/events" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-[#003e79] font-semibold border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all">
              View all events
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ CITY SHOWCASE ═══════════════════════ */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center mb-12">
            <p className="text-[#00ccff] text-sm font-bold uppercase tracking-widest mb-2">Our Locations</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#1d1d1f]">7 Cities. Endless Memories.</h2>
            <p className="mt-3 text-lg text-[#6e6e73]">Premier tournaments in the best hockey markets across the Midwest.</p>
          </div>

          {/* Masonry-style grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {CITY_SHOWCASE.map((city, i) => (
              <a
                key={city.name}
                href={'/events?city=' + encodeURIComponent(city.name)}
                className={`group relative rounded-2xl overflow-hidden ${
                  i === 0 ? 'col-span-2 row-span-2 aspect-square md:aspect-auto' : 'aspect-[4/3]'
                }`}
              >
                <img
                  src={city.image}
                  alt={city.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                  <h3 className={`font-bold text-white ${i === 0 ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
                    {city.name}
                  </h3>
                  <p className={`text-white/70 ${i === 0 ? 'text-sm mt-1' : 'text-xs mt-0.5'}`}>
                    {city.tagline}
                  </p>
                </div>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="px-3 py-1 rounded-full bg-white/90 text-[#003e79] text-xs font-bold">
                    View Events →
                  </span>
                </div>
              </a>
            ))}
          </div>

          <div className="mt-8 text-center">
            <a href="/cities" className="inline-flex items-center gap-2 text-sm text-[#003e79] font-semibold hover:text-[#00ccff] transition-colors">
              Explore all cities
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ WHAT SETS US APART ═══════════════════════ */}
      <section className="bg-[#fafafa] py-20">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center mb-14">
            <p className="text-[#00ccff] text-sm font-bold uppercase tracking-widest mb-2">Why UHT</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#1d1d1f]">What Sets Us Apart</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                  </svg>
                ),
                title: 'USA Hockey Sanctioned',
                desc: 'Every event is fully sanctioned with proper insurance, certified officials, and competitive standards.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                ),
                title: 'Premier Venues',
                desc: 'Top-tier arenas across 7 cities with multiple sheets, pro-level ice, and great spectator facilities.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                ),
                title: 'Balanced Competition',
                desc: 'Smart division placement ensures your team faces opponents at the right level. Every game matters.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
                  </svg>
                ),
                title: 'Family Experience',
                desc: 'Tournament weekends are about more than hockey. Great hotels, team dinners, and memories that last.',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="group bg-white rounded-2xl p-6 border border-[#e8e8ed] hover:border-[#00ccff]/30 hover:shadow-[0_8px_30px_-10px_rgba(0,204,255,0.15)] transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#003e79] to-[#00ccff] flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="font-bold text-[#1d1d1f] text-lg mb-2">{feature.title}</h3>
                <p className="text-sm text-[#6e6e73] leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ PHOTO GALLERY ═══════════════════════ */}
      <section className="bg-white py-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center mb-12">
            <p className="text-[#00ccff] text-sm font-bold uppercase tracking-widest mb-2">Tournament Life</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#1d1d1f]">More Than Just Hockey</h2>
            <p className="mt-3 text-lg text-[#6e6e73]">Action on the ice, memories off it.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {GALLERY_PHOTOS.map((photo, i) => (
              <div
                key={i}
                className={`relative rounded-2xl overflow-hidden ${
                  i === 0 || i === 5 ? 'row-span-2 aspect-[3/4]' : 'aspect-[4/3]'
                } group`}
              >
                <img
                  src={photo.src}
                  alt={photo.alt}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ TESTIMONIALS ═══════════════════════ */}
      <section className="bg-[#001d3d] py-20">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center mb-14">
            <p className="text-[#00ccff] text-sm font-bold uppercase tracking-widest mb-2">What People Say</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">Trusted by Hockey Families</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 sm:p-8 hover:bg-white/10 transition-colors"
              >
                {/* Stars */}
                <div className="flex gap-1 mb-4">
                  {[0,1,2,3,4].map(s => (
                    <svg key={s} className="w-5 h-5 text-[#00ccff]" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-white/80 leading-relaxed text-sm sm:text-base mb-6">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#003e79] flex items-center justify-center text-lg">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{t.name}</p>
                    <p className="text-white/50 text-xs">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ BIG CTA ═══════════════════════ */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff] py-20 sm:py-24">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-[#00ccff]/20 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />

        <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center relative z-10">
          <h2 className={oswald.className + " text-4xl sm:text-5xl lg:text-6xl font-bold uppercase tracking-tight text-white leading-[0.95]"}>
            READY TO <span className="text-[#a0e8ff]">COMPETE?</span>
          </h2>
          <p className="mt-6 text-lg text-white/70 max-w-2xl mx-auto">
            Join hundreds of teams across the Midwest. Find your next tournament and register today.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
            <a
              href="/events"
              className="px-10 py-4 rounded-full bg-white text-[#003e79] font-bold text-base hover:bg-white/90 active:scale-[0.98] transition-all shadow-lg"
            >
              Find Your Tournament
            </a>
            <a
              href="/register"
              className="px-10 py-4 rounded-full bg-white/15 backdrop-blur-sm text-white font-semibold text-base border border-white/25 hover:bg-white/25 active:scale-[0.98] transition-all"
            >
              Register Now
            </a>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ SPONSOR + PARTNER ═══════════════════════ */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sponsor CTA */}
            <div className="bg-[#fafafa] rounded-2xl border border-[#e8e8ed] p-8 sm:p-10 flex flex-col">
              <div className="w-12 h-12 rounded-xl bg-[#f0f7ff] flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[#003e79]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#1d1d1f] mb-2">Become a Sponsor</h3>
              <p className="text-[#6e6e73] text-sm leading-relaxed mb-6 flex-1">
                Get your brand in front of thousands of hockey families. Per-event and season-long packages available.
              </p>
              <a href="/sponsors" className="inline-flex items-center gap-2 text-sm text-[#003e79] font-semibold hover:text-[#00ccff] transition-colors">
                Explore sponsorships
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>

            {/* Referee CTA */}
            <div className="bg-[#fafafa] rounded-2xl border border-[#e8e8ed] p-8 sm:p-10 flex flex-col">
              <div className="w-12 h-12 rounded-xl bg-[#f0f7ff] flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[#003e79]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 013.15 0V15M6.9 7.575a1.575 1.575 0 10-3.15 0v8.175a6.75 6.75 0 006.75 6.75h2.018a5.25 5.25 0 003.712-1.538l1.732-1.732a5.25 5.25 0 001.538-3.712l.003-2.024a.668.668 0 01.198-.471 1.575 1.575 0 10-2.228-2.228 3.818 3.818 0 00-1.12 2.687M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0116.35 15" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#1d1d1f] mb-2">Become a Referee</h3>
              <p className="text-[#6e6e73] text-sm leading-relaxed mb-6 flex-1">
                Officiate at premier tournaments, earn competitive pay with direct deposit, and build your career on the ice.
              </p>
              <a href="/referees" className="inline-flex items-center gap-2 text-sm text-[#003e79] font-semibold hover:text-[#00ccff] transition-colors">
                Learn more
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
