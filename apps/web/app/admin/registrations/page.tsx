'use client';

export default function AdminRegistrationsPage() {
  return (
    <div className="bg-[#fafafa] min-h-full">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Registrations</h1>
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
            <path d="M9 11H3v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-11h-6" />
            <path d="M9 5a3 3 0 0 1 6 0v0a3 3 0 0 1-6 0v0" />
            <path d="M9 11v5" />
            <path d="M12 11v5" />
            <path d="M15 11v5" />
          </svg>
          <h2 className="text-lg font-bold text-[#3d3d3d] mb-2">Registrations</h2>
          <p className="text-sm text-[#86868b]">View and manage all event registrations</p>
          <p className="text-xs text-[#86868b] mt-4">This feature is under development.</p>
        </div>
      </div>
    </div>
  );
}
