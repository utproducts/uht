// Cities page - UHT
import type { Metadata } from 'next';
import { Oswald } from 'next/font/google';

const oswald = Oswald({ subsets: ['latin'], weight: ['700'] });

export const metadata: Metadata = {
  title: 'Cities \u2014 Ultimate Hockey Tournaments',
};

const CITIES = [
  {
    name: 'Chicago',
    state: 'IL',
    events: 8,
    slug: 'chicago',
    tagline: 'The hockey capital of the Midwest',
    description: 'Home to our largest tournament series including the Deep Dish Cup, Windy City Showdown, and Chicago Dog Classic. World-class arenas and unbeatable energy.',
    image: 'https://images.unsplash.com/photo-1494522855154-9297ac14b55f?w=800&q=80',
    arenas: ['Canlan West Dundee', 'Addison Ice Arena', 'Arctic Ice Arena'],
  },
  {
    name: 'Wisconsin Dells',
    state: 'WI',
    events: 4,
    slug: 'wisconsin-dells',
    tagline: 'Where hockey meets vacation',
    description: 'Tournament hockey in America\'s waterpark capital. Play hard, then hit the Dells attractions with the family. A fan-favorite destination every summer.',
    image: 'https://images.unsplash.com/photo-1570639034860-12bfb7ca532b?w=800&q=80',
    arenas: ['Poppy Waterman Ice Arena'],
  },
  {
    name: 'St. Louis',
    state: 'MO',
    events: 3,
    slug: 'st-louis',
    tagline: 'Blues country, tournament hockey',
    description: 'Compete in the home of the Stanley Cup champion Blues. Great rinks, passionate hockey community, and the Gateway Arch as your backdrop.',
    image: 'https://images.unsplash.com/photo-1603366615917-1fa6dad5c4fa?w=800&q=80',
    arenas: ['Centene Community Ice Center', 'Queeny Park Ice Arena'],
  },
  {
    name: 'South Bend',
    state: 'IN',
    events: 3,
    slug: 'south-bend',
    tagline: 'Fighting Irish hockey territory',
    description: 'Home of Notre Dame and some of Indiana\'s best ice. A growing hockey market with top-notch facilities and Midwest hospitality.',
    image: 'https://images.unsplash.com/photo-1564769625688-040f5765883e?w=800&q=80',
    arenas: ['Compton Family Ice Arena', 'Ice Box'],
  },
  {
    name: 'Madison',
    state: 'WI',
    events: 2,
    slug: 'madison',
    tagline: 'College town, big-time hockey',
    description: 'Wisconsin\'s capital city delivers excellent tournament hockey alongside great restaurants, lakes, and the energy of a Big Ten campus.',
    image: 'https://images.unsplash.com/photo-1569163139599-0f4517e36f51?w=800&q=80',
    arenas: ['Madison Ice Arena'],
  },
  {
    name: 'Holland',
    state: 'MI',
    events: 2,
    slug: 'holland',
    tagline: 'Lake Michigan hockey charm',
    description: 'A hidden gem on Michigan\'s west coast. Beautiful lakeside setting, great community rinks, and a small-town feel that families love.',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80',
    arenas: ['Edge Ice Arena'],
  },
  {
    name: 'Ann Arbor',
    state: 'MI',
    events: 2,
    slug: 'ann-arbor',
    tagline: 'Wolverine hockey excellence',
    description: 'One of America\'s great college hockey towns. Home to incredible facilities and a deep-rooted hockey culture that runs year-round.',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&q=80',
    arenas: ['Ann Arbor Ice Cube', 'Yost Ice Arena'],
  },
];
export default function CitiesPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-700">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1515703407324-5f753afd8be8?w=1920&q=80"
            alt=""
            className="w-full h-full object-cover opacity-25"
          />
        </div>
        <div className="section py-16 sm:py-20 text-center relative z-10">
          <h1
            className={
              oswald.className +
              ' text-4xl sm:text-5xl lg:text-6xl font-bold uppercase tracking-tight text-white'
            }
          >
            Our <span className="text-brand-400">Cities.</span>
          </h1>
          <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
            Premier youth and adult hockey tournaments in the best hockey markets across the Midwest.
          </p>
        </div>
      </section>

      {/* City Cards Grid */}
      <section className="bg-[#f5f5f7]">
        <div className="section">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {CITIES.map((city) => (
              <a
                key={city.slug}
                href={'/events?city=' + encodeURIComponent(city.name)}
                className="card overflow-hidden group cursor-pointer"
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
                        {city.events} events
                      </span>
                    </div>
                  </div>
                </div>

                {/* City Details */}
                <div className="p-5">
                  <p className="text-[#00ccff] text-sm font-semibold mb-1">{city.tagline}</p>
                  <p className="text-[#6e6e73] text-sm leading-relaxed">{city.description}</p>

                  <div className="mt-4">
                    <p className="text-xs text-[#86868b] font-semibold uppercase tracking-wider mb-2">Arenas</p>
                    <div className="flex flex-wrap gap-1.5">
                      {city.arenas.map((arena) => (
                        <span key={arena} className="badge text-xs">{arena}</span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center text-sm text-brand-500 font-medium">
                    View events
                    <svg
                      className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>
      {/* Invite UHT to Your City */}
      <section className="bg-white">
        <div className="section">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-semibold text-[#1d1d1f]">
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
            <div className="card p-6 sm:p-8 space-y-5">
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
                    className="w-full px-4 py-2.5 rounded-lg border border-[#d2d2d7] text-sm focus:outline-none focus:ring-2 focus:ring-[#00ccff] focus:border-transparent"
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
                    className="w-full px-4 py-2.5 rounded-lg border border-[#d2d2d7] text-sm focus:outline-none focus:ring-2 focus:ring-[#00ccff] focus:border-transparent"
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
                    className="w-full px-4 py-2.5 rounded-lg border border-[#d2d2d7] text-sm focus:outline-none focus:ring-2 focus:ring-[#00ccff] focus:border-transparent"
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
                    className="w-full px-4 py-2.5 rounded-lg border border-[#d2d2d7] text-sm focus:outline-none focus:ring-2 focus:ring-[#00ccff] focus:border-transparent"
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
                  className="w-full px-4 py-2.5 rounded-lg border border-[#d2d2d7] text-sm focus:outline-none focus:ring-2 focus:ring-[#00ccff] focus:border-transparent bg-white"
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
                  className="w-full px-4 py-2.5 rounded-lg border border-[#d2d2d7] text-sm focus:outline-none focus:ring-2 focus:ring-[#00ccff] focus:border-transparent"
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
                  className="w-full px-4 py-2.5 rounded-lg border border-[#d2d2d7] text-sm focus:outline-none focus:ring-2 focus:ring-[#00ccff] focus:border-transparent resize-none"
                  placeholder="Tell us about the hockey community, facilities, and why it would be a great fit..."
                />
              </div>

              <button
                type="submit"
                className="w-full btn-primary text-base py-3"
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
