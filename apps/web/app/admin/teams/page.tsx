'use client';

export default function AdminTeamsPage() {
  return (
    <div className="bg-gray-100 min-h-full">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-gray-900">Team Management</h1>
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
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <h2 className="text-lg font-bold text-gray-700 mb-2">Team Management</h2>
          <p className="text-sm text-gray-400">View and manage all registered teams</p>
          <p className="text-xs text-gray-300 mt-4">This feature is under development.</p>
        </div>
      </div>
    </div>
  );
}
