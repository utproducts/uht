'use client';

export default function AdminFinancialsPage() {
  return (
    <div className="bg-gray-100 min-h-full">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-gray-900">Financials</h1>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
          <svg
            className="w-16 h-16 mx-auto text-gray-300 mb-4"
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
          <h2 className="text-lg font-bold text-gray-700 mb-2">Financials</h2>
          <p className="text-sm text-gray-400">Revenue tracking, payments, and financial reports</p>
          <p className="text-xs text-gray-300 mt-4">This feature is under development.</p>
        </div>
      </div>
    </div>
  );
}
