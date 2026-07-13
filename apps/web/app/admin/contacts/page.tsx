'use client';

import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.ultimatetournaments.com';

interface Contact {
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  source_type: string;
  city: string | null;
  state: string | null;
  org: string | null;
  created_at: string | null;
}

interface Stats {
  contacts: number;
  icontacts: number;
  users: number;
  legacy_team: number;
}

const SOURCE_FILTERS = [
  { value: '', label: 'All Sources' },
  { value: 'legacy_team', label: 'Past Contacts' },
  { value: 'icontact', label: 'iContacts' },
  { value: 'registered', label: 'Registered Users' },
  { value: 'manual', label: 'Manual' },
];

const SOURCE_COLORS: Record<string, string> = {
  'Past Contact': 'bg-amber-50 text-amber-700 border-amber-200',
  'iContact': 'bg-purple-50 text-purple-700 border-purple-200',
  'Registered User': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Manual': 'bg-blue-50 text-blue-700 border-blue-200',
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const perPage = 50;

  // Fetch stats
  useEffect(() => {
    fetch(`${API}/api/contacts/stats`, { headers: { 'X-Dev-Bypass': 'true' } })
      .then(r => r.json())
      .then(data => { if (data.success) setStats(data.data); })
      .catch(console.error);
  }, []);

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), per_page: perPage.toString() });
      if (search) params.set('search', search);
      if (sourceFilter) params.set('source', sourceFilter);

      const res = await fetch(`${API}/api/contacts/all?${params}`, {
        headers: { 'X-Dev-Bypass': 'true' },
      });
      const data = await res.json();
      if (data.success) {
        setContacts(data.data || []);
        setTotal(data.pagination?.total || 0);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [search, sourceFilter, page]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Reset to page 1 on filter change
  useEffect(() => { setPage(1); }, [search, sourceFilter]);

  const handleExport = () => {
    const source = sourceFilter || 'all';
    window.open(`${API}/api/contacts/export/csv?source=${source}`, '_blank');
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1d1d1f]">Contacts</h1>
          <p className="text-sm text-[#86868b] mt-1">
            All contacts across past teams, iContact imports, and registered users
          </p>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-white border border-[#e8e8ed] rounded-lg text-sm font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] transition flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <button
            onClick={() => { setSourceFilter(''); }}
            className={`bg-white rounded-xl border p-4 text-left transition hover:shadow-sm ${!sourceFilter ? 'border-[#003e79] ring-1 ring-[#003e79]/20' : 'border-[#e8e8ed]'}`}
          >
            <p className="text-2xl font-semibold text-[#1d1d1f]">
              {(stats.contacts + stats.icontacts + stats.users).toLocaleString()}
            </p>
            <p className="text-xs text-[#86868b] mt-0.5">All Contacts</p>
          </button>
          <button
            onClick={() => setSourceFilter('legacy_team')}
            className={`bg-white rounded-xl border p-4 text-left transition hover:shadow-sm ${sourceFilter === 'legacy_team' ? 'border-amber-400 ring-1 ring-amber-200' : 'border-[#e8e8ed]'}`}
          >
            <p className="text-2xl font-semibold text-amber-700">{stats.legacy_team.toLocaleString()}</p>
            <p className="text-xs text-[#86868b] mt-0.5">Past Contacts</p>
          </button>
          <button
            onClick={() => setSourceFilter('icontact')}
            className={`bg-white rounded-xl border p-4 text-left transition hover:shadow-sm ${sourceFilter === 'icontact' ? 'border-purple-400 ring-1 ring-purple-200' : 'border-[#e8e8ed]'}`}
          >
            <p className="text-2xl font-semibold text-purple-700">{stats.icontacts.toLocaleString()}</p>
            <p className="text-xs text-[#86868b] mt-0.5">iContacts</p>
          </button>
          <button
            onClick={() => setSourceFilter('registered')}
            className={`bg-white rounded-xl border p-4 text-left transition hover:shadow-sm ${sourceFilter === 'registered' ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-[#e8e8ed]'}`}
          >
            <p className="text-2xl font-semibold text-emerald-700">{stats.users.toLocaleString()}</p>
            <p className="text-xs text-[#86868b] mt-0.5">Registered Users</p>
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-[#e8e8ed] p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[250px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#e8e8ed] text-sm focus:border-[#003e79] focus:ring-1 focus:ring-[#003e79]/20 outline-none"
            />
          </div>

          {/* Source filter */}
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#e8e8ed] text-sm bg-white focus:border-[#003e79] outline-none"
          >
            {SOURCE_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>

          {/* Count */}
          <span className="text-sm text-[#86868b]">
            {total.toLocaleString()} result{total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 border-3 border-[#003e79] border-t-transparent rounded-full" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e8e8ed] p-12 text-center">
          <h3 className="text-lg font-medium text-[#1d1d1f]">No contacts found</h3>
          <p className="text-sm text-[#86868b] mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e8e8ed] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-left text-[11px] uppercase tracking-wide text-[#86868b] border-b border-[#e8e8ed]">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Organization</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => (
                <tr key={`${c.email}-${i}`} className="border-t border-[#f0f0f0] hover:bg-[#fafafa] transition">
                  <td className="px-5 py-3 font-medium text-[#1d1d1f]">
                    {[c.first_name, c.last_name].filter(Boolean).join(' ') || <span className="text-[#c7c7cc]">—</span>}
                  </td>
                  <td className="px-5 py-3 text-[#6e6e73]">{c.email}</td>
                  <td className="px-5 py-3 text-[#6e6e73]">{c.phone || <span className="text-[#c7c7cc]">—</span>}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-full border ${SOURCE_COLORS[c.source_type] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {c.source_type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[#6e6e73] text-xs">
                    {[c.city, c.state].filter(Boolean).join(', ') || <span className="text-[#c7c7cc]">—</span>}
                  </td>
                  <td className="px-5 py-3 text-[#6e6e73] text-xs">{c.org || <span className="text-[#c7c7cc]">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#e8e8ed] bg-[#fafafa]">
              <span className="text-xs text-[#86868b]">
                Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, total)} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg border border-[#e8e8ed] text-xs font-medium disabled:opacity-40 hover:bg-white transition"
                >
                  Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) p = i + 1;
                  else if (page <= 3) p = i + 1;
                  else if (page >= totalPages - 2) p = totalPages - 4 + i;
                  else p = page - 2 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-medium transition ${p === page ? 'bg-[#003e79] text-white' : 'hover:bg-white border border-transparent hover:border-[#e8e8ed]'}`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-[#e8e8ed] text-xs font-medium disabled:opacity-40 hover:bg-white transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
