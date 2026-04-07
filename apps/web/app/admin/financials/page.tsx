'use client';

export default function AdminFinancialsPage() {
  return (
    <div className="bg-[#fafafa] min-h-full">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Financials</h1>
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
            <circle cx="12" cy="12" r="1" />
            <path d="M8 12a4 4 0 0 1 8 0" />
            <path d="M8 8a8 8 0 0 1 8 0" />
            <path d="M9 4a12 12 0 0 1 6 0" />
          </svg>
          <h2 className="text-lg font-bold text-[#3d3d3d] mb-2">Financials</h2>
          <p className="text-sm text-[#86868b]">Revenue tracking, payments, and financial reports</p>
          <p className="text-xs text-[#86868b] mt-4">This feature is under development.</p>
        </div>
      </div>
    </div>
  );
}
