'use client';

import { AdminDash } from '../dashboard/[role]/DashboardContent';

// Admin overview, INSIDE the /admin layout so the sidebar never changes.
// (/dashboard/admin redirects here — the old split between the two layouts
// made the left menu swap whenever Overview was clicked.)
export default function AdminOverviewPage() {
  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[#1d1d1f] mb-6">Admin Dashboard</h1>
      <AdminDash />
    </div>
  );
}
