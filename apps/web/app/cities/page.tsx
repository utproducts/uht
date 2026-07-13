'use client';

import { useState, useEffect } from 'react';

const API = 'https://api.ultimatetournaments.com/api';

const CITIES = [
  {
    name: 'Chicago',
    state: 'IL',
    slug: 'chicago',
    tagline: 'The hockey capital of the Midwest',
    description: 'Home to our largest tournament series including the Deep Dish Cup, Windy City Showdown, and Chicago Dog Classic. World-class arenas and unbeatable energy.',
    image: 'https://images.unsplash.com/photo-1494522855154-9297ac14b55f?w=800&q=80',
  },
  {
    name: 'Wisconsin Dells',
    state: 'WI',
    slug: 'wisconsin-dells',
    tagline: 'Where hockey meets vacation',
    description: "Tournament hockey in America's waterpark capital. Play hard, then hit the Dells attractions with the family. A fan-favorite destination every summer.",
    image: 'https://images.unsplash.com/photo-1627319704960-7bb15934f478?w=800&q=80',
  },
  {
    name: 'St. Louis',
    state: 'MO',
    slug: 'st-louis',
    tagline: 'Blues country, tournament hockey',
    description: 'Compete in the home of the Stanley Cup champion Blues. Great rinks, passionate hockey community, and the Gateway Arch as your backdrop.',
    image: 'https://images.unsplash.com/photo-1675906798393-89cbae461520?w=800&q=80',
  },
  {
    name: 'South Bend',
    state: 'IN',
    slug: 'south-bend',
    tagline: 'Fighting Irish hockey territory',
    description: "Home of Notre Dame and some of Indiana's best ice. A growing hockey market with top-notch facilities and Midwest hospitality.",
    image: 'https://images.unsplash.com/photo-1508507596652-540da01c3453?w=800&q=80',
  },
  {
    name: 'Madison',
    state: 'WI',
    slug: 'madison',
    tagline: 'College town, big-time hockey',
    description: "Wisconsin's capital city delivers excellent tournament hockey alongside great restaurants, lakes, and the energy of a Big Ten campus.",
    image: 'https://images.unsplash.com/photo-1748276122946-bbbd8f1d4f94?w=800&q=80',
  },
  {
    name: 'Holland',
    state: 'MI',
    slug: 'holland',
    tagline: 'Lake Michigan hockey charm',
    description: "A hidden gem on Michigan's west coast. Beautiful lakeside setting, great community rinks, and a small-town feel that families love.",
    image: 'https://images.unsplash.com/photo-1602076693004-ba674acf4389?w=800&q=80',
  },
  {
    name: 'Ann Arbor',
    state: 'MI',
    slug: 'ann-arbor',
    tagline: 'Wolverine hockey excellence',
    description: "One of America's great college hockey towns. Home to incredible facilities and a deep-rooted hockey culture that runs year-round.",
    image: 'https://images.unsplash.com/photo-1508760215803-36f2ec2b7713?w=800&q=80',
  },
];

