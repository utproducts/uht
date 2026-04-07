'use client';

export default function AdminSchedulePage() {
  return (
    <div className="bg-[#fafafa] min-h-full">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Schedule Builder</h1>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-12 text-center">
          <svg
            className="w-16 h-16 mx-auto text-[#86868b] mb-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
            <path d="M3 10h18" />
            <path d="M7 14h2" />
            <path d="M13 14h2" />
            <path d="M7 18h2" />
            <path d="M13 18h2" />
          </svg>
          <h2 className="text-lg font-bold text-[#3d3d3d] mb-2">Schedule Builder</h2>
          <p className="text-sm text-[#86868b]">Build and manage game schedules and brackets</p>
          <p className="text-xs text-[#86868b] mt-4">This feature is under development.</p>
        </div>
      </div>
    </div>
  );
}
