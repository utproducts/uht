import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ultimate Hockey Tournaments — Premier Youth & Adult Hockey Events',
};

export default function HomePage() {
  return (
    <>
      {/* ==================
          HERO SECTION
          Navy background with rink image at 30% opacity
          ================== */}
      <section className="relative overflow-hidden bg-navy-700">
        {/* Background rink image */}
        <div className="absolute inset-0">
          <img
            src="/AdobeStock_693343870.jpeg"
            alt=""
            className="w-full h-full object-cover opacity-30"
          />
        </div>
        <div className="section py-24 sm:py-32 text-center relative z-10">
          <p className="text-brand-300 font-medium text-sm tracking-wide uppercase mb-4">
            2026-2027 Season
          </p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold text-white max-w-4xl mx-auto leading-[1.05]">
            Where champions{' '}
            <span className="text-brand-400">compete.</span>
          </h1>
          <p className="mt-6 text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
            Premier youth and adult hockey tournaments across the Midwest.
            Register your team, track live scores, and build your legacy.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <a href="/events" className="btn-primary text-base px-8 py-4">
              View Events
            </a>
            <a href="/register" className="btn-secondary text-base px-8 py-4">
              Register Your Team
            </a>
          </div>
        </div>
      </section>

      {/* ==================
          STATE MAP SECTION
          Interactive US map showing states with events
          ================== */}
      <section className="bg-[#f5f5f7]">
        <div className="section">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-semibold text-[#1d1d1f]">
              Find events near you.
            </h2>
            <p className="mt-3 text-lg text-[#6e6e73]">
              Select a state to browse tournaments in your area.
            </p>
          </div>

          {/* State map placeholder — will be an interactive SVG component */}
          <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-card p-8">
            <div className="aspect-[16/9] bg-[#f5f5f7] rounded-2xl flex items-center justify-center">
              <p className="text-[#86868b]">Interactive State Map</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================
          CITIES SECTION
          Grid of city cards
          ================== */}
      <section className="bg-white">