export default function CitiesPage() {
  const [cityCounts, setCityCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // Fetch all upcoming events and count per city
    fetch(`${API}/events?per_page=100`)
      .then(r => r.json())
      .then(json => {
        const events = (json.data || []) as { city: string; status: string }[];
        const upcoming = events.filter(e => e.status !== 'completed');
        const counts: Record<string, number> = {};
        for (const ev of upcoming) {
          const city = ev.city.toLowerCase();
          // Match against our city names
          for (const c of CITIES) {
            if (city.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(city)) {
              counts[c.slug] = (counts[c.slug] || 0) + 1;
            }
          }
        }
        setCityCounts(counts);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff]">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#00ccff] rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
        <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-[#003e79] rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
        <div className="absolute -bottom-8 right-1/3 w-96 h-96 bg-[#005599] rounded-full mix-blend-multiply filter blur-3xl opacity-20" />

        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-16 sm:py-20 text-center relative z-10">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold uppercase tracking-tight text-white">
            Our <span className="text-[#00ccff]">Cities.</span>
          </h1>
          <p className="mt-4 text-lg text-white/80 max-w-2xl mx-auto">
            Premier youth and adult hockey tournaments in the best hockey markets across the Midwest.
          </p>
        </div>

        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
            <path d="M0 60V0c240 40 480 60 720 60s480-20 720-60v60H0z" fill="#fafafa" />
          </svg>
        </div>
      </section>

      {/* City Cards Grid */}
      <section className="bg-[#fafafa] pb-12">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {CITIES.map((city) => {
              const count = cityCounts[city.slug] || 0;

              return (
                <div
                  key={city.slug}
                  className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden group transition-all duration-300 hover:shadow-[0_8px_40px_-12px_rgba(0,62,121,0.18)] hover:-translate-y-1 flex flex-col"
                >
                  {/* City Image */}
                  <div className="aspect-[16/10] relative overflow-hidden">
                    <img
                      src={city.image}
                      alt={city.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="flex items-end justify-between">
                        <div>
                          <h2 className="text-2xl font-bold text-white">{city.name}</h2>
                          <p className="text-white/80 text-sm">{city.state}</p>
                        </div>
                        <span className="bg-[#00ccff] text-[#003e79] text-xs font-bold px-3 py-1 rounded-full">
                          {count} upcoming
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* City Details */}
                  <div className="p-5 flex-1 flex flex-col">
                    <p className="text-[#00ccff] text-sm font-semibold mb-1">{city.tagline}</p>
                    <p className="text-[#6e6e73] text-sm leading-relaxed flex-1">{city.description}</p>

                    <div className="mt-4">
                      <a
                        href={'/events?city=' + encodeURIComponent(city.name)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-[#003e79] hover:bg-[#002d5a] active:scale-[0.98] transition-all"
                      >
                        View Upcoming Events
                        <svg
                          className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Invite UHT to Your City */}
      <section className="bg-[#fafafa] py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-[#1d1d1f]">
              Invite UHT to your city.
            </h2>
            <p className="mt-3 text-lg text-[#6e6e73]">
              Want Ultimate Hockey Tournaments in your area? Tell us about your city and we&apos;ll explore bringing a tournament to you.
            </p>
          </div>

          <form
            action="/api/city-invite"
            method="POST"
            className="max-w-xl mx-auto"
            id="invite-form"
          >
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6 sm:p-8 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-[#1d1d1f] mb-1.5">
                    Your Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/20"
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-[#1d1d1f] mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/20"
                    placeholder="john@email.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-[#1d1d1f] mb-1.5">
                    City
                  </label>
                  <input
                    type="text"
                    id="city"
                    name="city"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/20"
                    placeholder="Detroit"
                  />
                </div>
                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-[#1d1d1f] mb-1.5">
                    State
                  </label>
                  <input
                    type="text"
                    id="state"
                    name="state"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/20"
                    placeholder="MI"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="role" className="block text-sm font-medium text-[#1d1d1f] mb-1.5">
                  Your Role
                </label>
                <select
                  id="role"
                  name="role"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 bg-white"
                >
                  <option value="parent">Hockey Parent</option>
                  <option value="coach">Coach / Team Manager</option>
                  <option value="rink">Rink / Arena Manager</option>
                  <option value="association">Hockey Association</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="arenas" className="block text-sm font-medium text-[#1d1d1f] mb-1.5">
                  Local Arenas (optional)
                </label>
                <input
                  type="text"
                  id="arenas"
                  name="arenas"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/20"
                  placeholder="List any rinks in your area"
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-[#1d1d1f] mb-1.5">
                  Why should UHT come to your city?
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 resize-none"
                  placeholder="Tell us about the hockey community, facilities, and why it would be a great fit..."
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-full bg-[#003e79] text-white font-medium text-base py-3 hover:bg-[#002d5f] transition-colors duration-200"
              >
                Submit Invitation
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
