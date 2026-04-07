'use client';

export default function AdminCommsPage() {
  return (
    <div className="bg-[#fafafa] min-h-full">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Communications</h1>
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
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M7 11l5 4 5-4" />
          </svg>
          <h2 className="text-lg font-bold text-[#3d3d3d] mb-2">Communications</h2>
          <p className="text-sm text-[#86868b]">Email and SMS messaging to teams and parents</p>
          <p className="text-xs text-[#86868b] mt-4">This feature is under development.</p>
        </div>
      </div>
    </div>
  );
}
