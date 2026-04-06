'use client';

export default function AdminSchedulePage() {
  return (
    <div className="bg-gray-100 min-h-full">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-gray-900">Schedule Builder</h1>
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
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
            <path d="M3 10h18" />
            <path d="M7 14h2" />
            <path d="M13 14h2" />
            <path d="M7 18h2" />
            <path d="M13 18h2" />
          </svg>
          <h2 className="text-lg font-bold text-gray-700 mb-2">Schedule Builder</h2>
          <p className="text-sm text-gray-400">Build and manage game schedules and brackets</p>
          <p className="text-xs text-gray-300 mt-4">This feature is under development.</p>
        </div>
      </div>
    </div>
  );
}
